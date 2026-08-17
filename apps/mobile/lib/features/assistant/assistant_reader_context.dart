/// 小爱请求附带：读者本地灵修上下文（对齐 PWA `assistant_reader_context.ts`）。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/gamification.dart' show readingStreak;
import '../../core/ref_label.dart' show bookIdToChineseName;
import '../bible/reading_repository.dart';
import '../bible/thoughts_repository.dart';

Map<String, dynamic>? buildAssistantReaderContext(WidgetRef ref) {
  final ctx = <String, dynamic>{};

  final last = ref.read(readingProgressStreamProvider).value;
  if (last != null && last.book.isNotEmpty) {
    final book = bookIdToChineseName(last.book);
    if (last.verse > 0) {
      ctx['last_read_label'] = '$book ${last.chapter}:${last.verse}';
    } else {
      ctx['last_read_label'] = '$book 第 ${last.chapter} 章';
    }
  }

  final review = ref.read(reviewDataProvider).asData?.value;
  if (review != null) {
    final streak = readingStreak(review);
    if (streak > 0) ctx['reading_streak'] = streak;
    final mins = review.minutesByDay[ReadingRepository.todayKey()] ?? 0;
    if (mins > 0) ctx['today_reading_minutes'] = mins;
  }

  final snippets = ref
      .read(myThoughtsProvider)
      .take(2)
      .map((t) {
        final collapsed = t.body.replaceAll(RegExp(r'\s+'), ' ').trim();
        final body = collapsed.length > 80
            ? '${collapsed.substring(0, 80)}…'
            : collapsed;
        final refLabel = t.ref.isNotEmpty ? '（${t.ref}）' : '';
        return '$body$refLabel';
      })
      .where((s) => s.trim().isNotEmpty)
      .toList();
  if (snippets.isNotEmpty) ctx['recent_note_snippets'] = snippets;

  return ctx.isEmpty ? null : ctx;
}
