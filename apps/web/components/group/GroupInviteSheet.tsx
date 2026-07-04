'use client';

import { useState } from 'react';

type Props = {
  groupName: string;
  joinCode: string;
  onClose: () => void;
};

/** 邀请好友：展示邀请码 + 复制 / 系统分享 */
export function GroupInviteSheet({ groupName, joinCode, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const code = (joinCode || '').trim().toUpperCase();
  const shareText = `邀请你加入共读群「${groupName}」\n邀请码：${code}\n打开圣经 App → 首页「+」→ 加入群，输入邀请码即可。`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `加入「${groupName}」`, text: shareText });
        return;
      }
    } catch {
      /* user cancel */
      return;
    }
    await copyCode();
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
          把邀请码发给好友，对方在首页「+」→「加入群」输入即可。
        </p>
        <div className="group-invite-code-card">
          <span className="muted" style={{ fontSize: 12 }}>群邀请码</span>
          <strong className="group-invite-code">{code}</strong>
        </div>
        <div className="group-invite-actions">
          <button type="button" className="btn btn-block" onClick={() => void copyCode()}>
            {copied ? '已复制' : '复制邀请码'}
          </button>
          <button
            type="button"
            className="half-sheet-action-btn"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => void share()}
          >
            分享给好友
          </button>
        </div>
      </div>
    </div>
  );
}
