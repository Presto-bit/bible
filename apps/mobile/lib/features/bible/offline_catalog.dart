/// 离线下载目录（对齐 Web offline_catalog.ts）。
library;

class OfflineCatalogItem {
  const OfflineCatalogItem({
    required this.id,
    required this.tab,
    required this.name,
    this.description,
    this.paths = const [],
    this.kind = 'sqlite',
  });
  final String id;
  final String tab; // bible | materials
  final String name;
  final String? description;
  final List<String> paths;
  final String kind;
}

const offlineCatalog = [
  OfflineCatalogItem(
    id: 'cnv',
    tab: 'bible',
    name: '圣经新译本',
    description: 'CNV 全文',
    paths: ['bible/bible_cnv.sqlite'],
    kind: 'sqlite',
  ),
  OfflineCatalogItem(
    id: 'cuvs',
    tab: 'bible',
    name: '和合本',
    description: 'CUVS 全文',
    paths: ['bible/bible_cuvs.sqlite'],
    kind: 'sqlite',
  ),
  OfflineCatalogItem(
    id: 'kjv',
    tab: 'bible',
    name: 'King James Version',
    description: 'KJV 全文',
    paths: ['bible/bible_kjv.sqlite'],
    kind: 'sqlite',
  ),
  OfflineCatalogItem(
    id: 'dictionary',
    tab: 'materials',
    name: '圣经词典',
    paths: ['content/dictionary/entities.json'],
    kind: 'bundle',
  ),
  OfflineCatalogItem(
    id: 'crossrefs',
    tab: 'materials',
    name: '串珠',
    paths: [
      'content/crossrefs/cross_references.sqlite',
      'content/crossrefs/cross_references.json',
    ],
    kind: 'bundle',
  ),
  OfflineCatalogItem(
    id: 'daily',
    tab: 'materials',
    name: '每日经文',
    paths: ['content/daily-verses/daily_verses.json'],
    kind: 'bundle',
  ),
  OfflineCatalogItem(
    id: 'topics',
    tab: 'materials',
    name: '人生主题',
    paths: ['content/topics/topics.json'],
    kind: 'bundle',
  ),
];
