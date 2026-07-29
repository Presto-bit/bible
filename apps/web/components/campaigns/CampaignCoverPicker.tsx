'use client';

import { useEffect, useId, useState } from 'react';
import {
  normalizeCampaignCoverPath,
  resolveCampaignCoverUrl,
  systemCoverOptions,
} from '@/lib/daily_verse_wallpaper';

const OPTIONS = systemCoverOptions();

/** 活动首页卡背景：触发条 + 弹窗筛选系统风景图 */
export function CampaignCoverPicker({
  value,
  onChange,
  compact = false,
}: {
  value?: string | null;
  onChange: (path: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const current = normalizeCampaignCoverPath(value);
  const currentUrl = resolveCampaignCoverUrl(current);
  const currentOpt = OPTIONS.find((o) => o.path === current);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
      <button
        type="button"
        className="ops-cover-picker-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="ops-cover-picker-thumb" aria-hidden>
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="" />
          ) : (
            <span className="ops-cover-picker-thumb-empty">默</span>
          )}
        </span>
        <span className="ops-cover-picker-trigger-text">
          <strong>{currentOpt ? currentOpt.id : '默认风景'}</strong>
          <span className="muted">点击选择系统背景</span>
        </span>
      </button>

      {open ? (
        <div
          className="ops-cover-picker-overlay"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="ops-cover-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ops-cover-picker-dialog-head">
              <h3 id={titleId} className="settings-title" style={{ margin: 0 }}>
                选择卡片背景
              </h3>
              <button type="button" className="text-link" style={{ fontSize: 13 }} onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
              共 {OPTIONS.length} 张系统风景，点选即用
            </p>
            <div className="ops-cover-picker-grid" role="listbox" aria-label="系统风景背景">
              <button
                type="button"
                role="option"
                aria-selected={!current}
                className={`ops-cover-picker-item is-default${!current ? ' is-on' : ''}`}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <span>默认</span>
              </button>
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
                    onClick={() => {
                      onChange(opt.path);
                      setOpen(false);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={opt.url} alt="" loading="lazy" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
