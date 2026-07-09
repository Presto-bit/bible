/// 经文仓库：调用后端 /bible/*。
///
/// 后续 local-first 阶段：优先读本地 SQLite（drift），网络仅做兜底/校验。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'offline_bible.dart';
import 'models.dart';

class BibleRepository {
  BibleRepository(this._dio, {OfflineBibleService? offline}) : _offline = offline;
  final Dio _dio;
  final OfflineBibleService? _offline;

  Future<List<BibleBook>> books() async {
    try {
      final res = await _dio.get('/bible/books');
      final list = (res.data['books'] ?? []) as List;
      return list
          .map((e) => BibleBook.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      final local = await _offline?.listBooks() ?? [];
      if (local.isNotEmpty) return local;
      rethrow;
    }
  }

  Future<Chapter> chapter(String book, int chapter, {String? version}) async {
    try {
      final res = await _dio.get(
        '/bible/chapter',
        queryParameters: {
          'book': book,
          'chapter': chapter,
          if (version != null) 'version': version,
        },
      );
      return Chapter.fromJson(res.data as Map<String, dynamic>);
    } catch (e) {
      if (version == null || version == 'cnv') {
        final local = await _offline?.chapter(book, chapter);
        if (local != null) return local;
      }
      rethrow;
    }
  }

  Future<List<BibleVersion>> versions() async {
    final res = await _dio.get('/bible/versions');
    final list = (res.data['versions'] ?? []) as List;
    return list
        .map((e) => BibleVersion.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<VerseRendition>> compare(String osisRef) async {
    final res = await _dio.get(
      '/bible/compare',
      queryParameters: {'ref': osisRef},
    );
    final list = (res.data['versions'] ?? []) as List;
    return list
        .map((e) => VerseRendition.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<GuideResult> guide(String ref) async {
    final res = await _dio.get(
      '/guide/passage',
      queryParameters: {'ref': ref},
    );
    return GuideResult.fromJson(res.data as Map<String, dynamic>);
  }
}

/// 资源指南卡片（确定性研经卡：注释/资源片段）。
class GuideCard {
  const GuideCard({required this.title, required this.snippet, required this.score});
  final String title;
  final String snippet;
  final double score;

  factory GuideCard.fromJson(Map<String, dynamic> j) => GuideCard(
        title: (j['title'] ?? '') as String,
        snippet: (j['snippet'] ?? '') as String,
        score: (j['score'] as num?)?.toDouble() ?? 0,
      );
}

class GuideResult {
  const GuideResult({
    required this.ref,
    required this.display,
    required this.passage,
    required this.cards,
  });
  final String ref;
  final String display;
  final String passage;
  final List<GuideCard> cards;

  factory GuideResult.fromJson(Map<String, dynamic> j) => GuideResult(
        ref: (j['ref'] ?? '') as String,
        display: (j['display'] ?? '') as String,
        passage: (j['passage'] ?? '') as String,
        cards: ((j['cards'] ?? []) as List)
            .map((e) => GuideCard.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class BibleVersion {
  const BibleVersion({
    required this.id,
    required this.label,
    required this.available,
    required this.primary,
  });
  final String id;
  final String label;
  final bool available;
  final bool primary;

  factory BibleVersion.fromJson(Map<String, dynamic> j) => BibleVersion(
        id: j['id'] as String,
        label: j['label'] as String,
        available: j['available'] as bool? ?? false,
        primary: j['primary'] as bool? ?? false,
      );
}

class VerseRendition {
  const VerseRendition({
    required this.version,
    required this.label,
    required this.text,
  });
  final String version;
  final String label;
  final String text;

  factory VerseRendition.fromJson(Map<String, dynamic> j) => VerseRendition(
        version: j['version'] as String,
        label: j['label'] as String,
        text: j['text'] as String,
      );
}

final bibleRepoProvider = Provider<BibleRepository>(
  (ref) => BibleRepository(
    ref.watch(dioProvider),
    offline: ref.watch(offlineBibleProvider),
  ),
);

final booksProvider = FutureProvider<List<BibleBook>>(
  (ref) => ref.watch(bibleRepoProvider).books(),
);

/// 章节内容（book, chapter）。
final chapterProvider =
    FutureProvider.family<Chapter, ({String book, int chapter})>(
  (ref, key) => ref.watch(bibleRepoProvider).chapter(key.book, key.chapter),
);

/// 指定译本章节（对照阅读）。
final chapterVersionProvider =
    FutureProvider.family<Chapter, ({String book, int chapter, String version})>(
  (ref, key) => ref.watch(bibleRepoProvider).chapter(
        key.book,
        key.chapter,
        version: key.version,
      ),
);

/// 可用译本列表（含 KJV 是否已落地）。
final bibleVersionsProvider = FutureProvider<List<BibleVersion>>(
  (ref) => ref.watch(bibleRepoProvider).versions(),
);

/// 单节多译本对照（osis 如 JHN.3.16）。
final verseCompareProvider =
    FutureProvider.family<List<VerseRendition>, String>(
  (ref, osis) => ref.watch(bibleRepoProvider).compare(osis),
);

/// 资源指南（确定性研经卡，ref 如 JHN.3.16）。
final guideProvider = FutureProvider.family<GuideResult, String>(
  (ref, refStr) => ref.watch(bibleRepoProvider).guide(refStr),
);
