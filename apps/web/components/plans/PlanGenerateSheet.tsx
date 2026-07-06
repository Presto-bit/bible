'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useState } from 'react';
import { api, type GeneratedPlan } from '@/lib/api';
import {
  attachCalendarToPlan,
  buildEligibleDates,
  defaultPlanEndDate,
  defaultPlanStartDate,
  formatPlanDayDate,
} from '@/lib/plan_calendar';
import { mergeCustomRefs, parsePlanContentToRefs, rangesToCustomRefs, type PlanChapterRange } from '@/lib/plan_content_parse';
import { saveGeneratedPlan } from '@/lib/generated_plans';
import { PlanChapterPicker } from '@/components/plans/PlanChapterPicker';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (plan: GeneratedPlan, mode: 'start' | 'save') => void;
};

export function PlanGenerateSheet({ open, onClose, onSaved }: Props) {
  const [planName, setPlanName] = useState('');
  const [planContent, setPlanContent] = useState('');
  const [pickedRanges, setPickedRanges] = useState<PlanChapterRange[]>([]);
  const [startDate, setStartDate] = useState(defaultPlanStartDate());
  const [endDate, setEndDate] = useState(defaultPlanEndDate());
  const [excludeSaturday, setExcludeSaturday] = useState(false);
  const [excludeSunday, setExcludeSunday] = useState(true);
  const [preview, setPreview] = useState<GeneratedPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const resetPreview = () => setPreview(null);

  const eligibleCount = buildEligibleDates(
    startDate,
    endDate,
    excludeSaturday,
    excludeSunday,
  ).length;

  const generate = async () => {
    const customRefs = mergeCustomRefs(
      rangesToCustomRefs(pickedRanges),
      parsePlanContentToRefs(planContent),
    );
    if (!customRefs) {
      setErr('请点选卷章或填写经节');
      return;
    }
    const eligible = buildEligibleDates(
      startDate,
      endDate,
      excludeSaturday,
      excludeSunday,
    );
    if (!eligible.length) {
      setErr('日期范围内没有可读经日，请调整起止日期或剔除选项');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const raw = await api.generatePlan(
        null,
        eligible.length,
        planName.trim() || undefined,
        customRefs,
      );
      const withDates = attachCalendarToPlan(raw, eligible, {
        startDate,
        endDate,
        excludeSaturday,
        excludeSunday,
      });
      setPreview({
        ...withDates,
        id: `gen_custom_${Date.now()}`,
      });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setPreview(null);
    setPlanName('');
    setPlanContent('');
    setPickedRanges([]);
    setStartDate(defaultPlanStartDate());
    setEndDate(defaultPlanEndDate());
    setExcludeSaturday(false);
    setExcludeSunday(true);
  };

  const commit = (mode: 'start' | 'save') => {
    if (!preview) return;
    const saved = saveGeneratedPlan(preview);
    onSaved(saved, mode);
    resetForm();
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card plans-generate-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>定制读经计划</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        <section className="plan-gen-section">
          <h3 className="plan-section-label">计划名称</h3>
          <input
            className="search-input"
            placeholder="如：暑假通读福音书"
            value={planName}
            onChange={(e) => { setPlanName(e.target.value); resetPreview(); }}
          />
        </section>

        <section className="plan-gen-section">
          <h3 className="plan-section-label">计划内容</h3>
          <p className="muted plan-gen-section-hint">点选卷 · 章，或填写经节范围</p>
          <PlanChapterPicker ranges={pickedRanges} onChange={(r) => { setPickedRanges(r); resetPreview(); }} />
          <textarea
            className="search-input compose-textarea plan-gen-verse-input"
            rows={2}
            placeholder="如：约翰福音 1-3 章（可与上方点选组合）"
            value={planContent}
            onChange={(e) => { setPlanContent(e.target.value); resetPreview(); }}
          />
        </section>

        <section className="plan-gen-section">
          <h3 className="plan-section-label">计划时间</h3>
          <div className="plan-date-summary">
            <span>{formatPlanDayDate(startDate)}</span>
            <span className="muted">至</span>
            <span>{formatPlanDayDate(endDate)}</span>
            <span className="plan-date-summary-count">可读 {eligibleCount} 天</span>
          </div>
          <div className="plan-date-row">
            <label className="plan-date-field">
              <span className="muted">开始日期</span>
              <input
                type="date"
                className="search-input"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                  resetPreview();
                }}
              />
            </label>
            <label className="plan-date-field">
              <span className="muted">结束日期</span>
              <input
                type="date"
                className="search-input"
                value={endDate}
                min={startDate}
                onChange={(e) => { setEndDate(e.target.value); resetPreview(); }}
              />
            </label>
          </div>
          <div className="plan-weekday-toggles">
            <label className="reader-toggle-row">
              <span>剔除周六</span>
              <input
                type="checkbox"
                checked={excludeSaturday}
                onChange={(e) => { setExcludeSaturday(e.target.checked); resetPreview(); }}
              />
            </label>
            <label className="reader-toggle-row">
              <span>剔除周日</span>
              <input
                type="checkbox"
                checked={excludeSunday}
                onChange={(e) => { setExcludeSunday(e.target.checked); resetPreview(); }}
              />
            </label>
          </div>
          <p className="muted plan-gen-section-foot">
            {excludeSaturday || excludeSunday
              ? `已剔除${excludeSaturday ? '周六' : ''}${excludeSaturday && excludeSunday ? '、' : ''}${excludeSunday ? '周日' : ''}`
              : '含周末'}
          </p>
        </section>

        <section className="plan-gen-section plan-gen-section-preview">
          <h3 className="plan-section-label">生成预览</h3>
          <button type="button" className="btn" style={{ width: '100%' }} onClick={() => void generate()} disabled={busy}>
            {busy ? '生成中…' : preview ? '重新生成' : '生成预览'}
          </button>
          {err && <p className="group-composer-err" style={{ marginTop: 8 }}>{err}</p>}

          {preview && (
            <div className="plan-gen-preview">
              <strong>{preview.title}</strong>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
                {preview.days_count} 天 · 共 {preview.chapters_total} 章
                {preview.start_date && preview.end_date
                  ? ` · ${formatPlanDayDate(preview.start_date)} 至 ${formatPlanDayDate(preview.end_date)}`
                  : ''}
              </p>
              <div className="plan-gen-preview-days">
                {preview.days.slice(0, 6).map((d) => (
                  <div key={d.day} className="verse-row plan-gen-date-row">
                    <span className="verse-no plan-gen-date-badge">
                      {d.date ? formatPlanDayDate(d.date) : `第 ${d.day} 天`}
                    </span>
                    <span>{d.title}</span>
                  </div>
                ))}
                {preview.days.length > 6 && (
                  <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                    … 共 {preview.days.length} 天日程
                  </p>
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
              <p className="muted plan-gen-save-hint">
                「仅保存」不会开始计划，可稍后在列表中查看再设定
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
