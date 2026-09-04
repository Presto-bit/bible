/// 用户书架视图：分组 Tab、排序、本地 meta（对齐 Web presto_shelf_library_v1）。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'shelf_progress.dart';
import 'shelf_repository.dart';

const shelfLibraryKey = 'presto_shelf_library_v1';
const shelfMaxUserGroups = 8;
const shelfImportMaxBytes = 20 * 1024 * 1024;
const shelfUngroupedId = '_ungrouped';

enum ShelfLibraryTabKind { lastRead, progress, added, group }

enum ShelfProgressFilter { reading, finished, unread }

class ShelfLibraryTab {
  const ShelfLibraryTab.lastRead()
      : kind = ShelfLibraryTabKind.lastRead,
        groupId = null,
        progressStatus = null;

  const ShelfLibraryTab.added()
      : kind = ShelfLibraryTabKind.added,
        groupId = null,
        progressStatus = null;

  const ShelfLibraryTab.group(this.groupId)
      : kind = ShelfLibraryTabKind.group,
        progressStatus = null;

  const ShelfLibraryTab.progress(this.progressStatus)
      : kind = ShelfLibraryTabKind.progress,
        groupId = null;

  final ShelfLibraryTabKind kind;
  final String? groupId;
  final ShelfProgressFilter? progressStatus;
}

class ShelfUserGroup {
  const ShelfUserGroup({
    required this.id,
    required this.title,
    this.sortOrder = 0,
    this.createdAt = 0,
  });

  final String id;
  final String title;
  final int sortOrder;
  final int createdAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'sortOrder': sortOrder,
        'createdAt': createdAt,
      };

  factory ShelfUserGroup.fromJson(Map<String, dynamic> j) => ShelfUserGroup(
        id: '${j['id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        sortOrder: (j['sortOrder'] as num?)?.toInt() ?? 0,
        createdAt: (j['createdAt'] as num?)?.toInt() ?? 0,
      );
}

class ShelfBookLibraryMeta {
  const ShelfBookLibraryMeta({
    this.groupId,
    required this.addedAt,
    this.lastReadAt,
    this.hidden = false,
  });

  final String? groupId;
  final int addedAt;
  final int? lastReadAt;
  final bool hidden;

  Map<String, dynamic> toJson() => {
        'groupId': groupId,
        'addedAt': addedAt,
        'lastReadAt': lastReadAt,
        'hidden': hidden,
      };

