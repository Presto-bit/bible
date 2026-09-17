'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import {
  adminCheck,
  adminHeaders,
  createKnowledgeNote,
  listKnowledgeNoteDrafts,
  uploadKnowledgeNoteMedia,
} from '@/lib/admin_rag';
import { API_BASE } from '@/lib/api';
import { knowledgeMediaUrl } from '@/lib/knowledge_media_url';
import { renderNoteArticlePngs, renderNoteBodyPng, renderNoteCoverPng } from '@/lib/note_paper_render';
import { knowledgeNoteHref } from '@/lib/topic_routes';

type PageKind = 'text' | 'image' | 'audio' | 'video';
/** 发稿入口：听 + 视频合成「音视频」 */
type SeedKind = 'image' | 'text' | 'av';
type UploadKind = 'image' | 'audio' | 'video' | 'cover' | 'av';

type FolioDraftPage = {
  id: string;
  kind: PageKind;
  /** 文页正文 */
  body: string;
  /** 图页 / 音视频页封面 */
  src: string;
  /** 音/视频地址 */
  mediaUrl: string;
  /** 可选页注 */
  note: string;
};

type DraftRow = {
  id: string;
  title?: string;
  guide_one_liner?: string;
  generated_at?: string;
  cover_image?: string;
};

const MAX_PAGES = 12;

const MODE_META: Record<
  PageKind,
  { label: string; hint: string; verb: string; pageLabel: string }
> = {
  image: { label: '图文', hint: '从相册选图，一页一图', verb: '图片', pageLabel: '图' },
  text: { label: '文字', hint: '写长文，发布自动排版分页', verb: '文字', pageLabel: '文' },
  audio: { label: '音视频', hint: '上传音频或视频', verb: '音频', pageLabel: '听' },
  video: { label: '音视频', hint: '上传音频或视频', verb: '视频', pageLabel: '看' },
};

const CHOOSER: Array<{
  seed: SeedKind;
  label: string;
  hint: string;
  glyph: string;
}> = [
  { seed: 'image', label: '图文', hint: '从相册选图，一页一图', glyph: '图' },
  { seed: 'text', label: '文字', hint: '写长文，发布自动排版分页', glyph: '文' },
  { seed: 'av', label: '音视频', hint: '音频与视频同一入口', glyph: '音' },
];

function looksLikeVideo(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v)$/i.test(file.name || '');
}

function looksLikeAudio(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('audio/')) return true;
  return /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(file.name || '');
}

function looksLikeImage(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  // iOS 相册常给空 MIME
  if (!t) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || '');
}

function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function emptyPage(kind: PageKind): FolioDraftPage {
  return { id: newId(), kind, body: '', src: '', mediaUrl: '', note: '' };
}

function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || 'image/png' });
}

function pageReady(p: FolioDraftPage): boolean {
  if (p.kind === 'text') return p.body.trim().length > 0;
  if (p.kind === 'image') return Boolean(p.src.trim());
  if (p.kind === 'audio') return Boolean(p.mediaUrl.trim());
  if (p.kind === 'video') return Boolean(p.mediaUrl.trim());
  return false;
}

function inferKindFromFolioPage(p: Record<string, unknown>): PageKind {
  const media = p.media as { type?: string } | undefined;
  if (media?.type === 'video') return 'video';
  if (media?.type === 'audio') return 'audio';
  if ((p.type === 'text' || p.body) && !p.src) return 'text';
  return 'image';
}

function folioRawToDraftPages(
  raw: Array<Record<string, unknown>> | undefined,
  fallbackBody: string,
  cover: string,
): FolioDraftPage[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const mapped = raw.slice(0, MAX_PAGES).map((p) => {
      const kind = inferKindFromFolioPage(p);
      const media = p.media as { type?: string; url?: string } | undefined;
      return {
        id: newId(),
        kind,
        body: typeof p.body === 'string' ? p.body : '',
        src: typeof p.src === 'string' ? p.src : cover || '',
        mediaUrl: media?.url || '',
        note: typeof p.title === 'string' ? p.title : '',
      };
    });
    // 纯文字草稿：合并为一篇，编辑态不要求手动分页
    if (mapped.length && mapped.every((p) => p.kind === 'text')) {
      return [
        {
          ...emptyPage('text'),
          body: mapped
            .map((p) => p.body.trim())
            .filter(Boolean)
            .join('\n\n'),
        },
      ];
    }
    return mapped;
  }
  if (fallbackBody.trim()) {
    const paras = fallbackBody
      .split(/\n\s*\n+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, MAX_PAGES);
    if (paras.length) {
      return paras.map((body) => ({
        ...emptyPage('text'),
        body,
      }));
    }
  }
  return [emptyPage('text')];
}

