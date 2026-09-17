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

type FolioDraftPage = {
  id: string;
  kind: PageKind;
  /** 文页正文 */
  body: string;
  /** 图页 / 听看页封面 */
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
  text: { label: '文字', hint: '写长文，加页成册', verb: '文字', pageLabel: '文' },
  audio: { label: '音频', hint: '上传音频，可加页', verb: '音频', pageLabel: '听' },
  video: { label: '视频', hint: '上传视频，可加页', verb: '视频', pageLabel: '看' },
};

const CHOOSER_ORDER: PageKind[] = ['image', 'text', 'audio', 'video'];

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
    return raw.slice(0, MAX_PAGES).map((p) => {
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
  const [seedKind, setSeedKind] = useState<PageKind | null>(null);
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
  const [pendingUploadKind, setPendingUploadKind] = useState<
    'image' | 'audio' | 'video' | 'cover'
  >('image');
  const [pickerNonce, setPickerNonce] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = (kind: 'image' | 'audio' | 'video' | 'cover') => {
    setPendingUploadKind(kind);
    setPickerNonce((n) => n + 1);
  };

  useEffect(() => {
    if (!pickerNonce) return;
    const t = window.setTimeout(() => fileInputRef.current?.click(), 40);
    return () => window.clearTimeout(t);
  }, [pickerNonce, pendingUploadKind]);

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

  const enterMode = (kind: PageKind) => {
    resetForm();
    setSeedKind(kind);
    setPages([emptyPage(kind)]);
    setActive(0);
  };

  // 进入图/音/视频后自动弹选文件
  useEffect(() => {
    if (!seedKind || seedKind === 'text') return;
    if (!pages[0] || pageReady(pages[0])) return;
    const t = window.setTimeout(() => {
      openFilePicker(
        seedKind === 'image' ? 'image' : seedKind === 'audio' ? 'audio' : 'video',
      );
    }, 280);
    return () => window.clearTimeout(t);
    // 仅在刚进入类型时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKind]);

  const leaveMode = () => {
    resetForm();
    setSeedKind(null);
  };

  const addPage = (kind: PageKind) => {
    if (pages.length >= MAX_PAGES) {
      setErr(`最多 ${MAX_PAGES} 页`);
      return;
    }
    setShowAddMenu(false);
    setErr(null);
    const next = emptyPage(kind);
    setPages((prev) => [...prev, next]);
    setActive(pages.length);
    if (kind !== 'text') {
      window.setTimeout(() => {
        openFilePicker(
          kind === 'image' ? 'image' : kind === 'audio' ? 'audio' : 'video',
        );
      }, 120);
    }
  };

  /** ＋ 默认加同类型页（小红书式）；长按/展开再选其它 */
  const quickAddPage = () => {
    const kind = current?.kind || seedKind || 'image';
    addPage(kind);
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
    if (!files?.length || !current) return;
    const kind = pendingUploadKind;
    setErr(null);
    setBusy(true);
    try {
      if (kind === 'image' || kind === 'cover') {
        const list = Array.from(files).slice(0, Math.max(1, MAX_PAGES - pages.length + 1));
        if (kind === 'cover' || list.length === 1) {
          setBusyLabel('上传图片…');
          const url = await uploadKnowledgeNoteMedia(list[0]!, 'cover');
          patchPage(current.id, { src: url });
          setOkHint('图片已上传');
        } else {
          // 多选：当前页用第一张，其余追加为图页
          const urls: string[] = [];
          for (let i = 0; i < list.length; i += 1) {
            setBusyLabel(`上传图片 ${i + 1}/${list.length}…`);
            urls.push(await uploadKnowledgeNoteMedia(list[i]!, 'cover'));
          }
          setPages((prev) => {
            const copy = [...prev];
            const cur = copy[active];
            if (cur) copy[active] = { ...cur, kind: 'image', src: urls[0]! };
            const extras = urls.slice(1).map((src) => ({
              ...emptyPage('image'),
              src,
            }));
            return [...copy, ...extras].slice(0, MAX_PAGES);
          });
          setOkHint(`已添加 ${urls.length} 张图`);
        }
      } else if (kind === 'audio') {
        setBusyLabel('上传音频…');
        const url = await uploadKnowledgeNoteMedia(files[0]!, 'audio');
        patchPage(current.id, { mediaUrl: url, kind: 'audio' });
        setOkHint('音频已上传');
      } else {
        setBusyLabel('上传视频…');
        const url = await uploadKnowledgeNoteMedia(files[0]!, 'video');
        patchPage(current.id, { mediaUrl: url, kind: 'video' });
        setOkHint('视频已上传');
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
      setSeedKind(primary);
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
    pendingUploadKind === 'audio'
      ? 'audio/mpeg,audio/mp4,audio/*,.mp3,.m4a,.aac,.wav,.ogg'
      : pendingUploadKind === 'video'
        ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
        : 'image/jpeg,image/png,image/webp';

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
          {CHOOSER_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              className="knowledge-note-chooser-card"
              role="listitem"
              onClick={() => enterMode(m)}
            >
              <em className="knowledge-note-chooser-glyph" aria-hidden>
                {MODE_META[m].pageLabel}
              </em>
              <strong>{MODE_META[m].label}</strong>
              <span>{MODE_META[m].hint}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  const openCurrentMedia = () => {
    if (!current) return;
    if (current.kind === 'image') openFilePicker('image');
    else if (current.kind === 'audio') openFilePicker('audio');
    else if (current.kind === 'video') openFilePicker('video');
  };

  return (
    <main className="knowledge-note-compose">
      <header className="knowledge-compose-bar">
        <button type="button" className="knowledge-compose-cancel" onClick={leaveMode}>
          取消
        </button>
        <p className="knowledge-compose-meta" aria-live="polite">
          {active + 1}/{pages.length}
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

      <input
        key={`pick-${pendingUploadKind}-${pickerNonce}`}
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
            className={`knowledge-compose-hero${pageReady(current) ? ' has-media' : ''}`}
            disabled={busy}
            onClick={openCurrentMedia}
            aria-label={
              current.kind === 'image'
                ? current.src
                  ? '更换图片'
                  : '添加图片'
                : current.mediaUrl
                  ? `更换${current.kind === 'audio' ? '音频' : '视频'}`
                  : `添加${current.kind === 'audio' ? '音频' : '视频'}`
            }
          >
            {current.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={knowledgeMediaUrl(current.src)} alt="" />
            ) : (
              <span className="knowledge-compose-hero-empty">
                <strong>＋</strong>
                <span>
                  {current.kind === 'image'
                    ? '添加图片'
                    : current.kind === 'audio'
                      ? '添加音频'
                      : '添加视频'}
                </span>
                <em>可多选图片一次加多页</em>
              </span>
            )}
            {current.kind !== 'image' && current.mediaUrl ? (
              <span className="knowledge-compose-hero-badge">
                {current.kind === 'audio' ? '听' : '看'} · 已选
              </span>
            ) : null}
          </button>
        ) : null}

        {current && (current.kind === 'audio' || current.kind === 'video') ? (
          <button
            type="button"
            className="knowledge-compose-cover-link"
            disabled={busy}
            onClick={() => openFilePicker('cover')}
          >
            {current.src ? '更换封面' : '添加封面图（可选）'}
          </button>
        ) : null}

        <div className="knowledge-compose-copy">
          <input
            className="knowledge-compose-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="添加标题"
            autoFocus={seedKind === 'text'}
          />
          {current?.kind === 'text' ? (
            <textarea
              className="knowledge-compose-body"
              value={current.body}
              onChange={(e) => patchPage(current.id, { body: e.target.value })}
              rows={12}
              maxLength={4000}
              placeholder="写正文，点底部 ＋ 可继续加页"
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

        {err ? <p className="knowledge-note-editor-err">{err}</p> : null}
        {busy && busyLabel ? (
          <p className="knowledge-note-editor-busy">{busyLabel}</p>
        ) : null}
        {okHint ? <p className="knowledge-note-editor-ok">{okHint}</p> : null}
      </div>

      <nav className="knowledge-compose-strip" aria-label="册页">
        <div className="knowledge-compose-strip-scroll">
          {pages.map((p, i) => (
            <div
              key={p.id}
              className={`knowledge-compose-thumb${i === active ? ' is-on' : ''}${pageReady(p) ? '' : ' is-empty'}`}
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
                onClick={() => setActive(i)}
                aria-label={`第 ${i + 1} 页`}
                aria-current={i === active ? 'page' : undefined}
              >
                {p.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={knowledgeMediaUrl(p.src)} alt="" />
                ) : (
                  <span className="knowledge-folio-thumb-fallback">
                    {MODE_META[p.kind].pageLabel}
                  </span>
                )}
                <em>{i + 1}</em>
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
            onContextMenu={(e) => {
              e.preventDefault();
              setShowAddMenu(true);
            }}
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
        <p className="knowledge-compose-strip-hint">拖动缩略图可排序 · ＋加同类型页</p>
      </nav>

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
              {CHOOSER_ORDER.map((k) => (
                <button key={k} type="button" onClick={() => addPage(k)}>
                  <em>{MODE_META[k].pageLabel}</em>
                  <strong>{MODE_META[k].label}</strong>
                </button>
              ))}
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
