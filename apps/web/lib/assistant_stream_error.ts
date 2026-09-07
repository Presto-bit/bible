/** 流式错误与已有正文合并（半屏 / Tab 共用）。 */
export function mergeAssistantStreamError(acc: string, msg: string): string {
  const trimmed = acc.trim();
  const cleanMsg = msg.startsWith('⚠️') ? msg : `⚠️ ${msg}`;
  if (!trimmed || trimmed.startsWith('⚠️')) return cleanMsg;
  return `${trimmed}\n\n${cleanMsg}`;
}

/** 流未正常结束时追加轻提示（不覆盖正文）。 */
export function appendStreamIncompleteNotice(acc: string): string {
  const trimmed = acc.trim();
  if (!trimmed || trimmed.startsWith('⚠️')) return trimmed;
  if (trimmed.includes('生成未完成')) return trimmed;
  return `${trimmed}\n\n（生成未完成，可点重新生成）`;
}