  factory ShelfBookLibraryMeta.fromJson(Map<String, dynamic> j) => ShelfBookLibraryMeta(
        groupId: j['groupId'] as String?,
        addedAt: (j['addedAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
        lastReadAt: (j['lastReadAt'] as num?)?.toInt(),
        hidden: j['hidden'] == true,
      );
}

class ShelfLibraryStore {
  ShelfLibraryStore(this._prefs, this._progress);

  final SharedPreferences _prefs;
  final ShelfProgressStore _progress;

  Map<String, dynamic> _read() {
    try {
      final raw = _prefs.getString(shelfLibraryKey);
      if (raw == null || raw.isEmpty) return {'groups': [], 'books': {}};
      final parsed = jsonDecode(raw);
      if (parsed is Map<String, dynamic>) return parsed;
      if (parsed is Map) return Map<String, dynamic>.from(parsed);
    } catch (_) {}
    return {'groups': [], 'books': {}};
  }

  void _write(Map<String, dynamic> store) {
    try {
      _prefs.setString(shelfLibraryKey, jsonEncode(store));
    } catch (_) {}
  }

  List<ShelfUserGroup> listGroups() {
    final store = _read();
    final groups = (store['groups'] as List?) ?? const [];
    return groups
        .whereType<Map>()
        .map((e) => ShelfUserGroup.fromJson(Map<String, dynamic>.from(e)))
        .toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  Map<String, ShelfBookLibraryMeta> _booksMap() {
    final store = _read();
    final raw = store['books'];
    if (raw is! Map) return {};
    return raw.map(
      (k, v) => MapEntry(
        '$k',
        ShelfBookLibraryMeta.fromJson(Map<String, dynamic>.from(v as Map)),
      ),
    );
  }

  void syncFromBooks(List<ShelfBookSummary> books) {
    final store = _read();
    final booksMap = Map<String, dynamic>.from(store['books'] as Map? ?? {});
    final last = _progress.loadLastRead();
    final now = DateTime.now().millisecondsSinceEpoch;
    var dirty = false;
    for (final book in books) {
      if (!booksMap.containsKey(book.id)) {
        booksMap[book.id] = ShelfBookLibraryMeta(addedAt: now).toJson();
        dirty = true;
      }
      if (last?.bookId == book.id && last?.at != null) {
        final m = ShelfBookLibraryMeta.fromJson(Map<String, dynamic>.from(booksMap[book.id] as Map));
        final ts = last!.at!;
        if (m.lastReadAt != ts) {
          booksMap[book.id] = ShelfBookLibraryMeta(
            groupId: m.groupId,
            addedAt: m.addedAt,
            lastReadAt: ts,
            hidden: m.hidden,
          ).toJson();
          dirty = true;
        }
      }
    }
    if (dirty) {
      store['books'] = booksMap;
      _write(store);
    }
  }

  ShelfUserGroup? createGroup(String title) {
    final trimmed = title.trim();
    if (trimmed.isEmpty) return null;
    final store = _read();
    final groups = [...(store['groups'] as List? ?? const [])];
    if (groups.length >= shelfMaxUserGroups) return null;
    final group = ShelfUserGroup(
      id: 'ug_${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}',
      title: trimmed,
      sortOrder: groups.length,
      createdAt: DateTime.now().millisecondsSinceEpoch,
    );
    groups.add(group.toJson());
    store['groups'] = groups;
    _write(store);
    return group;
  }

  bool renameGroup(String groupId, String title) {
    final trimmed = title.trim();
    if (trimmed.isEmpty) return false;
    final store = _read();
    final groups = [...(store['groups'] as List? ?? const [])];
    final idx = groups.indexWhere((g) => (g as Map)['id'] == groupId);
    if (idx < 0) return false;
    final old = ShelfUserGroup.fromJson(Map<String, dynamic>.from(groups[idx] as Map));
    groups[idx] = ShelfUserGroup(
      id: old.id,
      title: trimmed,
      sortOrder: old.sortOrder,
      createdAt: old.createdAt,
    ).toJson();
    store['groups'] = groups;
    _write(store);
    return true;
  }

  bool deleteGroup(String groupId) {
    final store = _read();
    final groups = [...(store['groups'] as List? ?? const [])];
    groups.removeWhere((g) => (g as Map)['id'] == groupId);
    final booksMap = Map<String, dynamic>.from(store['books'] as Map? ?? {});
    for (final entry in booksMap.entries) {
      final m = ShelfBookLibraryMeta.fromJson(Map<String, dynamic>.from(entry.value as Map));
      if (m.groupId == groupId) {
        booksMap[entry.key] = ShelfBookLibraryMeta(
          groupId: null,
          addedAt: m.addedAt,
          lastReadAt: m.lastReadAt,
          hidden: m.hidden,
        ).toJson();
      }
    }
    store['groups'] = groups;
    store['books'] = booksMap;
    _write(store);
    return true;
  }

  void setBookGroup(String bookId, String? groupId) {
    final store = _read();
    final booksMap = Map<String, dynamic>.from(store['books'] as Map? ?? {});
    final now = DateTime.now().millisecondsSinceEpoch;
    final existing = booksMap[bookId];
    final m = existing is Map
        ? ShelfBookLibraryMeta.fromJson(Map<String, dynamic>.from(existing))
        : ShelfBookLibraryMeta(addedAt: now);
    booksMap[bookId] = ShelfBookLibraryMeta(
      groupId: groupId,
      addedAt: m.addedAt,
      lastReadAt: m.lastReadAt,
      hidden: m.hidden,
    ).toJson();
    store['books'] = booksMap;
    _write(store);
  }

  void touchLastRead(String bookId) {
    final store = _read();
    final booksMap = Map<String, dynamic>.from(store['books'] as Map? ?? {});
    final now = DateTime.now().millisecondsSinceEpoch;
    final existing = booksMap[bookId];
    final m = existing is Map
        ? ShelfBookLibraryMeta.fromJson(Map<String, dynamic>.from(existing))
        : ShelfBookLibraryMeta(addedAt: now);
    booksMap[bookId] = ShelfBookLibraryMeta(
      groupId: m.groupId,
      addedAt: m.addedAt,
      lastReadAt: now,
      hidden: m.hidden,
    ).toJson();
    store['books'] = booksMap;
    _write(store);
  }

  double? bookProgressRatio(String bookId) {
    final p = _progress.loadBook(bookId);
    if (p == null) return null;
    if (p.progressRatio != null) return p.progressRatio!.clamp(0.0, 1.0);
    if (p.scrollOffset != null && p.scrollOffset! > 0) {
      return (p.scrollOffset! * 0.5 + 0.04).clamp(0.0, 1.0);
    }
    if (p.pageIndex > 0) {
      return ((p.pageIndex + 1) / (p.pageIndex + 4).clamp(4, 999)).clamp(0.0, 1.0);
    }
    return 0.04;
  }

  ShelfProgressFilter bookReadStatus(String bookId) {
    final p = _progress.loadBook(bookId);
    final meta = _booksMap()[bookId];
    if (p == null && meta?.lastReadAt == null) return ShelfProgressFilter.unread;
    if (p?.isFinished == true) return ShelfProgressFilter.finished;
    return ShelfProgressFilter.reading;
  }

  List<ShelfBookSummary> filterAndSort(
    List<ShelfBookSummary> books,
    ShelfLibraryTab tab,
    String query,
  ) {
    syncFromBooks(books);
    final meta = _booksMap();
    final q = query.trim().toLowerCase();
    var list = books.where((b) {
      final m = meta[b.id];
      if (m?.hidden == true) return false;
      if (q.isNotEmpty) {
        final hay = '${b.title} ${b.subtitle} ${b.author}'.toLowerCase();
        if (!hay.contains(q)) return false;
      }
      if (tab.kind == ShelfLibraryTabKind.group) {
        if (tab.groupId == shelfUngroupedId) return m?.groupId == null;
        return m?.groupId == tab.groupId;
      }
      // 「最近阅读」：全部展示，仅按阅读时间排序（未读沉底）
      if (tab.kind == ShelfLibraryTabKind.progress) {
        return bookReadStatus(b.id) == tab.progressStatus;
      }
      return true;
    }).toList();

    if (tab.kind == ShelfLibraryTabKind.lastRead) {
      list.sort((a, b) {
        final ma = meta[a.id]?.lastReadAt ?? 0;
        final mb = meta[b.id]?.lastReadAt ?? 0;
        if (mb != ma) return mb.compareTo(ma);
        final sa = a.sortOrder;
        final sb = b.sortOrder;
        if (sb != sa) return sb.compareTo(sa);
        return (meta[b.id]?.addedAt ?? 0).compareTo(meta[a.id]?.addedAt ?? 0);
      });
    } else if (tab.kind == ShelfLibraryTabKind.progress) {
      list.sort((a, b) {
        final ma = meta[a.id]?.lastReadAt ?? 0;
        final mb = meta[b.id]?.lastReadAt ?? 0;
        if (mb != ma) return mb.compareTo(ma);
        return a.title.compareTo(b.title);
      });
    } else if (tab.kind == ShelfLibraryTabKind.added) {
      list.sort((a, b) => (meta[b.id]?.addedAt ?? 0).compareTo(meta[a.id]?.addedAt ?? 0));
    } else {
      list.sort((a, b) => a.title.compareTo(b.title));
    }
    return list;
  }

  int ungroupedCount(List<ShelfBookSummary> books) {
    final meta = _booksMap();
    return books.where((b) => meta[b.id]?.hidden != true && meta[b.id]?.groupId == null).length;
  }

  bool bookCardOpensDetail(String bookId) {
    final progress = _progress.loadBook(bookId);
    final meta = _booksMap()[bookId];
    if (progress == null && meta?.lastReadAt == null) return true;
    if (progress?.isFinished == true) return true;
    return false;
  }

  String bookReadPath(String bookId) {
    final progress = _progress.loadBook(bookId);
    if (progress == null) return '/shelf/$bookId/read';
    final params = {
      'section': progress.sectionId,
      if (progress.pageIndex > 0) 'page': '${progress.pageIndex}',
    };
    final qs = params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');
    return '/shelf/$bookId/read?$qs';
  }

  String bookCardPath(String bookId) =>
      bookCardOpensDetail(bookId) ? '/shelf/$bookId' : bookReadPath(bookId);
}
