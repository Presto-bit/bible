/// 书架 API（平台书目列表 / 详情 / 章节）。
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import 'shelf_cache.dart';

final shelfCacheProvider = Provider<ShelfCache>((ref) {
  return ShelfCache(ref.watch(prefsProvider));
});

final shelfRepoProvider = Provider<ShelfRepository>((ref) {
  return ShelfRepository(ref.watch(dioProvider), ref.watch(shelfCacheProvider));
});

class ShelfGroup {
  const ShelfGroup({required this.id, required this.title, this.sortOrder = 0});

  final String id;
  final String title;
  final int sortOrder;

  factory ShelfGroup.fromJson(Map<String, dynamic> j) => ShelfGroup(
        id: '${j['id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        sortOrder: (j['sort_order'] as num?)?.toInt() ?? 0,
      );
}

class ShelfBookSummary {
  const ShelfBookSummary({
    required this.id,
    required this.title,
    this.subtitle = '',
    this.author = '',
    this.sectionCount = 0,
    this.groupId = 'default',
    this.sortOrder = 0,
    this.bookType = 'document',
  });

  final String id;
  final String title;
  final String subtitle;
  final String author;
  final int sectionCount;
  final String groupId;
  final int sortOrder;
  final String bookType;

  factory ShelfBookSummary.fromJson(Map<String, dynamic> j) => ShelfBookSummary(
        id: '${j['id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        subtitle: '${j['subtitle'] ?? ''}',
        author: '${j['author'] ?? ''}',
        sectionCount: (j['section_count'] as num?)?.toInt() ?? 0,
        groupId: '${j['group_id'] ?? 'default'}',
        sortOrder: (j['sort_order'] as num?)?.toInt() ?? 0,
        bookType: '${j['book_type'] ?? 'document'}',
      );
}

class ShelfTocItem {
  const ShelfTocItem({
    required this.id,
    required this.title,
    this.level = 1,
    this.zone = 'body',
    this.sectionId,
    this.source,
  });

  final String id;
  final String title;
  final int level;
  final String zone;
  final String? sectionId;
  final String? source;

  factory ShelfTocItem.fromJson(Map<String, dynamic> j) => ShelfTocItem(
        id: '${j['id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        level: (j['level'] as num?)?.toInt() ?? 1,
        zone: '${j['zone'] ?? 'body'}',
        sectionId: j['section_id'] as String?,
        source: j['source'] as String?,
      );
}

class ShelfBookToc {
  const ShelfBookToc({
    this.front = const [],
    this.outline = const [],
    this.body = const [],
    this.appendix = const [],
  });

  final List<ShelfTocItem> front;
  final List<ShelfTocItem> outline;
  final List<ShelfTocItem> body;
  final List<ShelfTocItem> appendix;

  factory ShelfBookToc.fromJson(Map<String, dynamic>? j) {
    if (j == null) return const ShelfBookToc();
    List<ShelfTocItem> parseList(String key) =>
        (j[key] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map((e) => ShelfTocItem.fromJson(Map<String, dynamic>.from(e)))
            .toList();
    return ShelfBookToc(
      front: parseList('front'),
      outline: parseList('outline'),
      body: parseList('body'),
      appendix: parseList('appendix'),
    );
  }
}

class ShelfSectionSummary {
  const ShelfSectionSummary({
    required this.id,
    required this.title,
    this.zone,
    this.level,
    this.kind = 'html',
    this.unit,
  });

  final String id;
  final String title;
  final String? zone;
  final int? level;
  final String kind;
  final String? unit;

  factory ShelfSectionSummary.fromJson(Map<String, dynamic> j) =>
      ShelfSectionSummary(
        id: '${j['id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        zone: j['zone'] as String?,
        level: (j['level'] as num?)?.toInt(),
        kind: '${j['kind'] ?? 'html'}',
        unit: j['unit'] as String?,
      );
}

class ShelfPrimaryAsset {
  const ShelfPrimaryAsset({
    required this.storageKey,
    required this.mime,
    this.title,
  });

  final String storageKey;
  final String mime;
  final String? title;

