'use client';

import { BASE_PATH } from '@/lib/basePath';
import { PWA_HOME_NAME, PWA_HOME_SUBTITLE } from '@/lib/pwa_brand';

type Props = {
  resumeLabel?: string;
  softCloseOnly?: boolean;
  onDismissPassive: () => void;
  onSoftClose: () => void;
};

/**
 * iOS Safari：一屏指尖引导（无法程序化「添加到主屏幕」）。
 * 指向底栏中间「共享」↑，路径压成一句。
 */
export function IosSafariInstallCoach({
  resumeLabel = '',
  softCloseOnly = false,
  onDismissPassive,
  onSoftClose,
}: Props) {
  const iconSrc = `${BASE_PATH || ''}/apple-touch-icon.png`;
  const headline = resumeLabel
    ? `下次从主屏幕一键续读 · ${resumeLabel}`
    : '保存到主屏幕，像打开 App 一样读经';

  return (
    <div
      className="ios-install-coach"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-coach-title"
    >
      <button
        type="button"
        className="ios-install-coach-scrim"
        aria-label="关闭"
        onClick={onSoftClose}
      />

      <div className="ios-install-coach-body">
        <div className="ios-install-coach-card">
          <button
            type="button"
            className="ios-install-coach-close"
            aria-label="关闭"
            onClick={onSoftClose}
          >
            ✕
          </button>

          <div className="ios-install-coach-brand">
            <img src={iconSrc} alt="" width={56} height={56} className="ios-install-coach-icon" />
            <div>
              <strong id="ios-install-coach-title" className="ios-install-coach-name">
                {PWA_HOME_NAME}
              </strong>
              <span className="muted ios-install-coach-sub">{PWA_HOME_SUBTITLE}</span>
            </div>
          </div>

          <p className="ios-install-coach-headline">{headline}</p>

          <p className="ios-install-coach-path" aria-label="操作路径">
            <span>共享</span>
            <span className="ios-install-coach-path-sep" aria-hidden>
              →
            </span>
            <span>添加到主屏幕</span>
            <span className="ios-install-coach-path-sep" aria-hidden>
              →
            </span>
            <span>添加</span>
          </p>

          <p className="muted ios-install-coach-hint">约 10 秒 · 点 Safari 底栏中间的 ↑</p>
        </div>

        <div className="ios-install-coach-point" aria-hidden>
          <svg className="ios-install-coach-arrow" viewBox="0 0 64 88" width="52" height="72">
            <path
              d="M32 6v58"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M18 50l14 18 14-18"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <div className="ios-install-coach-target">
            <span className="ios-install-coach-share" title="共享">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                <path
                  d="M12 3v11M7.5 7.5 12 3l4.5 4.5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="ios-install-coach-target-label">共享</span>
          </div>
        </div>

        <button
          type="button"
          className="text-link ios-install-coach-dismiss"
          onClick={() => {
            if (softCloseOnly) onSoftClose();
            else onDismissPassive();
          }}
        >
          暂不保存
        </button>
      </div>
    </div>
  );
}
