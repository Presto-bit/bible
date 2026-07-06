'use client';

import type { GeoPlace } from '@/lib/api';

const REGION = {
  minLat: 28,
  maxLat: 36,
  minLng: 30,
  maxLng: 40,
};

function project(lat: number, lng: number, w: number, h: number) {
  const x = ((lng - REGION.minLng) / (REGION.maxLng - REGION.minLng)) * w;
  const y = ((REGION.maxLat - lat) / (REGION.maxLat - REGION.minLat)) * h;
  return { x, y };
}

export function GeoMiniMap({
  places,
  activeId,
  height = 200,
}: {
  places: GeoPlace[];
  activeId?: string | null;
  height?: number;
}) {
  const w = 360;
  const h = height;
  const valid = places.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  if (!valid.length) {
    return <p className="muted" style={{ fontSize: 13 }}>暂无坐标数据</p>;
  }

  return (
    <div className="geo-mini-map" style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="geo-mini-map-svg" role="img" aria-label="地图">
        <rect width={w} height={h} fill="var(--paper-2, #f0ebe0)" rx="8" />
        <path
          d={`M0 ${h * 0.55} Q ${w * 0.3} ${h * 0.45} ${w * 0.55} ${h * 0.5} T ${w} ${h * 0.42}`}
          stroke="var(--line, #d8d0c4)"
          strokeWidth="1"
          fill="none"
        />
        {valid.map((p) => {
          const { x, y } = project(p.latitude, p.longitude, w, h);
          const active = activeId && p.id === activeId;
          return (
            <g key={p.id}>
              <circle
                cx={x}
                cy={y}
                r={active ? 7 : 5}
                fill={active ? 'var(--accent, #3d6b8e)' : 'var(--gold, #b8956a)'}
                stroke="#fff"
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={y - 10}
                textAnchor="middle"
                fontSize="9"
                fill="var(--ink-muted, #6b6358)"
              >
                {p.name.length > 12 ? `${p.name.slice(0, 12)}…` : p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