/** 管理员新建：册页条多页编辑（方案 A） */
export default function KnowledgeNewNotePage() {
  const router = useRouter();
  const goBack = useFlowBack('/knowledge');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [seedKind, setSeedKind] = useState<SeedKind | null>(null);
  const [title, setTitle] = useState('');
  const [guide, setGuide] = useState('');
  const [pages, setPages] = useState<FolioDraftPage[]>([]);
  const [active, setActive] = useState(0);
  const [noteId, setNoteId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [okHint, setOkHint] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [paperPreviewUrls, setPaperPreviewUrls] = useState<string[]>([]);
  const [pendingUploadKind, setPendingUploadKind] = useState<UploadKind>('image');
  const [pickerNonce, setPickerNonce] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetIdRef = useRef<string | null>(null);

  const openFilePicker = (kind: UploadKind, pageId?: string) => {
    uploadTargetIdRef.current = pageId || pages[active]?.id || null;
    setPendingUploadKind(kind);
    setPickerNonce((n) => n + 1);
  };

  // 等 accept 更新后再点选，避免 remount 抢掉 onChange
  useEffect(() => {
    if (!pickerNonce) return;
    const t = window.setTimeout(() => {
      const el = fileInputRef.current;
      if (!el) return;
      el.value = '';
      el.click();
    }, 80);
    return () => window.clearTimeout(t);
  }, [pickerNonce]);

  const current = pages[active] || null;

  const refreshDrafts = useCallback(async () => {
    try {
      const rows = await listKnowledgeNoteDrafts();
      setDrafts(rows);
    } catch {
      /* 非阻断 */
    }
  }, []);

  useEffect(() => {
    void adminCheck().then((ok) => {
      setAllowed(ok);
      if (ok) void refreshDrafts();
    });
  }, [refreshDrafts]);

  useEffect(() => {
    return () => {
      for (const u of paperPreviewUrls) URL.revokeObjectURL(u);
    };
  }, [paperPreviewUrls]);

  const patchPage = (id: string, patch: Partial<FolioDraftPage>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const resetForm = () => {
    setTitle('');
    setGuide('');
    setPages([]);
    setActive(0);
    setNoteId(undefined);
    setErr(null);
    setOkHint(null);
    setShowAddMenu(false);
    setPaperPreviewUrls((prev) => {
      for (const u of prev) URL.revokeObjectURL(u);
      return [];
    });
  };

  const enterMode = (seed: SeedKind) => {
    resetForm();
    setSeedKind(seed);
    if (seed === 'av') {
      setPages([emptyPage('audio')]);
    } else {
      setPages([emptyPage(seed)]);
    }
    setActive(0);
  };

  // 进入图文/音视频后自动弹选文件
  useEffect(() => {
    if (!seedKind || seedKind === 'text') return;
    if (!pages[0] || pageReady(pages[0])) return;
    const t = window.setTimeout(() => {
      openFilePicker(seedKind === 'image' ? 'image' : 'av', pages[0]?.id);
    }, 280);
    return () => window.clearTimeout(t);
    // 仅在刚进入类型时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKind]);

  const leaveMode = () => {
    resetForm();
    setSeedKind(null);
  };

  const addPage = (kind: PageKind | 'av') => {
    if (pages.length >= MAX_PAGES) {
      setErr(`最多 ${MAX_PAGES} 页`);
      return;
    }
    setShowAddMenu(false);
    setErr(null);
    const pageKind: PageKind = kind === 'av' ? 'audio' : kind;
    const next = emptyPage(pageKind);
    setPages((prev) => [...prev, next]);
    setActive(pages.length);
    if (kind !== 'text') {
      window.setTimeout(() => {
        openFilePicker(kind === 'image' ? 'image' : 'av', next.id);
      }, 120);
    }
  };

  /** ＋ 默认加同类型页（小红书式）；··· 再选图文/音视频 */
  const quickAddPage = () => {
    if (seedKind === 'av' || current?.kind === 'audio' || current?.kind === 'video') {
      addPage('av');
      return;
    }
    addPage(current?.kind || 'image');
  };

  const removePage = (index: number) => {
    if (pages.length <= 1) {
      setErr('至少保留一页');
      return;
    }
    setPages((prev) => prev.filter((_, i) => i !== index));
    setActive((a) => {
      if (index < a) return a - 1;
      if (index === a) return Math.max(0, a - 1);
      return a;
    });
  };

  const reorderPage = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) {
      return;
    }
    setPages((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (!item) return prev;
      next.splice(to, 0, item);
      return next;
    });
    setActive(to);
  };

  const onFilePicked = async (files: FileList | null) => {
    if (!files?.length) return;
    const pageId =
      uploadTargetIdRef.current || pages[active]?.id || null;
    if (!pageId) {
      setErr('请先选择一页再上传');
      return;
    }
    const kind = pendingUploadKind;
    setErr(null);
    setOkHint(null);

    const applyLocalSrc = (file: File) => {
      const localUrl = URL.createObjectURL(file);
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          if (p.src.startsWith('blob:')) URL.revokeObjectURL(p.src);
          return { ...p, src: localUrl, kind: kind === 'cover' ? p.kind : 'image' };
        }),
      );
    };

    const applyLocalMedia = (file: File, as: 'audio' | 'video') => {
      const localUrl = URL.createObjectURL(file);
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          if (p.mediaUrl.startsWith('blob:')) URL.revokeObjectURL(p.mediaUrl);
          let nextSrc = p.src;
          if (as === 'video') {
            // 无封面时用视频 blob 进册页条即时预览
            if (!p.src || p.src.startsWith('blob:')) {
              if (p.src.startsWith('blob:') && p.src !== localUrl) {
                URL.revokeObjectURL(p.src);
              }
              nextSrc = localUrl;
            }
          }
          return { ...p, kind: as, mediaUrl: localUrl, src: nextSrc };
        }),
      );
    };

    // 先本地预览进册页条，再后台上传
    if (kind === 'image' || kind === 'cover') {
      const first = files[0];
      if (first && looksLikeImage(first)) applyLocalSrc(first);
    } else if (kind === 'av') {
      const first = files[0];
      if (first) {
        if (looksLikeVideo(first)) applyLocalMedia(first, 'video');
        else if (looksLikeAudio(first)) applyLocalMedia(first, 'audio');
        else {
          setErr('请选择音频或视频文件');
          return;
        }
      }
    } else if (kind === 'audio') {
      const first = files[0];
      if (first) applyLocalMedia(first, 'audio');
    } else if (kind === 'video') {
      const first = files[0];
      if (first) applyLocalMedia(first, 'video');
    }

    setBusy(true);
    try {
      if (kind === 'image' || kind === 'cover') {
        const list = Array.from(files)
          .filter(looksLikeImage)
          .slice(0, Math.max(1, MAX_PAGES - pages.length + 1));
        if (!list.length) throw new Error('未识别到图片文件');
        if (kind === 'cover' || list.length === 1) {
          setBusyLabel('上传图片…');
          const url = await uploadKnowledgeNoteMedia(list[0]!, 'cover');
          setPages((prev) =>
            prev.map((p) => {
              if (p.id !== pageId) return p;
              if (p.src.startsWith('blob:')) URL.revokeObjectURL(p.src);
              return { ...p, src: url, kind: kind === 'cover' ? p.kind : 'image' };
            }),
          );
          setOkHint('图片已添加');
        } else {
          const urls: string[] = [];
          for (let i = 0; i < list.length; i += 1) {
            setBusyLabel(`上传图片 ${i + 1}/${list.length}…`);
            urls.push(await uploadKnowledgeNoteMedia(list[i]!, 'cover'));
          }
          setPages((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex((p) => p.id === pageId);
            const at = idx >= 0 ? idx : active;
            const cur = copy[at];
            if (cur) {
              if (cur.src.startsWith('blob:')) URL.revokeObjectURL(cur.src);
              copy[at] = { ...cur, kind: 'image', src: urls[0]! };
            }
            const extras = urls.slice(1).map((src) => ({
              ...emptyPage('image'),
              src,
            }));
            return [...copy, ...extras].slice(0, MAX_PAGES);
          });
          setOkHint(`已添加 ${urls.length} 张图`);
        }
      } else if (kind === 'av' || kind === 'audio' || kind === 'video') {
        const file = files[0]!;
        const asVideo =
          kind === 'video' || (kind === 'av' && looksLikeVideo(file));
        const asAudio =
          kind === 'audio' || (kind === 'av' && looksLikeAudio(file));
        if (!asVideo && !asAudio) throw new Error('请选择音频或视频文件');
        setBusyLabel(asVideo ? '上传视频…' : '上传音频…');
        const url = await uploadKnowledgeNoteMedia(
          file,
          asVideo ? 'video' : 'audio',
        );
        setPages((prev) =>
          prev.map((p) => {
            if (p.id !== pageId) return p;
            if (p.mediaUrl.startsWith('blob:')) URL.revokeObjectURL(p.mediaUrl);
            const keepCover =
              p.src && !p.src.startsWith('blob:')
                ? p.src
                : asVideo
                  ? url
                  : p.src.startsWith('blob:')
                    ? ''
                    : p.src;
            if (p.src.startsWith('blob:') && keepCover !== p.src) {
              URL.revokeObjectURL(p.src);
            }
            return {
              ...p,
              kind: asVideo ? 'video' : 'audio',
              mediaUrl: url,
              src: keepCover,
            };
          }),
        );
        setOkHint(asVideo ? '视频已添加' : '音频已添加');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const bodyForSave = (): string => {
    const texts = pages
      .filter((p) => p.kind === 'text' && p.body.trim())
      .map((p) => p.body.trim());
    if (texts.length) return texts.join('\n\n');
    if (guide.trim()) return guide.trim();
    const note = pages.map((p) => p.note.trim()).find(Boolean);
    return note || title.trim() || '彼爱手稿';
  };

  const canPublish = (): boolean => {
    if (!title.trim()) return false;
    if (!pages.length) return false;
    return pages.every(pageReady);
  };

  /** 文页烘焙为竖图；其它页直接落 folio */
  const buildFolioPages = async (): Promise<Array<Record<string, unknown>>> => {
    const out: Array<Record<string, unknown>> = [];
    const bookTitle = title.trim() || '手稿';
    let textPageOrdinal = 0;
    const textPages = pages.filter((p) => p.kind === 'text' && p.body.trim());

    for (let i = 0; i < pages.length; i += 1) {
      const p = pages[i]!;
      const key = i === 0 ? 'cover' : `p${i}`;

      if (p.kind === 'text') {
        textPageOrdinal += 1;
        setBusyLabel(`排版第 ${textPageOrdinal} 文页…`);
        let blob: Blob;
        if (textPages.length === 1 && pages.length === 1) {
          // 单页整篇：封面式标题 + 正文
          const baked = await renderNoteArticlePngs({
            title: bookTitle,
            body: p.body.trim(),
          });
          const coverUrl = await uploadKnowledgeNoteMedia(
            blobToFile(baked.cover, 'paper-cover.png'),
            'cover',
          );
          out.push({
            key: 'cover',
            type: 'image',
            src: coverUrl,
            alt: `${bookTitle} · 封面`,
          });
          for (let bi = 0; bi < baked.bodies.length; bi += 1) {
            const src = await uploadKnowledgeNoteMedia(
              blobToFile(baked.bodies[bi]!, `paper-p${bi + 1}.png`),
              'cover',
            );
            out.push({
              key: `p${bi + 1}`,
              type: 'image',
              src,
              alt: `${bookTitle} · 第 ${bi + 1} 页`,
            });
          }
          setPaperPreviewUrls((prev) => {
            for (const u of prev) URL.revokeObjectURL(u);
            return [
              URL.createObjectURL(baked.cover),
              ...baked.bodies.map((b) => URL.createObjectURL(b)),
            ];
          });
          return out;
        }

        if (i === 0 && textPageOrdinal === 1) {
          blob = await renderNoteCoverPng({
            title: bookTitle,
            guide: p.body.trim().slice(0, 120),
          });
        } else {
          blob = await renderNoteBodyPng({
            title: bookTitle,
            sectionLabel: p.note.trim() || `第 ${textPageOrdinal} 页`,
            body: p.body.trim(),
            pageIndex: textPageOrdinal,
            pageTotal: textPages.length,
            continuation: textPageOrdinal > 1,
          });
        }
        setBusyLabel('上传纸页图…');
        const src = await uploadKnowledgeNoteMedia(
          blobToFile(blob, `paper-${key}.png`),
          'cover',
        );
        out.push({
          key,
          type: 'image',
          src,
          alt: `${bookTitle} · ${p.note.trim() || `第 ${i + 1} 页`}`,
        });
        continue;
      }

      if (p.kind === 'image') {
        out.push({
          key,
          type: 'image',
          src: p.src.trim(),
          alt: `${bookTitle} · ${p.note.trim() || (i === 0 ? '封面' : `第 ${i + 1} 页`)}`,
        });
        continue;
      }

      const coverSrc =
        p.src.trim() || '/knowledge/infographics/_paper_texture.jpg';
      out.push({
        key,
        type: 'image',
        src: coverSrc,
        alt: `${bookTitle} · ${p.kind === 'audio' ? '听' : '看'}`,
        media: {
          type: p.kind,
          url: p.mediaUrl.trim(),
          label: p.note.trim() || (p.kind === 'audio' ? '本页音频' : '本页视频'),
        },
      });
    }

    setPaperPreviewUrls((prev) => {
      for (const u of prev) {
        if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      }
      return out
        .map((row) =>
          typeof row.src === 'string' ? knowledgeMediaUrl(row.src) : '',
        )
        .filter(Boolean);
    });

    return out;
  };

  const onSave = async (status: 'draft' | 'published') => {
    if (!seedKind) return;
    setErr(null);
    setOkHint(null);
    setBusy(true);
    setBusyLabel(status === 'draft' ? '保存草稿…' : '发布中…');
    try {
      // 草稿：文页可先以 text 落盘，便于再编辑；发布：烘焙成图
      let folio: Array<Record<string, unknown>>;
      if (status === 'draft') {
        folio = pages.map((p, i) => {
          const key = i === 0 ? 'cover' : `p${i}`;
          if (p.kind === 'text') {
            return {
              key,
              type: 'text',
              title: p.note.trim() || undefined,
              body: p.body.trim(),
              alt: `${title.trim()} · 第 ${i + 1} 页`,
            };
          }
          if (p.kind === 'image') {
            return {
              key,
              type: 'image',
              src: p.src.trim(),
              alt: `${title.trim()} · 第 ${i + 1} 页`,
            };
          }
          return {
            key,
            type: 'image',
            src: p.src.trim() || '/knowledge/infographics/_paper_texture.jpg',
            alt: `${title.trim()} · ${p.kind === 'audio' ? '听' : '看'}`,
            media: {
              type: p.kind,
              url: p.mediaUrl.trim(),
              label: p.note.trim() || undefined,
            },
          };
        });
      } else {
        folio = await buildFolioPages();
      }

      const coverImage =
        pages.find((p) => p.src.trim())?.src ||
        (folio[0]?.src as string | undefined) ||
        undefined;
      const firstAudio = pages.find((p) => p.kind === 'audio' && p.mediaUrl)?.mediaUrl;
      const firstVideo = pages.find((p) => p.kind === 'video' && p.mediaUrl)?.mediaUrl;

      const saved = await createKnowledgeNote({
        title: title.trim(),
        body: bodyForSave(),
        cover_image: coverImage,
        audio_url: firstAudio || undefined,
        video_url: firstVideo || undefined,
        status,
        note_id: noteId,
        folio_pages: folio,
      });
      setNoteId(saved.id);
      if (status === 'draft') {
        await refreshDrafts();
        setOkHint(`草稿已保存 · ${pages.length} 页`);
        setBusyLabel('');
        setBusy(false);
        return;
      }
      router.replace(`${knowledgeNoteHref(saved.id)}?view=1`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : status === 'draft' ? '保存失败' : '发布失败');
      setBusy(false);
      setBusyLabel('');
    }
  };

  const loadDraft = async (id: string) => {
    setErr(null);
    setBusy(true);
    setBusyLabel('载入草稿…');
    try {
      const res = await fetch(
        `${API_BASE}/content/knowledge-layouts/${encodeURIComponent(id)}`,
        { headers: { ...adminHeaders(), Accept: 'application/json' }, cache: 'no-store' },
      );
      if (!res.ok) throw new Error('草稿不存在或无法读取');
      const data = (await res.json()) as {
        layout?: {
          id?: string;
          title?: string;
          body_source?: string;
          cover_image?: string;
          guide_one_liner?: string;
          folio_pages?: Array<Record<string, unknown>>;
        };
      };
      const layout = data.layout;
      if (!layout?.id) throw new Error('草稿数据不完整');
      const draftPages = folioRawToDraftPages(
        layout.folio_pages,
        layout.body_source || '',
        layout.cover_image || '',
      );
      const primary = draftPages[0]?.kind || 'text';
      const seed: SeedKind =
        primary === 'audio' || primary === 'video' ? 'av' : primary === 'image' ? 'image' : 'text';
      setSeedKind(seed);
      setNoteId(layout.id);
      setTitle(layout.title || '');
      setGuide(layout.guide_one_liner || '');
      setPages(draftPages);
      setActive(0);
      setOkHint(`已载入 · ${draftPages.length} 页`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '载入失败');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const acceptForInput =
    pendingUploadKind === 'av'
      ? 'audio/mpeg,audio/mp4,audio/*,video/mp4,video/webm,video/quicktime,.mp3,.m4a,.aac,.wav,.ogg,.mp4,.webm,.mov'
      : pendingUploadKind === 'audio'
        ? 'audio/mpeg,audio/mp4,audio/*,.mp3,.m4a,.aac,.wav,.ogg'
        : pendingUploadKind === 'video'
          ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
          : 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic';

  if (allowed === null) {
    return (
      <main className="container">
        <p className="muted">验证权限…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="container knowledge-note-editor">
        <PageBackBar onClick={goBack} label="探索" />
        <h2 className="page-head-title">新建手稿</h2>
        <p className="muted">需要管理员登录后才能新建。</p>
        <button type="button" className="btn" onClick={() => router.push('/admin')}>
          去管理后台
        </button>
      </main>
    );
  }

  if (!seedKind) {
    return (
      <main className="container knowledge-note-editor knowledge-note-editor--chooser">
        <header className="page-head">
          <PageBackBar onClick={goBack} label="探索" />
          <h2 className="page-head-title">发手稿</h2>
        </header>
        <p className="knowledge-note-editor-lead">选一种方式开始，之后还能加页。</p>

        {drafts.length > 0 ? (
          <section className="knowledge-note-drafts" aria-label="草稿">
            <p className="knowledge-note-drafts-label">草稿</p>
            <ul>
              {drafts.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="knowledge-note-draft-item"
                    disabled={busy}
                    onClick={() => void loadDraft(d.id)}
                  >
                    <strong>{d.title || d.id}</strong>
                    {d.guide_one_liner ? <span>{d.guide_one_liner}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="knowledge-note-chooser" role="list">
          {CHOOSER.map((m) => (
            <button
              key={m.seed}
              type="button"
              className="knowledge-note-chooser-card"
              role="listitem"
              onClick={() => enterMode(m.seed)}
            >
              <em className="knowledge-note-chooser-glyph" aria-hidden>
                {m.glyph}
              </em>
              <strong>{m.label}</strong>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  const isTextMode = seedKind === 'text';
  const showStrip = !isTextMode;

  const openCurrentMedia = () => {
    if (!current) return;
    if (current.kind === 'image') openFilePicker('image', current.id);
    else openFilePicker('av', current.id);
  };

  const thumbPreview = (p: FolioDraftPage) => {
    if (p.src) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={knowledgeMediaUrl(p.src)} alt="" />
      );
    }
    if (p.kind === 'video' && p.mediaUrl) {
      return (
        <video
          className="knowledge-compose-thumb-video"
          src={knowledgeMediaUrl(p.mediaUrl)}
          muted
          playsInline
          preload="metadata"
        />
      );
    }
    return (
      <span className="knowledge-folio-thumb-fallback">
        {MODE_META[p.kind].pageLabel}
      </span>
    );
  };

  const stripNav = showStrip ? (
    <nav className="knowledge-compose-strip knowledge-compose-strip--top" aria-label="册页预览">
      <div className="knowledge-compose-strip-scroll">
        {pages.map((p, i) => (
          <div
            key={p.id}
            className={`knowledge-compose-thumb${i === active ? ' is-on' : ''}${pageReady(p) ? '' : ' is-empty'}${p.src || (p.kind === 'video' && p.mediaUrl) ? ' has-preview' : ''}`}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom != null) reorderPage(dragFrom, i);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
          >
            <button
              type="button"
              className="knowledge-compose-thumb-hit"
              onClick={() => {
                setActive(i);
                if (!pageReady(p) || p.kind === 'image') {
                  // 空页或图页：点缩略图即可换图/补传
                  if (!pageReady(p)) {
                    openFilePicker(
                      p.kind === 'image' ? 'image' : 'av',
                      p.id,
                    );
                  }
                }
              }}
              onDoubleClick={() => {
                openFilePicker(p.kind === 'image' ? 'image' : 'av', p.id);
              }}
              aria-label={
                p.src || p.mediaUrl
                  ? `第 ${i + 1} 页，点击选中，双击更换`
                  : `第 ${i + 1} 页，添加内容`
              }
              aria-current={i === active ? 'page' : undefined}
            >
              {thumbPreview(p)}
              <em>{i + 1}</em>
              {p.kind === 'audio' && p.mediaUrl ? (
                <span className="knowledge-compose-thumb-tag">听</span>
              ) : null}
              {p.kind === 'video' && p.mediaUrl ? (
                <span className="knowledge-compose-thumb-tag">看</span>
              ) : null}
            </button>
            {i === active && pages.length > 1 ? (
              <button
                type="button"
                className="knowledge-compose-thumb-del"
                aria-label="删除本页"
                onClick={() => removePage(i)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="knowledge-compose-add"
          disabled={pages.length >= MAX_PAGES || busy}
          onClick={quickAddPage}
          aria-label="加一页"
        >
          ＋
        </button>
        <button
          type="button"
          className="knowledge-compose-add-more"
          disabled={pages.length >= MAX_PAGES || busy}
          onClick={() => setShowAddMenu(true)}
          aria-label="选择页类型"
        >
          ···
        </button>
      </div>
      <p className="knowledge-compose-strip-hint">
        {busy && busyLabel
          ? busyLabel
          : '上方预览 · 拖动排序 · 点空页添加 · 双击更换'}
      </p>
    </nav>
  ) : null;

  return (
    <main className={`knowledge-note-compose${isTextMode ? ' is-text' : ''}`}>
      <header className="knowledge-compose-bar">
        <button type="button" className="knowledge-compose-cancel" onClick={leaveMode}>
          取消
        </button>
        <p className="knowledge-compose-meta" aria-live="polite">
          {isTextMode
            ? '文字 · 自动分页'
            : `${active + 1}/${pages.length}`}
        </p>
        <div className="knowledge-compose-bar-actions">
          <button
            type="button"
            className="knowledge-compose-draft"
            disabled={busy || !canPublish()}
            onClick={() => void onSave('draft')}
          >
            草稿
          </button>
          <button
            type="button"
            className="knowledge-compose-publish"
            disabled={busy || !canPublish()}
            onClick={() => void onSave('published')}
          >
            {busy && busyLabel.includes('发布') ? '…' : '发布'}
          </button>
        </div>
      </header>

      {stripNav}

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptForInput}
        multiple={pendingUploadKind === 'image'}
        hidden
        onChange={(e) => {
          const files = e.target.files;
          e.target.value = '';
          void onFilePicked(files);
        }}
      />

      <div className="knowledge-compose-scroll">
        {current && current.kind !== 'text' ? (
          <button
            type="button"
            className={`knowledge-compose-hero${current.src || (current.kind === 'video' && current.mediaUrl) ? ' has-media' : ' is-empty'}`}
            disabled={false}
            onClick={openCurrentMedia}
            aria-label={
              current.kind === 'image'
                ? current.src
                  ? '更换图片'
                  : '添加图片'
                : current.mediaUrl
                  ? '更换音视频'
                  : '添加音频或视频'
            }
          >
            {current.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={knowledgeMediaUrl(current.src)} alt="" />
            ) : current.kind === 'video' && current.mediaUrl ? (
              <video
                className="knowledge-compose-hero-video"
                src={knowledgeMediaUrl(current.mediaUrl)}
                muted
                playsInline
                controls
                preload="metadata"
              />
            ) : (
              <span className="knowledge-compose-hero-empty">
                <strong>＋</strong>
                <span>
                  {current.kind === 'image'
                    ? '添加图片'
                    : '添加音频或视频'}
                </span>
                <em>{busy ? busyLabel || '处理中…' : '预览在上方册页条'}</em>
              </span>
            )}
            {(current.kind === 'audio' || current.kind === 'video') &&
            current.mediaUrl ? (
              <span className="knowledge-compose-hero-badge">
                {current.kind === 'audio' ? '听' : '看'} · 已选
              </span>
            ) : null}
            {busy && (current.src || current.mediaUrl) ? (
              <span className="knowledge-compose-hero-busy">{busyLabel || '上传中…'}</span>
            ) : null}
          </button>
        ) : null}

        {current && (current.kind === 'audio' || current.kind === 'video') ? (
          <button
            type="button"
            className="knowledge-compose-cover-link"
            disabled={busy}
            onClick={() => openFilePicker('cover', current.id)}
          >
            {current.src && !current.src.startsWith('blob:')
              ? '更换封面'
              : current.src
                ? '上传封面图（可选）'
                : '添加封面图（可选）'}
          </button>
        ) : null}

        <div className="knowledge-compose-copy">
          <input
            className="knowledge-compose-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="添加标题"
            autoFocus={isTextMode}
          />
          {isTextMode && current ? (
            <textarea
              className="knowledge-compose-body"
              value={current.body}
              onChange={(e) => patchPage(current.id, { body: e.target.value })}
              rows={14}
              maxLength={12000}
              placeholder={'写正文。分段空一行即可。\n发布时自动排版分页成册，无需手动加页。'}
            />
          ) : (
            <textarea
              className="knowledge-compose-body knowledge-compose-body--caption"
              value={guide}
              onChange={(e) => setGuide(e.target.value)}
              rows={4}
              maxLength={200}
              placeholder="添加正文"
            />
          )}
        </div>

        {isTextMode ? (
          <p className="knowledge-compose-auto-hint">
            发布后将按版心自动分页为竖版纸页图
          </p>
        ) : null}

        {err ? <p className="knowledge-note-editor-err">{err}</p> : null}
        {busy && busyLabel && isTextMode ? (
          <p className="knowledge-note-editor-busy">{busyLabel}</p>
        ) : null}
        {okHint ? <p className="knowledge-note-editor-ok">{okHint}</p> : null}
      </div>

      {showAddMenu ? (
        <div className="knowledge-compose-sheet" role="dialog" aria-label="添加一页">
          <button
            type="button"
            className="knowledge-compose-sheet-backdrop"
            aria-label="关闭"
            onClick={() => setShowAddMenu(false)}
          />
          <div className="knowledge-compose-sheet-panel">
            <p className="knowledge-compose-sheet-title">添加一页</p>
            <div className="knowledge-compose-sheet-grid">
              <button type="button" onClick={() => addPage('image')}>
                <em>图</em>
                <strong>图文</strong>
              </button>
              <button type="button" onClick={() => addPage('av')}>
                <em>听</em>
                <strong>音视频</strong>
              </button>
            </div>
            <button
              type="button"
              className="knowledge-compose-sheet-cancel"
              onClick={() => setShowAddMenu(false)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
