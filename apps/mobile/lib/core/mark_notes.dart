/// 划线 ↔ 笔记绑定（本地索引）。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const _linkKey = 'mark_note_links_v1';

Map<String, String> readMarkNoteLinks(SharedPreferences prefs) {
  try {
    final raw = prefs.getString(_linkKey);
    if (raw == null || raw.isEmpty) return {};
    return Map<String, String>.from(jsonDecode(raw) as Map);
  } catch (_) {
    return {};
  }
}

Future<void> bindNoteToMark(
  SharedPreferences prefs,
  String ref,
  String noteId,
) async {
  final map = readMarkNoteLinks(prefs);
  map[ref] = noteId;
  await prefs.setString(_linkKey, jsonEncode(map));
}

Future<void> unbindMarkRef(SharedPreferences prefs, String ref) async {
  final map = readMarkNoteLinks(prefs);
  map.remove(ref);
  await prefs.setString(_linkKey, jsonEncode(map));
}

String? noteIdForMarkRef(SharedPreferences prefs, String ref) =>
    readMarkNoteLinks(prefs)[ref];