  factory ShelfPrimaryAsset.fromJson(Map<String, dynamic>? j) {
    if (j == null) {
      return const ShelfPrimaryAsset(storageKey: '', mime: '');
    }
    return ShelfPrimaryAsset(
      storageKey: '${j['storage_key'] ?? ''}',
      mime: '${j['mime'] ?? ''}',
      title: j['title'] as String?,
    );
  }

  bool get isPdf => mime.contains('pdf') || storageKey.toLowerCase().endsWith('.pdf');
  bool get isDocx =>
      mime.contains('wordprocessingml') || storageKey.toLowerCase().endsWith('.docx');
}

class ShelfAttachment {
  const ShelfAttachment({
    required this.id,
    required this.title,
    required this.kind,
    required this.storageKey,
    required this.mime,
  });

  final String id;
  final String title;
  final String kind;
  final String storageKey;
  final String mime;

  factory ShelfAttachment.fromJson(Map<String, dynamic> j) => ShelfAttachment(
        id: '${j['id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        kind: '${j['kind'] ?? ''}',
        storageKey: '${j['storage_key'] ?? ''}',
        mime: '${j['mime'] ?? ''}',
      );
}

class ShelfBookDetail extends ShelfBookSummary {
  const ShelfBookDetail({
    required super.id,
    required super.title,
    super.subtitle,
    super.author,
    super.sectionCount,
    super.groupId,
    super.sortOrder,
    super.bookType,
    required this.toc,
    this.sections = const [],
  });

  final ShelfBookToc toc;
  final List<ShelfSectionSummary> sections;

