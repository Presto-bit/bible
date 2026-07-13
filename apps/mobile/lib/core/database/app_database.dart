/// 本地优先存储（drift / SQLite）。
///
/// 设计：
///   • 业务镜像表（如 notes）—— UI 直接读写本地，离线可用。
///   • outbox —— 本地写操作生成「变更信封」排队，联网后 push 到 /sync。
///   • sync_meta —— 存增量游标等键值。
/// 同步采用行级 LWW（updatedAtMs + version），与后端 sync 引擎一致。
library;

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../user_storage.dart';

part 'app_database.g.dart';

/// 笔记（versioned 实体：软删 + version）。对齐后端 user_note。
class Notes extends Table {
  TextColumn get id => text()();
  TextColumn get ref => text().nullable()();
  TextColumn get body => text().withDefault(const Constant(''))();
  TextColumn get tagsJson => text().withDefault(const Constant('[]'))();
  BoolColumn get isPrivate => boolean().withDefault(const Constant(true))();
  IntColumn get version => integer().withDefault(const Constant(1))();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();
  IntColumn get updatedAtMs => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// 待上行变更队列。
class Outbox extends Table {
  IntColumn get seq => integer().autoIncrement()();
  TextColumn get entity => text()();
  TextColumn get op => text()(); // update / delete
  TextColumn get envelopeJson => text()();
  IntColumn get createdAtMs => integer()();
}

/// 高亮（versioned）。对齐后端 user_highlight。
class Highlights extends Table {
  TextColumn get id => text()();
  TextColumn get ref => text()();
  TextColumn get color => text().withDefault(const Constant('yellow'))();
  IntColumn get version => integer().withDefault(const Constant(1))();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();
  IntColumn get updatedAtMs => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// 书签（versioned）。对齐后端 user_bookmark。
class Bookmarks extends Table {
  TextColumn get id => text()();
  TextColumn get ref => text()();
  IntColumn get version => integer().withDefault(const Constant(1))();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();
  IntColumn get updatedAtMs => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// 小爱会话（versioned）。元数据对齐后端 ai_session（title + anchor_ref）。
class AiSessions extends Table {
  TextColumn get id => text()();
  TextColumn get title => text().withDefault(const Constant('新会话'))();
  TextColumn get anchorRef => text().nullable()();
  IntColumn get version => integer().withDefault(const Constant(1))();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();
  IntColumn get updatedAtMs => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// 小爱消息（仅本地：会话历史不上行，符合最小联网）。
class ChatMessages extends Table {
  TextColumn get id => text()();
  TextColumn get sessionId => text()();
  TextColumn get role => text()(); // user / assistant
  TextColumn get content => text()();
  TextColumn get citationsJson => text().withDefault(const Constant('[]'))();
  IntColumn get createdAtMs => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// AI 生成的个性化计划（仅本地：内容由 /content/generate-plan 生成后保存）。
class GeneratedPlans extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get scope => text()();
  IntColumn get daysCount => integer()();
  TextColumn get daysJson => text()(); // [{day,title,refs:[...]}]
  IntColumn get createdAtMs => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// 阅读日志（非 versioned，主键 date=yyyy-MM-dd）。对齐后端 reading_log（minutes/chapters）。
class ReadingLogs extends Table {
  TextColumn get date => text()();
  IntColumn get minutes => integer().withDefault(const Constant(0))();
  IntColumn get chapters => integer().withDefault(const Constant(0))();
  IntColumn get updatedAtMs => integer()();

  @override
  Set<Column> get primaryKey => {date};
}

/// 计划进度（非 versioned，复合键 plan_id）。对齐后端 plan_progress。
class PlanProgress extends Table {
  TextColumn get planId => text()();
  IntColumn get day => integer().withDefault(const Constant(0))();
  TextColumn get status => text().withDefault(const Constant('active'))();
  IntColumn get updatedAtMs => integer()();

  @override
  Set<Column> get primaryKey => {planId};
}

/// 阅读进度（非 versioned 单例，user 级）。对齐后端 reading_progress。
class ReadingProgress extends Table {
  IntColumn get singleton => integer().withDefault(const Constant(0))(); // 固定 0
  TextColumn get book => text()();
  IntColumn get chapter => integer()();
  IntColumn get verse => integer().withDefault(const Constant(1))();
  IntColumn get updatedAtMs => integer()();

