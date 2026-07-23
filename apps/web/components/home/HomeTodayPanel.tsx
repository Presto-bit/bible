'use client';

import { useRouter } from 'next/navigation';
import { bookCoverImageUrl } from '@/lib/book_cover';
import type { HomeTodayPanelModel, HomeTodayPanelSlot } from '@/lib/home_today_panel';
import { RailLineIcon } from '@/components/home/RailLineIcon';
import { isTabKeepAliveEnabled } from '@/lib/platform';
import { isPwaMainTabHref, navigatePwaTab, navigateToReaderHref } from '@/lib/pwa_tab_nav';

type Props = {
  panel: HomeTodayPanelModel;
};

function navigate(href: string, router: ReturnType<typeof useRouter>) {
  if (href.startsWith('/reader')) {
    navigateToReaderHref(href, router);
    return;
  }
  if (isTabKeepAliveEnabled() && isPwaMainTabHref(href)) {
    navigatePwaTab(href);
    return;
  }
  router.push(href);
}

function SideCard({
  slot,
  toneClass,
}: {
  slot: HomeTodayPanelSlot;
  toneClass: string;
}) {
  const router = useRouter();
  const classes = [
    'home-today-side',
    toneClass,
    slot.pending ? 'is-pending' : '',
    slot.done ? 'is-done' : '',
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
        {slot.cta ? (
          <span className="home-today-side-cta">{slot.cta}</span>
        ) : null}
      </span>
      {slot.badge ? (
        <span className="home-today-side-badge" aria-label={slot.badge}>
          {slot.badge}
        </span>
      ) : (
        <span className="home-today-side-icon" aria-hidden>
          <RailLineIcon id={slot.icon || 'group'} size={20} />
        </span>
      )}
    </button>
  );
}

/** 今日推荐：浅底容器 + 三张独立浅色卡（左大右双） */
export function HomeTodayPanel({ panel }: Props) {
  const router = useRouter();
  const { primary, group, prayer } = panel;
  const bookId = primary.bookId;

  return (
    <section className="home-today-shell" aria-label="今日推荐">
      <header className="home-today-shell-head">
        <h2 className="home-today-shell-title">今日推荐</h2>
      </header>
      <div className="home-today-panel">
        <button
          type="button"
          className={['home-today-primary', bookId ? 'has-cover' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => navigate(primary.href, router)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {bookId ? (
            <div className="home-today-primary-bg" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bookCoverImageUrl(bookId)}
                alt=""
                className="home-today-primary-bg-img"
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
        </button>

        <div className="home-today-sides" role="group" aria-label="快捷入口">
          <SideCard
            key={`group-${group.href}-${group.title}-${group.badge || ''}`}
            slot={group}
            toneClass="home-today-side-group"
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
