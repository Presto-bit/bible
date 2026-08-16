'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bookCoverImageUrl, bookIdFromReaderHref } from '@/lib/book_cover';
import { resolveCampaignCoverUrl } from '@/lib/daily_verse_wallpaper';
import { openCampaignHref, toInternalAppPath } from '@/lib/campaign_nav';
import type { HomeTodayPanelModel, HomeTodayPanelSlot } from '@/lib/home_today_panel';
import { RailLineIcon } from '@/components/home/RailLineIcon';
import { HomeTodayProgressRing } from '@/components/home/HomeTodayProgressRing';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import WallpaperBg from '@/components/home/WallpaperBg';

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

/** 主卡封面：运营图 → 书卷风景 → href 书卷 → 槽位稳定风景（永不空，避免白板） */
function slotCoverSrc(slot: HomeTodayPanelSlot): string {
  const custom = resolveCampaignCoverUrl(slot.coverUrl);
  if (custom) return custom;
  if (slot.bookId) return bookCoverImageUrl(slot.bookId);
  const fromHref = bookIdFromReaderHref(slot.href)?.bookId;
  if (fromHref) return bookCoverImageUrl(fromHref);
  return bookCoverImageUrl(slot.id || 'HOME');
}

/** 副卡：主题色静态底 + 字色跟全站 token；不铺风景图、不随封面加载刷新 */
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
  const classes = [
    'home-today-side',
    toneClass,
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
      <span className="home-today-side-text">
        <span className="home-today-side-label">{slot.tag}</span>
        <strong className="home-today-side-title">{slot.title}</strong>
        {slot.cta ? <span className="home-today-side-cta">{slot.cta}</span> : null}
      </span>
      {slot.badge ? (
        <span className="home-today-side-badge" aria-label={slot.badge}>
          {slot.badge}
        </span>
      ) : (
        <span className="home-today-side-icon" aria-hidden>
          <RailLineIcon id={slot.icon || 'group'} size={18} />
        </span>
      )}
    </button>
  );
}

/** 今日推荐：左大右双；主卡始终铺风景，禁白底 */
export function HomeTodayPanel({
  panel,
  groupFlash = false,
  staggerEnter = false,
}: Props) {
  const router = useRouter();
  const { primary, group, prayer } = panel;
  const coverSrc = slotCoverSrc(primary);
  const [coverReady, setCoverReady] = useState(false);
  useEffect(() => {
    setCoverReady(false);
  }, [coverSrc]);
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
            coverReady ? 'has-cover' : 'is-loading-cover',
            primary.done ? 'is-done' : '',
            staggerEnter ? 'home-stagger-item home-stagger-1' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => navigate(primary.href, router)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="home-today-primary-bg" aria-hidden>
            <WallpaperBg
              key={coverSrc}
              src={coverSrc}
              className="home-today-primary-bg-img"
              objectPosition="center 28%"
              fetchPriority="auto"
              onReady={() => setCoverReady(true)}
              onFail={() => setCoverReady(false)}
            />
            <div
              className={`home-today-primary-bg-veil${coverReady ? ' is-ready' : ''}`}
            />
          </div>
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
