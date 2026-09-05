/// 书架阅读进度（本地 SharedPreferences，对齐 Web presto_shelf_progress_v1）。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'shelf_scroll_anchor.dart';

const _progressKey = 'presto_shelf_progress_v1';

class ShelfBookProgress {
  const ShelfBookProgress({
    required this.sectionId,
    this.pageIndex = 0,
    this.scrollOffset,
    this.scrollAnchor,
    this.progressRatio,
    this.finished = false,
  });

  final String sectionId;
  final int pageIndex;
  final double? scrollOffset;
  final ShelfScrollAnchor? scrollAnchor;
  final double? progressRatio;
  final bool finished;

  bool get isFinished => finished || (progressRatio ?? 0) >= 0.97;
}

class ShelfLastRead {
  const ShelfLastRead({
    required this.bookId,
    required this.sectionId,
    required this.bookTitle,
    this.sectionTitle = '',
    this.pageIndex = 0,
    this.scrollOffset,
    this.scrollAnchor,
    this.at,
  });

  final String bookId;
  final String sectionId;
  final String bookTitle;
  final String sectionTitle;
  final int pageIndex;
  final double? scrollOffset;
  final ShelfScrollAnchor? scrollAnchor;
  final int? at;
}

class ShelfProgressStore {
  ShelfProgressStore(this._prefs);

  final SharedPreferences _prefs;

  ShelfBookProgress? loadBook(String bookId) {
    final byBook = _readStore()['byBook'];
    if (byBook is! Map) return null;
    final entry = byBook[bookId] ?? byBook['$bookId'];
    if (entry == null) return null;
    if (entry is String) {
      final sid = entry.trim();
      if (sid.isEmpty) return null;
      return ShelfBookProgress(sectionId: sid);
    }
    if (entry is Map) {
      final sid = entry['sectionId'];
      if (sid is! String || sid.trim().isEmpty) return null;
      final scroll = entry['scrollOffset'];
      return ShelfBookProgress(
        sectionId: sid.trim(),
        pageIndex: (entry['pageIndex'] as num?)?.toInt() ?? 0,
        scrollOffset: scroll is num ? scroll.toDouble().clamp(0, 1) : null,
        scrollAnchor: ShelfScrollAnchor.fromJson(entry['scrollAnchor']),
        progressRatio: (entry['progressRatio'] as num?)?.toDouble(),
        finished: entry['finished'] == true,
      );
    }
    return null;
  }

  ShelfLastRead? loadLastRead() {
    try {
      final last = _readStore()['last'];
      if (last is! Map) return null;
      final bookId = '${last['bookId'] ?? ''}';
      final sectionId = '${last['sectionId'] ?? ''}';
      final bookTitle = '${last['bookTitle'] ?? ''}';
      if (bookId.isEmpty || bookTitle.isEmpty) return null;
      final scroll = last['scrollOffset'];
      return ShelfLastRead(
        bookId: bookId,
        sectionId: sectionId,
        bookTitle: bookTitle,
        sectionTitle: '${last['sectionTitle'] ?? ''}',
        pageIndex: (last['pageIndex'] as num?)?.toInt() ?? 0,
        scrollOffset: scroll is num ? scroll.toDouble().clamp(0, 1) : null,
        scrollAnchor: ShelfScrollAnchor.fromJson(last['scrollAnchor']),
        at: (last['at'] as num?)?.toInt(),
      );
    } catch (_) {
      return null;
    }
  }

  void saveBook(
    String bookId,
    String sectionId, {
    int pageIndex = 0,
    double? scrollOffset,
    ShelfScrollAnchor? scrollAnchor,
    double? progressRatio,
    String? bookTitle,
    String? sectionTitle,
  }) {
    final store = _readStore();
    // jsonDecode 得到的是 Map<dynamic,dynamic>，不可 as Map<String,dynamic>
    final byBook = _stringKeyMap(store['byBook']);
    final entry = <String, dynamic>{
      'sectionId': sectionId,
      'pageIndex': pageIndex < 0 ? 0 : pageIndex,
    };
    if (scrollOffset != null) {
      entry['scrollOffset'] = scrollOffset.clamp(0.0, 1.0);
    }
    if (scrollAnchor != null) {
      entry['scrollAnchor'] = scrollAnchor.toJson();
    }
    if (progressRatio != null) {
      entry['progressRatio'] = progressRatio.clamp(0.0, 1.0);
      if (progressRatio >= 0.97) entry['finished'] = true;
    }
    byBook[bookId] = entry;
    store['byBook'] = byBook;
    if (bookTitle != null && bookTitle.isNotEmpty) {
      store['last'] = {
        'bookId': bookId,
        'sectionId': sectionId,
        'bookTitle': bookTitle,
        'sectionTitle': sectionTitle ?? '',
        'pageIndex': pageIndex < 0 ? 0 : pageIndex,
        if (scrollOffset != null) 'scrollOffset': scrollOffset.clamp(0.0, 1.0),
        if (scrollAnchor != null) 'scrollAnchor': scrollAnchor.toJson(),
        'at': DateTime.now().millisecondsSinceEpoch,
      };
    }
    _writeStore(store);
  }

  void clearFinished(String bookId) {
    final store = _readStore();
    final byBook = _stringKeyMap(store['byBook']);
    final entry = byBook[bookId];
    if (entry is! Map) return;
    final next = _stringKeyMap(entry);
    next.remove('finished');
    byBook[bookId] = next;
    store['byBook'] = byBook;
    _writeStore(store);
  }

  Map<String, dynamic> _readStore() {
    try {
      final raw = _prefs.getString(_progressKey);
      if (raw == null || raw.isEmpty) return {'byBook': <String, dynamic>{}};
      final parsed = jsonDecode(raw);
      if (parsed is Map) return _stringKeyMap(parsed);
    } catch (_) {}
    return {'byBook': <String, dynamic>{}};
  }

  void _writeStore(Map<String, dynamic> store) {
    try {
      _prefs.setString(_progressKey, jsonEncode(store));
    } catch (_) {}
  }
}

/// jsonDecode / SharedPreferences 常见为 Map&lt;dynamic,dynamic&gt;，统一转成 String key。
Map<String, dynamic> _stringKeyMap(Object? value) {
  if (value is Map<String, dynamic>) return Map<String, dynamic>.from(value);
  if (value is Map) {
    return value.map((k, v) => MapEntry(k.toString(), v));
  }
  return <String, dynamic>{};
}
