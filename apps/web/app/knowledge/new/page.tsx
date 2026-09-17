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

type DraftRow = {
  id: string;
  title?: string;
  guide_one_liner?: string;
  generated_at?: string;
  cover_image?: string;
};

/** 管理员新建运营笔记手稿 */
export default function KnowledgeNewNotePage() {
  const router = useRouter();
  const goBack = useFlowBack('/knowledge');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [cover, setCover] = useState('');
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
  const coverSrc = knowledgeMediaUrl(
    cover.trim() || '/knowledge/infographics/_paper_texture.jpg',
  );
  const guide = paras[0] || '';

  const uploadFile = async (file: File, kind: 'cover' | 'audio' | 'video') => {
    setErr(null);
    setBusy(true);
    setBusyLabel(`上传${kind === 'cover' ? '封面' : kind === 'audio' ? '音频' : '视频'}…`);
    try {
      const url = await uploadKnowledgeNoteMedia(file, kind);
      if (kind === 'cover') setCover(url);
      if (kind === 'audio') setAudioUrl(url);
      if (kind === 'video') setVideoUrl(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const onSave = async (status: 'draft' | 'published') => {
    setErr(null);
    setOkHint(null);
    setBusy(true);
    setBusyLabel(status === 'draft' ? '保存草稿…' : '发布中…');
    try {
      const saved = await createKnowledgeNote({
        title: title.trim(),
        body: body.trim(),
        cover_image: cover.trim() || undefined,
        audio_url: audioUrl.trim() || undefined,
        video_url: videoUrl.trim() || undefined,
        status,
        note_id: noteId,
        folio_pages: folioPages || undefined,
      });
      setNoteId(saved.id);
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

      const media =
        videoUrl.trim()
          ? { type: 'video', url: videoUrl.trim(), label: '本页视频' }
          : audioUrl.trim()
            ? { type: 'audio', url: audioUrl.trim(), label: '本页音频' }
            : undefined;

      const pages: Array<Record<string, unknown>> = [
        {
          key: 'cover',
          type: 'image',
          src: coverUrl,
          alt: `${title.trim()} · 封面`,
          media,
        },
        ...pageUrls.map((src, i) => ({
          key: `p${i + 1}`,
          type: 'image',
          src,
          alt: `${title.trim()} · 第 ${i + 1} 段`,
          media: i === 0 ? media : undefined,
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
      setNoteId(layout.id);
      setTitle(layout.title || '');
      setBody(layout.body_source || '');
      setCover(layout.cover_image || '');
      setFolioPages(Array.isArray(layout.folio_pages) ? layout.folio_pages : null);
      const m = layout.beats?.[0]?.media || layout.folio_pages?.[0]?.media;
      const media = m as { type?: string; url?: string } | undefined;
      if (media?.type === 'audio' && media.url) setAudioUrl(media.url);
      if (media?.type === 'video' && media.url) setVideoUrl(media.url);
      setShowPreview(true);
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

  return (
    <main className="container knowledge-note-editor">
      <header className="page-head">
        <PageBackBar onClick={goBack} label="探索" />
        <h2 className="page-head-title">新建手稿</h2>
      </header>
      <p className="knowledge-note-editor-lead">
        标题 + 正文（空行分段）。可本地上传封面/音视频，或一键生成纸页竖图后再发布。草稿不进公开列表。
      </p>

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

      <label className="knowledge-note-field">
        <span>标题</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="例如：安息日的安静"
        />
      </label>

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

      <div className="knowledge-note-media-row">
        <div className="knowledge-note-field">
          <span>封面</span>
          <div className="knowledge-note-upload-row">
            <input
              value={cover}
              onChange={(e) => {
                setCover(e.target.value);
                setFolioPages(null);
              }}
              placeholder="/knowledge/… 或上传"
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

        <div className="knowledge-note-field">
          <span>音频（可选）</span>
          <div className="knowledge-note-upload-row">
            <input
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="mp3 / m4a…"
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

        <div className="knowledge-note-field">
          <span>视频（可选）</span>
          <div className="knowledge-note-upload-row">
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="mp4 / webm…"
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
      </div>

      {err ? <p className="knowledge-note-editor-err">{err}</p> : null}
      {okHint ? <p className="knowledge-note-editor-ok">{okHint}</p> : null}
      {busy && busyLabel ? (
        <p className="knowledge-note-editor-busy">{busyLabel}</p>
      ) : null}

      <div className="knowledge-note-editor-actions">
        <button
          type="button"
          className="btn"
          disabled={!title.trim() || !body.trim()}
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? '收起预览' : '预览'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void onGeneratePaper()}
        >
          生成纸页图
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void onSave('draft')}
        >
          存草稿
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void onSave('published')}
        >
          {busy && busyLabel.includes('发布') ? '发布中…' : '发布到探索'}
        </button>
      </div>

      {folioPages ? (
        <p className="knowledge-note-paper-hint">
          已绑定 {folioPages.length} 张纸页图；改正文后需重新生成。
        </p>
      ) : null}

      {showPreview ? (
        <section className="knowledge-note-preview" aria-label="发布预览">
          <p className="knowledge-note-preview-meta">
            预览 · 共 {(paperPreviewUrls.length || paras.length + 1)} 页
            {audioUrl.trim() ? ' · 听' : ''}
            {videoUrl.trim() ? ' · 看' : ''}
            {noteId ? ` · ${noteId}` : ''}
          </p>
          {paperPreviewUrls.length > 0 ? (
            <div className="knowledge-note-paper-strip">
              {paperPreviewUrls.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`纸页 ${i + 1}`} />
              ))}
            </div>
          ) : (
            <>
              <div className="knowledge-note-preview-cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverSrc} alt="" />
                <strong>{title.trim() || '未命名'}</strong>
                {guide ? (
                  <span>
                    {guide.slice(0, 48)}
                    {guide.length > 48 ? '…' : ''}
                  </span>
                ) : null}
              </div>
              <ol className="knowledge-note-preview-pages">
                {paras.map((p, i) => (
                  <li key={i}>
                    <em>第 {i + 1} 段</em>
                    <p>{p}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