  @override
  Set<Column> get primaryKey => {singleton};
}

/// 键值元数据（如 pull 游标）。
class SyncMeta extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [
  Notes,
  Highlights,
  Bookmarks,
  AiSessions,
  ChatMessages,
  PlanProgress,
  ReadingProgress,
  ReadingLogs,
  GeneratedPlans,
  Outbox,
  SyncMeta,
])
class AppDatabase extends _$AppDatabase {
  /// [executor] 用于测试内存库；正式环境传 [name] 按用户分库。
  AppDatabase([QueryExecutor? executor, String name = 'presto_bible'])
      : super(executor ?? driftDatabase(name: name));

  factory AppDatabase.forUser(String userCode) =>
      AppDatabase(null, driftDbNameForUser(userCode));

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await customStatement('DROP TABLE IF EXISTS memorize_cards');
          }
        },
      );

  // ── sync_meta ──
  Future<String?> meta(String key) async {
    final row = await (select(syncMeta)..where((t) => t.key.equals(key)))
        .getSingleOrNull();
    return row?.value;
  }

  Future<void> setMeta(String key, String value) =>
      into(syncMeta).insertOnConflictUpdate(
          SyncMetaCompanion.insert(key: key, value: value));

  // ── notes 读 ──
  Stream<List<Note>> watchNotes() => (select(notes)
        ..where((t) => t.deleted.equals(false))
        ..orderBy([(t) => OrderingTerm.desc(t.updatedAtMs)]))
      .watch();

  Future<Note?> noteById(String id) =>
      (select(notes)..where((t) => t.id.equals(id))).getSingleOrNull();

  // ── highlights ──
  Stream<List<Highlight>> watchHighlights() => (select(highlights)
        ..where((t) => t.deleted.equals(false))).watch();

  Future<Highlight?> highlightById(String id) =>
      (select(highlights)..where((t) => t.id.equals(id))).getSingleOrNull();

  Future<Highlight?> highlightByRef(String ref) => (select(highlights)
        ..where((t) => t.ref.equals(ref) & t.deleted.equals(false)))
      .getSingleOrNull();

  // ── bookmarks ──
  Stream<List<Bookmark>> watchBookmarks() => (select(bookmarks)
        ..where((t) => t.deleted.equals(false))
        ..orderBy([(t) => OrderingTerm.desc(t.updatedAtMs)]))
      .watch();

  Future<Bookmark?> bookmarkByRef(String ref) => (select(bookmarks)
        ..where((t) => t.ref.equals(ref) & t.deleted.equals(false)))
      .getSingleOrNull();

  // ── generated plans ──
  Stream<List<GeneratedPlan>> watchGeneratedPlans() =>
      (select(generatedPlans)
            ..orderBy([(t) => OrderingTerm.desc(t.createdAtMs)]))
          .watch();

  Future<GeneratedPlan?> generatedPlanById(String id) =>
      (select(generatedPlans)..where((t) => t.id.equals(id)))
          .getSingleOrNull();

  // ── reading log ──
  Future<ReadingLog?> readingLogByDate(String date) =>
      (select(readingLogs)..where((t) => t.date.equals(date)))
          .getSingleOrNull();

  Stream<List<ReadingLog>> watchReadingLogs() =>
      (select(readingLogs)..orderBy([(t) => OrderingTerm.asc(t.date)])).watch();

  Future<List<ReadingLog>> allReadingLogs() =>
      (select(readingLogs)..orderBy([(t) => OrderingTerm.asc(t.date)])).get();

  // ── ai sessions ──
  Stream<List<AiSession>> watchSessions() => (select(aiSessions)
        ..where((t) => t.deleted.equals(false))
        ..orderBy([(t) => OrderingTerm.desc(t.updatedAtMs)]))
      .watch();

  Future<AiSession?> sessionById(String id) =>
      (select(aiSessions)..where((t) => t.id.equals(id))).getSingleOrNull();

