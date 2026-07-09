/// 云同步调度：启动/登录/回前台触发，pull 后刷新相关 Provider。
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../badge_engine.dart' show badgesProvider;
import '../gamification.dart' show badgeCatalogProvider;
import '../../features/bible/bible_repository.dart' show booksProvider;
import '../../features/bible/reading_repository.dart'
    show
        readingProgressStreamProvider,
        readingReportProvider,
        reviewDataProvider,
        todayReadingProvider;
import '../../features/notes/notes_repository.dart' show dbProvider, syncEngineProvider;
import '../api_client.dart' show prefsProvider;
import 'sync_engine.dart';
import 'sync_migrate.dart';

enum SyncUiStateKind { idle, syncing, offline, error }

class SyncUiState {
  const SyncUiState({
    this.kind = SyncUiStateKind.idle,
    this.pending = 0,
    this.lastSyncAt,
    this.error,
  });

  final SyncUiStateKind kind;
  final int pending;
  final DateTime? lastSyncAt;
  final String? error;

  SyncUiState copyWith({
    SyncUiStateKind? kind,
    int? pending,
    DateTime? lastSyncAt,
    String? error,
    bool clearError = false,
  }) =>
      SyncUiState(
        kind: kind ?? this.kind,
        pending: pending ?? this.pending,
        lastSyncAt: lastSyncAt ?? this.lastSyncAt,
        error: clearError ? null : (error ?? this.error),
      );
}

final syncControllerProvider =
    NotifierProvider<SyncController, SyncUiState>(SyncController.new);

final pendingOutboxProvider = FutureProvider<int>((ref) async {
  final db = ref.watch(dbProvider);
  final rows = await db.select(db.outbox).get();
  return rows.length;
});

final needsMigrateProvider = FutureProvider<bool>((ref) async {
  final prefs = ref.watch(prefsProvider);
  final db = ref.watch(dbProvider);
  return needsSyncMigration(prefs, db);
});

class SyncController extends Notifier<SyncUiState> {
  Timer? _debounce;
  bool _inFlight = false;

  @override
  SyncUiState build() {
    ref.onDispose(() => _debounce?.cancel());
    ref.listen(pendingOutboxProvider, (_, next) {
      next.whenData((n) {
        state = state.copyWith(pending: n);
      });
    });
    return const SyncUiState();
  }

  void _invalidateAfterSync() {
    ref.invalidate(reviewDataProvider);
    ref.invalidate(badgesProvider);
    ref.invalidate(todayReadingProvider);
    ref.invalidate(readingReportProvider);
    ref.invalidate(readingProgressStreamProvider);
    ref.invalidate(booksProvider);
    ref.invalidate(badgeCatalogProvider);
    ref.invalidate(pendingOutboxProvider);
  }

  Future<void> refreshPending() async {
    final n = await ref.read(syncEngineProvider).pendingCount();
    state = state.copyWith(pending: n);
  }

  Future<SyncResult?> runSync({bool force = false}) async {
    if (_inFlight && !force) return null;
    _inFlight = true;
    state = state.copyWith(kind: SyncUiStateKind.syncing, clearError: true);
    try {
      final engine = ref.read(syncEngineProvider);
      final result = await engine.syncOnce();
      _invalidateAfterSync();
      final pending = await engine.pendingCount();
      state = SyncUiState(
        kind: SyncUiStateKind.idle,
        pending: pending,
        lastSyncAt: DateTime.now(),
      );
      return result;
    } on DioException catch (e) {
      final offline = e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.unknown;
      state = state.copyWith(
        kind: offline ? SyncUiStateKind.offline : SyncUiStateKind.error,
        error: offline ? '离线' : '同步失败',
      );
      return null;
    } catch (_) {
      state = state.copyWith(
        kind: SyncUiStateKind.error,
        error: '同步失败',
      );
      return null;
    } finally {
      _inFlight = false;
    }
  }

  void scheduleSync({Duration delay = const Duration(milliseconds: 400)}) {
    _debounce?.cancel();
    _debounce = Timer(delay, () {
      unawaited(runSync());
    });
  }

  Future<void> runMigrationAndSync() async {
    final prefs = ref.read(prefsProvider);
    final db = ref.read(dbProvider);
    final sync = ref.read(syncEngineProvider);
    await enqueueLocalReadingMigration(sync, prefs, db);
    await runSync(force: true);
  }
}

/// 启动 / 回前台时触发同步；首次迁移由 Profile 或弹窗处理。
class SyncLifecycle extends ConsumerStatefulWidget {
  const SyncLifecycle({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<SyncLifecycle> createState() => _SyncLifecycleState();
}

class _SyncLifecycleState extends ConsumerState<SyncLifecycle>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    final needs = await ref.read(needsMigrateProvider.future);
    if (!mounted) return;
    if (!needs) {
      ref.read(syncControllerProvider.notifier).scheduleSync();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(syncControllerProvider.notifier).scheduleSync();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
