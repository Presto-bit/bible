/// AI 听经 API：/listen/*
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';

const kListenDefaultVoice = 'voice_calm_m';
const kListenGentleFemaleVoice = 'voice_gentle_f';

const kListenVoices = <({String id, String label})>[
  (id: kListenDefaultVoice, label: '沉稳男声'),
  (id: kListenGentleFemaleVoice, label: '温柔女声'),
];

class ListenTimelineItem {
  const ListenTimelineItem({
    required this.verse,
    required this.startMs,
    required this.endMs,
  });

  final int verse;
  final int startMs;
  final int endMs;

  factory ListenTimelineItem.fromJson(Map<String, dynamic> j) =>
      ListenTimelineItem(
        verse: (j['verse'] as num).toInt(),
        startMs: (j['start_ms'] as num).toInt(),
        endMs: (j['end_ms'] as num).toInt(),
      );
}

class ListenChapterReady {
  const ListenChapterReady({
    required this.url,
    required this.timeline,
    required this.durationMs,
    required this.textHash,
    required this.translation,
    required this.translationLabel,
    required this.voice,
    required this.book,
    required this.chapter,
    required this.bookName,
    this.nextBook,
    this.nextChapter,
  });

  final String url;
  final List<ListenTimelineItem> timeline;
  final int durationMs;
  final String textHash;
  final String translation;
  final String translationLabel;
  final String voice;
  final String book;
  final int chapter;
  final String bookName;
  final String? nextBook;
  final int? nextChapter;

  factory ListenChapterReady.fromJson(Map<String, dynamic> j) {
    final next = j['next'];
    String? nextBook;
    int? nextChapter;
    if (next is Map) {
      nextBook = next['book']?.toString();
      nextChapter = (next['chapter'] as num?)?.toInt();
    }
    final urlRaw = (j['url'] as String?) ?? '';
    final abs = urlRaw.startsWith('http')
        ? urlRaw
        : '${AppConfig.baseUrl}${urlRaw.startsWith('/') ? '' : '/'}$urlRaw';
    final tl = <ListenTimelineItem>[];
    final rawTl = j['timeline'];
    if (rawTl is List) {
      for (final item in rawTl) {
        if (item is Map<String, dynamic>) {
          tl.add(ListenTimelineItem.fromJson(item));
        } else if (item is Map) {
          tl.add(ListenTimelineItem.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }
    return ListenChapterReady(
      url: abs,
      timeline: tl,
      durationMs: (j['duration_ms'] as num?)?.toInt() ?? 0,
      textHash: (j['text_hash'] as String?) ?? '',
      translation: (j['translation'] as String?) ?? '',
      translationLabel: (j['translation_label'] as String?) ?? '',
      voice: (j['voice'] as String?) ?? kListenDefaultVoice,
      book: (j['book'] as String?) ?? '',
      chapter: (j['chapter'] as num?)?.toInt() ?? 0,
      bookName: (j['book_name'] as String?) ?? '',
      nextBook: nextBook,
      nextChapter: nextChapter,
    );
  }
}

class BibleListenApi {
  BibleListenApi(this._dio);

  final Dio _dio;

  Future<Object> fetchChapter({
    required String translation,
    required String book,
    required int chapter,
    String voice = kListenDefaultVoice,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/listen/chapter',
      queryParameters: {
        'translation': translation,
        'book': book,
        'chapter': chapter,
        'voice': voice,
      },
      options: Options(
        validateStatus: (s) => s != null && (s == 200 || s == 202),
      ),
    );
    final data = res.data ?? const <String, dynamic>{};
    if (res.statusCode == 202) {
      return data['job_id'] as String? ?? '';
    }
    return ListenChapterReady.fromJson(data);
  }

  Future<ListenChapterReady> pollJob(String jobId) async {
    final deadline = DateTime.now().add(const Duration(seconds: 180));
    while (DateTime.now().isBefore(deadline)) {
      final res = await _dio.get<Map<String, dynamic>>(
        '/listen/jobs/$jobId',
      );
      final data = res.data ?? const <String, dynamic>{};
      final status = data['status'] as String?;
      if (status == 'ready') {
        return ListenChapterReady.fromJson(data);
      }
      if (status == 'error') {
        throw DioException(
          requestOptions: res.requestOptions,
          message: (data['error'] as String?) ?? '合成失败',
        );
      }
      await Future<void>.delayed(const Duration(milliseconds: 1200));
    }
    throw DioException(
      requestOptions: RequestOptions(path: '/listen/jobs/$jobId'),
      message: '准备超时，请重试',
    );
  }

  Future<ListenChapterReady> ensureChapter({
    required String translation,
    required String book,
    required int chapter,
    String voice = kListenDefaultVoice,
  }) async {
    final first = await fetchChapter(
      translation: translation,
      book: book,
      chapter: chapter,
      voice: voice,
    );
    if (first is ListenChapterReady) return first;
    final jobId = first as String;
    if (jobId.isEmpty) {
      throw StateError('缺少 job_id');
    }
    return pollJob(jobId);
  }
}

final bibleListenApiProvider = Provider<BibleListenApi>((ref) {
  return BibleListenApi(ref.watch(dioProvider));
});

int? resolveListenVerse(List<ListenTimelineItem> timeline, int positionMs) {
  if (timeline.isEmpty) return null;
  // 取已开始的最后一节；节间空隙保持上一节，避免回跳到首节。
  int? current;
  for (final t in timeline) {
    if (positionMs >= t.startMs) current = t.verse;
  }
  return current;
}
