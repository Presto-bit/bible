'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BibleDiagram } from '@/lib/api';
import { api } from '@/lib/api';
import { KnowledgeStoryEnd } from '@/components/search/KnowledgeStoryEnd';
import { KnowledgeAskSheet } from '@/components/search/KnowledgeAskSheet';
import {
  estimateTourMinutes,
  knowledgeAskQuestion,
  nextInExodusSeries,
  tourHook,
} from '@/lib/knowledge_story';
import {
  resumeKnowledgeStep,
  saveKnowledgeProgress,
} from '@/lib/knowledge_progress';

export function DiagramViewer({
  diagram,
  onRefClick,
  guided = false,
}: {
  diagram: BibleDiagram;
  onRefClick?: (ref: string) => void;
  /** 引导式热区游览：按顺序高亮，上一处/下一处 */
  guided?: boolean;
}) {
  const hotspots = useMemo(() => diagram.hotspots ?? [], [diagram.hotspots]);
  const [step, setStep] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);

  const guidedMode = guided && hotspots.length > 0;
  const hotspot = hotspots.find((h) => h.id === activeHotspot);
  const src = api.diagramFileUrl(diagram.id);
  const isLast = guidedMode && step >= hotspots.length - 1;

  useEffect(() => {
    if (!guidedMode) return;
    setAskOpen(false);
    const resume = resumeKnowledgeStep('diagram', diagram.id);
    if (resume != null && resume > 0 && resume < hotspots.length) {
      setStep(resume);
      setResumedFrom(resume);
    } else {
      setStep(0);
      setResumedFrom(null);
    }
  }, [diagram.id, guidedMode, hotspots.length]);

  useEffect(() => {
    if (guidedMode && hotspots[step]) {
      setActiveHotspot(hotspots[step].id);
    }
  }, [guidedMode, step, hotspots]);

  useEffect(() => {
    if (!guidedMode || hotspots.length === 0) return;
    saveKnowledgeProgress('diagram', diagram.id, {
      step,
      total: hotspots.length,
      completed: step >= hotspots.length - 1,
    });
  }, [guidedMode, diagram.id, step, hotspots.length]);

  useEffect(() => {
    setLoadErr(false);
  }, [diagram.id]);

  const askHere = () => {
    if (!hotspot) return;
    setAskOpen(true);
  };

  const hook = tourHook(diagram.id);
  const mins = estimateTourMinutes(hotspots.length);
  const askQ = hotspot
    ? knowledgeAskQuestion({
        title: diagram.title,
        stopLabel: hotspot.label,
        askSeed: hotspot.ask_seed,
        ref: hotspot.ref,
      })
    : '';

  return (
    <div className={`diagram-viewer${guidedMode ? ' diagram-viewer-guided' : ''}`}>
      <p className="muted diagram-viewer-badge">示意图 · 非考古复原</p>
      {guidedMode ? (
        <p className="muted story-mode-sub" style={{ marginTop: 0 }}>
          约 {mins} 分钟
        </p>
      ) : null}
      {guidedMode && step === 0 && hook ? (
        <p className="story-mode-hook">{hook}</p>
      ) : null}
      {diagram.summary && (!guidedMode || step === 0) ? (
        <p className="diagram-viewer-summary">{diagram.summary}</p>
      ) : null}
      {guidedMode && resumedFrom != null && step === resumedFrom ? (
        <p className="muted story-mode-resume">已从第 {resumedFrom + 1} 处继续</p>
      ) : null}
      {guidedMode ? (
        <p className="story-mode-progress diagram-guided-progress">
          第 <strong>{step + 1}</strong> / {hotspots.length} 处
          {hotspot?.label ? ` · ${hotspot.label}` : ''}
        </p>
      ) : null}
      <div className="diagram-viewer-frame">
        {loadErr ? (
          <p className="muted diagram-viewer-placeholder">图鉴加载失败，请检查网络后重试</p>
        ) : (
          <img
            src={src}
            alt={diagram.title}
            className="diagram-viewer-img"
            onError={() => setLoadErr(true)}
          />
        )}
        {hotspots.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`diagram-hotspot${activeHotspot === h.id ? ' is-active' : ''}`}
            style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
            aria-label={h.label}
            aria-current={activeHotspot === h.id ? 'true' : undefined}
            onClick={() => {
              if (guidedMode) {
                const idx = hotspots.findIndex((x) => x.id === h.id);
                if (idx >= 0) setStep(idx);
              } else {
                setActiveHotspot(h.id === activeHotspot ? null : h.id);
              }
            }}
          />
        ))}
      </div>
      {hotspot ? (
        <div className="diagram-hotspot-card card card-2">
          <strong>{hotspot.label}</strong>
          {hotspot.note ? (
            <p className="story-mode-stop-note">{hotspot.note}</p>
          ) : null}
          {hotspot.ref && onRefClick ? (
            <button type="button" className="text-link" onClick={() => onRefClick(hotspot.ref!)}>
              读 {hotspot.ref}
            </button>
          ) : null}
        </div>
      ) : null}
      {guidedMode ? (
        <div className="story-mode-actions diagram-guided-actions">
          {hotspot?.ref && onRefClick ? (
            <button type="button" className="font-pill accent" onClick={() => onRefClick(hotspot.ref!)}>
              读本节 · {hotspot.ref}
            </button>
          ) : null}
          {hotspot ? (
            <button type="button" className="font-pill" onClick={askHere}>
              问小爱
            </button>
          ) : null}
          {!isLast ? (
            <button type="button" className="font-pill" onClick={() => setStep((s) => s + 1)}>
              下一处 · {hotspots[step + 1]?.label} ›
            </button>
          ) : null}
          {step > 0 ? (
            <button type="button" className="text-link story-mode-back-step" onClick={() => setStep((s) => s - 1)}>
              ‹ 上一处
            </button>
          ) : null}
        </div>
      ) : null}
      {guidedMode && isLast && hotspot ? (
        <KnowledgeStoryEnd
          title={diagram.title}
          related={diagram.related}
          seriesNext={nextInExodusSeries('diagram', diagram.id)}
          listHref="/search/diagrams"
          listLabel="切换其他图鉴 ›"
          onAsk={askHere}
          onRestart={() => {
            setResumedFrom(null);
            setStep(0);
            saveKnowledgeProgress('diagram', diagram.id, {
              step: 0,
              total: hotspots.length,
              completed: false,
            });
          }}
          restartLabel="回到第一处"
          share={{
            kind: 'diagram',
            id: diagram.id,
            highlight: hotspot.note || hook || diagram.summary,
            stopCount: hotspots.length,
            unit: '处',
          }}
        />
      ) : null}
      {askOpen && hotspot ? (
        <KnowledgeAskSheet
          title={diagram.title}
          question={askQ}
          refParam={hotspot.ref}
          onClose={() => setAskOpen(false)}
        />
      ) : null}
    </div>
  );
}
