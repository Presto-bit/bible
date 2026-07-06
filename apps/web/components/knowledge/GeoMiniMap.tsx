'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { GeoPlace } from '@/lib/api';

/** 黎凡特示意海岸线（离线 SVG，非精确地理） */
const COAST_SILHOUETTE =
  'M8 120 C 40 95, 70 88, 110 82 S 180 70, 220 75 S 300 95, 352 88 '
  + 'L 352 200 L 8 200 Z';

const REGION_LABELS = [
  { x: 52, y: 36, text: '地中海' },
  { x: 300, y: 42, text: '美索不达米亚' },
  { x: 72, y: 168, text: '埃及' },
  { x: 200, y: 118, text: '犹地亚' },
  { x: 248, y: 88, text: '叙利亚' },
];

type RouteStop = {
  placeId: string;
  order: number;
  label?: string;
};

function project(
  lat: number,
  lng: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  w: number,
  h: number,
  pad: number,
) {
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.8);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.8);
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const x = pad + ((lng - bounds.minLng) / lngSpan) * innerW;
  const y = pad + ((bounds.maxLat - lat) / latSpan) * innerH;
  return { x, y };
}

function boundsForPlaces(places: GeoPlace[]) {
  const valid = places.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  if (!valid.length) {
    return { minLat: 28, maxLat: 36, minLng: 30, maxLng: 40, valid };
  }
  let minLat = valid[0]!.latitude;
  let maxLat = valid[0]!.latitude;
  let minLng = valid[0]!.longitude;
  let maxLng = valid[0]!.longitude;
  for (const p of valid) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  // 至少展示黎凡特区域，避免单点缩成「一个点」
  minLat = Math.min(minLat, 28);
  maxLat = Math.max(maxLat, 36);
  minLng = Math.min(minLng, 30);
  maxLng = Math.max(maxLng, 40);
  const latPad = Math.max((maxLat - minLat) * 0.12, 0.4);
  const lngPad = Math.max((maxLng - minLng) * 0.12, 0.4);
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
    valid,
  };
}

