'use client';

import { useState } from 'react';
import { api, type GeneratedPlan, type GroupDetail, type PlanSummary } from '@/lib/api';
import { loadGeneratedPlans, saveGeneratedPlan } from '@/lib/generated_plans';
import { GroupMembersPanel } from './GroupMembersPanel';
import { GroupMemberNickname } from './GroupMemberNickname';

type Props = {
  open: boolean;
  gid: string;
  detail: GroupDetail;
  isOwner: boolean;
  members: GroupDetail['members'];
  tasks: GroupDetail['tasks'];
  plans: PlanSummary[];
  generatedPlans: GeneratedPlan[];
  planScopes: { id: string; label: string }[];
  busy?: boolean;
  nameDraft: string;
  planDraft: string;
  announceDraft: string;
  onClose: () => void;
  onNameChange: (v: string) => void;
  onPlanChange: (v: string) => void;
  onAnnounceChange: (v: string) => void;
  onGeneratedPlansChange: (plans: GeneratedPlan[]) => void;
  onSaveSettings: () => void;
  onPinTask: (taskId: string) => void;
  onToggleMute: () => void;
  onDissolve: () => void;
  onMembersChanged: () => void;
};

export function GroupSettingsSheet({
  open,
  gid,
  detail,
  isOwner,
  members = [],
  tasks = [],
  plans,
  generatedPlans,
  planScopes,
  busy,
  nameDraft,
  planDraft,
  announceDraft,
  onClose,
  onNameChange,
  onPlanChange,
  onAnnounceChange,
  onGeneratedPlansChange,
  onSaveSettings,
  onPinTask,
  onToggleMute,
  onDissolve,
  onMembersChanged,
}: Props) {
  const [customScope, setCustomScope] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState(30);
  const [customRefs, setCustomRefs] = useState('');
  const [customTheme, setCustomTheme] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  if (!open) return null;

  const allPlanOptions = [
    ...plans.map((p) => ({ id: p.plan_id, title: p.title, tag: '精选' })),
    ...generatedPlans.map((p) => ({ id: p.id, title: p.title, tag: '定制' })),
  ];

  const generateCustomPlan = async () => {
    if (!customScope && !customRefs.trim()) {
      setGenErr('请选择范围或填写经节');
      return;
    }
    setGenBusy(true);
    setGenErr(null);
    try {
      const preview = await api.generatePlan(
        customScope,
        customDays,
        customTheme.trim() || undefined,
        customRefs.trim() || undefined,
      );
      saveGeneratedPlan(preview);
      onGeneratedPlansChange(loadGeneratedPlans());
      onPlanChange(preview.id);
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop group-settings-backdrop" onClick={onClose}>
      <div
        className="sheet card group-settings-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row group-settings-sheet-head">
          <strong>群设置</strong>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="group-settings-section">
          <h3 className="group-settings-section-title">群成员</h3>
          <GroupMemberNickname gid={gid} members={members} onChanged={onMembersChanged} />
          <GroupMembersPanel
            gid={gid}
            members={members}
            isOwner={isOwner}
            joinCode={isOwner ? detail.join_code : undefined}
            planDaysTotal={detail.plan_days_total}
            onChanged={onMembersChanged}
          />
        </div>

        <div className="group-settings-section">
          <h3 className="group-settings-section-title">提醒</h3>
          <button type="button" className="group-settings-row-btn" disabled={busy} onClick={onToggleMute}>
            <span>{detail.muted ? '已关闭本群提醒' : '本群提醒已开启'}</span>
            <span className="muted">{detail.muted ? '开启' : '关闭'}</span>
          </button>
        </div>

        {isOwner && (
          <div className="group-settings-section">
            <h3 className="group-settings-section-title">群管理</h3>
            <label className="group-composer-label" htmlFor="gs-name">
              群名称
            </label>
            <input
              id="gs-name"
              className="search-input"
              value={nameDraft}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="修改群名称"
            />
            <label className="group-composer-label" htmlFor="gs-plan" style={{ marginTop: 10 }}>
              绑定读经计划
            </label>
            <select
              id="gs-plan"
              className="search-input"
              value={planDraft}
              onChange={(e) => onPlanChange(e.target.value)}
            >
              <option value="">不绑定计划</option>
              {allPlanOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.tag}] {p.title}
                </option>
              ))}
            </select>

            <div className="group-custom-plan-box">
              <span className="group-composer-label">定制共读计划</span>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                选择读经范围与天数，生成后绑定到本群。
              </p>
              <div className="chip-swipe group-chip-swipe" style={{ marginBottom: 8 }}>
                {planScopes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`group-chip chip-swipe-item${customScope === s.id ? ' selected' : ''}`}
                    onClick={() => setCustomScope(customScope === s.id ? null : s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input
                className="search-input"
                placeholder="或填写经节，如 JHN.1-JHN.3"
                value={customRefs}
                onChange={(e) => setCustomRefs(e.target.value)}
              />
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                天数：{customDays} 天
              </p>
              <input
                type="range"
                min={7}
                max={90}
                step={1}
                value={customDays}
                onChange={(e) => setCustomDays(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <input
                className="search-input"
                style={{ marginTop: 8 }}
                placeholder="主题（可选）"
                value={customTheme}
                onChange={(e) => setCustomTheme(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                style={{ width: '100%', marginTop: 10 }}
                disabled={genBusy || busy}
                onClick={() => void generateCustomPlan()}
              >
                {genBusy ? '生成中…' : '生成并选用定制计划'}
              </button>
              {genErr && <p className="group-composer-err">{genErr}</p>}
            </div>

            <label className="group-composer-label" htmlFor="gs-announce" style={{ marginTop: 10 }}>
              群公告
            </label>
            <textarea
              id="gs-announce"
              className="group-composer-text"
              rows={3}
              placeholder="发布群公告（全员可见）"
              value={announceDraft}
              onChange={(e) => onAnnounceChange(e.target.value)}
            />
            {tasks.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <span className="group-composer-label">置顶任务</span>
                <div className="group-pin-list">
                  {tasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`group-pin-item${t.pinned ? ' active' : ''}`}
                      disabled={busy}
                      onClick={() => onPinTask(t.id)}
                    >
                      {t.pinned ? '📌 ' : ''}
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              className="btn"
              style={{ width: '100%', marginTop: 12 }}
              disabled={busy}
              onClick={onSaveSettings}
            >
              {busy ? '保存中…' : '保存设置'}
            </button>
            <button
              type="button"
              className="font-pill danger-pill"
              style={{ width: '100%', marginTop: 12 }}
              disabled={busy}
              onClick={onDissolve}
            >
              解散共读群
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
