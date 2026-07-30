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
  /** 有来源时点按打开核对 */
  onReview?: () => void;
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
  onReview,
  className,
}: Props) {
  if (useRag === false) return null;
  const isTopic = Boolean(knowledgeBaseId && knowledgeBaseId !== 'platform');
  const kbSuffix =
    isTopic && knowledgeBaseName ? ` · ${knowledgeBaseName}` : '';

  if (count > 0) {
    return (
      <div
        className={['assistant-rag-status', 'assistant-rag-status-row', className]
          .filter(Boolean)
          .join(' ')}
        role="status"
      >
        <p className="muted assistant-rag-status-text">
          已参考 {count} 条来源{kbSuffix}
          {onReview ? (
            <>
              {' · '}
              <button type="button" className="text-link" onClick={onReview}>
                核对
              </button>
            </>
          ) : null}
        </p>
        <p className="assistant-rag-disclaimer">AI 释义，请以圣经原文为准</p>
      </div>
    );
  }

  return (
    <div
      className={['assistant-rag-status', 'assistant-rag-status-row', className]
        .filter(Boolean)
        .join(' ')}
      role="status"
    >
      <p className="muted assistant-rag-status-text">
        本次主要依据经文与通识 · 未检索到专题资料{kbSuffix}
        {isTopic && onSwitchToPlatform ? (
          <>
            {' · '}
            <button type="button" className="text-link" onClick={onSwitchToPlatform}>
              换回平台库
            </button>
          </>
        ) : null}
      </p>
      <p className="assistant-rag-disclaimer">AI 释义，请以圣经原文为准</p>
    </div>
  );
}
