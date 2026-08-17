/// 想法云同步 outbox（对齐 Web `thought_sync.ts`）。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart' show prefsProvider;
import '../../core/user_storage.dart';
import '../notes/notes_repository.dart' show syncEngineProvider;

const _verMapKey = 'thought_sync_versions_v1';

Map<String, int> _readVers(SharedPreferences prefs) {
  try {
    final raw = userPrefGetString(prefs, _verMapKey);
    if (raw == null || raw.isEmpty) return {};
    return (jsonDecode(raw) as Map).map(
      (k, v) => MapEntry(k as String, (v as num).toInt()),
    );
  } catch (_) {
    return {};
  }
}

Future<void> _writeVers(SharedPreferences prefs, Map<String, int> m) async {
  await userPrefSetString(prefs, _verMapKey, jsonEncode(m));
}

int bumpThoughtVersion(SharedPreferences prefs, String id) {
  final vers = _readVers(prefs);
  final next = (vers[id] ?? 0) + 1;
  vers[id] = next;
  userPrefSetString(prefs, _verMapKey, jsonEncode(vers));
  return next;
}

int remoteVersionForThought(SharedPreferences prefs, String id) =>
    _readVers(prefs)[id] ?? 0;

Future<void> recordRemoteThought(
  SharedPreferences prefs,
  String id,
  int version,
) async {
  final vers = _readVers(prefs);
  vers[id] = version;
  await _writeVers(prefs, vers);
}

Future<void> clearThoughtSyncMeta(SharedPreferences prefs, String id) async {
  final vers = _readVers(prefs);
  vers.remove(id);
  await _writeVers(prefs, vers);
}

final _uuid = Uuid();

/// 确保本地想法 id 为 UUID，便于服务端主键。
String ensureThoughtSyncId(String? existing) {
  if (existing != null &&
      RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        caseSensitive: false,
      ).hasMatch(existing)) {
    return existing;
  }
  return _uuid.v4();
}

Future<void> enqueueThoughtSync(
  Ref ref, {
  required String id,
  required String refStr,
  required String body,
  required String visibility,
  required int createdAtMs,
  bool isDelete = false,
}) async {
  final prefs = ref.read(prefsProvider);
  final version = bumpThoughtVersion(prefs, id);
  await ref.read(syncEngineProvider).enqueueThought(
        id: id,
        version: version,
        refStr: refStr,
        body: body,
        visibility: visibility,
        createdAtMs: createdAtMs,
        isDelete: isDelete,
      );
  if (isDelete) await clearThoughtSyncMeta(prefs, id);
}
