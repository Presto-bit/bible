/// 计划阅读会话：段进度、断点、多端同步。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'plan_steps.dart';
import '../../core/user_storage.dart';

class PlanSession {
  PlanSession({
    required this.planId,
    required this.day,
    required this.currentStepIndex,
    required this.stepsDone,
    this.lastRef,
    required this.updatedAtMs,
  });

  final String planId;
  final int day;
  final int currentStepIndex;
  final List<String> stepsDone;
  final String? lastRef;
  final int updatedAtMs;

  PlanSession copyWith({
    int? currentStepIndex,
    List<String>? stepsDone,
    String? lastRef,
    int? updatedAtMs,
  }) =>
      PlanSession(
        planId: planId,
        day: day,
        currentStepIndex: currentStepIndex ?? this.currentStepIndex,
        stepsDone: stepsDone ?? this.stepsDone,
        lastRef: lastRef ?? this.lastRef,
        updatedAtMs: updatedAtMs ?? this.updatedAtMs,
      );

  Map<String, dynamic> toJson() => {
        'planId': planId,
        'day': day,
        'currentStepIndex': currentStepIndex,
        'stepsDone': stepsDone,
        if (lastRef != null) 'lastRef': lastRef,
        'updatedAt': updatedAtMs,
      };

  factory PlanSession.fromJson(Map<String, dynamic> j) => PlanSession(
        planId: j['planId'] as String,
        day: (j['day'] ?? 1) as int,
        currentStepIndex: (j['currentStepIndex'] ?? 0) as int,
        stepsDone: ((j['stepsDone'] ?? []) as List).cast<String>(),
        lastRef: j['lastRef'] as String?,
        updatedAtMs: (j['updatedAt'] ?? DateTime.now().millisecondsSinceEpoch) as int,
      );

  Map<String, dynamic> toSyncJson() => {
        'currentStepIndex': currentStepIndex,
        'stepsDone': stepsDone,
        'lastRef': lastRef,
        'day': day,
        'updatedAt': updatedAtMs,
      };
}

const _sessionKey = 'presto_plan_sessions';

Future<Map<String, PlanSession>> _readAll(SharedPreferences prefs) async {
  try {
    final raw = userPrefGetString(prefs, _sessionKey);
    if (raw == null || raw.isEmpty) return {};
    final map = jsonDecode(raw) as Map<String, dynamic>;
    return map.map((k, v) =>
        MapEntry(k, PlanSession.fromJson(v as Map<String, dynamic>)));
  } catch (_) {
    return {};
  }
}

Future<void> _writeAll(
    SharedPreferences prefs, Map<String, PlanSession> map) async {
  final encoded = jsonEncode(map.map((k, v) => MapEntry(k, v.toJson())));
  await userPrefSetString(prefs, _sessionKey, encoded);
}

String _key(String planId, int day) => '$planId:$day';

Future<PlanSession?> getPlanSession(
    SharedPreferences prefs, String planId, int day) async {
  final all = await _readAll(prefs);
  return all[_key(planId, day)];
}

Future<void> savePlanSession(
    SharedPreferences prefs, PlanSession session) async {
  final all = await _readAll(prefs);
  all[_key(session.planId, session.day)] =
      session.copyWith(updatedAtMs: DateTime.now().millisecondsSinceEpoch);
  await _writeAll(prefs, all);
}

Future<void> clearPlanSession(
    SharedPreferences prefs, String planId, int day) async {
  final all = await _readAll(prefs);
  all.remove(_key(planId, day));
  await _writeAll(prefs, all);
}

Future<PlanSession> startPlanSession(SharedPreferences prefs, String planId,
    int day, List<PlanStep> steps) async {
  final existing = await getPlanSession(prefs, planId, day);
  if (existing != null) return existing;
  final session = PlanSession(
    planId: planId,
    day: day,
    currentStepIndex: 0,
    stepsDone: [],
    updatedAtMs: DateTime.now().millisecondsSinceEpoch,
  );
  await savePlanSession(prefs, session);
  return session;
}

Future<PlanSession> markStepDone(SharedPreferences prefs, PlanSession session,
    String stepId, List<PlanStep> steps) async {
  final stepsDone = session.stepsDone.contains(stepId)
      ? session.stepsDone
      : [...session.stepsDone, stepId];
  final next = steps.where((s) => !stepsDone.contains(s.id)).firstOrNull;
  final nextIndex = next != null
      ? steps.indexWhere((s) => s.id == next.id)
      : steps.length - 1;
  final updated = session.copyWith(
    stepsDone: stepsDone,
    currentStepIndex: nextIndex.clamp(0, steps.length - 1),
    updatedAtMs: DateTime.now().millisecondsSinceEpoch,
  );
  await savePlanSession(prefs, updated);
  return updated;
}

Future<PlanSession> applyRemoteSession(SharedPreferences prefs, String planId,
    int day, Map<String, dynamic> raw) async {
  final session = PlanSession(
    planId: planId,
    day: day,
    currentStepIndex: (raw['currentStepIndex'] ?? 0) as int,
    stepsDone: ((raw['stepsDone'] ?? []) as List).cast<String>(),
    lastRef: raw['lastRef'] as String?,
    updatedAtMs: (raw['updatedAt'] ?? DateTime.now().millisecondsSinceEpoch) as int,
  );
  await savePlanSession(prefs, session);
  return session;
}

PlanSession updateSessionRef(PlanSession session, String ref) =>
    session.copyWith(
      lastRef: ref,
      updatedAtMs: DateTime.now().millisecondsSinceEpoch,
    );
