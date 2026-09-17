'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { renderNoteArticlePngs, splitNoteParagraphs } from '@/lib/note_paper_render';
import { knowledgeNoteHref } from '@/lib/topic_routes';

type CreateMode = 'text' | 'image' | 'audio' | 'video';

type DraftRow = {
  id: string;
  title?: string;
  guide_one_liner?: string;
  generated_at?: string;
  cover_image?: string;
};

const MODE_META: Record<
  CreateMode,
  { label: string; hint: string; verb: string }
> = {
  text: { label: '写文字', hint: '长文排版成册页图，默认图片阅读', verb: '文字' },
  image: { label: '传图片', hint: '多图排成手稿册页', verb: '图片' },
  audio: { label: '传音频', hint: '听稿 · 封面 + 导语', verb: '音频' },
  video: { label: '传视频', hint: '看稿 · 封面 + 导语', verb: '视频' },
};

function previewParagraphs(body: string): string[] {
  return splitNoteParagraphs(body).slice(0, 12);
}

function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || 'image/png' });
}

function inferModeFromLayout(layout: {
  body_source?: string;
  folio_pages?: Array<Record<string, unknown>>;
  beats?: Array<{ media?: { type?: string } }>;
}): CreateMode {
  const media =
    layout.beats?.[0]?.media ||
    (layout.folio_pages?.[0]?.media as { type?: string } | undefined);
  if (media?.type === 'video') return 'video';
  if (media?.type === 'audio') return 'audio';
  const pages = layout.folio_pages || [];
  const imagePages = pages.filter(
    (p) => p.type === 'image' || (typeof p.src === 'string' && p.src),
  );
  const textOnly = pages.every((p) => p.type === 'text' || p.body);
  if (imagePages.length >= 2 && !textOnly) return 'image';
  if (imagePages.length >= 1 && !(layout.body_source || '').includes('\n\n')) {
    return 'image';
  }
  return 'text';
}

