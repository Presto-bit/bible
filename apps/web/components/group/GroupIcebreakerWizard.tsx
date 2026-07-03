'use client';

import { useEffect, useState } from 'react';
import { GROUP_CHECKIN_CHIPS, GROUP_CHECKIN_DEFAULT_BODY } from '@/lib/group_checkin';
import { loadFootprintRefs, type FootprintRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';

const RULES = [
  '打卡须关联经文或任务',
  '仅支持打卡与任务，不支持自由聊天',
  '互相鼓励，文明交流',
];

type Props = {
  onComplete: (payload: { ref?: string; body?: string }) => Promise<void>;
  busy?: boolean;
};

export function GroupIcebreakerWizard({ onComplete, busy }: Props) {
  const [step, setStep] = useState(0);
  const [footprints, setFootprints] = useState<FootprintRef[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadFootprintRefs().then(setFootprints);
  }, []);

  const submit = async () => {
    if (!selectedRef || busy) return;
    setErr(null);
    try {
      await onComplete({
        ref: selectedRef,
        body: body.trim() || GROUP_CHECKIN_DEFAULT_BODY,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="card card-tint card-2 icebreaker-wizard">
      <div className="icebreaker-wizard-steps" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`icebreaker-step-dot${step >= i ? ' active' : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <>
          <strong>欢迎加入共读群</strong>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 10px' }}>
            三步完成第一条打卡，和大家打个招呼吧。
          </p>
          <ul className="group-icebreaker-rules muted">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <button type="button" className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setStep(1)}>
            下一步
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <strong>选一段经文</strong>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 10px' }}>
            关联今日所读或计划经节。
          </p>
          {footprints.length > 0 ? (
            <div className="chip-swipe group-chip-swipe">
              {footprints.slice(0, 10).map((f) => (
                <button
                  key={`${f.source}-${f.ref}`}
                  type="button"
                  className={`group-chip chip-swipe-item${selectedRef === f.ref ? ' selected' : ''}`}
                  onClick={() => setSelectedRef(selectedRef === f.ref ? null : f.ref)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 12 }}>
              暂无足迹，请先去读经页阅读一章后再回来。
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="font-pill" onClick={() => setStep(0)}>上一步</button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              disabled={!selectedRef}
              onClick={() => setStep(2)}
            >
              下一步
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <strong>写点感想（可选）</strong>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 8px' }}>
            已选：{selectedRef ? formatGroupRefLabel(selectedRef) : '未选择'}
          </p>
          <div className="chip-swipe group-chip-swipe">
            {GROUP_CHECKIN_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`group-chip chip-swipe-item${body === chip ? ' selected' : ''}`}
                onClick={() => setBody(body === chip ? '' : chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <textarea
            className="group-composer-text"
            rows={2}
            placeholder="写点感想（可选）"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="font-pill" onClick={() => setStep(1)}>上一步</button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              disabled={!selectedRef || busy}
              onClick={submit}
            >
              {busy ? '发送中…' : '发送第一条打卡'}
            </button>
          </div>
        </>
      )}

      {err && <p className="group-composer-err" role="alert">{err}</p>}
    </div>
  );
}
