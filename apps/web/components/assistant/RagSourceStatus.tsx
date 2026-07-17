'use client';

type Props = {
  /** 正文中实际出现的脚标数；无则用 citations.length */
  count: number;
  /** 本次是否走过 RAG；false 时不展示「暂无注释」 */
  useRag?: boolean;
  /** 当前选用知识库名（非平台库时展示） */
  knowledgeBaseName?: string | null;
  knowledgeBaseId?: string | null;
  /** 无命中且非平台库时：换回平台库 */
  onSwitchToPlatform?: () => void;
  className?: string;
};

/**
 * 回答上方固定状态：有引用 / 走过 RAG 但无命中。
 * 未走过 RAG（如章卷导读）不展示，避免误导。
 */
export function RagSourceStatus({
  count,
  useRag = true,
  knowledgeBaseName,
  knowledgeBaseId,
  onSwitchToPlatform,
  className,
}: Props) {
  if (useRag === false) return null;
  const isTopic = Boolean(knowledgeBaseId && knowledgeBaseId !== 'platform');
  const kbSuffix =
    isTopic && knowledgeBaseName ? ` · ${knowledgeBaseName}` : '';
  const text =
    count > 0
      ? `已参考 ${count} 条释经资料${kbSuffix}`
      : `本次以圣经与通识作答 · 资料库暂无直接对应注释${kbSuffix}`;
  return (
    <p
      className={['assistant-rag-status', 'muted', className].filter(Boolean).join(' ')}
      role="status"
    >
      {text}
      {count === 0 && isTopic && onSwitchToPlatform ? (
        <>
          {' · '}
          <button type="button" className="text-link" onClick={onSwitchToPlatform}>
            换回平台库
          </button>
        </>
      ) : null}
    </p>
  );
}
