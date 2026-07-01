/// 在线同步端到端：本地建笔记 → push → 另一台「设备」pull 能看到（多端同步）。
///
/// 需后端在 127.0.0.1:8000 且 AUTH_DEV_ALLOW_USER_HEADER=true；不可达自动跳过。
///   flutter test test/sync_live_test.dart
library;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/core/database/app_database.dart';
import 'package:presto_bible/core/sync/sync_engine.dart';
import 'package:uuid/uuid.dart';

const _base = 'http://127.0.0.1:8011';

Dio _dioFor(String userId) => Dio(BaseOptions(
      baseUrl: _base,
      connectTimeout: const Duration(seconds: 3),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'X-User-Id': userId},
    ));

Future<bool> _up() async {
  try {
    final r = await Dio().get('$_base/health');
    return r.data['status'] == 'ok';
  } catch (_) {
    return false;
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('笔记多端同步（push → 另设备 pull）', () async {
    if (!await _up()) {
      markTestSkipped('后端不可达，跳过');
      return;
    }
    final userId = const Uuid().v4();
    final body = '端到端同步验证 ${DateTime.now().toIso8601String()}';

    // 设备 A：本地建笔记 + push
    final dbA = AppDatabase(NativeDatabase.memory());
    final prefsA = await SharedPreferences.getInstance();
    final engineA = SyncEngine(dbA, _dioFor(userId), prefsA);
    final now = DateTime.now().millisecondsSinceEpoch;
    final note = Note(
      id: const Uuid().v4(),
      ref: 'JHN.3.16',
      body: body,
      tagsJson: jsonEncode(['默想']),
      isPrivate: true,
      version: 1,
      deleted: false,
      updatedAtMs: now,
    );
    await dbA.into(dbA.notes).insertOnConflictUpdate(note);
    await engineA.enqueueNote(note, isDelete: false);
    final pushed = await engineA.push();
    expect(pushed.applied, greaterThanOrEqualTo(1));

    // 设备 B：全新本地库，同一用户，pull 应能看到该笔记
    final dbB = AppDatabase(NativeDatabase.memory());
    final prefsB = await SharedPreferences.getInstance();
    final engineB = SyncEngine(dbB, _dioFor(userId), prefsB);
    final pulled = await engineB.pull();
    expect(pulled.pulled, greaterThanOrEqualTo(1));

    final got = await dbB.noteById(note.id);
    expect(got, isNotNull);
    expect(got!.body, body);
    expect(got.deleted, isFalse);

    // 设备 A 删除 → push；设备 B 增量 pull 得到 tombstone
    final tomb = note.copyWith(
        deleted: true,
        version: note.version + 1,
        updatedAtMs: DateTime.now().millisecondsSinceEpoch);
    await dbA.into(dbA.notes).insertOnConflictUpdate(tomb);
    await engineA.enqueueNote(tomb, isDelete: true);
    await engineA.push();

    final pulled2 = await engineB.pull();
    expect(pulled2.pulled, greaterThanOrEqualTo(1));
    final gotB = await dbB.noteById(note.id);
    expect(gotB!.deleted, isTrue);

    await dbA.close();
    await dbB.close();
  }, timeout: const Timeout(Duration(seconds: 40)));

  test('高亮 + 计划进度多端同步', () async {
    if (!await _up()) {
      markTestSkipped('后端不可达，跳过');
      return;
    }
    final userId = const Uuid().v4();
    final now = DateTime.now().millisecondsSinceEpoch;

    final dbA = AppDatabase(NativeDatabase.memory());
    final prefsA = await SharedPreferences.getInstance();
    final engineA = SyncEngine(dbA, _dioFor(userId), prefsA);

    // 高亮
    final h = Highlight(
        id: const Uuid().v4(),
        ref: 'JHN.3.16',
        color: 'green',
        version: 1,
        deleted: false,
        updatedAtMs: now);
    await dbA.into(dbA.highlights).insertOnConflictUpdate(h);
    await engineA.enqueueHighlight(h, isDelete: false);

    // 计划进度（非 versioned 复合键）
    final p = PlanProgressData(
        planId: 'gospels_30', day: 3, status: 'active', updatedAtMs: now);
    await dbA.into(dbA.planProgress).insertOnConflictUpdate(p);
    await engineA.enqueuePlanProgress(p);

    final pushed = await engineA.push();
    expect(pushed.applied, greaterThanOrEqualTo(2));

    // 设备 B 全量 pull
    final dbB = AppDatabase(NativeDatabase.memory());
    final prefsB = await SharedPreferences.getInstance();
    final engineB = SyncEngine(dbB, _dioFor(userId), prefsB);
    final pulled = await engineB.pull();
    expect(pulled.pulled, greaterThanOrEqualTo(2));

    final gotH = await dbB.highlightByRef('JHN.3.16');
    expect(gotH, isNotNull);
    expect(gotH!.color, 'green');

    final gotP = await dbB.planProgressById('gospels_30');
    expect(gotP, isNotNull);
    expect(gotP!.day, 3);

    await dbA.close();
    await dbB.close();
  }, timeout: const Timeout(Duration(seconds: 40)));
}
