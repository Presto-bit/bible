/// 计划：内容接口（只读，/content/plans）+ 计划进度（本地优先 + 同步）。
library;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/database/app_database.dart';
import '../notes/notes_repository.dart' show dbProvider, syncEngineProvider;
import 'plan_session.dart';

// ── 模型 ──
class PlanSummary {
  PlanSummary({
    required this.planId,
    required this.title,
    required this.type,
    required this.days,
  });
  final String planId;
  final String title;
  final String type; // reading / prayer
  final int days;

  bool get isPrayer => type == 'prayer';

  factory PlanSummary.fromJson(Map<String, dynamic> j) => PlanSummary(
        planId: j['plan_id'] as String,
        title: (j['title'] ?? '') as String,
        type: (j['type'] ?? 'reading') as String,
        days: (j['days'] ?? 0) as int,
      );
}

class ReadingDay {
  ReadingDay({
    required this.day,
    required this.book,
    required this.bookName,
    required this.chapterStart,
    required this.chapterEnd,
    required this.title,
  });
  final int day;
  final String book;
  final String bookName;
  final int chapterStart;
  final int chapterEnd;
  final String title;

  factory ReadingDay.fromJson(Map<String, dynamic> j) => ReadingDay(
        day: j['day'] as int,
        book: (j['book'] ?? '') as String,
        bookName: (j['book_name'] ?? '') as String,
        chapterStart: (j['chapter_start'] ?? 1) as int,
        chapterEnd: (j['chapter_end'] ?? 1) as int,
        title: (j['title'] ?? '') as String,
      );
}

class PlanDetail {
  PlanDetail({required this.summary, required this.readingDays, this.raw});
  final PlanSummary summary;
  final List<ReadingDay> readingDays; // reading 计划
  final Map<String, dynamic>? raw; // prayer 计划原始
}

// ── 内容仓库 ──
class PlansRepository {
  PlansRepository(this._dio);
  final Dio _dio;

  Future<List<PlanSummary>> list() async {
    final res = await _dio.get('/content/plans');
    return ((res.data['plans'] ?? []) as List)
        .map((e) => PlanSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<PlanDetail> detail(PlanSummary s) async {
    final res = await _dio.get('/content/plans/${s.planId}');
    final data = res.data as Map<String, dynamic>;
    if (s.isPrayer) {
      return PlanDetail(summary: s, readingDays: const [], raw: data);
    }
    final days = ((data['days'] ?? []) as List)
        .map((e) => ReadingDay.fromJson(e as Map<String, dynamic>))
        .toList();
    return PlanDetail(summary: s, readingDays: days);
  }

  Future<Map<String, dynamic>> day(String planId, int day) async {
    final res = await _dio.get('/content/plans/$planId/day/$day');
    return res.data as Map<String, dynamic>;
  }

  /// 可选的生成范围（id → 标签）。
  Future<List<({String id, String label})>> scopes() async {
    final res = await _dio.get('/content/plan-scopes');
    return ((res.data['scopes'] ?? []) as List)
        .map((e) => (id: e['id'] as String, label: e['label'] as String))
        .toList();
  }

  /// 生成个性化计划（D1）。返回完整结构（含每天 refs）。
  Future<Map<String, dynamic>> generate(
      String? scope, int days, String? theme,
      {String? customRefs}) async {
    final res = await _dio.post('/content/generate-plan', data: {
      if (scope != null) 'scope': scope,
      'days': days,
      'theme': ?theme,
      'custom_refs': ?customRefs,
    });
    return res.data as Map<String, dynamic>;
  }
}

/// 生成计划的本地存取（仅本地，含每天 refs）。
class GeneratedDay {
  GeneratedDay({required this.day, required this.title, required this.refs});
  final int day;
  final String title;
  final List<String> refs;
  factory GeneratedDay.fromJson(Map<String, dynamic> j) => GeneratedDay(
        day: j['day'] as int,
        title: (j['title'] ?? '') as String,
        refs: ((j['refs'] ?? []) as List).cast<String>(),
      );
  Map<String, dynamic> toJson() => {'day': day, 'title': title, 'refs': refs};
}

class GeneratedPlanStore {
  GeneratedPlanStore(this._db);
  final AppDatabase _db;
  static const _uuid = Uuid();

  Stream<List<GeneratedPlan>> watch() => _db.watchGeneratedPlans();
  Future<GeneratedPlan?> byId(String id) => _db.generatedPlanById(id);

  Future<String> save(Map<String, dynamic> plan) async {
    final id = _uuid.v4();
    final days = (plan['days'] ?? []) as List;
    await _db.into(_db.generatedPlans).insert(GeneratedPlan(
          id: id,
          title: (plan['title'] ?? '生成计划') as String,
          scope: (plan['scope'] ?? '') as String,
          daysCount: (plan['days_count'] ?? days.length) as int,
          daysJson: jsonEncode(days),
          createdAtMs: DateTime.now().millisecondsSinceEpoch,
        ));
    return id;
  }

  Future<void> delete(String id) async {
    await (_db.delete(_db.generatedPlans)..where((t) => t.id.equals(id))).go();
  }

  static List<GeneratedDay> daysOf(GeneratedPlan p) =>
      (jsonDecode(p.daysJson) as List)
          .map((e) => GeneratedDay.fromJson(e as Map<String, dynamic>))
          .toList();
}

final generatedPlanStoreProvider =
    Provider<GeneratedPlanStore>((ref) => GeneratedPlanStore(ref.watch(dbProvider)));

final generatedPlansProvider = StreamProvider<List<GeneratedPlan>>(
    (ref) => ref.watch(generatedPlanStoreProvider).watch());

final plansRepoProvider =
    Provider<PlansRepository>((ref) => PlansRepository(ref.watch(dioProvider)));

final plansListProvider =
    FutureProvider<List<PlanSummary>>((ref) => ref.watch(plansRepoProvider).list());

final planDetailProvider =
    FutureProvider.family<PlanDetail, PlanSummary>((ref, s) => ref.watch(plansRepoProvider).detail(s));

// ── 进度仓库（本地优先 + 同步） ──
final planProgressMapProvider = StreamProvider<Map<String, PlanProgressData>>((ref) {
  final db = ref.watch(dbProvider);
  return db.watchPlanProgress().map((rows) => {for (final p in rows) p.planId: p});
});

final planProgressRepoProvider = Provider<PlanProgressRepository>(
  (ref) => PlanProgressRepository(
      ref.watch(dbProvider), ref.watch(syncEngineProvider)),
);

class PlanProgressRepository {
  PlanProgressRepository(this._db, this._sync);
  final AppDatabase _db;
  final dynamic _sync;

  /// 标记某计划进行到第 day 天（status active/done），可选同步 session。
  Future<void> mark(String planId, int day,
      {String status = 'active', PlanSession? session}) async {
    final row = PlanProgressData(
      planId: planId,
      day: day,
      status: status,
      updatedAtMs: DateTime.now().millisecondsSinceEpoch,
    );
    await _db.into(_db.planProgress).insertOnConflictUpdate(row);
    await _sync.enqueuePlanProgress(row, session: session);
  }

  Future<void> cancel(String planId) async {
    await (_db.delete(_db.planProgress)..where((t) => t.planId.equals(planId)))
        .go();
  }
}
