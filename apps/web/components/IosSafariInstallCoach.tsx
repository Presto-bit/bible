'use client';

import { PWA_HOME_NAME } from '@/lib/pwa_brand';
import { type IosA2hsMark } from '@/lib/ios_home_screen_guide';
import { useIosAddToHomeGuide } from '@/lib/use_ios_add_to_home_guide';

type Props = {
  resumeLabel?: string;
  softCloseOnly?: boolean;
  onDismissPassive: () => void;
  onSoftClose: () => void;
};

/**
 * iOS Safari：非模态提示。分享页保持可滚可点。
 * 步骤按系统版本切换，见 ios_home_screen_guide。
 */
export function IosSafariInstallCoach({
  resumeLabel = '',
  softCloseOnly = false,
  onDismissPassive,
  onSoftClose,
}: Props) {
  const guide = useIosAddToHomeGuide();
  const close = () => {
    if (softCloseOnly) onSoftClose();
    else onDismissPassive();
  };
  const mark = <AnchorMark mark={guide.mark} />;
  const label = <span className="ios-install-coach-anchor-label">点这里</span>;

  return (
    <div
      className={`ios-install-coach is-anchor-${guide.anchor}`}
      role="dialog"
      aria-labelledby="ios-install-coach-title"
    >
      <div className="ios-install-coach-anchor" aria-hidden>
        {guide.anchor === 'top-right' ? <>{mark}{label}</> : <>{label}{mark}</>}
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
            {guide.steps.map((step, i) => (
              <li
                key={step.title}
                className={i === guide.steps.length - 1 ? 'ios-install-coach-menu-pick' : undefined}
              >
                <span className="ios-install-coach-menu-n">{i + 1}</span>
                <span>{step.title}</span>
              </li>
            ))}
          </ol>

          <p className="muted ios-install-coach-hint">{guide.hint}</p>
          {guide.alternate ? (
            <p className="muted ios-install-coach-alt">{guide.alternate}</p>
          ) : null}

          <button type="button" className="text-link ios-install-coach-dismiss" onClick={close}>
            收起
          </button>
        </div>
      </div>
    </div>
  );
}

function AnchorMark({ mark }: { mark: IosA2hsMark }) {
  if (mark === 'share') {
    return (
      <span className="ios-install-coach-anchor-btn" aria-hidden>
        <ShareGlyph />
      </span>
    );
  }
  if (mark === 'menu') {
    return <span className="ios-install-coach-anchor-btn is-word">图标</span>;
  }
  return <span className="ios-install-coach-anchor-btn">···</span>;
}

function ShareGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3.5v9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M8.2 7.2 12 3.4l3.8 3.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 10.5H6a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V12.5a2 2 0 0 0-2-2h-1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
