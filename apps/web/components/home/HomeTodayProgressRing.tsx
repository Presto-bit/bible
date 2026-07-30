'use client';

/** 今日主卡轻量进度环 */
export function HomeTodayProgressRing({ pct }: { pct: number }) {
  const value = Math.min(100, Math.max(0, pct));
  const r = 14;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  return (
    <svg
      className="home-today-progress-ring"
      viewBox="0 0 36 36"
      aria-hidden
    >
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="rgba(15, 23, 42, 0.12)"
        strokeWidth="3"
      />
      <circle
        className="home-today-progress-ring-fill"
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--accent-deep, #069952)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 18 18)"
      />
      <text
        x="18"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="8"
        fontWeight="700"
        fill="var(--ink)"
      >
        {Math.round(value)}
      </text>
    </svg>
  );
}
