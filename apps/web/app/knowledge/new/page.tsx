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
import { renderNoteBodyPng, renderNoteCoverPng } from '@/lib/note_paper_render';
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
  text: { label: '写文字', hint: '分段成册，可生成纸页竖图', verb: '文字' },
  image: { label: '传图片', hint: '多图排成手稿册页', verb: '图片' },
  audio: { label: '传音频', hint: '听稿 · 封面 + 导语', verb: '音频' },
  video: { label: '传视频', hint: '看稿 · 封面 + 导语', verb: '视频' },
};

function previewParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 12);
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
      const pages = buildFolioForSave();
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
        setOkHint('草稿已保存');
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
    setBusyLabel('生成纸页图…');
    try {
      const paragraphs = previewParagraphs(body);
      const coverBlob = await renderNoteCoverPng({
        title: title.trim(),
        guide: paragraphs[0] || '',
      });
      const bodyBlobs: Blob[] = [];
      for (let i = 0; i < paragraphs.length; i += 1) {
        bodyBlobs.push(
          await renderNoteBodyPng({
            title: title.trim(),
            sectionLabel: paragraphs.length > 1 ? `第 ${i + 1} 段` : '正文',
            body: paragraphs[i],
            pageIndex: i + 1,
            pageTotal: paragraphs.length,
          }),
        );
      }

      setBusyLabel('上传纸页图…');
      const coverUrl = await uploadKnowledgeNoteMedia(
        blobToFile(coverBlob, 'paper-cover.png'),
        'cover',
      );
      const pageUrls: string[] = [];
      for (let i = 0; i < bodyBlobs.length; i += 1) {
        pageUrls.push(
          await uploadKnowledgeNoteMedia(
            blobToFile(bodyBlobs[i], `paper-p${i + 1}.png`),
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
          alt: `${title.trim()} · 第 ${i + 1} 段`,
        })),
      ];

      setCover(coverUrl);
      setFolioPages(pages);
      setOkHint(`已生成 ${pages.length} 张纸页图`);

      for (const u of paperPreviewUrls) URL.revokeObjectURL(u);
      setPaperPreviewUrls([
        URL.createObjectURL(coverBlob),
        ...bodyBlobs.map((b) => URL.createObjectURL(b)),
      ]);
      setShowPreview(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成纸页图失败');
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

  return (
    <main className="container knowledge-note-editor">
      <header className="page-head">
        <PageBackBar onClick={leaveMode} label="选择类型" />
        <h2 className="page-head-title">{meta.label}</h2>
      </header>
      <p className="knowledge-note-editor-lead">{meta.hint}</p>

      <label className="knowledge-note-field">
        <span>标题</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="例如：安息日的安静"
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
            }}
            rows={10}
            maxLength={12000}
            placeholder="分段之间空一行；第一段会作为导语。"
          />
        </label>
      ) : (
        <label className="knowledge-note-field">
          <span>导语（可选）</span>
          <textarea
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="一句话说明这则手稿"
          />
        </label>
      )}

      {mode === 'image' ? (
        <div className="knowledge-note-field">
          <span>图片册页（可多选，最多 12 张）</span>
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
            className="btn"
            disabled={busy}
            onClick={() => imagesInputRef.current?.click()}
          >
            {imageUrls.length ? '继续添加' : '选择图片'}
          </button>
          {imageUrls.length > 0 ? (
            <div className="knowledge-note-image-strip">
              {imageUrls.map((src, i) => (
                <div key={`${src}-${i}`} className="knowledge-note-image-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={knowledgeMediaUrl(src)} alt="" />
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
          <span>音频</span>
          <div className="knowledge-note-upload-row">
            <input
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="已上传后显示地址"
              readOnly
            />
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
              className="btn"
              disabled={busy}
              onClick={() => audioInputRef.current?.click()}
            >
              上传
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'video' ? (
        <div className="knowledge-note-field">
          <span>视频</span>
          <div className="knowledge-note-upload-row">
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="已上传后显示地址"
              readOnly
            />
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
              className="btn"
              disabled={busy}
              onClick={() => videoInputRef.current?.click()}
            >
              上传
            </button>
          </div>
        </div>
      ) : null}

      {(mode === 'audio' || mode === 'video' || mode === 'text') && (
        <div className="knowledge-note-field">
          <span>{mode === 'text' ? '封面（可选）' : '封面'}</span>
          <div className="knowledge-note-upload-row">
            <input
              value={cover}
              onChange={(e) => {
                setCover(e.target.value);
                setFolioPages(null);
              }}
              placeholder={mode === 'text' ? '可选上传或生成纸页' : '建议上传'}
            />
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
              className="btn"
              disabled={busy}
              onClick={() => coverInputRef.current?.click()}
            >
              上传
            </button>
          </div>
        </div>
      )}

      {err ? <p className="knowledge-note-editor-err">{err}</p> : null}
      {okHint ? <p className="knowledge-note-editor-ok">{okHint}</p> : null}
      {busy && busyLabel ? (
        <p className="knowledge-note-editor-busy">{busyLabel}</p>
      ) : null}

      <div className="knowledge-note-editor-actions">
        <button
          type="button"
          className="btn"
          disabled={!canPublish()}
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? '收起预览' : '预览'}
        </button>
        {mode === 'text' ? (
          <button
            type="button"
            className="btn"
            disabled={busy || !title.trim() || !body.trim()}
            onClick={() => void onGeneratePaper()}
          >
            生成纸页图
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={busy || !canPublish()}
          onClick={() => void onSave('draft')}
        >
          存草稿
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !canPublish()}
          onClick={() => void onSave('published')}
        >
          {busy && busyLabel.includes('发布') ? '发布中…' : '发布到探索'}
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
