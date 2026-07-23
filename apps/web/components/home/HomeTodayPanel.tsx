'use client';

import { useRouter } from 'next/navigation';
import { bookCoverImageUrl } from '@/lib/book_cover';
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

/** 今日推荐：浅底轻容器 + 左大右双；与 Hero 沉浸卡区分 */
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
          </div>
          <div className="home-today-primary-body">
            <span className="home-today-primary-kicker">{primary.tag}</span>
            <strong className="home-today-primary-title">{primary.title}</strong>
            {primary.sub ? (
              <span className="muted home-today-primary-sub">{primary.sub}</span>
            ) : null}
            {primary.cta ? (
              <span className="home-today-primary-cta">{primary.cta}</span>
            ) : null}
          </div>
        </button>

        <div className="home-today-sides" role="group" aria-label="快捷入口">
          <button
            type="button"
            className="home-today-side"
            onClick={() => navigate(group.href, router)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="home-today-side-icon" aria-hidden>
              <RailLineIcon id="group" size={18} />
            </span>
            <strong className="home-today-side-title">{group.title}</strong>
          </button>
          <button
            type="button"
            className="home-today-side"
            onClick={() => navigate(prayer.href, router)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="home-today-side-icon" aria-hidden>
              <RailLineIcon id="prayer" size={18} />
            </span>
            <strong className="home-today-side-title">{prayer.title}</strong>
          </button>
        </div>
      </div>
    </section>
  );
}
