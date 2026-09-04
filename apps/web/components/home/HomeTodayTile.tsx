'use client';

import { useEffect, useRef, useState } from 'react';
import type { HomeTodayPanelSlot } from '@/lib/home_today_panel';
import {
  resolveTodayTileImage,
  resolveTodayTileKind,
  resolveTodayTileObjectPosition,
} from '@/lib/home_today_tile_image';

type Props = {
  slot: HomeTodayPanelSlot;
  flash?: boolean;
  /** 首屏前两张可 eager + high priority */
  priority?: boolean;
  className?: string;
  onClick: () => void;
};

/** 2×2 今日推荐单卡：上图下文 */
export function HomeTodayTile({
  slot,
  flash,
  priority = false,
  className,
  onClick,
}: Props) {
  const kind = resolveTodayTileKind(slot);
  const networkSrc = resolveTodayTileImage(slot);
  const objectPosition = resolveTodayTileObjectPosition(slot);
  const [displaySrc, setDisplaySrc] = useState(networkSrc);
  const [imgFailed, setImgFailed] = useState(false);
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImgFailed(false);

    void (async () => {
      try {
        const { getCachedHomeTileUrl, ensureHomeTileImages } = await import(
          '@/lib/home_tile_image_cache'
        );
        const cached = await getCachedHomeTileUrl(networkSrc);
        if (cancelled) return;
        if (cached) {
          if (blobRef.current && blobRef.current !== cached) {
            try {
              URL.revokeObjectURL(blobRef.current);
            } catch {
              /* ignore */
            }
          }
          blobRef.current = cached;
          setDisplaySrc(cached);
        } else {
          setDisplaySrc(networkSrc);
        }
        void ensureHomeTileImages([networkSrc]);
      } catch {
        if (!cancelled) setDisplaySrc(networkSrc);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [networkSrc]);

  useEffect(
    () => () => {
      if (!blobRef.current) return;
      try {
        URL.revokeObjectURL(blobRef.current);
      } catch {
        /* ignore */
      }
      blobRef.current = null;
    },
    [],
  );

  const showProgress =
    typeof slot.progressPct === 'number' && slot.progressPct > 0 && slot.progressPct < 100;

  return (
    <button
      type="button"
      className={[
        'home-today-tile',
        `home-today-tile--${kind}`,
        slot.pending ? 'is-pending' : '',
        slot.done ? 'is-done' : '',
        flash ? 'is-checkin-flash' : '',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={
        slot.sub
          ? `${slot.tag}：${slot.title}，${slot.sub}`
          : `${slot.tag}：${slot.title}`
      }
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="home-today-tile-media" aria-hidden>
        {!imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displaySrc}
            alt=""
            className="home-today-tile-img"
            style={{ objectPosition }}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="home-today-tile-img-fallback" />
        )}
        <span className="home-today-tile-tag">{slot.tag}</span>
        {slot.badge ? (
          <span className="home-today-tile-badge">{slot.badge}</span>
        ) : null}
      </span>
      <span className="home-today-tile-body">
        <strong className="home-today-tile-title">{slot.title}</strong>
        {slot.sub ? <span className="home-today-tile-sub">{slot.sub}</span> : null}
        {showProgress ? (
          <span className="home-today-tile-progress" aria-hidden>
            <span
              className="home-today-tile-progress-fill"
              style={{ width: `${slot.progressPct}%` }}
            />
          </span>
        ) : null}
      </span>
    </button>
  );
}
