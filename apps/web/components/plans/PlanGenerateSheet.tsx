'use client';

import { useState } from 'react';
import { api, type GeneratedPlan } from '@/lib/api';
import { saveGeneratedPlan } from '@/lib/generated_plans';

const QUICK_PRESETS = [
  { label: '7 天福音', scope: 'gospels', days: 7 },
  { label: '30 天新约', scope: 'nt', days: 30 },
  { label: '90 天圣经', scope: 'bible', days: 90 },
] as const;

type Props = {
  open: boolean;
  scopes: { id: string; label: string }[];
  onClose: () => void;
  onSaved: (plan: GeneratedPlan, mode: 'start' | 'save') => void;
};

export function PlanGenerateSheet({ open, scopes, onClose, onSaved }: Props) {
  const [scope, setScope] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [prompt, setPrompt] = useState('');
  const [customRefs, setCustomRefs] = useState('');
  const [preview, setPreview] = useState<GeneratedPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const resetPreview = () => setPreview(null);

  const applyPreset = (preset: (typeof QUICK_PRESETS)[number]) => {
    setScope(preset.scope);
    setDays(preset.days);
    setPrompt(preset.label);
    resetPreview();
  };

  const generate = async () => {
    if (!scope && !customRefs.trim()) {
      setErr('请选择读经范围，或填写自定义经节');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      setPreview(await api.generatePlan(scope, days, prompt.trim() || undefined, customRefs.trim() || undefined));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = (mode: 'start' | 'save') => {
    if (!preview) return;
    const saved = saveGeneratedPlan(preview);
    onSaved(saved, mode);
    setPreview(null);
    setScope(null);
    setPrompt('');
    setCustomRefs('');
    setDays(30);
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card plans-generate-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>定制读经计划</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
        </div>

        <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>快捷模板</p>
        <div className="chip-swipe" style={{ marginBottom: 14 }}>
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip-swipe-item${scope === p.scope && days === p.days ? ' selected' : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>1. 选择范围</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`book-chip plan-gen-scope-chip${scope === s.id ? ' active' : ''}`}
              onClick={() => { setScope(scope === s.id ? null : s.id); resetPreview(); }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>2. 天数 · {days} 天</p>
        <input
          type="range"
          min={7}
          max={180}
          value={days}
          style={{ width: '100%', marginBottom: 12 }}
          onChange={(e) => { setDays(Number(e.target.value)); resetPreview(); }}
        />

        <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>3. 计划名称（可选）</p>
        <input
          className="search-input"
          placeholder="如：暑假通读福音书"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <input
          className="search-input"
          style={{ marginTop: 8 }}
          placeholder="或填写经节，如 JHN.1-JHN.3"
          value={customRefs}
          onChange={(e) => { setCustomRefs(e.target.value); resetPreview(); }}
        />

        <button type="button" className="btn" style={{ marginTop: 12, width: '100%' }} onClick={() => void generate()} disabled={busy}>
          {busy ? '生成中…' : preview ? '重新生成' : '生成预览'}
        </button>
        {err && <p className="group-composer-err" style={{ marginTop: 8 }}>{err}</p>}

        {preview && (
          <div className="plan-gen-preview">
            <strong>{preview.title}</strong>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
              {preview.days_count} 天 · 共 {preview.chapters_total} 章
            </p>
            <div className="plan-gen-preview-days">
              {preview.days.slice(0, 4).map((d) => (
                <div key={d.day} className="verse-row">
                  <span className="verse-no">{d.day}</span>
                  {d.title}
                </div>
              ))}
              {preview.days.length > 4 && (
                <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>… 共 {preview.days.length} 天</p>
              )}
            </div>
            <div className="plan-gen-preview-actions">
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => commit('start')}>
                保存并设为我的计划
              </button>
              <button type="button" className="font-pill" style={{ flex: 1 }} onClick={() => commit('save')}>
                仅保存
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11, margin: '8px 0 0', textAlign: 'center' }}>
              「仅保存」不会开始计划，可稍后在列表中查看再设定
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
