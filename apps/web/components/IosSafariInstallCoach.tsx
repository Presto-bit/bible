'use client';

import { PWA_HOME_NAME } from '@/lib/pwa_brand';

type Props = {
  resumeLabel?: string;
  softCloseOnly?: boolean;
  onDismissPassive: () => void;
  onSoftClose: () => void;
};

const STEPS = ['点右侧 ···', '点「共享」', '点「查看更多」', '点「添加到主屏幕」'] as const;

/**
 * iOS Safari：非模态提示。分享页保持可滚可点。
 * 路径：右侧 ··· → 共享 → 查看更多 → 添加到主屏幕。
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
            {resumeLabel ? `加上之后可回到${resumeLabel}` : `把${PWA_HOME_NAME}留在主屏幕`}
          </p>

          <ol className="ios-install-coach-menu" aria-label="操作步骤">
            {STEPS.map((label, i) => (
              <li key={label} className={i === STEPS.length - 1 ? 'ios-install-coach-menu-pick' : undefined}>
                <span className="ios-install-coach-menu-n">{i + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>

          <p className="muted ios-install-coach-hint">按顺序点。最后再点右上角「添加」。</p>

          <button type="button" className="text-link ios-install-coach-dismiss" onClick={close}>
            收起
          </button>
        </div>
      </div>
    </div>
  );
}
