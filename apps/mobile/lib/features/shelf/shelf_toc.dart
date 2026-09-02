/// 书架目录分组（对齐 Web shelf_toc.ts 核心逻辑）。
library;

import 'shelf_repository.dart';

class ShelfTocGroup {
  const ShelfTocGroup({required this.key, required this.label, required this.items});

  final String key;
  final String label;
  final List<ShelfTocItem> items;
}

const _unitDisplay = {
  '第一单元': '第一单元 · 创造与天地万物',
  '第二单元': '第二单元 · 奇妙的身体与家',
  '第三单元': '第三单元 · 耶稣的神迹与呼召',
  '第四单元': '第四单元 · 品格故事与服事',
  '第五单元': '第五单元 · 信心、勇气与守信',
  '第六单元': '第六单元 · 好牧人与小羊群',
};

String shelfTocDisplayTitle(ShelfTocItem item) {
  if (item.source == 'unit' && item.title.isNotEmpty) {
    if (item.title.contains('·')) return item.title;
    return _unitDisplay[item.title] ?? item.title;
  }
  return item.title;
}

Set<String> _sectionIds(List<ShelfTocItem> items) =>
    items.map((i) => i.sectionId).whereType<String>().toSet();

bool _outlineDuplicatesBody(List<ShelfTocItem> outline, List<ShelfTocItem> body) {
  if (outline.isEmpty || body.isEmpty) return false;
  final oIds = _sectionIds(outline);
  final bIds = _sectionIds(body);
  if (oIds.isEmpty || bIds.isEmpty) return false;
  final overlap = oIds.where(bIds.contains).length;
  return overlap >= (oIds.length < bIds.length ? oIds.length : bIds.length) * 0.8;
}

List<ShelfTocItem> _filterMeta(List<ShelfTocItem> items) => items.where((item) {
      final t = item.title.trim();
      if (item.zone == 'meta') return false;
      if (RegExp(r'^目\s*录$').hasMatch(t)) return false;
      if (t == 'Table of Contents') return false;
      return true;
    }).toList();

List<ShelfTocItem> _dedupeUnits(List<ShelfTocItem> items) {
  final seen = <String>{};
  return items.where((item) {
    if (item.source != 'unit') return true;
    if (seen.contains(item.id)) return false;
    seen.add(item.id);
    return true;
  }).toList();
}

List<ShelfTocGroup> buildShelfTocGroups(ShelfBookToc toc, {String? bookType}) {
  final front = _filterMeta(toc.front);
  final outline = _filterMeta(toc.outline);
  final body = _dedupeUnits(_filterMeta(toc.body));
  final appendix = _filterMeta(toc.appendix);
  final dup = _outlineDuplicatesBody(outline, body);
  final groups = <ShelfTocGroup>[];

  if (bookType == 'collection') {
    if (front.isNotEmpty) groups.add(ShelfTocGroup(key: 'front', label: '文前', items: front));
    if (body.isNotEmpty) groups.add(ShelfTocGroup(key: 'body', label: '目录', items: body));
    if (appendix.isNotEmpty) {
      groups.add(ShelfTocGroup(key: 'appendix', label: '附录', items: appendix));
    }
    return groups;
  }

  if (front.isNotEmpty) groups.add(ShelfTocGroup(key: 'front', label: '文前', items: front));
  if (dup) {
    if (body.isNotEmpty) groups.add(ShelfTocGroup(key: 'body', label: '目录', items: body));
  } else {
    if (outline.isNotEmpty) {
      groups.add(ShelfTocGroup(key: 'outline', label: '目录', items: outline));
    }
    if (body.isNotEmpty) groups.add(ShelfTocGroup(key: 'body', label: '正文', items: body));
  }
  if (appendix.isNotEmpty) {
    groups.add(ShelfTocGroup(key: 'appendix', label: '附录', items: appendix));
  }
  return groups;
}

String? resolveSectionId(ShelfTocItem item, List<ShelfSectionSummary> sections) {
  if (item.sectionId != null && item.sectionId!.isNotEmpty) return item.sectionId;
  if (item.level == 1 && sections.length == 1) return sections.first.id;
  return null;
}
