'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { api, type KnowledgeLayoutSummary } from '@/lib/api';
import {
  knowledgeKindLabel,
  resolveKnowledgeTopicMeta,
} from '@/lib/knowledge_topic_meta';
import { knowledgeLayoutViewHref } from '@/lib/topic_routes';
import { adminCheck, deleteKnowledgeNote } from '@/lib/admin_rag';
import { useConfirm } from '@/components/ui/ConfirmProvider';

function isNoteRow(row: KnowledgeLayoutSummary): boolean {
  return (
    row.kind === 'note' ||
    row.source?.kind === 'note' ||
    (row.id || '').startsWith('note-')
  );
}

function sortLayouts(rows: KnowledgeLayoutSummary[]) {
  return [...rows].sort((a, b) => {
    const na = isNoteRow(a) ? 0 : 1;
    const nb = isNoteRow(b) ? 0 : 1;
    if (na !== nb) return na - nb;
    const ta = Date.parse(a.generated_at || '') || 0;
    const tb = Date.parse(b.generated_at || '') || 0;
    if (tb !== ta) return tb - ta;
    return (a.title || a.id || '').localeCompare(b.title || b.id || '', 'zh');
  });
}

/** 管理员：专题下架管理（与浏览列表分离） */
export default function KnowledgeManagePage() {
  const router = useRouter();
  const goBack = useFlowBack('/knowledge');
  const confirm = useConfirm();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState<KnowledgeLayoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void adminCheck()
      .then((ok) => {
        if (cancelled) return;
        setIsAdmin(ok);
        setReady(true);
        if (!ok) router.replace('/knowledge');
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(false);
        setReady(true);
        router.replace('/knowledge');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.knowledgeLayouts();
      setRows(sortLayouts(res.layouts || []));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void reload();
  }, [isAdmin, reload]);

  const notes = useMemo(() => rows.filter(isNoteRow), [rows]);
  const systemRows = useMemo(() => rows.filter((r) => !isNoteRow(r)), [rows]);

  const onUnpublish = async (row: KnowledgeLayoutSummary) => {
    const id = row.id || '';
    if (!isNoteRow(row) || !id) return;
    const ok = await confirm({
      title: '下架手稿？',
      message: `「${row.title || id}」将从探索列表移除。`,
      confirmLabel: '下架',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
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

  if (!ready || !isAdmin) {
    return (
      <main className="container knowledge-manage-page" aria-busy="true">
        <p className="muted">正在载入…</p>
      </main>
    );
  }

  return (
    <main className="container knowledge-manage-page">
      <header className="page-head knowledge-topics-head">
        <PageBackBar onClick={goBack} label="探索" />
        <h2 className="page-head-title">管理专题</h2>
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
      </header>

      <p className="knowledge-manage-lead muted">
        运营笔记可下架；系统行程专题不可删。
      </p>

      {loading ? (
        <p className="muted">正在载入…</p>
      ) : (
        <>
          <section className="knowledge-manage-section" aria-labelledby="km-notes">
            <h3 id="km-notes" className="knowledge-manage-section-title">
              运营笔记
              <span className="knowledge-manage-count">{notes.length}</span>
            </h3>
            {notes.length === 0 ? (
              <p className="muted knowledge-manage-empty">暂无运营笔记</p>
            ) : (
              <ul className="knowledge-manage-list">
                {notes.map((row) => {
                  const meta = resolveKnowledgeTopicMeta(row);
                  const href = knowledgeLayoutViewHref(row);
                  const busy = busyId === row.id;
                  return (
                    <li key={row.id} className="knowledge-manage-row">
                      <div className="knowledge-manage-row-main">
                        <Link href={href} className="knowledge-manage-row-title">
                          {row.title || row.id}
                        </Link>
                        <p className="knowledge-manage-row-meta muted">
                          {knowledgeKindLabel(meta.kind)}
                          {row.beat_count ? ` · ${row.beat_count} 页` : ''}
                        </p>
                      </div>
                      <div className="knowledge-manage-row-actions">
                        <Link href={href} className="knowledge-manage-btn">
                          查看
                        </Link>
                        <button
                          type="button"
                          className="knowledge-manage-btn is-danger"
                          disabled={busy}
                          onClick={() => void onUnpublish(row)}
                        >
                          {busy ? '…' : '下架'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {systemRows.length > 0 ? (
            <section className="knowledge-manage-section" aria-labelledby="km-system">
              <h3 id="km-system" className="knowledge-manage-section-title">
                系统专题
                <span className="knowledge-manage-count">{systemRows.length}</span>
              </h3>
              <ul className="knowledge-manage-list">
                {systemRows.map((row) => {
                  const meta = resolveKnowledgeTopicMeta(row);
                  const href = knowledgeLayoutViewHref(row);
                  return (
                    <li key={row.id} className="knowledge-manage-row">
                      <div className="knowledge-manage-row-main">
                        <Link href={href} className="knowledge-manage-row-title">
                          {row.title || row.id}
                        </Link>
                        <p className="knowledge-manage-row-meta muted">
                          {knowledgeKindLabel(meta.kind)} · 不可下架
                        </p>
                      </div>
                      <div className="knowledge-manage-row-actions">
                        <Link href={href} className="knowledge-manage-btn">
                          查看
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
