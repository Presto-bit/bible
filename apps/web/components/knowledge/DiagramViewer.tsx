'use client';

import { useEffect, useState } from 'react';
import type { BibleDiagram } from '@/lib/api';
import { api } from '@/lib/api';

export function DiagramViewer({
  diagram,
  onRefClick,
}: {
  diagram: BibleDiagram;
  onRefClick?: (ref: string) => void;
}) {
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const [src, setSrc] = useState('');
  const [loadErr, setLoadErr] = useState(false);
  const hotspot = diagram.hotspots?.find((h) => h.id === activeHotspot);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setLoadErr(false);
    setSrc('');

    const url = api.diagramFileUrl(diagram.id);
    void fetch(url, { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('diagram fetch failed');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setLoadErr(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [diagram.id]);

  return (
    <div className="diagram-viewer">
      <p className="muted diagram-viewer-badge">示意图 · 非考古复原</p>
      {diagram.summary ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 8px' }}>{diagram.summary}</p>
      ) : null}
      <div className="diagram-viewer-frame">
        {loadErr ? (
          <p className="muted" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>
            图鉴加载失败，请检查网络后重试
          </p>
        ) : src ? (
          <img src={src} alt={diagram.title} className="diagram-viewer-img" />
        ) : (
          <p className="muted" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>加载中…</p>
        )}
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
