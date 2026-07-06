'use client';

import { useState } from 'react';
import type { BibleDiagram } from '@/lib/api';
import { API_BASE } from '@/lib/api';

export function DiagramViewer({
  diagram,
  onRefClick,
}: {
  diagram: BibleDiagram;
  onRefClick?: (ref: string) => void;
}) {
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const src = `${API_BASE}/content/diagrams/${encodeURIComponent(diagram.id)}/file`;
  const hotspot = diagram.hotspots?.find((h) => h.id === activeHotspot);

  return (
    <div className="diagram-viewer">
      <p className="muted diagram-viewer-badge">示意图 · 非考古复原</p>
      {diagram.summary ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 8px' }}>{diagram.summary}</p>
      ) : null}
      <div className="diagram-viewer-frame">
        <img src={src} alt={diagram.title} className="diagram-viewer-img" />
        {(diagram.hotspots ?? []).map((h) => (
          <button
            key={h.id}
            type="button"
            className={`diagram-hotspot${activeHotspot === h.id ? ' is-active' : ''}`}
            style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
            aria-label={h.label}
            onClick={() => setActiveHotspot(h.id === activeHotspot ? null : h.id)}
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
    </div>
  );
}
