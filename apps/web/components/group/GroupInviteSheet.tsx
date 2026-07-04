'use client';

import { useState } from 'react';

type Props = {
  groupName: string;
  joinCode: string;
  onClose: () => void;
};

function isWeChatBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

/** 邀请好友：展示邀请码 + 复制 / 系统分享（手机上可选微信） */
export function GroupInviteSheet({ groupName, joinCode, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState('');
  const code = (joinCode || '').trim().toUpperCase();
  const shareText = `邀请你加入共读群「${groupName}」\n邀请码：${code}\n打开圣经 App → 首页「+」→ 加入群，输入邀请码即可。`;
  const inWeChat = isWeChatBrowser();

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setHint(okMsg);
      window.setTimeout(() => {
        setCopied(false);
        setHint('');
      }, 2200);
    } catch {
      setHint('复制失败，请长按邀请码手动复制');
    }
  };

  const copyCode = async () => {
    await copyText(code, '邀请码已复制，可粘贴到微信');
  };

  const share = async () => {
    // 微信内置浏览器通常无系统分享面板，引导复制后发微信
    if (inWeChat) {
      await copyText(shareText, '邀请文案已复制，点右上角「…」发给朋友，或粘贴到微信聊天');
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: `加入「${groupName}」`, text: shareText });
        return;
      }
    } catch {
      /* 用户取消 */
      return;
    }
    await copyText(shareText, '已复制邀请文案，可粘贴到微信');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card group-invite-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>邀请好友</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
          {inWeChat
            ? '当前在微信内打开：复制邀请后，点右上角「…」发给朋友或粘贴到聊天。'
            : '手机上点「分享」可选用微信等应用；也可复制邀请码手动发送。'}
        </p>
        <div className="group-invite-code-card">
          <span className="muted" style={{ fontSize: 12 }}>群邀请码</span>
          <strong className="group-invite-code">{code}</strong>
        </div>
        <div className="group-invite-actions">
          <button type="button" className="btn btn-block" onClick={() => void copyCode()}>
            {copied && hint.includes('邀请码') ? '已复制' : '复制邀请码'}
          </button>
          <button
            type="button"
            className="half-sheet-action-btn"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => void share()}
          >
            {inWeChat ? '复制并分享到微信' : '分享到微信等应用'}
          </button>
          {hint && (
            <p className="muted" style={{ fontSize: 12, margin: '10px 0 0', lineHeight: 1.45, textAlign: 'center' }}>
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
