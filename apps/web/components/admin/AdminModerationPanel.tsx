'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchModerationCases, resolveModerationCase, type ModerationCase } from '@/lib/admin_moderation';

const REASON_LABEL: Record<string, string> = {
  spam: '广告骚扰',
  abuse: '不当内容',
  heresy: '异端传教',
  illegal: '违法违规',
  other: '其他',
};

export default function AdminModerationPanel() {
  const [status, setStatus] = useState<'open' | 'actioned' | 'dismissed' | 'all'>('open');
  const [items, setItems] = useState<ModerationCase[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetchModerationCases(status);
      setItems(r);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, [status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (id: string, next: 'actioned' | 'dismissed') => {
    setBusyId(id);
    try {
      const note = window.prompt(next === 'actioned' ? '处置说明（可选）' : '驳回说明（可选）') || undefined;
      await resolveModerationCase(id, next, note);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-moderation">
      <div className="admin-tabs" role="tablist" style={{ marginBottom: 12 }}>
        {([
          ['open', '待处理'],
          ['actioned', '已处置'],
          ['dismissed', '已驳回'],
          ['all', '全部'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`admin-tab ${status === id ? 'admin-tab-active' : ''}`}
            aria-selected={status === id}
            onClick={() => setStatus(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {err ? <p className="error-text">{err}</p> : null}
      {items.length === 0 ? (
        <p className="muted">暂无工单</p>
      ) : (
        <ul className="admin-moderation-list">
          {items.map((c) => {
            const body = typeof c.snapshot?.body === 'string' ? c.snapshot.body : '';
            return (
              <li key={c.id} className="settings-card" style={{ marginBottom: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{REASON_LABEL[c.reason] || c.reason}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{c.created_at?.slice(0, 16)}</span>
                </div>
                <p className="muted" style={{ margin: '6px 0', fontSize: 12 }}>
                  {c.target_type} · {c.target_id.slice(0, 8)}…
                </p>
                {body ? (
                  <p style={{ margin: '0 0 8px', fontSize: 13, whiteSpace: 'pre-wrap' }}>{body}</p>
                ) : (
                  <p className="muted" style={{ fontSize: 13 }}>无正文快照</p>
                )}
                {c.status === 'open' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={busyId === c.id}
                      onClick={() => void act(c.id, 'actioned')}
                    >
                      处置
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === c.id}
                      onClick={() => void act(c.id, 'dismissed')}
                    >
                      驳回
                    </button>
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                    {c.status}{c.resolution_note ? ` · ${c.resolution_note}` : ''}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
