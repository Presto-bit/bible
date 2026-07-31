/** 想法正文展示：列表预览剥 Markdown；详情走富文本渲染。 */

/** 列表/足迹用：去掉常见 Markdown 标记，避免出现 ###、** 等原文。 */
export function plainThoughtPreview(body: string, maxLen = 80): string {
  const raw = (body || '').trim();
  if (!raw) return '';
  let text = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>+\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/^【([^】]+)】\s*/gm, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) text = raw.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

export function thoughtTitleLine(body: string, maxLen = 40): string {
  return plainThoughtPreview(body, maxLen) || '（空）';
}