  factory ShelfBookDetail.fromJson(Map<String, dynamic> j) => ShelfBookDetail(
        id: '${j['id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        subtitle: '${j['subtitle'] ?? ''}',
        author: '${j['author'] ?? ''}',
        sectionCount: (j['section_count'] as num?)?.toInt() ?? 0,
        groupId: '${j['group_id'] ?? 'default'}',
        sortOrder: (j['sort_order'] as num?)?.toInt() ?? 0,
        bookType: '${j['book_type'] ?? 'document'}',
        toc: ShelfBookToc.fromJson(j['toc'] as Map<String, dynamic>?),
        sections: (j['sections'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map((e) => ShelfSectionSummary.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );
}

class ShelfSection {
  const ShelfSection({
    required this.id,
    required this.title,
    required this.html,
    this.zone,
    this.level,
    this.kind = 'html',
    this.unit,
    this.primary,
    this.attachments = const [],
  });

  final String id;
  final String title;
  final String html;
  final String? zone;
  final int? level;
  final String kind;
  final String? unit;
  final ShelfPrimaryAsset? primary;
  final List<ShelfAttachment> attachments;

  factory ShelfSection.fromJson(Map<String, dynamic> j) => ShelfSection(
        id: '${j['id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        html: '${j['html'] ?? ''}',
        zone: j['zone'] as String?,
        level: (j['level'] as num?)?.toInt(),
        kind: '${j['kind'] ?? 'html'}',
        unit: j['unit'] as String?,
        primary: j['primary'] is Map
            ? ShelfPrimaryAsset.fromJson(Map<String, dynamic>.from(j['primary'] as Map))
            : null,
        attachments: (j['attachments'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map((e) => ShelfAttachment.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );

  bool get hasProseHtml => html.trim().isNotEmpty;
  bool get hasPdfPrimary => primary != null && primary!.isPdf;
  bool get docxHtmlLooksLegacy {
    final docx = kind == 'lesson' || (primary?.isDocx ?? false);
    if (!docx) return false;
    return !html.contains('shelf-docx-root');
  }
}

class ShelfListData {
  const ShelfListData({required this.groups, required this.items});

  final List<ShelfGroup> groups;
  final List<ShelfBookSummary> items;
}

class ShelfRepository {
  ShelfRepository(this._dio, this._cache);

  final Dio _dio;
  final ShelfCache _cache;

  Future<ShelfListData> listPlatform({bool force = false}) async {
    if (!force) {
      final cached = _cache.peekList(allowStale: true);
      if (cached != null) {
        unawaited(_refreshList());
        return ShelfListData(groups: cached.groups, items: cached.items);
      }
    }
    return _fetchListFresh(force: force);
  }

  Future<ShelfListData> _fetchListFresh({bool force = false}) async {
    final res = await _dio.get<Map<String, dynamic>>('/shelf/platform');
    final data = res.data ?? const {};
    final groups = (data['groups'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((e) => ShelfGroup.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    final items = (data['items'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((e) => ShelfBookSummary.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    items.sort((a, b) => b.sortOrder.compareTo(a.sortOrder));
    final payload = ShelfListData(groups: groups, items: items);
    await _cache.saveList(payload);
    return payload;
  }

  Future<void> _refreshList() async {
    try {
      await _fetchListFresh(force: true);
    } catch (_) {}
  }

  Future<ShelfBookDetail> getBook(String bookId) async {
    final res = await _dio.get<Map<String, dynamic>>('/shelf/platform/$bookId');
    return ShelfBookDetail.fromJson(res.data ?? const {});
  }

  Future<ShelfSection> getSection(String bookId, String sectionId, {bool force = false}) async {
    if (!force) {
      final cached = _cache.peekSection(bookId, sectionId);
      if (cached != null && !cached.docxHtmlLooksLegacy) {
        unawaited(_fetchSectionFresh(bookId, sectionId));
        return cached;
      }
    }
    return _fetchSectionFresh(bookId, sectionId);
  }

  ShelfSection? peekSection(String bookId, String sectionId) {
    return _cache.peekSection(bookId, sectionId);
  }

  Future<void> prefetchSection(String bookId, String sectionId) async {
    final cached = _cache.peekSection(bookId, sectionId);
    if (cached != null && !cached.docxHtmlLooksLegacy) return;
    try {
      await _fetchSectionFresh(bookId, sectionId);
    } catch (_) {}
  }

  Future<ShelfSection> _fetchSectionFresh(String bookId, String sectionId) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/shelf/platform/$bookId/sections/$sectionId',
    );
    final section = ShelfSection.fromJson(res.data ?? const {});
    await _cache.saveSection(bookId, section);
    return section;
  }

  Future<List<int>> fetchAssetBytes(String bookId, String storageKey) async {
    final cached = await _cache.peekPdfBytes(bookId, storageKey);
    if (cached != null && cached.isNotEmpty) return cached;
    final key = Uri.encodeComponent(storageKey.split('/').last);
    final res = await _dio.get<List<int>>(
      '/shelf/platform/${Uri.encodeComponent(bookId)}/files/$key',
      options: Options(responseType: ResponseType.bytes),
    );
    final bytes = res.data ?? const [];
    if (bytes.isNotEmpty) {
      await _cache.savePdfBytes(bookId, storageKey, bytes);
    }
    return bytes;
  }

  String assetUrl(String bookId, String storageKey) {
    final key = Uri.encodeComponent(storageKey.split('/').last);
    return '${AppConfig.baseUrl}/shelf/platform/${Uri.encodeComponent(bookId)}/files/$key';
  }

  Future<Map<String, dynamic>> importBook(String filePath, String filename) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath, filename: filename),
    });
    final res = await _dio.post<Map<String, dynamic>>('/shelf/platform/import', data: form);
    await _fetchListFresh(force: true);
    return res.data ?? const {};
  }
}

int shelfCoverHue(String title) {
  var h = 0;
  for (var i = 0; i < title.length; i++) {
    h = (h * 31 + title.codeUnitAt(i)) & 0x7fffffff;
  }
  return h % 360;
}

String shelfCheckinRef(String bookId, String sectionId, [int pageIndex = 0]) {
  final base = 'SHELF.$bookId.$sectionId';
  if (pageIndex > 0) return '$base.p$pageIndex';
  return base;
}

String shelfCheckinLabel(String bookTitle, String sectionTitle) {
  if (sectionTitle.trim().isEmpty) return bookTitle.trim();
  return '${bookTitle.trim()} · ${sectionTitle.trim()}';
}
