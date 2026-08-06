/// 「我的」足迹本机回流角标，对齐 web `profile_footprint.ts`。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'user_storage.dart';

const _seenKey = 'profile_footprint_seen';
const _milestoneKey = 'profile_streak_milestones_shared';

const streakMilestones = [7, 30, 100];

class FootprintSeen {
  const FootprintSeen({
    this.thoughts = 0,
    this.marks = 0,
    this.badges = 0,
  });
  final int thoughts;
  final int marks;
  final int badges;

  FootprintSeen copyWith({int? thoughts, int? marks, int? badges}) =>
      FootprintSeen(
        thoughts: thoughts ?? this.thoughts,
        marks: marks ?? this.marks,
        badges: badges ?? this.badges,
      );
}

FootprintSeen readFootprintSeen(SharedPreferences prefs) {
  try {
    final raw = userPrefGetString(prefs, _seenKey);
    if (raw == null || raw.isEmpty) return const FootprintSeen();
    final j = jsonDecode(raw) as Map<String, dynamic>;
    return FootprintSeen(
      thoughts: (j['thoughts'] as num?)?.toInt() ?? 0,
      marks: (j['marks'] as num?)?.toInt() ?? 0,
      badges: (j['badges'] as num?)?.toInt() ?? 0,
    );
  } catch (_) {
    return const FootprintSeen();
  }
}

Future<void> writeFootprintSeen(
  SharedPreferences prefs,
  FootprintSeen next,
) async {
  await userPrefSetString(
    prefs,
    _seenKey,
    jsonEncode({
      'thoughts': next.thoughts,
      'marks': next.marks,
      'badges': next.badges,
    }),
  );
}

bool footprintHasNew(FootprintSeen seen, String kind, int current) {
  if (current <= 0) return false;
  final s = switch (kind) {
    'thoughts' => seen.thoughts,
    'marks' => seen.marks,
    'badges' => seen.badges,
    _ => 0,
  };
  return current > s;
}

Future<void> markFootprintSeen(
  SharedPreferences prefs,
  String kind,
  int current,
) async {
  final cur = readFootprintSeen(prefs);
  final next = switch (kind) {
    'thoughts' => cur.copyWith(thoughts: current),
    'marks' => cur.copyWith(marks: current),
    'badges' => cur.copyWith(badges: current),
    _ => cur,
  };
  await writeFootprintSeen(prefs, next);
}

/// 当前 streak 下尚未分享过的最高里程碑；无则 null。
int? pendingStreakMilestone(SharedPreferences prefs, int streak) {
  if (streak <= 0) return null;
  final shared = _readSharedMilestones(prefs).toSet();
  int? hit;
  for (final m in streakMilestones) {
    if (streak >= m && !shared.contains(m)) hit = m;
  }
  return hit;
}

Future<void> markStreakMilestoneShared(
  SharedPreferences prefs,
  int n,
) async {
  final set = _readSharedMilestones(prefs).toSet()..add(n);
  final list = set.toList()..sort();
  await userPrefSetString(prefs, _milestoneKey, jsonEncode(list));
}

List<int> _readSharedMilestones(SharedPreferences prefs) {
  try {
    final raw = userPrefGetString(prefs, _milestoneKey);
    if (raw == null || raw.isEmpty) return const [];
    final j = jsonDecode(raw);
    if (j is! List) return const [];
    return j
        .whereType<num>()
        .map((e) => e.toInt())
        .where((n) => n > 0)
        .toList();
  } catch (_) {
    return const [];
  }
}
