/// 计划阅读编排：加载 Steps、启动会话、打开阅读器。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/api_client.dart';
import '../../core/database/app_database.dart';
import '../bible/reader_screen.dart';
import 'plan_session.dart';
import 'plan_steps.dart';
import 'plans_repository.dart';

class PlanReadingMeta {
  PlanReadingMeta({
    required this.planId,
    required this.planTitle,
    required this.day,
    required this.totalDays,
    required this.steps,
    required this.session,
    required this.source,
  });

  final String planId;
  final String planTitle;
  final int day;
  final int totalDays;
  final List<PlanStep> steps;
  final PlanSession session;
  final String source; // featured | generated
}

Future<List<PlanStep>> loadStepsForDay(
  Ref ref,
  String planId,
  int day, {
  required String source,
}) async {
  if (source == 'generated') {
    final row = await ref.read(generatedPlanStoreProvider).byId(planId);
    if (row == null) return [];
    final days = GeneratedPlanStore.daysOf(row);
    final d = days.where((x) => x.day == day).firstOrNull;
    if (d == null) return [];
    return stepsFromRefs(d.refs, titleHint: d.title);
  }
  final detail = await ref.read(plansRepoProvider).detail(
        PlanSummary(planId: planId, title: '', type: 'reading', days: 0),
      );
  return stepsForReadingRows(
    detail.readingDays
        .map((d) => {
              'day': d.day,
              'book': d.book,
              'book_name': d.bookName,
              'chapter_start': d.chapterStart,
              'chapter_end': d.chapterEnd,
              'title': d.title,
            })
        .toList(),
    day,
  );
}

Future<PlanReadingMeta?> buildPlanReadingMeta(
  Ref ref,
  SharedPreferences prefs, {
  required String planId,
  required String planTitle,
  required int day,
  required int totalDays,
  required String source,
}) async {
  final steps = await loadStepsForDay(ref, planId, day, source: source);
  if (steps.isEmpty) return null;
  final session = await startPlanSession(prefs, planId, day, steps);
  return PlanReadingMeta(
    planId: planId,
    planTitle: planTitle,
    day: day,
    totalDays: totalDays,
    steps: steps,
    session: session,
    source: source,
  );
}

int resumeStepIndex(PlanReadingMeta meta) {
  final idx = meta.session.currentStepIndex;
  if (idx >= 0 && idx < meta.steps.length) return idx;
  final pending = meta.steps.indexWhere(
    (s) => !meta.session.stepsDone.contains(s.id),
  );
  return pending >= 0 ? pending : 0;
}

Future<String?> segmentProgressLabel(
  Ref ref,
  SharedPreferences prefs, {
  required String planId,
  required int day,
  required String source,
}) async {
  final steps = await loadStepsForDay(ref, planId, day, source: source);
  if (steps.isEmpty) return null;
  final session = await getPlanSession(prefs, planId, day);
  final done = session?.stepsDone ?? const [];
  final prog = sessionProgress(steps, done);
  return '${prog.done}/${prog.total} 段';
}

Future<void> openPlanReading(
  BuildContext context,
  WidgetRef ref,
  SharedPreferences prefs, {
  required String planId,
  required String planTitle,
  required int day,
  required int totalDays,
  required String source,
}) async {
  final meta = await buildPlanReadingMeta(
    ref,
    prefs,
    planId: planId,
    planTitle: planTitle,
    day: day,
    totalDays: totalDays,
    source: source,
  );
  if (meta == null || !context.mounted) return;
  ref.read(navIndexProvider.notifier).set(1);
  await ref.read(planProgressRepoProvider).mark(planId, day, status: 'active');
  final idx = resumeStepIndex(meta);
  final step = meta.steps[idx];
  if (!context.mounted) return;
  await Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => ReaderScreen(
        initialBook: step.bookId,
        initialChapter: step.chapterStart,
        planMeta: meta,
        initialStepIndex: idx,
      ),
    ),
  );
}
