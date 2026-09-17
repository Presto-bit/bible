'use client';

import { useCallback, useEffect, useState } from 'react';
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
import {
  adminCheck,
  deleteKnowledgeLayout,
  unpublishKnowledgeLayout,
} from '@/lib/admin_rag';
import { useConfirm } from '@/components/ui/ConfirmProvider';

function sortLayouts(rows: KnowledgeLayoutSummary[]) {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.generated_at || '') || 0;
    const tb = Date.parse(b.generated_at || '') || 0;
    if (tb !== ta) return tb - ta;
    return (a.title || a.id || '').localeCompare(b.title || b.id || '', 'zh');
  });
}

/** 管理员：专题下架 / 删除（笔记与行程） */
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

  const onUnpublish = async (row: KnowledgeLayoutSummary) => {
    const id = row.id || '';
    if (!id) return;
    const ok = await confirm({
      title: '下架专题？',
      message: `「${row.title || id}」将从探索列表移除（文件保留，可再上架）。`,
      confirmLabel: '下架',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await unpublishKnowledgeLayout(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '下架失败');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (row: KnowledgeLayoutSummary) => {
    const id = row.id || '';
    if (!id) return;
    const ok = await confirm({
      title: '删除专题？',
      message: `将永久删除「${row.title || id}」的版式文件，不可恢复。`,
      confirmLabel: '删除',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await deleteKnowledgeLayout(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '删除失败');
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
        下架：移出列表；删除：永久移除版式。笔记与行程均可操作。
      </p>

      {loading ? (
        <p className="muted">正在载入…</p>
      ) : rows.length === 0 ? (
        <p className="muted knowledge-manage-empty">暂无已发布专题</p>
      ) : (
        <section className="knowledge-manage-section" aria-labelledby="km-all">
          <h3 id="km-all" className="knowledge-manage-section-title">
            全部专题
            <span className="knowledge-manage-count">{rows.length}</span>
          </h3>
          <ul className="knowledge-manage-list">
            {rows.map((row) => {
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
                      className="knowledge-manage-btn"
                      disabled={busy}
                      onClick={() => void onUnpublish(row)}
                    >
                      {busy ? '…' : '下架'}
                    </button>
                    <button
                      type="button"
                      className="knowledge-manage-btn is-danger"
                      disabled={busy}
                      onClick={() => void onDelete(row)}
                    >
                      {busy ? '…' : '删除'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
