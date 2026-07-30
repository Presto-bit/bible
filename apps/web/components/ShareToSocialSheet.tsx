'use client';

import { useCallback, useState } from 'react';
import { api, effectiveId } from '@/lib/api';
import { GROUP_CHECKIN_DEFAULT_BODY } from '@/lib/group_checkin';
import { ImContactPicker, type ImContactTarget } from '@/components/social/ImContactPicker';

type ShareMode = 'verse' | 'checkin';

type Props = {
  ref: string;
  refLabel: string;
  body?: string;
  kind?: 'thought' | 'verse' | 'note' | 'analysis';
  defaultGroupMode?: ShareMode;
  onClose: () => void;
  onDone?: (target: string) => void;
};

export function ShareToSocialSheet({
  ref: verseRef,
  refLabel,
  body,
  kind = 'verse',
  defaultGroupMode = 'verse',
  onClose,
  onDone,
}: Props) {
  const isAnalysis = kind === 'analysis';
  const canVerseCard =
    Boolean(verseRef?.trim())
    && verseRef !== 'FREE'
    && verseRef !== '小爱的解读';
  const [groupMode, setGroupMode] = useState<ShareMode>(
    isAnalysis ? 'verse' : defaultGroupMode,
  );
  const uid = effectiveId();

  const onConfirm = useCallback(
    async (targets: ImContactTarget[], leaveMessage: string) => {
      const msg = leaveMessage.trim();
      for (const t of targets) {
        if (t.type === 'group') {
          if (!isAnalysis && groupMode === 'checkin') {
            await api.checkin(t.gid, {
              ref: verseRef,
              body: msg || GROUP_CHECKIN_DEFAULT_BODY,
            });
          } else if (isAnalysis && !canVerseCard) {
            await api.sendGroupChat(t.gid, (msg || refLabel).slice(0, 2000));
          } else {
            await api.sendGroupVerse(t.gid, {
              ref: canVerseCard ? verseRef : verseRef || 'FREE',
              body: msg || undefined,
            });
          }
        } else if (isAnalysis && !canVerseCard) {
          const dm = await api.openDm(t.peerId);
          await api.sendDm(dm.thread_id, {
            kind: 'chat',
            body: (msg || refLabel).slice(0, 2000),
          });
        } else {
          const dm = await api.openDm(t.peerId);
          await api.sendDm(dm.thread_id, {
            kind: 'verse',
            ref: canVerseCard ? verseRef : verseRef || 'FREE',
            body: msg || refLabel,
          });
        }
      }
      const label =
        targets.length === 1
          ? targets[0]!.label
          : `${targets[0]!.label} 等 ${targets.length} 个会话`;
      onDone?.(label);
    },
    [canVerseCard, groupMode, isAnalysis, onDone, refLabel, verseRef],
  );

  if (!uid) {
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet card" onClick={(e) => e.stopPropagation()}>
          <p>本机账号就绪后即可分享到共读群或私信好友。</p>
          <a className="btn" href="/profile">前往我的</a>
        </div>
      </div>
    );
  }

  return (
    <ImContactPicker
      open
      title={isAnalysis ? '分享解读' : '分享经文'}
      preview={refLabel}
      defaultLeaveMessage={body || ''}
      leaveMessagePlaceholder={isAnalysis ? '分享文案（可改）' : '附言（可选）'}
      confirmLabel="分享"
      headerExtra={
        !isAnalysis ? (
          <div className="reader-tools-tabs" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className={`mode-chip ${groupMode === 'verse' ? 'mode-chip-active' : ''}`}
              onClick={() => setGroupMode('verse')}
            >
              发经文卡
            </button>
            <button
              type="button"
              className={`mode-chip ${groupMode === 'checkin' ? 'mode-chip-active' : ''}`}
              onClick={() => setGroupMode('checkin')}
            >
              打卡分享
            </button>
          </div>
        ) : null
      }
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
