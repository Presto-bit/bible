'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BibleDiagram } from '@/lib/api';
import { api } from '@/lib/api';

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

  const guidedMode = guided && hotspots.length > 0;
  const hotspot = hotspots.find((h) => h.id === activeHotspot);
  const src = api.diagramFileUrl(diagram.id);

  useEffect(() => {
    if (!guidedMode) return;
    setStep(0);
  }, [diagram.id, guidedMode]);

  useEffect(() => {
    if (guidedMode && hotspots[step]) {
      setActiveHotspot(hotspots[step].id);
    }
  }, [guidedMode, step, hotspots]);

  useEffect(() => {
    setLoadErr(false);
  }, [diagram.id]);

  return (
    <div className={`diagram-viewer${guidedMode ? ' diagram-viewer-guided' : ''}`}>
      <p className="muted diagram-viewer-badge">示意图 · 非考古复原</p>
      {diagram.summary ? (
        <p className="diagram-viewer-summary">{diagram.summary}</p>
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
          {step < hotspots.length - 1 ? (
            <button type="button" className="font-pill" onClick={() => setStep((s) => s + 1)}>
              下一处 · {hotspots[step + 1]?.label} ›
            </button>
          ) : (
            <button type="button" className="font-pill" onClick={() => setStep(0)}>
              回到第一处
            </button>
          )}
          {step > 0 ? (
            <button type="button" className="text-link story-mode-back-step" onClick={() => setStep((s) => s - 1)}>
              ‹ 上一处
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
