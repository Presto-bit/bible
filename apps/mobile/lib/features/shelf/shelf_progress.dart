/// 书架阅读进度（本地 SharedPreferences，对齐 Web presto_shelf_progress_v1）。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const _progressKey = 'presto_shelf_progress_v1';

class ShelfBookProgress {
  const ShelfBookProgress({required this.sectionId, this.pageIndex = 0});

  final String sectionId;
  final int pageIndex;
}

class ShelfLastRead {
  const ShelfLastRead({
    required this.bookId,
    required this.sectionId,
    required this.bookTitle,
    this.sectionTitle = '',
    this.pageIndex = 0,
  });

  final String bookId;
  final String sectionId;
  final String bookTitle;
  final String sectionTitle;
  final int pageIndex;
}

class ShelfProgressStore {
  ShelfProgressStore(this._prefs);

  final SharedPreferences _prefs;

  ShelfBookProgress? loadBook(String bookId) {
    final raw = _readStore()['byBook'] as Map<String, dynamic>? ?? {};
    final entry = raw[bookId];
    if (entry == null) return null;
    if (entry is String) return ShelfBookProgress(sectionId: entry);
    if (entry is Map) {
      final sid = entry['sectionId'];
      if (sid is! String || sid.isEmpty) return null;
      return ShelfBookProgress(
        sectionId: sid,
        pageIndex: (entry['pageIndex'] as num?)?.toInt() ?? 0,
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
      return ShelfLastRead(
        bookId: bookId,
        sectionId: sectionId,
        bookTitle: bookTitle,
        sectionTitle: '${last['sectionTitle'] ?? ''}',
        pageIndex: (last['pageIndex'] as num?)?.toInt() ?? 0,
      );
    } catch (_) {
      return null;
    }
  }

  void saveBook(
    String bookId,
    String sectionId, {
    int pageIndex = 0,
    String? bookTitle,
    String? sectionTitle,
  }) {
    final store = _readStore();
    final byBook = Map<String, dynamic>.from(
      store['byBook'] as Map<String, dynamic>? ?? {},
    );
    byBook[bookId] = {
      'sectionId': sectionId,
      'pageIndex': pageIndex < 0 ? 0 : pageIndex,
    };
    store['byBook'] = byBook;
    if (bookTitle != null && bookTitle.isNotEmpty) {
      store['last'] = {
        'bookId': bookId,
        'sectionId': sectionId,
        'bookTitle': bookTitle,
        'sectionTitle': sectionTitle ?? '',
        'pageIndex': pageIndex < 0 ? 0 : pageIndex,
        'at': DateTime.now().millisecondsSinceEpoch,
      };
    }
    _writeStore(store);
  }

  Map<String, dynamic> _readStore() {
    try {
      final raw = _prefs.getString(_progressKey);
      if (raw == null || raw.isEmpty) return {'byBook': {}};
      final parsed = jsonDecode(raw);
      if (parsed is Map<String, dynamic>) {
        return parsed;
      }
      if (parsed is Map) {
        return Map<String, dynamic>.from(parsed);
      }
    } catch (_) {}
    return {'byBook': {}};
  }

  void _writeStore(Map<String, dynamic> store) {
    try {
      _prefs.setString(_progressKey, jsonEncode(store));
    } catch (_) {}
  }
}
