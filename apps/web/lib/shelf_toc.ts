import type { ShelfBookDetail, ShelfTocItem } from '@/lib/shelf_api';

export type ShelfTocGroup = { key: string; label: string; items: ShelfTocItem[] };

/** 教案合集单元完整标题（目录展示用） */
export const SHELF_UNIT_DISPLAY: Record<string, string> = {
  第一单元: '第一单元 · 创造与天地万物',
  第二单元: '第二单元 · 奇妙的身体与家',
  第三单元: '第三单元 · 耶稣的神迹与呼召',
  第四单元: '第四单元 · 品格故事与服事',
  第五单元: '第五单元 · 信心、勇气与守信',
  第六单元: '第六单元 · 好牧人与小羊群',
};

export function shelfTocDisplayTitle(item: ShelfTocItem): string {
  if (item.source === 'unit' && item.title) {
    if (item.title.includes('·')) return item.title;
    return SHELF_UNIT_DISPLAY[item.title] ?? item.title;
  }
  return item.title;
}

function sectionIds(items: ShelfTocItem[]): Set<string> {
  return new Set(items.map((i) => i.section_id).filter(Boolean) as string[]);
}

/** 文前目录页与正文 Heading 重复时，只保留 structured body。 */
function outlineDuplicatesBody(outline: ShelfTocItem[], body: ShelfTocItem[]): boolean {
  if (!outline.length || !body.length) return false;
  const oIds = sectionIds(outline);
  const bIds = sectionIds(body);
  if (!oIds.size || !bIds.size) return false;
  const overlap = [...oIds].filter((id) => bIds.has(id)).length;
  return overlap >= Math.min(oIds.size, bIds.size) * 0.8;
}

function filterMetaItems(items: ShelfTocItem[]): ShelfTocItem[] {
  return items.filter((item) => {
    const t = item.title.trim();
    if (item.zone === 'meta') return false;
    if (/^目\s*录$/.test(t)) return false;
    if (t === 'Table of Contents') return false;
    return true;
  });
}

function dedupeUnitHeaders(items: ShelfTocItem[]): ShelfTocItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (item.source !== 'unit') return true;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** 书架阅读器目录：去重、合并分组，避免 outline/body 双份。 */
export function buildShelfTocGroups(
  toc: ShelfBookDetail['toc'] | undefined,
  bookType?: string,
): ShelfTocGroup[] {
  const front = filterMetaItems(toc?.front ?? []);
  const outline = filterMetaItems(toc?.outline ?? []);
  const body = dedupeUnitHeaders(filterMetaItems(toc?.body ?? []));
  const appendix = filterMetaItems(toc?.appendix ?? []);

  const dup = outlineDuplicatesBody(outline, body);
  const groups: ShelfTocGroup[] = [];

  if (bookType === 'collection') {
    if (front.length) groups.push({ key: 'front', label: '文前', items: front });
    if (body.length) groups.push({ key: 'body', label: '目录', items: body });
    if (appendix.length) groups.push({ key: 'appendix', label: '附录', items: appendix });
    return groups;
  }

  if (front.length) groups.push({ key: 'front', label: '文前', items: front });

  if (dup) {
    if (body.length) groups.push({ key: 'body', label: '目录', items: body });
  } else if (outline.length && !body.length) {
    groups.push({ key: 'outline', label: '目录', items: outline });
  } else if (outline.length && body.length) {
    const bIds = sectionIds(body);
    const oOnly = outline.filter((o) => !o.section_id || !bIds.has(o.section_id));
    const bOnly = body.filter((b) => {
      const oIds = sectionIds(outline);
      return !b.section_id || !oIds.has(b.section_id);
    });
    if (oOnly.length) groups.push({ key: 'outline', label: '目录', items: oOnly });
    if (bOnly.length) groups.push({ key: 'body', label: '正文', items: bOnly });
  } else if (body.length) {
    groups.push({ key: 'body', label: '目录', items: body });
  }

  if (appendix.length) groups.push({ key: 'appendix', label: '附录', items: appendix });
  return groups;
}

export function resolveSectionId(item: ShelfTocItem, sections: { id: string; title: string }[]) {
  if (item.section_id) return item.section_id;
  const hit = sections.find((s) => s.title === item.title);
  return hit?.id ?? null;
}
