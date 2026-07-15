'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GroupMember } from '@/lib/api';
import { api } from '@/lib/api';
import {
  clearImDraft,
  getImDraftRecord,
  setImDraftRecord,
  type ImDraftMention,
} from '@/lib/im_drafts';
import {
  autosizeTextarea,
  matchAtQuery,
  type PendingAttach,
} from '@/lib/im_composer';
import { useImComposerKeyboard } from '@/lib/use_im_composer_keyboard';
import { ImAttachPreview } from '@/components/social/ImAttachPreview';
import {
  IconCheckin,
  IconClose,
  IconFile,
  IconImage,
  IconMention,
  IconPlan,
  IconPlus,
  IconTask,
} from '@/components/social/ImComposerIcons';

export type ComposerActionMode = 'checkin' | 'task' | 'plan';

type MentionPick = ImDraftMention;

type Props = {
  gid: string;
  disabled?: boolean;
  busy?: boolean;
  online?: boolean;
  allowChat?: boolean;
  canPostTask?: boolean;
  members?: GroupMember[];
  replyTo?: { id: string; author: string; snippet: string } | null;
  onClearReply?: () => void;
  /** 从草稿恢复回复条 */
  onRestoreReply?: (reply: { id: string; author: string; snippet: string }) => void;
  onOpenMode: (mode: ComposerActionMode) => void;
  onChat?: (body: string, opts?: { mentions?: string[]; replyToId?: string }) => Promise<void>;
  onChatMedia?: (payload: {
    storage_key: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    url: string;
    body?: string;
    mentions?: string[];
    reply_to_id?: string;
  }) => Promise<void>;
};

