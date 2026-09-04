'use client';

import { useRouter } from 'next/navigation';
import { openCampaignHref, toInternalAppPath } from '@/lib/campaign_nav';
import type { HomeTodayPanelModel } from '@/lib/home_today_panel';
import { homeTodayPanelSlots } from '@/lib/home_today_panel';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import { HomeTodayTile } from '@/components/home/HomeTodayTile';

type Props = {
  panel: HomeTodayPanelModel;
  /** 打卡回流高亮共读坑 [3] */
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

/** 今日推荐：2×2 固定四坑（活动/书架 · 继续阅读 · 共读 · 祷告） */
export function HomeTodayPanel({
  panel,
  groupFlash = false,
  staggerEnter = false,
}: Props) {
  const router = useRouter();
  const [activity, read, group, prayer] = homeTodayPanelSlots(panel);

  return (
    <section
      className={`home-today-section${staggerEnter ? ' home-stagger-enter' : ''}`}
      aria-label="今日推荐"
    >
      <h2 className="home-today-heading">今日推荐</h2>
      <div
        className={`home-today-grid${staggerEnter ? ' home-stagger-item home-stagger-1' : ''}`}
      >
        <HomeTodayTile
          slot={activity}
          priority
          onClick={() => navigate(activity.href, router)}
        />
        <HomeTodayTile slot={read} priority onClick={() => navigate(read.href, router)} />
        <HomeTodayTile
          slot={group}
          flash={groupFlash}
          onClick={() => navigate(group.href, router)}
        />
        <HomeTodayTile slot={prayer} onClick={() => navigate(prayer.href, router)} />
      </div>
    </section>
  );
}
