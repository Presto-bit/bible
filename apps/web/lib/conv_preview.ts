const KIND_RE = /\[(打卡|任务|经文|计划)\]\s*/;

/** 从会话预览里拆出类型标记，字幕不再重复方括号前缀。 */
export function splitConvKind(subtitle: string): { kind: string | null; text: string } {
  const m = KIND_RE.exec(subtitle);
  if (!m || m.index == null) return { kind: null, text: subtitle };
  const text = `${subtitle.slice(0, m.index)}${subtitle.slice(m.index + m[0].length)}`
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { kind: m[1] || null, text };
}
