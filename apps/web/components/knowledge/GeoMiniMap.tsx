'use client';

import { useMemo } from 'react';
import type { GeoPlace } from '@/lib/api';

/** 黎凡特示意海岸线（离线 SVG，非精确地理） */
const COAST_SILHOUETTE =
  'M8 120 C 40 95, 70 88, 110 82 S 180 70, 220 75 S 300 95, 352 88 '
  + 'L 352 200 L 8 200 Z';

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
  const latPad = Math.max((maxLat - minLat) * 0.18, 0.6);
  const lngPad = Math.max((maxLng - minLng) * 0.18, 0.6);
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
  /** 按行程顺序连线；与 places 可部分重叠 */
  routeStops?: RouteStop[];
  onPlaceClick?: (place: GeoPlace) => void;
}) {
  const w = 360;
  const h = height;
  const pad = 16;

  const { bounds, byId, routePoints, missingRoute } = useMemo(() => {
    const { valid, ...b } = boundsForPlaces(places);
    const idMap = new Map(valid.map((p) => [p.id, p]));
    const ordered = (routeStops ?? [])
      .slice()
      .sort((a, b) => a.order - b.order);
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

  const valid = [...byId.values()];
  if (!valid.length) {
    return <p className="muted" style={{ fontSize: 13 }}>暂无坐标数据</p>;
  }

  const routeLine = routePoints.length >= 2
    ? routePoints.map((p) => `${p.x},${p.y}`).join(' ')
    : '';

  return (
    <div className="geo-mini-map" style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="geo-mini-map-svg" role="img" aria-label="地图">
        <rect width={w} height={h} fill="var(--paper-2, #ebe4d6)" rx="8" />
        <path d={COAST_SILHOUETTE} fill="var(--paper-3, #e0d8cc)" opacity="0.85" />
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
              onClick={() => onPlaceClick?.(p)}
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
      {missingRoute > 0 ? (
        <p className="muted geo-mini-map-hint">
          {missingRoute} 个站点暂无坐标，路线为示意
        </p>
      ) : (
        <p className="muted geo-mini-map-hint">示意图 · 离线渲染 · 非精确地图</p>
      )}
    </div>
  );
}
