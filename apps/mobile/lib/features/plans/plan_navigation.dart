/// 计划模式翻页：仅在当日 Step 章节序列内导航。
library;

import '../../core/models/bible_book.dart';
import 'plan_steps.dart';

typedef PlanChapterRef = ({String bookId, int chapter, String stepId});

List<PlanChapterRef> flattenPlanChapters(List<PlanStep> steps) {
  final out = <PlanChapterRef>[];
  for (final step in steps) {
    for (var ch = step.chapterStart; ch <= step.chapterEnd; ch++) {
      out.add((bookId: step.bookId, chapter: ch, stepId: step.id));
    }
  }
  return out;
}

bool isChapterInPlan(List<PlanStep> steps, String bookId, int chapter) {
  final bid = bookId.toUpperCase();
  return steps.any(
    (s) => s.bookId == bid && chapter >= s.chapterStart && chapter <= s.chapterEnd,
  );
}

List<int> allowedChaptersForBook(List<PlanStep> steps, String bookId) {
  final bid = bookId.toUpperCase();
  final set = <int>{};
  for (final s in steps) {
    if (s.bookId != bid) continue;
    for (var ch = s.chapterStart; ch <= s.chapterEnd; ch++) {
      set.add(ch);
    }
  }
  final list = set.toList()..sort();
  return list;
}

List<String> planBooksInSteps(List<PlanStep> steps) {
  final seen = <String>{};
  final out = <String>[];
  for (final s in steps) {
    if (seen.add(s.bookId)) out.add(s.bookId);
  }
  return out;
}

int _planIndex(List<PlanChapterRef> flat, String bookId, int chapter) {
  final bid = bookId.toUpperCase();
  return flat.indexWhere((c) => c.bookId == bid && c.chapter == chapter);
}

({BibleBook book, int chapter})? resolvePlanNav(
  List<BibleBook> books,
  List<PlanStep> steps,
  String bookId,
  int chapter,
  int delta,
) {
  if (delta == 0 || steps.isEmpty) return null;
  final flat = flattenPlanChapters(steps);
  if (flat.isEmpty) return null;
  final idx = _planIndex(flat, bookId, chapter);
  if (idx < 0) return null;
  final nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= flat.length) return null;
  final target = flat[nextIdx];
  BibleBook? book;
  for (final b in books) {
    if (b.id == target.bookId) {
      book = b;
      break;
    }
  }
  if (book == null) return null;
  return (book: book, chapter: target.chapter);
}

bool canPlanNav(
  List<BibleBook> books,
  List<PlanStep> steps,
  String bookId,
  int chapter,
  int delta,
) =>
    resolvePlanNav(books, steps, bookId, chapter, delta) != null;

bool isForwardStepBoundary(
  List<PlanStep> steps,
  String fromBookId,
  int fromChapter,
  String toBookId,
  int toChapter,
) {
  final flat = flattenPlanChapters(steps);
  final from = _planIndex(flat, fromBookId, fromChapter);
  final to = _planIndex(flat, toBookId, toChapter);
  if (from < 0 || to < 0 || to != from + 1) return false;
  return flat[from].stepId != flat[to].stepId;
}
