'use client';

import {
  normalizeCampaignCoverPath,
  systemCoverOptions,
} from '@/lib/daily_verse_wallpaper';

const OPTIONS = systemCoverOptions();

/** 活动首页卡背景：从系统风景图库中选择 */
export function CampaignCoverPicker({
  value,
  onChange,
  compact = false,
}: {
  value?: string | null;
  onChange: (path: string) => void;
  compact?: boolean;
}) {
  const current = normalizeCampaignCoverPath(value);
  return (
    <div className={`ops-cover-picker${compact ? ' is-compact' : ''}`}>
      <div className="ops-cover-picker-head">
        <span className="ops-cover-picker-label">卡片背景</span>
        {current ? (
          <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={() => onChange('')}>
            恢复默认
          </button>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            系统风景图
          </span>
        )}
      </div>
      <div className="ops-cover-picker-grid" role="listbox" aria-label="选择卡片背景">
        {OPTIONS.map((opt) => {
          const on = current === opt.path;
          return (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={on}
              className={`ops-cover-picker-item${on ? ' is-on' : ''}`}
              title={opt.id}
              onClick={() => onChange(opt.path)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={opt.url} alt="" loading="lazy" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
