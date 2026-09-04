'use client';

import { useEffect, useState } from 'react';
import { HomeMediaIcon } from '@/components/home/HomeMediaIcon';
import type { HomeMediaIconId, HomeMediaTone } from '@/lib/home_media_visual';
import { shellTapProps } from '@/lib/shell_tap';

export type HomeMediaMetric = {
  prefix?: string;
  value: string;
  suffix?: string;
};

type Props = {
  title: string;
  /** 辅文（如本月天数） */
  detail?: string;
  /** 弱化眉题（如「去年今日」「发现」） */
  eyebrow?: string;
  /** 摘要数字强调：覆盖普通 title 展示 */
  metric?: HomeMediaMetric;
  tone: HomeMediaTone;
  icon: HomeMediaIconId;
  imageUrl?: string | null;
  imageObjectPosition?: string;
  progressPct?: number;
  ariaLabel: string;
  className?: string;
  onClick: () => void;
};

function ProgressBadge({ pct }: { pct: number }) {
  const r = 8.5;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = c * (1 - clamped / 100);
  return (
    <svg className="home-media-progress" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r={r + 1.2} fill="var(--surface)" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="color-mix(in srgb, var(--ink-faint) 35%, transparent)"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="var(--accent-deep, #4a6b52)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      className="home-media-chevron-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 左大媒 + 右文；图失败时回退到色底图标。 */
export function HomeMediaRow({
  title,
  detail,
  eyebrow,
  metric,
  tone,
  icon,
  imageUrl,
  imageObjectPosition = 'center',
  progressPct,
  ariaLabel,
  className,
  onClick,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [imageUrl]);
  const showImage = Boolean(imageUrl) && !imgFailed;
  const showProgress =
    typeof progressPct === 'number' && progressPct > 0 && progressPct <= 100;

  return (
    <button
      type="button"
      className={[
        'home-media-row',
        `tone-${tone}`,
        showImage ? 'has-image' : 'is-icon',
        metric ? 'has-metric' : '',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      {...shellTapProps({ onTap: onClick, softRecover: true })}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="home-media-thumb" aria-hidden>
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl!}
            alt=""
            className="home-media-thumb-img"
            style={{ objectPosition: imageObjectPosition }}
            width={68}
            height={68}
            loading={metric ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={(e) => {
              // 部分 WebView object-fit 失效时用父级 background 作双保险
              const thumb = e.currentTarget.parentElement;
              if (thumb instanceof HTMLElement) {
                thumb.style.backgroundImage = `url("${e.currentTarget.currentSrc || imageUrl!}")`;
                thumb.style.backgroundSize = 'cover';
                thumb.style.backgroundPosition = 'center';
              }
            }}
            onError={() => setImgFailed(true)}
          />
        ) : null}
        <span className={`home-media-thumb-fallback${showImage ? ' is-behind' : ''}`}>
          <HomeMediaIcon id={icon} size={30} className="home-media-icon" />
        </span>
        {showImage ? (
          <span className="home-media-thumb-chip">
            <HomeMediaIcon id={icon} size={14} className="home-media-icon" />
          </span>
        ) : null}
        {showProgress ? <ProgressBadge pct={progressPct!} /> : null}
      </span>
      <span className="home-media-body">
        {eyebrow ? <span className="home-media-eyebrow">{eyebrow}</span> : null}
        {metric ? (
          <span className="home-media-metric">
            {metric.prefix ? (
              <span className="home-media-metric-prefix">{metric.prefix}</span>
            ) : null}
            <span className="home-media-metric-value">{metric.value}</span>
            {metric.suffix ? (
              <span className="home-media-metric-suffix">{metric.suffix}</span>
            ) : null}
          </span>
        ) : (
          <strong className="home-media-title">{title}</strong>
        )}
        {detail ? <span className="home-media-detail">{detail}</span> : null}
      </span>
      <span className="home-media-chevron" aria-hidden>
        <Chevron />
      </span>
    </button>
  );
}
