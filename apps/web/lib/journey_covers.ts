/** 行程手稿：列表轻量封面 vs 册内总图（须一致用于进场占位） */

const JOURNEY_SPINE: Record<string, string> = {
  'paul-first-journey': '/knowledge/infographics/paul-first-journey.png',
  'exodus-wilderness': '/knowledge/infographics/exodus-wilderness.png',
  'jesus-ministry-galilee':
    '/knowledge/infographics/jesus-ministry-galilee-comic.png',
};

/** 手稿第 1 页（总图 comic）；进场占位必须用这个，勿用列表脊图 */
export function journeyManuscriptCover(tourId: string): string {
  const id = (tourId || '').trim();
  if (!id) return '/knowledge/infographics/_paper_texture.jpg';
  return `/knowledge/infographics/${encodeURIComponent(id)}-comic.png`;
}

/** 探索列表卡封面（可轻量）；与手稿总图可不同 */
export function journeyListCover(tourId: string, coverImage?: string | null): string {
  const id = (tourId || '').trim();
  if (id && JOURNEY_SPINE[id]) return JOURNEY_SPINE[id];
  if (coverImage) return coverImage;
  return '/knowledge/infographics/_paper_texture.jpg';
}

export function isJourneyManuscriptId(id: string): boolean {
  return id in JOURNEY_SPINE;
}