export function GroupComposerBar({
  gid,
  disabled,
  busy,
  online = true,
  allowChat = true,
  canPostTask = false,
  members = [],
  replyTo = null,
  onClearReply,
  onRestoreReply,
  onOpenMode,
  onChat,
  onChatMedia,
}: Props) {
  const [text, setText] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [mentions, setMentions] = useState<MentionPick[]>([]);
  const [mentionAll, setMentionAll] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atStart, setAtStart] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [pending, setPending] = useState<PendingAttach | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef<string | null>(null);
  const locked = Boolean(disabled || busy || sending || uploading || !online);
  const kbInset = useImComposerKeyboard(composerFocused || panelOpen);

  useEffect(() => {
    const d = getImDraftRecord('group', gid);
    setText(d.text || '');
    setMentions(d.mentions || []);
    setMentionAll(Boolean(d.mentionAll));
    if (
      d.replyToId
      && restoredRef.current !== `${gid}:${d.replyToId}`
    ) {
      restoredRef.current = `${gid}:${d.replyToId}`;
      onRestoreReply?.({
        id: d.replyToId,
        author: d.replyAuthor || '群友',
        snippet: d.replySnippet || '',
      });
    }
  }, [gid]); // eslint-disable-line react-hooks/exhaustive-deps -- 仅切群恢复

  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      setImDraftRecord('group', gid, {
        text,
        mentions,
        mentionAll: mentionAll || undefined,
        replyToId: replyTo?.id,
        replyAuthor: replyTo?.author,
        replySnippet: replyTo?.snippet,
      });
    }, 320);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [gid, text, mentions, mentionAll, replyTo]);

  useEffect(() => {
    autosizeTextarea(inputRef.current, 4);
  }, [text]);

  useEffect(() => {
    if (!replyTo) return;
    setPanelOpen(false);
    setPickerOpen(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [replyTo?.id]);

  useEffect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending]);

  const mentionPayload = () => {
    const ids = mentions.map((m) => m.id);
    if (mentionAll) return ['all', ...ids];
    return ids.length ? ids : undefined;
  };

  const mentionPrefix = () => {
    const labels: string[] = [];
    if (mentionAll) labels.push('@所有人');
    for (const m of mentions) labels.push(`@${m.label}`);
    return labels.length ? `${labels.join(' ')} ` : '';
  };

  const clearMentions = () => {
    setMentions([]);
    setMentionAll(false);
    setAtQuery(null);
    setPickerOpen(false);
  };

  const refreshAtQuery = (value: string, cursor: number) => {
    const hit = matchAtQuery(value, cursor);
    if (hit) {
      setAtQuery(hit.query);
      setAtStart(hit.start);
      setPickerOpen(false);
    } else if (!pickerOpen) {
      setAtQuery(null);
    }
  };

  const suggestMembers = useMemo(() => {
    if (atQuery == null && !pickerOpen) return [];
    const q = (atQuery ?? '').trim().toLowerCase();
    const list: Array<{ id: string; label: string; all?: boolean }> = [];
    if (!q || '所有人'.includes(q) || 'all'.includes(q)) {
      if (!mentionAll) list.push({ id: 'all', label: '所有人', all: true });
    }
    for (const m of members) {
      const uid = m.user_id;
      if (!uid || m.is_me) continue;
      if (mentions.some((x) => x.id === uid)) continue;
      const name = m.name || uid.slice(0, 4);
      if (q && !name.toLowerCase().includes(q) && !uid.toLowerCase().includes(q)) continue;
      list.push({ id: uid, label: name });
      if (list.length >= 10) break;
    }
    return list;
  }, [atQuery, pickerOpen, members, mentions, mentionAll]);

  const showSuggest = (pickerOpen || atQuery != null) && suggestMembers.length > 0;

  const pickMention = (item: { id: string; label: string; all?: boolean }) => {
    const el = inputRef.current;
    let next = text;
    let pos = el?.selectionStart ?? text.length;

    // 从手打 @query 选中时，去掉 "@query"
    if (atQuery != null && text[atStart] === '@') {
      const cursor = el?.selectionStart ?? text.length;
      const before = text.slice(0, atStart);
      const after = text.slice(cursor);
      next = `${before}${after}`;
      pos = before.length;
      setText(next);
    }

    setAtQuery(null);
    setPickerOpen(false);
    if (item.all) {
      setMentionAll(true);
    } else {
      setMentions((prev) =>
        prev.some((x) => x.id === item.id)
          ? prev
          : [...prev, { id: item.id, label: item.label }].slice(0, 20),
      );
    }
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(pos, pos);
      autosizeTextarea(node, 4);
    });
  };

  const canType = allowChat && online && !disabled;

  /** 常驻 @：点开成员浮层（无需先打字） */
  const openMentionPicker = () => {
    if (!canType || sending || uploading) return;
    setPanelOpen(false);
    setPickerOpen(true);
    setAtQuery('');
    setAtStart(inputRef.current?.selectionStart ?? text.length);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const placeholder = (() => {
    if (!online) return '离线不可发，联网后继续';
    if (!allowChat) return '本群已关闭闲聊，可打卡或发任务';
    if (replyTo) return '回复…';
    return '发消息…';
  })();

  const send = async () => {
    if (!allowChat || !onChat || locked) return;
    if (!online) {
      setErr('当前离线，联网后再发送');
      return;
    }
    const body = `${mentionPrefix()}${text.trim()}`.trim();
    if (!body) return;
    setErr(null);
    setSending(true);
    setPanelOpen(false);
    setPickerOpen(false);
    try {
      await onChat(body, {
        mentions: mentionPayload(),
        replyToId: replyTo?.id,
      });
      setText('');
      clearImDraft('group', gid);
      clearMentions();
      onClearReply?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
      requestAnimationFrame(() => autosizeTextarea(inputRef.current, 4));
    }
  };

  const clearPending = () => {
    setPending((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const queueFiles = (files: FileList | null) => {
    if (!files?.length || !onChatMedia || locked) return;
    const file = files[0];
    if (!file) return;
    setPanelOpen(false);
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setPending((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl };
    });
  };

  const confirmPending = async () => {
    if (!pending || !onChatMedia || uploading || busy || !online) return;
    setUploading(true);
    setUploadPct(0);
    setErr(null);
    try {
      const meta = await api.uploadSocialMedia(pending.file, {
        onProgress: (pct) => setUploadPct(pct),
      });
      const caption = `${mentionPrefix()}${text.trim()}`.trim() || undefined;
      await onChatMedia({
        storage_key: meta.storage_key,
        file_name: meta.file_name,
        mime_type: meta.mime_type,
        size_bytes: meta.size_bytes,
        url: meta.url,
        body: caption,
        mentions: mentionPayload(),
        reply_to_id: replyTo?.id,
      });
      setText('');
      clearImDraft('group', gid);
      clearMentions();
      onClearReply?.();
      clearPending();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const openMode = (mode: ComposerActionMode) => {
    setPanelOpen(false);
    onOpenMode(mode);
  };

  const togglePanel = () => {
    setPanelOpen((open) => {
      const next = !open;
      if (next) {
        inputRef.current?.blur();
        setAtQuery(null);
        setPickerOpen(false);
      }
      return next;
    });
  };

  const showSend =
    allowChat && (text.trim().length > 0 || mentionAll || mentions.length > 0) && !pending;

  useEffect(() => {
    if (showSend) setPanelOpen(false);
  }, [showSend]);

  return (
    <footer
      className="im-composer-bar group-wechat-composer im-composer-dock"
      style={{
        bottom: kbInset > 0 ? kbInset : undefined,
        paddingBottom: kbInset > 0 ? 8 : undefined,
      }}
    >
      {replyTo ? (
        <div className="group-composer-reply" style={{ width: '100%' }}>
          <div>
            <span className="muted">回复 {replyTo.author}</span>
            <p>{replyTo.snippet}</p>
          </div>
          <button type="button" className="text-link" onClick={() => onClearReply?.()}>
            取消
          </button>
        </div>
      ) : null}

      {pending ? (
        <ImAttachPreview
          pending={pending}
          busy={uploading}
          progress={uploadPct}
          onCancel={clearPending}
          onConfirm={() => void confirmPending()}
        />
      ) : null}

      {showSuggest ? (
        <div className="im-mention-suggest" role="listbox">
          {pickerOpen ? (
            <div className="im-mention-suggest-head muted">选择要 @ 的人</div>
          ) : null}
          {suggestMembers.map((item) => (
            <button
              key={item.id}
              type="button"
              className="im-mention-suggest-item"
              role="option"
              onMouseDown={(e) => {
                e.preventDefault();
                pickMention(item);
              }}
            >
              @{item.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="im-composer-row">
        {allowChat ? (
          <>
            <button
              type="button"
              className={`im-composer-at${pickerOpen ? ' is-open' : ''}`}
              disabled={!canType || sending || uploading}
              aria-label="提到某人"
              aria-expanded={pickerOpen}
              onClick={openMentionPicker}
            >
              <IconMention />
            </button>
            <div className={`im-composer-field-wrap${locked && !online ? ' is-offline' : ''}`}>
              {(mentionAll || mentions.length > 0) && (
                <div className="im-mention-pills">
                  {mentionAll ? (
                    <button
                      type="button"
                      className="im-mention-pill"
                      onClick={() => setMentionAll(false)}
                    >
                      @所有人 ×
                    </button>
                  ) : null}
                  {mentions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="im-mention-pill"
                      onClick={() => setMentions((prev) => prev.filter((x) => x.id !== m.id))}
                    >
                      @{m.label} ×
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                className="im-composer-field input im-composer-textarea"
                value={text}
                rows={1}
                placeholder={placeholder}
                disabled={!canType || sending || uploading}
                onChange={(e) => {
                  const value = e.target.value;
                  setText(value);
                  refreshAtQuery(value, e.target.selectionStart ?? value.length);
                }}
                onClick={(e) => {
                  const t = e.currentTarget;
                  refreshAtQuery(t.value, t.selectionStart ?? t.value.length);
                }}
                onKeyUp={(e) => {
                  const t = e.currentTarget;
                  refreshAtQuery(t.value, t.selectionStart ?? t.value.length);
                }}
                onFocus={() => {
                  setPanelOpen(false);
                  setComposerFocused(true);
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    if (document.activeElement !== inputRef.current) {
                      setComposerFocused(false);
                      setPickerOpen(false);
                      if (atQuery != null && !matchAtQuery(text, inputRef.current?.selectionStart ?? text.length)) {
                        setAtQuery(null);
                      }
                    }
                  }, 180);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && (atQuery != null || pickerOpen)) {
                    e.preventDefault();
                    setAtQuery(null);
                    setPickerOpen(false);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (showSuggest && suggestMembers[0]) {
                      pickMention(suggestMembers[0]);
                      return;
                    }
                    void send();
                  }
                }}
              />
            </div>
          </>
        ) : (
          <button
            type="button"
            className="im-composer-field group-wechat-input"
            disabled={disabled}
            onClick={togglePanel}
          >
            <span className="group-wechat-input-placeholder">
              {!online ? '离线：可稍后打卡' : '本群已关闭闲聊，可打卡或发任务'}
            </span>
          </button>
        )}
        {showSend ? (
          <button
            type="button"
            className="im-composer-send"
            disabled={locked || (!text.trim() && !mentionAll && !mentions.length)}
            onClick={() => void send()}
          >
            {sending || busy ? '…' : '发送'}
          </button>
        ) : (
          <button
            type="button"
            className={`im-composer-plus${panelOpen ? ' is-open' : ''}`}
            disabled={disabled || uploading || sending}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? '收起更多' : '更多'}
            onClick={togglePanel}
          >
            {panelOpen ? <IconClose /> : <IconPlus />}
          </button>
        )}
      </div>

      {err ? <p className="group-composer-err">{err}</p> : null}

      {panelOpen ? (
        <div className="im-plus-panel" role="menu">
          <button type="button" className="im-plus-item" onClick={() => openMode('checkin')}>
            <span className="im-plus-icon" aria-hidden>
              <IconCheckin />
            </span>
            <span>打卡</span>
          </button>
          {canPostTask ? (
            <button type="button" className="im-plus-item" onClick={() => openMode('task')}>
              <span className="im-plus-icon" aria-hidden>
                <IconTask />
              </span>
              <span>任务</span>
            </button>
          ) : null}
          {canPostTask ? (
            <button type="button" className="im-plus-item" onClick={() => openMode('plan')}>
              <span className="im-plus-icon" aria-hidden>
                <IconPlan />
              </span>
              <span>群计划</span>
            </button>
          ) : null}
          {allowChat && online ? (
            <>
              <button
                type="button"
                className="im-plus-item"
                disabled={uploading || busy || sending}
                onClick={() => imageRef.current?.click()}
              >
                <span className="im-plus-icon" aria-hidden>
                  <IconImage />
                </span>
                <span>图片</span>
              </button>
              <button
                type="button"
                className="im-plus-item"
                disabled={uploading || busy || sending}
                onClick={() => fileRef.current?.click()}
              >
                <span className="im-plus-icon" aria-hidden>
                  <IconFile />
                </span>
                <span>文件</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <input
        ref={imageRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(e) => {
          queueFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        hidden
        onChange={(e) => {
          queueFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </footer>
  );
}
