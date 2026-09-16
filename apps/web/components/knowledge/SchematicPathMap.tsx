'use client';

import { useMemo } from 'react';
import { SCHEMATIC_PATHS, type SchematicLayoutId } from '@/lib/schematic_paths';

export type SchematicPathStop = {
  placeId: string;
  order: number;
  label: string;
};

type Props = {
  layoutId: SchematicLayoutId;
  stops: SchematicPathStop[];
  activePlaceId?: string;
  activeOrder?: number;
  onStopClick?: (placeId: string, order: number) => void;
  height?: number;
};

/**
 * 示意路径图（SVG）· §19.14.12
 * 中文站名在图外/旁注短标；可点切站。非精确测绘。
 */
export function SchematicPathMap({
  layoutId,
  stops,
  activePlaceId,
  activeOrder,
  onStopClick,
  height = 200,
}: Props) {
  const def = SCHEMATIC_PATHS[layoutId];

  const positioned = useMemo(() => {
    const byPlace = new Map(def.stops.map((s) => [s.placeId, s]));
    // 同一 place 多次出现（如安提阿去程/回程）：用 order 微调 y
    const seen = new Map<string, number>();
    return stops.map((s) => {
      const base = byPlace.get(s.placeId);
      const times = seen.get(s.placeId) ?? 0;
      seen.set(s.placeId, times + 1);
      const x = base?.x ?? 40 + s.order * 40;
      const y = (base?.y ?? 100) + times * 18;
      return { ...s, x, y };
    });
  }, [def.stops, stops]);

  const routePoints = positioned.map((s) => `${s.x},${s.y}`).join(' ');

  return (
    <div className="schematic-path-map" style={{ height }}>
      <svg
        viewBox={def.viewBox}
        role="img"
        aria-label="示意路径图"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect className="spm-bg" x="0" y="0" width="380" height="200" rx="12" />
        <path className="spm-sea" d={def.sea} />
        {def.land.map((d, i) => (
          <path key={i} className="spm-land" d={d} />
        ))}
        <polyline className="spm-route" points={routePoints} />
        {positioned.map((s) => {
          const active =
            (activeOrder != null && s.order === activeOrder)
            || (activeOrder == null && s.placeId === activePlaceId);
          const short =
            s.label.length > 5 ? `${s.label.slice(0, 4)}…` : s.label;
          return (
            <g
              key={`${s.placeId}-${s.order}`}
              className={`spm-stop${active ? ' is-active' : ''}`}
              transform={`translate(${s.x} ${s.y})`}
              onClick={() => onStopClick?.(s.placeId, s.order)}
              style={{ cursor: onStopClick ? 'pointer' : undefined }}
            >
              <circle className="spm-core" r="11" />
              <text className="spm-num" y="1">{s.order}</text>
              <text className="spm-label" y="24">{short}</text>
            </g>
          );
        })}
      </svg>
      <p className="spm-caption">示意路线 · 非考古测绘 · 点站点切换</p>
    </div>
  );
}
