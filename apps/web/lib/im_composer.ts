/** IM 输入栏共用：多行高度、@ 检测、文件体量文案 */

export function autosizeTextarea(el: HTMLTextAreaElement | null, maxRows = 4) {
  if (!el) return;
  const style = getComputedStyle(el);
  const line = parseFloat(style.lineHeight) || 22;
  const pad =
    (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const maxH = line * maxRows + pad;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 光标前是否正在输入 @query；返回 query 与起始下标 */
export function matchAtQuery(
  text: string,
  cursor: number,
): { query: string; start: number } | null {
  const head = text.slice(0, cursor);
  const m = head.match(/@([^\s@]*)$/);
  if (!m || m.index == null) return null;
  return { query: m[1] || '', start: m.index };
}

export type PendingAttach = {
  file: File;
  previewUrl: string | null;
};
