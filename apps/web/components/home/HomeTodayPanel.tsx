'use client';

import { useRouter } from 'next/navigation';
import { bookCoverImageUrl, bookCoverLabel } from '@/lib/book_cover';
import type { HomeTodayPanelModel } from '@/lib/home_today_panel';
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

/** 今日推荐：左大主行动 + 右双（共读 / 祷告）；纸感面板，区别于 Hero 沉浸卡 */
export function HomeTodayPanel({ panel }: Props) {
  const router = useRouter();
  const { primary, group, prayer } = panel;
  const bookId = primary.bookId;

  return (
    <div className="home-today-panel" role="region" aria-label="今日推荐">
      <button
        type="button"
        className="home-today-primary"
        onClick={() => navigate(primary.href, router)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="home-today-primary-book" aria-hidden>
          {bookId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bookCoverImageUrl(bookId)}
              alt=""
              className="home-today-primary-book-img"
            />
          ) : (
            <div className="home-today-primary-book-fallback">
              <RailLineIcon id={primary.icon} size={22} />
            </div>
          )}
          {bookId ? (
            <span className="home-today-primary-book-label">
              {bookCoverLabel(bookId)}
            </span>
          ) : null}
        </div>
        <div className="home-today-primary-body">
          <span className="pill pill-active">{primary.tag}</span>
          <strong className="home-today-primary-title">{primary.title}</strong>
          {primary.sub ? (
            <span className="muted home-today-primary-sub">{primary.sub}</span>
          ) : null}
          {primary.cta ? (
            <span className="home-today-primary-cta">{primary.cta}</span>
          ) : null}
        </div>
      </button>

      <div className="home-today-sides">
        <button
          type="button"
          className="home-today-side home-today-side-group"
          onClick={() => navigate(group.href, router)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="home-today-side-icon" aria-hidden>
            <RailLineIcon id="group" size={20} />
          </span>
          <span className="home-today-side-text">
            <span className="home-today-side-tag">{group.tag}</span>
            <strong className="home-today-side-title">{group.title}</strong>
            {group.sub ? (
              <span className="muted home-today-side-sub">{group.sub}</span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          className="home-today-side home-today-side-prayer"
          onClick={() => navigate(prayer.href, router)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="home-today-side-icon" aria-hidden>
            <RailLineIcon id="prayer" size={20} />
          </span>
          <span className="home-today-side-text">
            <span className="home-today-side-tag">{prayer.tag}</span>
            <strong className="home-today-side-title">{prayer.title}</strong>
            {prayer.sub ? (
              <span className="muted home-today-side-sub">{prayer.sub}</span>
            ) : null}
          </span>
        </button>
      </div>
    </div>
  );
}
