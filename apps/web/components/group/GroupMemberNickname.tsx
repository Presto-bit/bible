'use client';

import { useEffect, useState } from 'react';
import { api, type GroupMember } from '@/lib/api';
import { displayMemberName } from '@/lib/group_ui';

type Props = {
  gid: string;
  members: GroupMember[];
  onChanged: () => void;
};

export function GroupMemberNickname({ gid, members, onChanged }: Props) {
  const me = members.find((m) => m.is_me);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(me ? displayMemberName(me) : '');
  }, [me?.user_id, me?.name]);

  if (!me) return null;

  const save = async () => {
    const name = draft.trim();
    if (!name) {
      setErr('名称不能为空');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.updateGroupMemberName(gid, name);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group-member-nickname-box" style={{ marginBottom: 12 }}>
      <label className="group-composer-label" htmlFor="group-member-nick">
        我在本群的显示名
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input
          id="group-member-nick"
          className="search-input"
          value={draft}
          maxLength={32}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="其他成员看到的名字"
        />
        <button type="button" className="btn" style={{ flexShrink: 0 }} disabled={busy} onClick={() => void save()}>
          {busy ? '…' : '保存'}
        </button>
      </div>
      {err && <p className="group-composer-err">{err}</p>}
    </div>
  );
}
