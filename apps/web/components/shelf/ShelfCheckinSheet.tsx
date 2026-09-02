'use client';

import { useEffect, useState } from 'react';
import { api, type Group } from '@/lib/api';
import { recordGroupCheckin } from '@/lib/badge_events';
import { requestInviteNudge } from '@/lib/invite_nudge';
import { formatGroupRefLabel } from '@/lib/ref_label';
import {
  buildShelfCheckinRef,
  formatShelfCheckinLabel,
  normalizeCheckinBody,
  rememberShelfRefLabel,
  SHELF_CHECKIN_CHIPS,
  GROUP_CHECKIN_BODY_MAX,
} from '@/lib/shelf_checkin';
import AppBodyPortal from '@/components/AppBodyPortal';
import { leaveFlutterH5ToDiscover } from '@/lib/flutter_h5_bridge';

type Props = {
  bookId: string;
  bookTitle: string;
  sectionId: string;
  sectionTitle: string;
  pageIndex?: number;
  presetGroupId?: string | null;
  onClose: () => void;
  onDone?: () => void;
};

export default function ShelfCheckinSheet({
  bookId,
  bookTitle,
  sectionId,
  sectionTitle,
  pageIndex = 0,
  presetGroupId,
  onClose,
  onDone,
}: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [gid, setGid] = useState(presetGroupId || '');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const checkinRef = () => buildShelfCheckinRef(bookId, sectionId, pageIndex);

  const checkinLabel = () => {
    const ref = checkinRef();
    return formatGroupRefLabel(ref) || formatShelfCheckinLabel(bookTitle, sectionTitle);
  };

  const onBodyInput = (value: string) => {
    setBody(value.slice(0, GROUP_CHECKIN_BODY_MAX));
  };

  useEffect(() => {
    api
      .myGroups()
      .then((r) => {
        setGroups(r.groups);
        if (!presetGroupId && r.groups.length === 1) {
          setGid(r.groups[0].id);
        }
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [presetGroupId]);

  const submit = async () => {
    if (!gid || busy) return;
    setBusy(true);
    setErr(null);
    const ref = checkinRef();
    const label = formatShelfCheckinLabel(bookTitle, sectionTitle);
    rememberShelfRefLabel(ref, label);
    try {
      await api.checkin(gid, {
        ref,
        body: normalizeCheckinBody(body),
      });
      recordGroupCheckin(gid);
      setSubmitted(true);
      requestInviteNudge(1600);
      onDone?.();
      window.setTimeout(onClose, 600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet card group-checkin-sheet group-checkin-compact" onClick={(e) => e.stopPropagation()}>
          <div className="half-sheet-grab" aria-hidden />
          <div className="section-row" style={{ marginTop: 0 }}>
            <strong style={{ fontSize: 15 }}>分享到共读群</strong>
            <button type="button" className="text-link" onClick={onClose}>
              关闭
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
            {checkinLabel()}
          </p>

          {loading ? (
            <p className="muted" style={{ fontSize: 13 }}>加载群列表…</p>
          ) : groups.length === 0 ? (
            <div>
              <p className="muted" style={{ fontSize: 13 }}>你还没有加入共读群。</p>
              <a
                href="/discover"
                className="font-pill"
                style={{ marginTop: 8, display: 'inline-block', fontSize: 12 }}
                onClick={(e) => {
                  if (leaveFlutterH5ToDiscover('/discover')) e.preventDefault();
                }}
              >
                进入消息创建或加入
              </a>
            </div>
          ) : submitted ? (
            <p className="muted" style={{ fontSize: 13 }}>已分享到群 ✓</p>
          ) : (
            <>
              <select
                id="shelf-group-pick"
                className="search-input"
                style={{ fontSize: 13, padding: '8px 10px' }}
                value={gid}
                onChange={(e) => setGid(e.target.value)}
                disabled={Boolean(presetGroupId)}
              >
                <option value="">请选择共读群</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.my_checked_in_today ? ' · 今日已打卡' : ''}
                  </option>
                ))}
              </select>

              <div className="group-composer-section" style={{ marginTop: 10 }}>
                <div className="group-composer-label">快捷感想</div>
                <div className="chip-swipe group-chip-swipe">
                  {SHELF_CHECKIN_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={`group-chip chip-swipe-item${body === chip ? ' selected' : ''}`}
                      disabled={!gid || busy}
                      onClick={() => onBodyInput(body === chip ? '' : chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              <div className="group-composer-section">
                <div className="group-composer-label-row">
                  <span className="group-composer-label">写感想</span>
                  <span className="muted group-composer-char-count">{body.length}/{GROUP_CHECKIN_BODY_MAX}</span>
                </div>
                <textarea
                  className="group-composer-text search-input compose-textarea"
                  rows={3}
                  placeholder="写下阅读感受（可选）"
                  value={body}
                  maxLength={GROUP_CHECKIN_BODY_MAX}
                  disabled={!gid || busy}
                  onChange={(e) => onBodyInput(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn"
                style={{ width: '100%', marginTop: 8, fontSize: 14, padding: '10px 12px' }}
                disabled={!gid || busy}
                onClick={() => void submit()}
              >
                {busy ? '发送中…' : '发送打卡'}
              </button>
            </>
          )}
          {err ? <p className="group-composer-err" role="alert">{err}</p> : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
