'use client';

import { useRouter } from 'next/navigation';
import { bookCoverImageUrl } from '@/lib/book_cover';
import { resolveCampaignCoverUrl } from '@/lib/daily_verse_wallpaper';
import { openCampaignHref, toInternalAppPath } from '@/lib/campaign_nav';
import type { HomeTodayPanelModel, HomeTodayPanelSlot } from '@/lib/home_today_panel';
import { RailLineIcon } from '@/components/home/RailLineIcon';
import { HomeTodayProgressRing } from '@/components/home/HomeTodayProgressRing';
import { navigateAppHref } from '@/lib/pwa_tab_nav';

type Props = {
  panel: HomeTodayPanelModel;
  /** 打卡回流高亮共读侧卡 */
  groupFlash?: boolean;
  /** 首屏错落入场 */
  staggerEnter?: boolean;
};

function navigate(href: string, router: ReturnType<typeof useRouter>) {
  const internal = toInternalAppPath(href);
  if (!internal) {
    openCampaignHref(href);
    return;
  }
  navigateAppHref(internal, router);
}

function slotCoverSrc(slot: HomeTodayPanelSlot): string | null {
  const custom = resolveCampaignCoverUrl(slot.coverUrl);
  if (custom) return custom;
  if (slot.bookId) return bookCoverImageUrl(slot.bookId);
  return null;
}

function SideCard({
  slot,
  toneClass,
  flash,
}: {
  slot: HomeTodayPanelSlot;
  toneClass: string;
  flash?: boolean;
}) {
  const router = useRouter();
  const coverSrc = slotCoverSrc(slot);
  const classes = [
    'home-today-side',
    toneClass,
    coverSrc ? 'has-cover' : '',
    slot.pending ? 'is-pending' : '',
    slot.done ? 'is-done' : '',
    flash ? 'is-checkin-flash' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={() => navigate(slot.href, router)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {coverSrc ? (
        <span className="home-today-side-bg" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc}
            alt=""
            className="home-today-side-bg-img"
            width={160}
            height={120}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.retry === '1') {
                img.style.display = 'none';
                return;
              }
              img.dataset.retry = '1';
              const sep = coverSrc.includes('?') ? '&' : '?';
              img.src = `${coverSrc}${sep}r=1`;
            }}
          />
          <span className="home-today-side-bg-veil" />
        </span>
      ) : null}
      <span className="home-today-side-text">
        <span className="home-today-side-label">{slot.tag}</span>
        <strong className="home-today-side-title">{slot.title}</strong>
        {slot.cta ? <span className="home-today-side-cta">{slot.cta}</span> : null}
      </span>
      {slot.badge ? (
        <span className="home-today-side-badge" aria-label={slot.badge}>
          {slot.badge}
        </span>
      ) : coverSrc ? null : (
        <span className="home-today-side-icon" aria-hidden>
          <RailLineIcon id={slot.icon || 'group'} size={20} />
        </span>
      )}
    </button>
  );
}

/** 今日推荐：浅底容器 + 三张独立浅色卡（左大右双） */
export function HomeTodayPanel({
  panel,
  groupFlash = false,
  staggerEnter = false,
}: Props) {
  const router = useRouter();
  const { primary, group, prayer } = panel;
  const coverSrc = slotCoverSrc(primary);
  const showRing =
    typeof primary.progressPct === 'number' && primary.progressPct > 0;

  return (
    <section
      className={`home-today-shell${staggerEnter ? ' home-stagger-enter' : ''}`}
      aria-label="今日推荐"
    >
      <header className="home-today-shell-head">
        <h2 className="home-today-shell-title">今日推荐</h2>
      </header>
      <div className="home-today-panel">
        <button
          type="button"
          className={[
            'home-today-primary',
            coverSrc ? 'has-cover' : '',
            primary.done ? 'is-done' : '',
            staggerEnter ? 'home-stagger-item home-stagger-1' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => navigate(primary.href, router)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {coverSrc ? (
            <div
              className="home-today-primary-bg"
              aria-hidden
              style={{
                backgroundImage: `url("${coverSrc}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center 28%',
                backgroundRepeat: 'no-repeat',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverSrc}
                alt=""
                className="home-today-primary-bg-img"
                width={360}
                height={220}
                decoding="async"
                fetchPriority="high"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.dataset.retry === '1') {
                    img.style.display = 'none';
                    return;
                  }
                  img.dataset.retry = '1';
                  const sep = coverSrc.includes('?') ? '&' : '?';
                  img.src = `${coverSrc}${sep}r=1`;
                }}
              />
              <div className="home-today-primary-bg-veil" />
            </div>
          ) : (
            <div className="home-today-primary-bg home-today-primary-bg-fallback" aria-hidden>
              <RailLineIcon id={primary.icon} size={28} />
            </div>
          )}
          <div className="home-today-primary-main">
            <span className="home-today-primary-badge">{primary.tag}</span>
            <strong className="home-today-primary-title">{primary.title}</strong>
            {primary.sub ? (
              <span className="home-today-primary-sub">{primary.sub}</span>
            ) : null}
            {primary.cta ? (
              <span className="home-today-primary-cta">{primary.cta}</span>
            ) : null}
          </div>
          {showRing ? (
            <span className="home-today-primary-ring">
              <HomeTodayProgressRing pct={primary.progressPct!} />
            </span>
          ) : null}
        </button>

        <div
          className={`home-today-sides${staggerEnter ? ' home-stagger-item home-stagger-2' : ''}`}
          role="group"
          aria-label="快捷入口"
        >
          <SideCard
            key={`group-${group.href}-${group.title}-${group.badge || ''}`}
            slot={group}
            toneClass="home-today-side-group"
            flash={groupFlash}
          />
          <SideCard
            key={`prayer-${prayer.href}-${prayer.title}`}
            slot={prayer}
            toneClass="home-today-side-prayer"
          />
        </div>
      </div>
    </section>
  );
}