  Stream<List<ChatMessage>> watchMessages(String sessionId) =>
      (select(chatMessages)
            ..where((t) => t.sessionId.equals(sessionId))
            ..orderBy([(t) => OrderingTerm.asc(t.createdAtMs)]))
          .watch();

  Future<void> deleteMessages(String sessionId) =>
      (delete(chatMessages)..where((t) => t.sessionId.equals(sessionId))).go();

  // ── plan progress ──
  Stream<List<PlanProgressData>> watchPlanProgress() =>
      select(planProgress).watch();

  Future<PlanProgressData?> planProgressById(String planId) =>
      (select(planProgress)..where((t) => t.planId.equals(planId)))
          .getSingleOrNull();

  // ── reading progress（单例） ──
  Future<ReadingProgressData?> currentReadingProgress() =>
      (select(readingProgress)..where((t) => t.singleton.equals(0)))
          .getSingleOrNull();

  Stream<ReadingProgressData?> watchReadingProgress() =>
      (select(readingProgress)..where((t) => t.singleton.equals(0)))
          .watchSingleOrNull();
}

/// 将旧版单库 `presto_bible` 认领到当前用户库（仅一次）。
Future<void> claimLegacyDriftIfNeeded(
  AppDatabase userDb,
  String userCode,
  SharedPreferences prefs,
) async {
  final id = userCode.trim();
  if (id.isEmpty) return;
  final claimed = (prefs.getString(driftLegacyClaimedKey) ?? '').trim();
  if (claimed.isNotEmpty) return;

  final targetName = driftDbNameForUser(id);
  if (targetName == 'presto_bible') {
    await prefs.setString(driftLegacyClaimedKey, id);
    return;
  }

  // 目标库已有数据：视为已归属，只打认领标记
  final existingNotes = await userDb.select(userDb.notes).get();
  final existingLogs = await userDb.select(userDb.readingLogs).get();
  if (existingNotes.isNotEmpty || existingLogs.isNotEmpty) {
    await prefs.setString(driftLegacyClaimedKey, id);
    return;
  }

  AppDatabase? legacy;
  try {
    legacy = AppDatabase(null, 'presto_bible');
    await _copyDriftContents(legacy, userDb);
  } catch (_) {
    /* 无旧库或拷贝失败：仍认领，避免反复尝试 */
  } finally {
    await legacy?.close();
  }
  await prefs.setString(driftLegacyClaimedKey, id);
}

Future<void> _copyDriftContents(AppDatabase from, AppDatabase to) async {
  for (final row in await from.select(from.notes).get()) {
    await to.into(to.notes).insertOnConflictUpdate(row);
  }
  for (final row in await from.select(from.highlights).get()) {
    await to.into(to.highlights).insertOnConflictUpdate(row);
  }
  for (final row in await from.select(from.bookmarks).get()) {
    await to.into(to.bookmarks).insertOnConflictUpdate(row);
  }
  for (final row in await from.select(from.aiSessions).get()) {
    await to.into(to.aiSessions).insertOnConflictUpdate(row);
  }
  for (final row in await from.select(from.chatMessages).get()) {
    await to.into(to.chatMessages).insertOnConflictUpdate(row);
  }
  for (final row in await from.select(from.generatedPlans).get()) {
    await to.into(to.generatedPlans).insertOnConflictUpdate(row);
  }
  for (final row in await from.select(from.readingLogs).get()) {
    await to.into(to.readingLogs).insertOnConflictUpdate(row);
  }
  for (final row in await from.select(from.planProgress).get()) {
    await to.into(to.planProgress).insertOnConflictUpdate(row);
  }
  for (final row in await from.select(from.readingProgress).get()) {
    await to.into(to.readingProgress).insertOnConflictUpdate(row);
  }
  for (final row in await from.select(from.outbox).get()) {
    await to.into(to.outbox).insert(
          OutboxCompanion.insert(
            entity: row.entity,
            op: row.op,
            envelopeJson: row.envelopeJson,
            createdAtMs: row.createdAtMs,
          ),
        );
  }
  for (final row in await from.select(from.syncMeta).get()) {
    await to.into(to.syncMeta).insertOnConflictUpdate(row);
  }
}
