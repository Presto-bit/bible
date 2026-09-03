/// 书架章节 / PDF / 列表本地缓存（离线续读）。
library;

import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'shelf_repository.dart';

const _listKey = 'shelf_platform_list_v2';
const _listTtlMs = 30 * 60 * 1000;
const _sectionPrefix = 'shelf_section_v3:';
const _sectionTtlMs = 7 * 24 * 60 * 60 * 1000;

class ShelfListCachePayload {
  ShelfListCachePayload({
    required this.groups,
    required this.items,
    required this.savedAtMs,
  });

  final List<ShelfGroup> groups;
  final List<ShelfBookSummary> items;
  final int savedAtMs;
}

class ShelfCache {
  ShelfCache(this._prefs);

  final SharedPreferences _prefs;
  final _sectionMem = <String, ShelfSection>{};
  final _pdfMem = <String, List<int>>{};

  String _sectionKey(String bookId, String sectionId) => '$bookId:$sectionId';

  ShelfListCachePayload? peekList({bool allowStale = true}) {
    try {
      final raw = _prefs.getString(_listKey);
      if (raw == null || raw.isEmpty) return null;
      final j = jsonDecode(raw) as Map<String, dynamic>;
      final savedAt = (j['savedAt'] as num?)?.toInt() ?? 0;
      if (!allowStale && DateTime.now().millisecondsSinceEpoch - savedAt > _listTtlMs) {
        return null;
      }
      final groups = (j['groups'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map((e) => ShelfGroup.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      final items = (j['items'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map((e) => ShelfBookSummary.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      return ShelfListCachePayload(groups: groups, items: items, savedAtMs: savedAt);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveList(ShelfListData data) async {
    try {
      await _prefs.setString(
        _listKey,
        jsonEncode({
          'savedAt': DateTime.now().millisecondsSinceEpoch,
          'groups': data.groups
              .map((g) => {'id': g.id, 'title': g.title, 'sort_order': g.sortOrder})
              .toList(),
          'items': data.items
              .map(
                (b) => {
                  'id': b.id,
                  'title': b.title,
                  'subtitle': b.subtitle,
                  'author': b.author,
                  'section_count': b.sectionCount,
                  'group_id': b.groupId,
                  'sort_order': b.sortOrder,
                  'book_type': b.bookType,
                },
              )
              .toList(),
        }),
      );
    } catch (_) {}
  }

  ShelfSection? peekSection(String bookId, String sectionId) {
    final key = _sectionKey(bookId, sectionId);
    final mem = _sectionMem[key];
    if (mem != null) return mem;
    try {
      final raw = _prefs.getString('$_sectionPrefix$key');
      if (raw == null) return null;
      final j = jsonDecode(raw) as Map<String, dynamic>;
      final savedAt = (j['savedAt'] as num?)?.toInt() ?? 0;
      if (DateTime.now().millisecondsSinceEpoch - savedAt > _sectionTtlMs) return null;
      final section = ShelfSection.fromJson(j['section'] as Map<String, dynamic>);
      _sectionMem[key] = section;
      return section;
    } catch (_) {
      return null;
    }
  }

  Future<void> saveSection(String bookId, ShelfSection section) async {
    final key = _sectionKey(bookId, section.id);
    _sectionMem[key] = section;
    try {
      await _prefs.setString(
        '$_sectionPrefix$key',
        jsonEncode({
          'savedAt': DateTime.now().millisecondsSinceEpoch,
          'section': {
            'id': section.id,
            'title': section.title,
            'html': section.html,
            'zone': section.zone,
            'level': section.level,
            'kind': section.kind,
            'unit': section.unit,
            'primary': section.primary == null
                ? null
                : {
                    'storage_key': section.primary!.storageKey,
                    'mime': section.primary!.mime,
                    'title': section.primary!.title,
                  },
            'attachments': section.attachments
                .map(
                  (a) => {
                    'id': a.id,
                    'title': a.title,
                    'kind': a.kind,
                    'storage_key': a.storageKey,
                    'mime': a.mime,
                  },
                )
                .toList(),
          },
        }),
      );
    } catch (_) {}
  }

  Future<List<int>?> peekPdfBytes(String bookId, String storageKey) async {
    final memKey = '$bookId:${storageKey.split('/').last}';
    final mem = _pdfMem[memKey];
    if (mem != null) return mem;
    try {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/shelf_pdf_$memKey');
      if (!await file.exists()) return null;
      final bytes = await file.readAsBytes();
      _pdfMem[memKey] = bytes;
      return bytes;
    } catch (_) {
      return null;
    }
  }

  Future<void> savePdfBytes(String bookId, String storageKey, List<int> bytes) async {
    final memKey = '$bookId:${storageKey.split('/').last}';
    _pdfMem[memKey] = bytes;
    try {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/shelf_pdf_$memKey');
      await file.writeAsBytes(bytes, flush: true);
    } catch (_) {}
  }
}
