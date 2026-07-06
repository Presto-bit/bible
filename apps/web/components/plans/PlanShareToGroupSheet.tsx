'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ensureAccountReady, type Group } from '@/lib/api';
import { markGroupsListDirty } from '@/lib/groups_refresh';
import { bindPlanToGroup, groupCheckinHref, groupsBoundToPlan, loadOwnerGroups } from '@/lib/plan_group_share';
import { recordPlanSharedGroup } from '@/lib/badge_events';

type Props = {
  open: boolean;
  planId: string;
  planTitle: string;
  /** 完成打卡时可带经文 ref */
  checkinRef?: string;
  onClose: () => void;
  onBound?: (gid: string) => void;
};

export function PlanShareToGroupSheet({
  open,
  planId,
  planTitle,
  checkinRef,
  onClose,
  onBound,
}: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void ensureAccountReady()
      .then(() => loadOwnerGroups())
      .then((list) => {
        if (!cancelled) setGroups(list);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const bound = groupsBoundToPlan(groups, planId);

  const handleBind = async (g: Group) => {
    if (g.plan_id === planId) {
      onBound?.(g.id);
      onClose();
      return;
    }
    const replace = g.plan_id
      ? `「${g.name}」已绑定其他计划，将替换为「${planTitle}」。继续？`
      : `将「${planTitle}」绑定到群「${g.name}」？`;
    if (!window.confirm(replace)) return;
    setBusyId(g.id);
    setErr(null);
    try {
      await bindPlanToGroup(g.id, planId);
      recordPlanSharedGroup();
      markGroupsListDirty();
      onBound?.(g.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    if (!window.confirm(`将创建新共读群并绑定「${planTitle}」。继续？`)) return;
    setBusyId('__create__');
    setErr(null);
    try {
      await ensureAccountReady();
      const g = await api.createGroupFromPlan(planId, `${planTitle} · 共读`);
      recordPlanSharedGroup();
      markGroupsListDirty();
      onBound?.(g.id);
      onClose();
      window.location.href = `/discover/group/${g.id}`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card plan-share-group-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>分享到共读群</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
          绑定后，群成员可在「今日焦点」看到同一计划并一起打卡。
        </p>

        {bound.length > 0 && (
          <div className="plan-share-bound-block">
            <span className="group-composer-label">已绑定的群</span>
            {bound.map((g) => (
              <div key={g.id} className="plan-share-group-row">
                <div>
                  <strong>{g.name}</strong>
                  <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>成员可共读此计划</p>
                </div>
                <Link
                  href={groupCheckinHref(g.id, checkinRef)}
                  className="font-pill accent"
                  onClick={onClose}
                >
                  去打卡
                </Link>
              </div>
            ))}
          </div>
        )}

        {loading && <p className="muted">加载群列表…</p>}
        {err && <p className="group-composer-err">{err}</p>}

        {!loading && groups.length === 0 && (
          <div className="card card-2" style={{ marginBottom: 12 }}>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
              你还没有可管理的共读群。可新建群并自动绑定本计划。
            </p>
            <button type="button" className="btn" style={{ width: '100%', marginTop: 12 }} disabled={busyId !== null} onClick={() => void handleCreate()}>
              {busyId === '__create__' ? '创建中…' : '新建共读群'}
            </button>
          </div>
        )}

        {groups.length > 0 && (
          <>
            <span className="group-composer-label">选择群绑定计划</span>
            <div className="plan-share-group-list">
              {groups.map((g) => {
                const isBound = g.plan_id === planId;
                const hasOther = Boolean(g.plan_id && g.plan_id !== planId);
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`plan-share-group-row plan-share-group-pick${isBound ? ' bound' : ''}`}
                    disabled={busyId !== null}
                    onClick={() => void handleBind(g)}
                  >
                    <div>
                      <strong>{g.name}</strong>
                      <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                        {isBound ? '已绑定本计划' : hasOther ? '将替换当前群计划' : '点击绑定'}
                      </p>
                    </div>
                    <span className="font-pill">{busyId === g.id ? '…' : isBound ? '已绑定' : '绑定'}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="text-link"
              style={{ marginTop: 12, width: '100%' }}
              disabled={busyId !== null}
              onClick={() => void handleCreate()}
            >
              {busyId === '__create__' ? '创建中…' : '+ 新建共读群并绑定'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
