/// 计划阅读 Step：最小跳转单元。
library;

class PlanStep {
  const PlanStep({
    required this.id,
    required this.label,
    required this.bookId,
    required this.chapterStart,
    required this.chapterEnd,
  });

  final String id;
  final String label;
  final String bookId;
  final int chapterStart;
  final int chapterEnd;
}

List<PlanStep> stepsForReadingRows(List<Map<String, dynamic>> rows, int day) {
  return rows
      .where((r) => (r['day'] as int?) == day)
      .map((r) {
        final book = (r['book'] ?? '') as String;
        final cs = (r['chapter_start'] ?? r['chapterStart'] ?? 1) as int;
        final ce = (r['chapter_end'] ?? r['chapterEnd'] ?? cs) as int;
        final name = (r['book_name'] ?? r['bookName'] ?? book) as String;
        final title = (r['title'] ?? '') as String;
        return PlanStep(
          id: '$book.$cs-$ce',
          label: title.isNotEmpty ? title : _formatRange(name, cs, ce),
          bookId: book.toUpperCase(),
          chapterStart: cs,
          chapterEnd: ce,
        );
      })
      .toList();
}

List<PlanStep> stepsFromRefs(List<String> refs, {String? titleHint}) {
  if (refs.isEmpty) return [];
  final parsed = refs.map(_parseRef).toList();
  final steps = <PlanStep>[];
  var start = 0;
  for (var i = 1; i <= parsed.length; i++) {
    final prev = parsed[i - 1];
    final curr = i < parsed.length ? parsed[i] : null;
    final breakGroup = curr == null ||
        curr.$1 != parsed[start].$1 ||
        curr.$2 != prev.$2 + 1;
    if (breakGroup) {
      final seg = parsed.sublist(start, i);
      final book = seg.first.$1;
      final cs = seg.first.$2;
      final ce = seg.last.$2;
      steps.add(PlanStep(
        id: '$book.$cs-$ce',
        label: _formatRange(book, cs, ce),
        bookId: book,
        chapterStart: cs,
        chapterEnd: ce,
      ));
      start = i;
    }
  }
  if (steps.length == 1 && titleHint != null && titleHint.isNotEmpty) {
    steps[0] = PlanStep(
      id: steps[0].id,
      label: titleHint,
      bookId: steps[0].bookId,
      chapterStart: steps[0].chapterStart,
      chapterEnd: steps[0].chapterEnd,
    );
  }
  return steps;
}

List<PlanStep> stepsForGeneratedDay(Map<String, dynamic> day) {
  final refs = ((day['refs'] ?? []) as List).cast<String>();
  return stepsFromRefs(refs, titleHint: day['title'] as String?);
}

({int done, int total}) sessionProgress(
    List<PlanStep> steps, List<String> stepsDone) {
  final done = steps.where((s) => stepsDone.contains(s.id)).length;
  return (done: done, total: steps.length);
}

bool allStepsDone(List<PlanStep> steps, List<String> stepsDone) =>
    steps.isNotEmpty && steps.every((s) => stepsDone.contains(s.id));

int stepForChapter(List<PlanStep> steps, String bookId, int chapter) {
  final bid = bookId.toUpperCase();
  return steps.indexWhere(
    (s) => s.bookId == bid && chapter >= s.chapterStart && chapter <= s.chapterEnd,
  );
}

bool isLastChapterOfStep(PlanStep step, int chapter) => chapter == step.chapterEnd;

PlanStep? nextIncompleteStep(List<PlanStep> steps, List<String> stepsDone) {
  for (final s in steps) {
    if (!stepsDone.contains(s.id)) return s;
  }
  return null;
}

PlanStep? pendingNextStep(
  List<PlanStep> steps,
  List<String> stepsDone,
  String bookId,
  int chapter,
) {
  final bid = bookId.toUpperCase();
  final step = steps.cast<PlanStep?>().firstWhere(
        (s) =>
            s!.bookId == bid &&
            chapter >= s.chapterStart &&
            chapter <= s.chapterEnd,
        orElse: () => null,
      );
  if (step == null || chapter != step.chapterEnd) return null;
  final next = nextIncompleteStep(steps, stepsDone);
  if (next == null || next.id == step.id) return null;
  return next;
}

(String bookId, int chapter) _parseRef(String ref) {
  final parts = ref.split('.');
  return (parts[0].toUpperCase(), int.tryParse(parts.length > 1 ? parts[1] : '1') ?? 1);
}

String _formatRange(String bookName, int start, int end) {
  if (start == end) return '$bookName $start';
  return '$bookName $start–$end';
}
