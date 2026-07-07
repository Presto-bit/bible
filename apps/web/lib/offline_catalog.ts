/** 离线下载目录：圣经 / 资料分包 */

export type OfflineCatalogTab = 'bible' | 'materials';

export type OfflineCatalogItem = {
  id: string;
  tab: OfflineCatalogTab;
  name: string;
  description?: string;
  /** manifest 内精确路径 */
  paths?: string[];
  /** manifest 内路径前缀（含子目录） */
  pathsPrefix?: string;
  kind: 'sqlite' | 'bundle';
  idbKey?: string;
};

export const OFFLINE_CATALOG: OfflineCatalogItem[] = [
  {
    id: 'cnv',
    tab: 'bible',
    name: '圣经新译本',
    description: 'CNV 全文',
    paths: ['bible/bible_cnv.sqlite'],
    kind: 'sqlite',
    idbKey: 'bible_cnv_sqlite_v1',
  },
  {
    id: 'cuvs',
    tab: 'bible',
    name: '和合本',
    description: 'CUVS 全文',
    paths: ['bible/bible_cuvs.sqlite'],
    kind: 'sqlite',
    idbKey: 'bible_cuvs_sqlite_v1',
  },
  {
    id: 'kjv',
    tab: 'bible',
    name: 'King James Version',
    description: 'KJV 全文',
    paths: ['bible/bible_kjv.sqlite'],
    kind: 'sqlite',
    idbKey: 'bible_kjv_sqlite_v1',
  },
  {
    id: 'dictionary',
    tab: 'materials',
    name: '圣经词典',
    paths: ['content/dictionary/entities.json'],
    kind: 'bundle',
  },
  {
    id: 'crossrefs',
    tab: 'materials',
    name: '串珠',
    paths: [
      'content/crossrefs/cross_references.sqlite',
      'content/crossrefs/cross_references.json',
    ],
    kind: 'bundle',
  },
  {
    id: 'plans',
    tab: 'materials',
    name: '读经计划',
    pathsPrefix: 'content/plans/',
    kind: 'bundle',
  },
  {
    id: 'daily',
    tab: 'materials',
    name: '每日经文',
    paths: ['content/daily-verses/daily_verses.json'],
    kind: 'bundle',
  },
  {
    id: 'topics',
    tab: 'materials',
    name: '人生主题',
    paths: ['content/topics/topics.json'],
    kind: 'bundle',
  },
  {
    id: 'geography',
    tab: 'materials',
    name: '地理与历史',
    paths: [
      'content/geography/places.json',
      'content/geography/timeline.json',
    ],
    kind: 'bundle',
  },
  {
    id: 'strongs',
    tab: 'materials',
    name: '希腊文原文',
    paths: ['content/strongs/strongs.sqlite'],
    kind: 'bundle',
  },
  {
    id: 'illustrations',
    tab: 'materials',
    name: '主题插画',
    pathsPrefix: 'content/illustrations/',
    kind: 'bundle',
  },
];

export function getCatalogItem(id: string): OfflineCatalogItem | undefined {
  return OFFLINE_CATALOG.find((x) => x.id === id);
}

export function catalogItemsForTab(tab: OfflineCatalogTab): OfflineCatalogItem[] {
  return OFFLINE_CATALOG.filter((x) => x.tab === tab);
}

export function bundleIdbKey(itemId: string): string {
  return `offline_item_${itemId}_v1`;
}

export function formatOfflineBytes(n: number): string {
  if (!n) return '';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
