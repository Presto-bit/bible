/// 静态内容：交叉引用（串珠）+ 圣经词典（人物/地名词条）。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class RelatedVerse {
  RelatedVerse({required this.ref, required this.text});
  final String ref; // 如 "JHN 3:17"
  final String text;
  factory RelatedVerse.fromJson(Map<String, dynamic> j) => RelatedVerse(
        ref: (j['ref'] ?? '') as String,
        text: (j['text'] ?? '') as String,
      );

  /// 解析为 (bookId, chapter)，失败返回 null。
  ({String book, int chapter})? get target {
    final m = RegExp(r'^([A-Za-z0-9]+)\s+(\d+)').firstMatch(ref.trim());
    if (m == null) return null;
    return (book: m.group(1)!.toUpperCase(), chapter: int.parse(m.group(2)!));
  }
}

class CrossrefResult {
  CrossrefResult({required this.label, required this.related});
  final String label;
  final List<RelatedVerse> related;
  factory CrossrefResult.fromJson(Map<String, dynamic> j) => CrossrefResult(
        label: (j['label'] ?? j['ref'] ?? '') as String,
        related: ((j['related'] ?? []) as List)
            .map((e) => RelatedVerse.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class DictEntity {
  DictEntity({
    required this.name,
    required this.type,
    required this.summary,
    required this.refs,
  });
  final String name;
  final String type;
  final String summary;
  final List<String> refs;
  factory DictEntity.fromJson(Map<String, dynamic> j) => DictEntity(
        name: (j['name'] ?? '') as String,
        type: (j['type'] ?? '') as String,
        summary: (j['summary'] ?? '') as String,
        refs: ((j['refs'] ?? []) as List).map((e) => '$e').toList(),
      );
}

class ContentRepository {
  ContentRepository(this._dio);
  final Dio _dio;

  Future<CrossrefResult> crossrefs(String ref) async {
    final res = await _dio.get('/content/crossrefs',
        queryParameters: {'ref': ref});
    return CrossrefResult.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<DictEntity>> dictionary({String? term, String? ref}) async {
    final res = await _dio.get('/content/dictionary',
        queryParameters: {
          if (term != null && term.isNotEmpty) 'term': term,
          if (ref != null && ref.isNotEmpty) 'ref': ref,
        });
    return ((res.data['entities'] ?? []) as List)
        .map((e) => DictEntity.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<StrongsWord>> strongs(String ref) async {
    final res = await _dio.get('/content/strongs', queryParameters: {'ref': ref});
    return ((res.data['words'] ?? []) as List)
        .map((e) => StrongsWord.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<SectionMark>> sectionTitles(String book, int chapter) async {
    final res = await _dio.get('/content/sections',
        queryParameters: {'book': book, 'chapter': chapter});
    return ((res.data['sections'] ?? []) as List)
        .map((e) => SectionMark.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TopicEntry>> topics() async {
    final res = await _dio.get('/content/topics');
    return ((res.data['topics'] ?? []) as List)
        .map((e) => TopicEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

class StrongsWord {
  StrongsWord({
    required this.position,
    this.word,
    this.strongs,
    this.lemma,
    this.gloss,
    this.morphology,
  });
  final int position;
  final String? word;
  final String? strongs;
  final String? lemma;
  final String? gloss;
  final String? morphology;
  factory StrongsWord.fromJson(Map<String, dynamic> j) => StrongsWord(
        position: (j['position'] as num?)?.toInt() ?? 0,
        word: j['word'] as String?,
        strongs: j['strongs'] as String?,
        lemma: j['lemma'] as String?,
        gloss: j['gloss'] as String?,
        morphology: j['morphology'] as String?,
      );
}

class SectionMark {
  SectionMark({required this.verse, required this.title});
  final int verse;
  final String title;
  factory SectionMark.fromJson(Map<String, dynamic> j) => SectionMark(
        verse: (j['verse'] as num?)?.toInt() ?? 1,
        title: (j['title'] ?? '') as String,
      );
}

class TopicEntry {
  TopicEntry({required this.id, required this.name, this.refs = const []});
  final String id;
  final String name;
  final List<String> refs;
  factory TopicEntry.fromJson(Map<String, dynamic> j) => TopicEntry(
        id: (j['id'] ?? j['name'] ?? '') as String,
        name: (j['name'] ?? '') as String,
        refs: ((j['refs'] ?? []) as List).map((e) => '$e').toList(),
      );
}

final contentRepoProvider =
    Provider<ContentRepository>((ref) => ContentRepository(ref.watch(dioProvider)));

final crossrefsProvider = FutureProvider.family<CrossrefResult, String>(
    (ref, refStr) => ref.watch(contentRepoProvider).crossrefs(refStr));

final dictionaryProvider = FutureProvider.family<List<DictEntity>, String>(
    (ref, term) => ref.watch(contentRepoProvider).dictionary(term: term));

final strongsProvider = FutureProvider.family<List<StrongsWord>, String>(
    (ref, refStr) => ref.watch(contentRepoProvider).strongs(refStr));

final sectionTitlesProvider =
    FutureProvider.family<List<SectionMark>, ({String book, int chapter})>(
        (ref, args) => ref
            .watch(contentRepoProvider)
            .sectionTitles(args.book, args.chapter));

final topicsProvider = FutureProvider<List<TopicEntry>>(
    (ref) => ref.watch(contentRepoProvider).topics());
