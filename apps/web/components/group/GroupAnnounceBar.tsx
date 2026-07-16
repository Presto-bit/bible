'use client';

type Props = {
  text: string;
  onOpen?: () => void;
};

/** 群聊顶栏公告条（飞书式：一行摘要，点开设置看全文）。 */
export function GroupAnnounceBar({ text, onOpen }: Props) {
  const t = text.trim();
  if (!t) return null;
  return (
    <button type="button" className="group-announce-bar" onClick={onOpen}>
      <span className="group-announce-label">公告</span>
      <span className="group-announce-text">{t}</span>
    </button>
  );
}