/** 管理员新建运营笔记：先选类型，再进分型表单（小红书式） */
export default function KnowledgeNewNotePage() {
  const router = useRouter();
  const goBack = useFlowBack('/knowledge');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [mode, setMode] = useState<CreateMode | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [guide, setGuide] = useState('');
  const [cover, setCover] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [noteId, setNoteId] = useState<string | undefined>();
  const [folioPages, setFolioPages] = useState<Array<Record<string, unknown>> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [okHint, setOkHint] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [paperPreviewUrls, setPaperPreviewUrls] = useState<string[]>([]);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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

  const paras = useMemo(() => previewParagraphs(body), [body]);
  const effectiveGuide =
    mode === 'text' ? paras[0] || '' : guide.trim() || paras[0] || '';
  const coverSrc = knowledgeMediaUrl(
    cover.trim() ||
      imageUrls[0] ||
      '/knowledge/infographics/_paper_texture.jpg',
  );

  const resetForm = () => {
    setTitle('');
    setBody('');
    setGuide('');
    setCover('');
    setImageUrls([]);
    setAudioUrl('');
    setVideoUrl('');
    setNoteId(undefined);
    setFolioPages(null);
    setErr(null);
    setOkHint(null);
    setShowPreview(false);
    for (const u of paperPreviewUrls) URL.revokeObjectURL(u);
    setPaperPreviewUrls([]);
  };

  const enterMode = (m: CreateMode) => {
    resetForm();
    setMode(m);
  };

  // 进入图/音/视频后自动弹出系统文件选择（更像小红书）
  useEffect(() => {
    if (!mode || mode === 'text') return;
    const t = window.setTimeout(() => {
      if (mode === 'image') imagesInputRef.current?.click();
      if (mode === 'audio') audioInputRef.current?.click();
      if (mode === 'video') videoInputRef.current?.click();
    }, 280);
    return () => window.clearTimeout(t);
  }, [mode]);

  const leaveMode = () => {
    resetForm();
    setMode(null);
  };

  const uploadFile = async (file: File, kind: 'cover' | 'audio' | 'video') => {
    setErr(null);
    setBusy(true);
    setBusyLabel(`上传${kind === 'cover' ? '封面' : kind === 'audio' ? '音频' : '视频'}…`);
    try {
      const url = await uploadKnowledgeNoteMedia(file, kind);
      if (kind === 'cover') {
        setCover(url);
        setFolioPages(null);
      }
      if (kind === 'audio') setAudioUrl(url);
      if (kind === 'video') setVideoUrl(url);
      setOkHint('上传成功');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const uploadImages = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 12);
    if (!list.length) return;
    setErr(null);
    setBusy(true);
    const next = [...imageUrls];
    try {
      for (let i = 0; i < list.length; i += 1) {
        setBusyLabel(`上传图片 ${i + 1}/${list.length}…`);
        const url = await uploadKnowledgeNoteMedia(list[i]!, 'cover');
        next.push(url);
      }
      setImageUrls(next);
      if (!cover.trim() && next[0]) setCover(next[0]);
      setFolioPages(null);
      setOkHint(`已添加 ${list.length} 张图`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const buildFolioForSave = (): Array<Record<string, unknown>> | undefined => {
    if (folioPages?.length) return folioPages;

    if (mode === 'image' && imageUrls.length > 0) {
      return imageUrls.map((src, i) => ({
        key: i === 0 ? 'cover' : `p${i}`,
        type: 'image',
        src,
        alt: `${title.trim() || '手稿'} · ${i === 0 ? '封面' : `第 ${i} 叶`}`,
      }));
    }

    if (mode === 'audio' && audioUrl.trim()) {
      const src =
        cover.trim() || '/knowledge/infographics/_paper_texture.jpg';
      return [
        {
          key: 'cover',
          type: 'image',
          src,
          alt: `${title.trim() || '手稿'} · 听`,
          media: { type: 'audio', url: audioUrl.trim(), label: '本页音频' },
        },
      ];
    }

    if (mode === 'video' && videoUrl.trim()) {
      const src =
        cover.trim() || '/knowledge/infographics/_paper_texture.jpg';
      return [
        {
          key: 'cover',
          type: 'image',
          src,
          alt: `${title.trim() || '手稿'} · 看`,
          media: { type: 'video', url: videoUrl.trim(), label: '本页视频' },
        },
      ];
    }

    return undefined;
  };

  /** 文字流：烘焙成长文纸页图（封面 + 自动分页正文） */
  const bakeTextArticle = async (): Promise<Array<Record<string, unknown>>> => {
    setBusyLabel('排版长文纸页…');
    const { cover: coverBlob, bodies } = await renderNoteArticlePngs({
      title: title.trim(),
      body: body.trim(),
    });

    setBusyLabel('上传纸页图…');
    const coverUrl = await uploadKnowledgeNoteMedia(
      blobToFile(coverBlob, 'paper-cover.png'),
      'cover',
    );
    const pageUrls: string[] = [];
    for (let i = 0; i < bodies.length; i += 1) {
      pageUrls.push(
        await uploadKnowledgeNoteMedia(
          blobToFile(bodies[i]!, `paper-p${i + 1}.png`),
          'cover',
        ),
      );
    }

    const pages: Array<Record<string, unknown>> = [
      {
        key: 'cover',
        type: 'image',
        src: coverUrl,
        alt: `${title.trim()} · 封面`,
      },
      ...pageUrls.map((src, i) => ({
        key: `p${i + 1}`,
        type: 'image',
        src,
        alt: `${title.trim()} · 第 ${i + 1} 页`,
      })),
    ];

    setCover(coverUrl);
    setFolioPages(pages);

    setPaperPreviewUrls((prev) => {
      for (const u of prev) URL.revokeObjectURL(u);
      return [
        URL.createObjectURL(coverBlob),
        ...bodies.map((b) => URL.createObjectURL(b)),
      ];
    });

    return pages;
  };

  const bodyForSave = (): string => {
    if (mode === 'text') return body.trim();
    const g = guide.trim();
    if (g) return g;
    return title.trim() || '彼爱手稿';
  };

  const canPublish = (): boolean => {
    if (!title.trim()) return false;
    if (mode === 'text') return body.trim().length >= 1;
    if (mode === 'image') return imageUrls.length >= 1;
    if (mode === 'audio') return Boolean(audioUrl.trim());
    if (mode === 'video') return Boolean(videoUrl.trim());
    return false;
  };

  const onSave = async (status: 'draft' | 'published') => {
    if (!mode) return;
    setErr(null);
    setOkHint(null);
    setBusy(true);
    setBusyLabel(status === 'draft' ? '保存草稿…' : '发布中…');
    try {
      let pages = buildFolioForSave();
      // 文字默认出图：发布（及尚无纸页的草稿）自动排版上传
      if (mode === 'text' && (status === 'published' || !pages?.length)) {
        pages = await bakeTextArticle();
      }
      const coverImage =
        cover.trim() ||
        imageUrls[0] ||
        (pages?.[0]?.src as string | undefined) ||
        undefined;
      const saved = await createKnowledgeNote({
        title: title.trim(),
        body: bodyForSave(),
        cover_image: coverImage,
        audio_url: mode === 'audio' ? audioUrl.trim() || undefined : undefined,
        video_url: mode === 'video' ? videoUrl.trim() || undefined : undefined,
        status,
        note_id: noteId,
        folio_pages: pages,
      });
      setNoteId(saved.id);
      if (pages) setFolioPages(pages);
      if (status === 'draft') {
        await refreshDrafts();
        setOkHint(mode === 'text' ? '草稿已保存（已排版为图片）' : '草稿已保存');
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

  const onGeneratePaper = async () => {
    if (!title.trim() || !body.trim()) {
      setErr('请先填写标题与正文');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const pages = await bakeTextArticle();
      setOkHint(`已排版 ${pages.length} 页长文图`);
      setShowPreview(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '排版失败');
    } finally {
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
          folio_pages?: Array<Record<string, unknown>>;
          beats?: Array<{ media?: { type?: string; url?: string } }>;
        };
      };
      const layout = data.layout;
      if (!layout?.id) throw new Error('草稿数据不完整');
      const nextMode = inferModeFromLayout(layout);
      setMode(nextMode);
      setNoteId(layout.id);
      setTitle(layout.title || '');
      const srcBody = layout.body_source || '';
      if (nextMode === 'text') {
        setBody(srcBody);
        setGuide('');
      } else {
        setGuide(srcBody.split(/\n\s*\n+/)[0]?.trim() || srcBody.trim());
        setBody('');
      }
      setCover(layout.cover_image || '');
      setFolioPages(Array.isArray(layout.folio_pages) ? layout.folio_pages : null);
      if (nextMode === 'image' && Array.isArray(layout.folio_pages)) {
        setImageUrls(
          layout.folio_pages
            .map((p) => (typeof p.src === 'string' ? p.src : ''))
            .filter(Boolean),
        );
      }
      const m = layout.beats?.[0]?.media || layout.folio_pages?.[0]?.media;
      const media = m as { type?: string; url?: string } | undefined;
      setAudioUrl(media?.type === 'audio' && media.url ? media.url : '');
      setVideoUrl(media?.type === 'video' && media.url ? media.url : '');
      setShowPreview(true);
      setOkHint('已载入草稿');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '载入失败');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

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

  /* —— 入口选择 —— */
  if (!mode) {
    return (
      <main className="container knowledge-note-editor">
        <header className="page-head">
          <PageBackBar onClick={goBack} label="探索" />
          <h2 className="page-head-title">新建手稿</h2>
        </header>
        <p className="knowledge-note-editor-lead">先选一种方式，再填写对应内容。</p>

        {drafts.length > 0 ? (
          <section className="knowledge-note-drafts" aria-label="草稿">
            <p className="knowledge-note-drafts-label">草稿（{drafts.length}）</p>
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
          {(Object.keys(MODE_META) as CreateMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="knowledge-note-chooser-card"
              role="listitem"
              onClick={() => enterMode(m)}
            >
              <strong>{MODE_META[m].label}</strong>
              <span>{MODE_META[m].hint}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  const meta = MODE_META[mode];
  const stepHint =
    mode === 'text'
      ? '① 写标题正文 → ② 发布时自动排成长文图 → ③ 图片阅读'
      : mode === 'image'
        ? '① 选图排序 → ② 写标题 → ③ 发布'
        : '① 上传文件 → ② 封面与标题 → ③ 发布';

  return (
    <main className="container knowledge-note-editor knowledge-note-editor--typed">
      <header className="page-head">
        <PageBackBar onClick={leaveMode} label="选择类型" />
        <h2 className="page-head-title">{meta.label}</h2>
      </header>
      <p className="knowledge-note-steps">{stepHint}</p>

      {/* 媒体优先：图/音/视频先上传 */}
      {mode === 'image' ? (
        <div className="knowledge-note-field">
          <input
            ref={imagesInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              const files = e.target.files;
              e.target.value = '';
              if (files?.length) void uploadImages(files);
            }}
          />
          <button
            type="button"
            className="knowledge-note-dropzone"
            disabled={busy}
            onClick={() => imagesInputRef.current?.click()}
          >
            <strong>{imageUrls.length ? '继续添加图片' : '点此选择图片'}</strong>
            <span>可多选，最多 12 张 · 顺序即册页</span>
          </button>
          {imageUrls.length > 0 ? (
            <div className="knowledge-note-image-strip">
              {imageUrls.map((src, i) => (
                <div key={`${src}-${i}`} className="knowledge-note-image-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={knowledgeMediaUrl(src)} alt="" />
                  <em>{i + 1}</em>
                  <button
                    type="button"
                    className="knowledge-note-image-remove"
                    aria-label="移除"
                    onClick={() => {
                      setImageUrls((prev) => prev.filter((_, j) => j !== i));
                      setFolioPages(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'audio' ? (
        <div className="knowledge-note-field">
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/*,.mp3,.m4a,.aac,.wav,.ogg"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void uploadFile(f, 'audio');
            }}
          />
          <button
            type="button"
            className={`knowledge-note-dropzone${audioUrl ? ' is-done' : ''}`}
            disabled={busy}
            onClick={() => audioInputRef.current?.click()}
          >
            <strong>{audioUrl ? '已选音频 · 点此更换' : '点此选择音频'}</strong>
            <span>mp3 / m4a / aac</span>
          </button>
        </div>
      ) : null}

      {mode === 'video' ? (
        <div className="knowledge-note-field">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void uploadFile(f, 'video');
            }}
          />
          <button
            type="button"
            className={`knowledge-note-dropzone${videoUrl ? ' is-done' : ''}`}
            disabled={busy}
            onClick={() => videoInputRef.current?.click()}
          >
            <strong>{videoUrl ? '已选视频 · 点此更换' : '点此选择视频'}</strong>
            <span>mp4 / webm</span>
          </button>
        </div>
      ) : null}

      <label className="knowledge-note-field">
        <span>标题</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="例如：安息日的安静"
          autoFocus={mode === 'text'}
        />
      </label>

      {mode === 'text' ? (
        <label className="knowledge-note-field">
          <span>正文</span>
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setFolioPages(null);
              setPaperPreviewUrls((prev) => {
                for (const u of prev) URL.revokeObjectURL(u);
                return [];
              });
            }}
            rows={10}
            maxLength={12000}
            placeholder={'分段之间空一行。\n发布后自动排成小红书式长文纸页图。'}
          />
        </label>
      ) : (
        <label className="knowledge-note-field">
          <span>导语（可选）</span>
          <textarea
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder="一句话说明这则手稿"
          />
        </label>
      )}

      {(mode === 'audio' || mode === 'video' || mode === 'text') && (
        <div className="knowledge-note-field">
          <span>{mode === 'text' ? '封面（可选）' : '封面'}</span>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void uploadFile(f, 'cover');
            }}
          />
          <button
            type="button"
            className={`knowledge-note-dropzone knowledge-note-dropzone--sm${cover ? ' is-done' : ''}`}
            disabled={busy}
            onClick={() => coverInputRef.current?.click()}
          >
            <strong>{cover ? '已选封面 · 点此更换' : '上传封面图'}</strong>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="knowledge-note-cover-preview"
                src={knowledgeMediaUrl(cover)}
                alt=""
              />
            ) : null}
          </button>
        </div>
      )}

      {err ? <p className="knowledge-note-editor-err">{err}</p> : null}
      {okHint ? <p className="knowledge-note-editor-ok">{okHint}</p> : null}
      {busy && busyLabel ? (
        <p className="knowledge-note-editor-busy">{busyLabel}</p>
      ) : null}

      <div className="knowledge-note-editor-actions knowledge-note-editor-actions--sticky">
        <button
          type="button"
          className="btn"
          disabled={!canPublish()}
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? '收起' : '预览'}
        </button>
        {mode === 'text' ? (
          <button
            type="button"
            className="btn"
            disabled={busy || !title.trim() || !body.trim()}
            onClick={() => void onGeneratePaper()}
          >
            预览排版
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={busy || !canPublish()}
          onClick={() => void onSave('draft')}
        >
          草稿
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !canPublish()}
          onClick={() => void onSave('published')}
        >
          {busy && busyLabel.includes('发布') ? '发布中…' : '发布'}
        </button>
      </div>

      {folioPages ? (
        <p className="knowledge-note-paper-hint">
          已绑定 {folioPages.length} 页；改内容后需重新生成或重新上传。
        </p>
      ) : null}

      {showPreview ? (
        <section className="knowledge-note-preview" aria-label="发布预览">
          <p className="knowledge-note-preview-meta">
            预览 · {meta.verb}
            {mode === 'image' ? ` · ${imageUrls.length} 图` : ''}
            {mode === 'audio' && audioUrl ? ' · 听' : ''}
            {mode === 'video' && videoUrl ? ' · 看' : ''}
            {noteId ? ` · ${noteId}` : ''}
          </p>
          {paperPreviewUrls.length > 0 ? (
            <div className="knowledge-note-paper-strip">
              {paperPreviewUrls.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`纸页 ${i + 1}`} />
              ))}
            </div>
          ) : mode === 'image' && imageUrls.length > 0 ? (
            <div className="knowledge-note-paper-strip">
              {imageUrls.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={knowledgeMediaUrl(src)} alt="" />
              ))}
            </div>
          ) : (
            <div className="knowledge-note-preview-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverSrc} alt="" />
              <strong>{title.trim() || '未命名'}</strong>
              {effectiveGuide ? (
                <span>
                  {effectiveGuide.slice(0, 48)}
                  {effectiveGuide.length > 48 ? '…' : ''}
                </span>
              ) : null}
            </div>
          )}
          {mode === 'text' && paras.length > 0 && paperPreviewUrls.length === 0 ? (
            <ol className="knowledge-note-preview-pages">
              {paras.map((p, i) => (
                <li key={i}>
                  <em>第 {i + 1} 段</em>
                  <p>{p}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
