'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE, api, type DailyVerse } from '@/lib/api';
import { shareCard } from '@/lib/share_card';

export function dailyVerseIllustrationUrl(theme?: string): string | null {
  const t = (theme || '').trim();
  if (!t) return null;
  return `${API_BASE}/content/illustrations/theme_${encodeURIComponent(t)}.svg`;
}

export default function DailyVerseWallpaper({
  dv,
  onClose,
}: {
  dv: DailyVerse;
  onClose: () => void;
}) {
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const bg = dailyVerseIllustrationUrl(dv.theme);

  useEffect(() => {
    if (!bg) return;
    const img = new Image();
    img.src = bg;
  }, [bg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await shareCard({
        title: dv.ref,
        subtitle: dv.theme ? `${dv.theme}系列` : undefined,
        body: dv.text,
      });
      if (ok) {
        setShared(true);
        if (dv.day) {
          try {
            await api.recordDailyVerseShare(dv.day);
          } catch {
            /* 离线忽略 */
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }, [busy, dv]);

  return (
    <div className="verse-full" onClick={onClose} role="dialog" aria-modal="true" aria-label="每日经文壁纸">
      {bg ? <img src={bg} alt="" className="verse-full-bg" decoding="async" /> : null}
      <div className="verse-full-scrim" />
      <div className="verse-full-glow" aria-hidden />
      <button
        type="button"
        className="verse-full-close"
        aria-label="关闭"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </button>
      <div className="verse-full-inner" onClick={(e) => e.stopPropagation()}>
        <p className="verse-full-kicker">每日经文</p>
        <div className="verse-full-ornament" aria-hidden>
          ✦
        </div>
        {dv.ref ? <p className="verse-full-ref">{dv.ref}</p> : null}
        <p className="verse-full-text">「{dv.text}」</p>
        {dv.theme ? <p className="verse-full-theme">{dv.theme}系列</p> : null}
        <div className="verse-full-actions">
          <button
            type="button"
            className="verse-full-btn"
            disabled={busy}
            onClick={handleShare}
          >
            {shared ? '已生成图 ✓' : '分享 / 壁纸'}
          </button>
        </div>
      </div>
    </div>
  );
}
