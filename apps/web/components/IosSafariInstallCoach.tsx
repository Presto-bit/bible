'use client';

import { PWA_HOME_NAME } from '@/lib/pwa_brand';

type Props = {
  resumeLabel?: string;
  softCloseOnly?: boolean;
  onDismissPassive: () => void;
  onSoftClose: () => void;
};

const MENU = [
  { label: '共享', pick: false },
  { label: '查看更多', pick: false },
  { label: '添加到主屏幕', pick: true },
] as const;

/**
 * iOS Safari：非模态提示。分享页保持可滚可点。
 * 指向屏幕右侧 ···；菜单三项里只点「添加到主屏幕」。
 */
export function IosSafariInstallCoach({
  resumeLabel = '',
  softCloseOnly = false,
  onDismissPassive,
  onSoftClose,
}: Props) {
  const close = () => {
    if (softCloseOnly) onSoftClose();
    else onDismissPassive();
  };

  return (
    <div className="ios-install-coach" role="dialog" aria-labelledby="ios-install-coach-title">
      <div className="ios-install-coach-anchor" aria-hidden>
        <span className="ios-install-coach-anchor-label">点这里</span>
        <span className="ios-install-coach-anchor-btn">···</span>
      </div>

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

          <strong id="ios-install-coach-title" className="ios-install-coach-name">
            添加到主屏幕
          </strong>
          <p className="ios-install-coach-headline">
            点 Safari 右侧 <strong>···</strong>
            {resumeLabel ? `。加上之后可回到${resumeLabel}` : `，把${PWA_HOME_NAME}留在主屏幕`}
          </p>

          <ol className="ios-install-coach-menu" aria-label="右侧菜单">
            {MENU.map((item) => (
              <li
                key={item.label}
                className={item.pick ? 'ios-install-coach-menu-pick' : 'ios-install-coach-menu-skip'}
              >
                <span>{item.label}</span>
                <span className="ios-install-coach-menu-tag">{item.pick ? '点这个' : '不要点'}</span>
              </li>
            ))}
          </ol>

          <p className="muted ios-install-coach-hint">
            点「添加到主屏幕」之后，再点右上角「添加」。
          </p>

          <button type="button" className="text-link ios-install-coach-dismiss" onClick={close}>
            先看这篇
          </button>
        </div>
      </div>
    </div>
  );
}
