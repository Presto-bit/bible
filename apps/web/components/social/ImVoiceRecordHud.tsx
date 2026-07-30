'use client';

import AppBodyPortal from '@/components/AppBodyPortal';

type Props = {
  open: boolean;
  cancelArmed?: boolean;
  elapsedSec?: number;
};

/** 按住说话时的全屏录音态（时长 + 上滑取消提示）。 */
export function ImVoiceRecordHud({ open, cancelArmed = false, elapsedSec = 0 }: Props) {
  if (!open) return null;
  const sec = Math.max(0, Math.min(60, elapsedSec));
  return (
    <AppBodyPortal>
      <div
        className={`im-voice-hud${cancelArmed ? ' is-cancel' : ''}`}
        role="status"
        aria-live="polite"
        aria-label={cancelArmed ? '松开取消' : '正在录音'}
      >
        <div className="im-voice-hud-card">
          <div className="im-voice-hud-wave" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
          <strong className="im-voice-hud-time">{sec}″</strong>
          <p className="im-voice-hud-tip">
            {cancelArmed ? '松开手指，取消发送' : '松开发送 · 上滑取消'}
          </p>
        </div>
      </div>
    </AppBodyPortal>
  );
}
