/** AbortSignal.reason：用户点「停止」，api_core 不合成超时 onError。 */
export const CHAT_ABORT_USER_CANCEL = 'user_cancel';

/** AbortSignal.reason：连接/生成超时（与 user_cancel 区分）。 */
export const CHAT_ABORT_TIMEOUT = 'timeout';

/** 失败 / 中断 / 空答 — 不应进入多轮 history（Tab / 半屏 / 服务端共用规则）。 */
export function isAssistantHistoryExcluded(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith('⚠️')) return true;
  if (t === '（已停止生成）' || t.includes('已停止生成')) return true;
  if (t.includes('生成未完成')) return true;
  return false;
}

/** 流式错误与已有正文合并（半屏 / Tab 共用）。 */
export function mergeAssistantStreamError(acc: string, msg: string): string {
  const trimmed = acc.trim();
  const cleanMsg = msg.startsWith('⚠️') ? msg : `⚠️ ${msg}`;
  if (!trimmed || trimmed.startsWith('⚠️')) return cleanMsg;
  return `${trimmed}\n\n${cleanMsg}`;
}

/** 服务端判定 incomplete：丢弃半成品，仅保留可重试提示。 */
export function replaceAssistantStreamError(msg: string): string {
  const cleanMsg = msg.startsWith('⚠️') ? msg : `⚠️ ${msg}`;
  return cleanMsg;
}

/** 流未正常结束时追加轻提示（不覆盖正文）。 */
export function appendStreamIncompleteNotice(acc: string): string {
  const trimmed = acc.trim();
  if (!trimmed || trimmed.startsWith('⚠️')) return trimmed;
  if (trimmed.includes('生成未完成')) return trimmed;
  return `${trimmed}\n\n（生成未完成，可点重新生成）`;
}
