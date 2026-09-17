'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import type { KnowledgeLayoutSummary } from '@/lib/api';
import { knowledgeMediaUrl } from '@/lib/knowledge_media_url';
import { knowledgeLayoutViewHref } from '@/lib/topic_routes';
import { readManuscriptPage } from '@/lib/manuscript_progress';
import {
  knowledgeKindLabel,
  knowledgeMediaBadge,
  resolveKnowledgeTopicMeta,
} from '@/lib/knowledge_topic_meta';
import { adminCheck, deleteKnowledgeNote } from '@/lib/admin_rag';

function coverFor(row: KnowledgeLayoutSummary): string {
  if (row.cover_image) return knowledgeMediaUrl(row.cover_image);
  const id = row.id || '';
  if (id === 'exodus-wilderness') {
    return knowledgeMediaUrl('/knowledge/vignettes/wilderness/00_overview.png');
  }
  if (id === 'paul-first-journey') {
    // 列表用轻量脊图，勿用 1080×1920 comic
    return knowledgeMediaUrl('/knowledge/infographics/paul-first-journey.png');
  }
  return knowledgeMediaUrl('/knowledge/infographics/_paper_texture.jpg');
}

function shortTitle(title: string): string {
  const t = title.trim();
  // 两列卡可排约 2–3 行；勿在「保罗第一次宣教旅程」这类完整题名上硬截半截
  if (t.length <= 18) return t;
  return `${t.slice(0, 17)}…`;
}

function shortHook(guide?: string): string {
  const g = (guide || '').trim();
  if (!g) return '';
  if (g.length <= 42) return g;
  return `${g.slice(0, 41)}…`;
}

function isNoteRow(row: KnowledgeLayoutSummary): boolean {
  return (
    row.kind === 'note' ||
    row.source?.kind === 'note' ||
    (row.id || '').startsWith('note-')
  );
}

type FilterId = 'all' | 'journey' | 'note';

type Props = {
  initialLayouts: KnowledgeLayoutSummary[];
};

/**
 * 探索列表：1 行 2 卡封面流（点进直达全屏），对齐已拍板方案。
 */
export function KnowledgeTopicsClient({ initialLayouts }: Props) {
  const goBack = useFlowBack('/');
  const [rows, setRows] = useState(initialLayouts);
  const [filter, setFilter] = useState<FilterId>('all');
  const [resumeById, setResumeById] = useState<Record<string, number>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialLayouts);
  }, [initialLayouts]);

  useEffect(() => {
    void adminCheck().then(setIsAdmin).catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    const map: Record<string, number> = {};
    for (const row of rows) {
      const id = row.source?.id || row.id;
      if (!id) continue;
      const pageCount = row.beat_count ? row.beat_count + 1 : undefined;
      const page = readManuscriptPage(id, pageCount);
      if (page > 0) map[id] = page;
    }
    setResumeById(map);
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'note') return rows.filter(isNoteRow);
    return rows.filter((r) => !isNoteRow(r));
  }, [rows, filter]);

  const onUnpublish = async (row: KnowledgeLayoutSummary) => {
    const id = row.id || '';
    if (!isNoteRow(row) || !id) return;
    if (!window.confirm(`下架「${row.title || id}」？列表将不再显示。`)) return;
    setBusyId(id);
    try {
      await deleteKnowledgeNote(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '下架失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="container knowledge-topics-page">
      <header className="page-head knowledge-topics-head">
        <PageBackBar onClick={goBack} label="首页" />
        <h2 className="page-head-title">探索</h2>
        {isAdmin ? (
          <div className="page-head-actions">
            <Link
              href="/knowledge/new"
              className="icon-btn knowledge-topics-new"
              aria-label="新建手稿"
              title="新建"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Link>
          </div>
        ) : (
          <span className="knowledge-topics-new-spacer" aria-hidden />
        )}
      </header>
      <p className="knowledge-topics-lead">点开即读</p>

      <div className="knowledge-topics-filters" role="tablist" aria-label="筛选">
        {(
          [
            ['all', '全部'],
            ['journey', '行程'],
            ['note', '笔记'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`knowledge-topics-filter${filter === id ? ' is-on' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="muted knowledge-topics-empty">
          {rows.length === 0 ? '暂无专题，稍后再来看看。' : '此分类暂无内容。'}
        </p>
      ) : (
        <div className="knowledge-topics-grid">
          {visible.map((row, i) => {
            const sourceId = row.source?.id || row.id;
            const resume = sourceId ? resumeById[sourceId] : undefined;
            const meta = resolveKnowledgeTopicMeta(row);
            const mediaBadge = knowledgeMediaBadge(meta.media);
            const note = isNoteRow(row);
            return (
              <div key={row.id} className="knowledge-topic-card-wrap">
                <Link
                  href={knowledgeLayoutViewHref(row)}
                  className="knowledge-topic-card"
                  aria-label={
                    resume
                      ? `${row.title || row.id}，续读第 ${resume + 1} 页`
                      : `${row.title || row.id}，打开手稿`
                  }
                  style={{ ['--stagger' as string]: i }}
                >
                  <span className="knowledge-topic-card-media" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="knowledge-topic-card-photo"
                      src={coverFor(row)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="knowledge-topic-card-veil" />
                    <span className="knowledge-topic-card-seal">
                      {knowledgeKindLabel(meta.kind)}
                    </span>
                    {mediaBadge ? (
                      <span className="knowledge-topic-card-media-badge">{mediaBadge}</span>
                    ) : null}
                    {resume ? (
                      <span className="knowledge-topic-card-resume">续 · {resume + 1}</span>
                    ) : row.beat_count ? (
                      <span className="knowledge-topic-card-count">{row.beat_count} 页</span>
                    ) : null}
                    <span className="knowledge-topic-card-caption">
                      <strong className="knowledge-topic-card-title">
                        {shortTitle(row.title || row.id || '')}
                      </strong>
                      {row.guide_one_liner ? (
                        <span className="knowledge-topic-card-guide">
                          {shortHook(row.guide_one_liner)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
                {isAdmin && note ? (
                  <button
                    type="button"
                    className="knowledge-topic-card-unpub"
                    disabled={busyId === row.id}
                    onClick={() => void onUnpublish(row)}
                  >
                    {busyId === row.id ? '…' : '下架'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
