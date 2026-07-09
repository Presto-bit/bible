/// 多端同步契约（与 shared/sync_contract.json、web sync_contract.ts 对齐）
library;

class SyncContract {
  static const version = 1;

  static const pullEntities = [
    'note',
    'highlight',
    'bookmark',
    'ai_session',
    'plan_progress',
    'reading_progress',
    'reading_log',
    'read_event',
    'badge_unlock',
    'user_profile',
  ];

  static const readEventDedupeMs = 30 * 60 * 1000;

  static int mergeMinutes(int a, int b) => a > b ? a : b;

  static int mergeChapters(int a, int b) => a > b ? a : b;

  /// 每用户每天每卷每章至多一条
  static String readEventSyncId(String book, int chapter, int tsMs) {
    final d = DateTime.fromMillisecondsSinceEpoch(tsMs);
    final ymd =
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    return '$ymd:${book.toUpperCase()}:$chapter';
  }
}
