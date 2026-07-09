/// 首次将本机阅读/成就数据并入账号云同步（对齐 Web sync_migrate.ts）。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../badge_catalog.dart' show normalizeBadgeId;
import '../database/app_database.dart';
import 'sync_contract.dart';
import 'sync_engine.dart';

const syncMigrateKey = 'presto_sync_migrated_v1';
const _chapterEventsKey = 'read_chapter_events';
const _badgeUnlockKey = 'badge_unlock_at';

bool hasLocalReadingData(SharedPreferences prefs, AppDatabase db) {
  // drift reading logs
  // checked async in needsSyncMigrationAsync
  final raw = prefs.getString(_chapterEventsKey);
  if (raw != null && raw.isNotEmpty) {
    try {
      final list = jsonDecode(raw) as List;
      if (list.isNotEmpty) return true;
    } catch (_) {}
  }
  final unlocks = prefs.getString(_badgeUnlockKey);
  if (unlocks != null && unlocks.isNotEmpty) {
    try {
      final m = jsonDecode(unlocks) as Map;
      if (m.isNotEmpty) return true;
    } catch (_) {}
  }
  return false;
}

Future<bool> hasLocalReadingDataAsync(
  SharedPreferences prefs,
  AppDatabase db,
) async {
  final logs = await db.allReadingLogs();
  if (logs.isNotEmpty) return true;
  return hasLocalReadingData(prefs, db);
}

bool isSyncMigrated(SharedPreferences prefs) =>
    prefs.getString(syncMigrateKey) == '1';

Future<bool> needsSyncMigration(
  SharedPreferences prefs,
  AppDatabase db,
) async {
  if (isSyncMigrated(prefs)) return false;
  return hasLocalReadingDataAsync(prefs, db);
}

void markSyncMigrated(SharedPreferences prefs) {
  prefs.setString(syncMigrateKey, '1');
}

/// 本机阅读日志、章节明细、已解锁成就 → outbox
Future<void> enqueueLocalReadingMigration(
  SyncEngine sync,
  SharedPreferences prefs,
  AppDatabase db,
) async {
  final logs = await db.allReadingLogs();
  for (final row in logs) {
    await sync.enqueueReadingLog(row);
  }

  final raw = prefs.getString(_chapterEventsKey);
  if (raw != null && raw.isNotEmpty) {
    try {
      final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      for (final e in list) {
        final book = '${e['book']}';
        final chapter = (e['chapter'] as num).toInt();
        final ts = (e['ts'] as num).toInt();
        final id = SyncContract.readEventSyncId(book, chapter, ts);
        await sync.enqueueReadEvent(id: id, ts: ts, book: book, chapter: chapter);
      }
    } catch (_) {}
  }

  final unlockRaw = prefs.getString(_badgeUnlockKey);
  if (unlockRaw != null && unlockRaw.isNotEmpty) {
    try {
      final m = jsonDecode(unlockRaw) as Map<String, dynamic>;
      for (final e in m.entries) {
        final id = normalizeBadgeId(e.key);
        final at = (e.value as num).toInt();
        await sync.enqueueBadgeUnlock(badgeId: id, unlockedAtMs: at);
      }
    } catch (_) {}
  }

  markSyncMigrated(prefs);
}
