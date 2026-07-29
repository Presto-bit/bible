'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  INVITE_NUDGE_EVENT,
  markInviteNudgeShown,
} from '@/lib/invite_nudge';
import { shareInviteProduct } from '@/lib/invite_share';
import { isStandalonePwa } from '@/lib/platform';

/**
 * 全局宿主：读完/打卡后通过 requestInviteNudge() 唤起。
 * 每日最多展示一次。
 */
export default function InviteFriendNudge() {
  const flash = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onNudge = () => {
      markInviteNudgeShown();
      setOpen(true);
    };
    window.addEventListener(INVITE_NUDGE_EVENT, onNudge);
    return () => window.removeEventListener(INVITE_NUDGE_EVENT, onNudge);
  }, []);

  if (!open) return null;

  const dismiss = () => setOpen(false);

  const invite = async () => {
    setBusy(true);
    try {
      const result = await shareInviteProduct();
      if (result === 'shared') flash('已调起分享');
      else if (result === 'copied') flash('邀请文案与链接已复制');
      else if (result === 'failed') flash('分享失败');
      if (result === 'shared' || result === 'copied') dismiss();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`invite-nudge-bar${isStandalonePwa() ? ' invite-nudge-bar-pwa' : ''}`}
      role="region"
      aria-label="邀请朋友一起读"
    >
      <button type="button" className="invite-nudge-main" onClick={() => void invite()} disabled={busy}>
        <span className="invite-nudge-title">邀请一位朋友一起读</span>
        <span className="invite-nudge-desc">陪你读懂圣经</span>
      </button>
      <button type="button" className="btn invite-nudge-cta" disabled={busy} onClick={() => void invite()}>
        {busy ? '…' : '去邀请'}
      </button>
      <button type="button" className="invite-nudge-x" onClick={dismiss} aria-label="关闭">
        ✕
      </button>
    </div>
  );
}