export function GeoMiniMap({
  places,
  activeId,
  height = 200,
  routeStops,
  onPlaceClick,
}: {
  places: GeoPlace[];
  activeId?: string | null;
  height?: number;
  routeStops?: RouteStop[];
  onPlaceClick?: (place: GeoPlace) => void;
}) {
  const w = 360;
  const h = height;
  const pad = 16;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const touchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const { bounds, byId, routePoints, missingRoute } = useMemo(() => {
    const { valid, ...b } = boundsForPlaces(places);
    const idMap = new Map(valid.map((p) => [p.id, p]));
    const ordered = (routeStops ?? []).slice().sort((a, b) => a.order - b.order);
    const pts: { x: number; y: number; placeId: string; order: number }[] = [];
    let missing = 0;
    for (const stop of ordered) {
      const p = idMap.get(stop.placeId);
      if (!p) {
        missing += 1;
        continue;
      }
      const { x, y } = project(p.latitude, p.longitude, b, w, h, pad);
      pts.push({ x, y, placeId: stop.placeId, order: stop.order });
    }
    return { bounds: b, byId: idMap, routePoints: pts, missingRoute: missing };
  }, [places, routeStops, w, h]);

  const viewBox = useMemo(() => {
    const vbW = w / zoom;
    const vbH = h / zoom;
    const cx = w / 2 - pan.x / zoom;
    const cy = h / 2 - pan.y / zoom;
    return `${cx - vbW / 2} ${cy - vbH / 2} ${vbW} ${vbH}`;
  }, [w, h, zoom, pan]);

  const zoomIn = () => setZoom((z) => Math.min(4, z * 1.25));
  const zoomOut = () => setZoom((z) => Math.max(0.6, z / 1.25));
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(4, Math.max(0.6, z * delta)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || pinchRef.current) return;
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({
      x: d.px + (e.clientX - d.x),
      y: d.py + (e.clientY - d.y),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      dragRef.current = null;
      pinchRef.current = { dist: touchDistance(e.touches), zoom };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const p = pinchRef.current;
    if (!p || e.touches.length < 2) return;
    e.preventDefault();
    const dist = touchDistance(e.touches);
    if (!dist || !p.dist) return;
    const scale = dist / p.dist;
    setZoom((z) => Math.min(4, Math.max(0.6, p.zoom * scale)));
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const valid = [...byId.values()];
  if (!valid.length) {
    return <p className="muted" style={{ fontSize: 13 }}>暂无坐标数据</p>;
  }

  const routeLine = routePoints.length >= 2
    ? routePoints.map((p) => `${p.x},${p.y}`).join(' ')
    : '';

  const activePlace = activeId ? byId.get(activeId) : null;

  return (
    <div className="geo-mini-map-wrap">
      <div className="geo-mini-map-toolbar">
        <button type="button" className="font-pill" onClick={zoomOut} aria-label="缩小">−</button>
        <button type="button" className="font-pill" onClick={resetView}>重置</button>
        <button type="button" className="font-pill" onClick={zoomIn} aria-label="放大">+</button>
        <span className="muted geo-mini-map-scale">双指/滚轮缩放 · 拖动平移</span>
      </div>
      <div
        className="geo-mini-map"
        style={{ height, touchAction: 'none' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <svg viewBox={viewBox} className="geo-mini-map-svg" role="img" aria-label="地图">
          <rect width={w} height={h} fill="var(--paper-2, #ebe4d6)" rx="8" />
          <path d={COAST_SILHOUETTE} fill="var(--paper-3, #e0d8cc)" opacity="0.85" />
          {REGION_LABELS.map((r) => (
            <text
              key={r.text}
              x={r.x}
              y={r.y}
              fontSize="10"
              fill="var(--ink-muted, #9a9084)"
              opacity="0.85"
            >
              {r.text}
            </text>
          ))}
          {routeLine ? (
            <polyline
              points={routeLine}
              fill="none"
              stroke="var(--accent, #3d6b8e)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6 4"
              opacity="0.75"
            />
          ) : null}
          {valid.map((p) => {
            const { x, y } = project(p.latitude, p.longitude, bounds, w, h, pad);
            const active = activeId && p.id === activeId;
            const onRoute = routePoints.find((r) => r.placeId === p.id);
            const clickable = Boolean(onPlaceClick);
            return (
              <g
                key={p.id}
                style={{ cursor: clickable ? 'pointer' : undefined }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlaceClick?.(p);
                }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={active ? 8 : 6}
                  fill={active ? 'var(--accent, #3d6b8e)' : 'var(--gold, #b8956a)'}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
                {onRoute ? (
                  <text
                    x={x}
                    y={y + 3}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#fff"
                    fontWeight="700"
                  >
                    {routePoints.findIndex((r) => r.placeId === p.id) + 1}
                  </text>
                ) : null}
                <text
                  x={x}
                  y={y - 12}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--ink-muted, #6b6358)"
                >
                  {(p.name || p.id).length > 10
                    ? `${(p.name || p.id).slice(0, 10)}…`
                    : (p.name || p.id)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {activePlace ? (
        <div className="geo-mini-map-active card card-2">
          <strong>{activePlace.name || activePlace.id}</strong>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            约 {activePlace.latitude.toFixed(2)}°N · {activePlace.longitude.toFixed(2)}°E
            {activePlace.type ? ` · ${activePlace.type}` : ''}
          </p>
        </div>
      ) : null}
      {missingRoute > 0 ? (
        <p className="muted geo-mini-map-hint">
          {missingRoute} 个站点暂无坐标，路线为示意
        </p>
      ) : (
        <p className="muted geo-mini-map-hint">示意图 · 离线渲染 · 可缩放查看周边</p>
      )}
    </div>
  );
}
