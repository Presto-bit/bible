import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'badge_recheck.dart';
import 'user_storage.dart';

/// 成就埋点（与 Web presto_badge_stats 对齐）
class BadgeStats {
  BadgeStats({
    this.crossrefOpen = 0,
    this.strongsOpen = 0,
    this.dictEntities = const [],
    this.mapTours = const [],
    this.timelineTours = const [],
    this.topicIds = const [],
    this.parallelChapters = 0,
    this.xiaoaiQuestions = 0,
    this.citationClicks = 0,
    this.saveAnswerNotes = 0,
    this.shareAnswers = 0,
    this.halfSheetXiaoai = 0,
    this.refScenes = const {},
    this.scenesUsed = const [],
    this.maxFollowupsSession = 0,
    this.nightXiaoai = false,
    this.groupCheckins = 0,
    this.groupCheckinDates = const {},
    this.groupResponses = 0,
    this.groupsCreated = 0,
    this.planSharedGroup = false,
    this.invitesAccepted = 0,
    this.memoryReviews = 0,
    this.wrongRevived = 0,
  });

  final int crossrefOpen;
  final int strongsOpen;
  final List<String> dictEntities;
  final List<String> mapTours;
  final List<String> timelineTours;
  final List<String> topicIds;
  final int parallelChapters;
  final int xiaoaiQuestions;
  final int citationClicks;
  final int saveAnswerNotes;
  final int shareAnswers;
  final int halfSheetXiaoai;
  final Map<String, List<String>> refScenes;
  final List<String> scenesUsed;
  final int maxFollowupsSession;
  final bool nightXiaoai;
  final int groupCheckins;
  final Map<String, List<String>> groupCheckinDates;
  final int groupResponses;
  final int groupsCreated;
  final bool planSharedGroup;
  final int invitesAccepted;
  final int memoryReviews;
  final int wrongRevived;

  static const _key = 'presto_badge_stats';

  static BadgeStats load(SharedPreferences prefs) {
    final raw = userPrefGetString(prefs, _key);
    if (raw == null || raw.isEmpty) return BadgeStats();
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return BadgeStats(
        crossrefOpen: (m['crossref_open'] ?? 0) as int,
        strongsOpen: (m['strongs_open'] ?? 0) as int,
        dictEntities: ((m['dict_entities'] ?? []) as List).cast<String>(),
        mapTours: ((m['map_tours'] ?? []) as List).cast<String>(),
        timelineTours: ((m['timeline_tours'] ?? []) as List).cast<String>(),
        topicIds: ((m['topic_ids'] ?? []) as List).cast<String>(),
        parallelChapters: (m['parallel_chapters'] ?? 0) as int,
        xiaoaiQuestions: (m['xiaoai_questions'] ?? 0) as int,
        citationClicks: (m['citation_clicks'] ?? 0) as int,
        saveAnswerNotes: (m['save_answer_notes'] ?? 0) as int,
        shareAnswers: (m['share_answers'] ?? 0) as int,
        halfSheetXiaoai: (m['half_sheet_xiaoai'] ?? 0) as int,
        refScenes: ((m['ref_scenes'] ?? {}) as Map).map(
          (k, v) => MapEntry('$k', (v as List).cast<String>()),
        ),
        scenesUsed: ((m['scenes_used'] ?? []) as List).cast<String>(),
        maxFollowupsSession: (m['max_followups_session'] ?? 0) as int,
        nightXiaoai: m['night_xiaoai'] == true,
        groupCheckins: (m['group_checkins'] ?? 0) as int,
        groupCheckinDates: ((m['group_checkin_dates'] ?? {}) as Map).map(
          (k, v) => MapEntry('$k', (v as List).cast<String>()),
        ),
        groupResponses: (m['group_responses'] ?? 0) as int,
        groupsCreated: (m['groups_created'] ?? 0) as int,
        planSharedGroup: m['plan_shared_group'] == true,
        invitesAccepted: (m['invites_accepted'] ?? 0) as int,
        memoryReviews: (m['memory_reviews'] ?? 0) as int,
        wrongRevived: (m['wrong_revived'] ?? 0) as int,
      );
    } catch (_) {
      return BadgeStats();
    }
  }
}

int maxGroupCheckinStreak(BadgeStats stats) {
  var best = 0;
  for (final dates in stats.groupCheckinDates.values) {
    if (dates.isEmpty) continue;
    final sorted = [...dates]..sort();
    var streak = 1;
    var localBest = 1;
    for (var i = 1; i < sorted.length; i++) {
      final prev = DateTime.parse('${sorted[i - 1]}T12:00:00');
      final cur = DateTime.parse('${sorted[i]}T12:00:00');
      final diff = cur.difference(prev).inDays;
      if (diff == 1) {
        streak += 1;
        localBest = streak > localBest ? streak : localBest;
      } else if (diff > 1) {
        streak = 1;
      }
    }
    if (localBest > best) best = localBest;
  }
  return best;
}

final badgeStatsRecorderProvider = Provider<BadgeStatsRecorder>(
  (ref) => BadgeStatsRecorder(ref),
);

class BadgeStatsRecorder {
  BadgeStatsRecorder(this._ref);

  final Ref _ref;

  SharedPreferences get _prefs => _ref.read(prefsProvider);

  String _ymd([DateTime? d]) {
    final x = d ?? DateTime.now();
    return '${x.year.toString().padLeft(4, '0')}-'
        '${x.month.toString().padLeft(2, '0')}-'
        '${x.day.toString().padLeft(2, '0')}';
  }

  void _patch(void Function(Map<String, dynamic> s) mutator) {
    Map<String, dynamic> m;
    try {
      m = jsonDecode(userPrefGetString(_prefs, BadgeStats._key) ?? '{}') as Map<String, dynamic>;
    } catch (_) {
      m = {};
    }
    mutator(m);
    userPrefSetString(_prefs, BadgeStats._key, jsonEncode(m));
    _queueRecheck();
  }

  void _queueRecheck() => queueBadgeRecheck(_ref);

  List<String> _uniqueAdd(List<dynamic>? arr, String v) {
    final list = [...?arr?.cast<String>()];
    if (!list.contains(v)) list.add(v);
    return list;
  }

  void recordCrossrefOpen() {
    _patch((s) => s['crossref_open'] = ((s['crossref_open'] ?? 0) as int) + 1);
  }

  void recordStrongsOpen() {
    _patch((s) => s['strongs_open'] = ((s['strongs_open'] ?? 0) as int) + 1);
  }

  void recordDictEntity(String id) {
    if (id.isEmpty) return;
    _patch((s) => s['dict_entities'] = _uniqueAdd(s['dict_entities'] as List?, id));
  }

  void recordMapTour(String id) {
    if (id.isEmpty) return;
    _patch((s) => s['map_tours'] = _uniqueAdd(s['map_tours'] as List?, id));
  }

  void recordTimelineTour(String id) {
    if (id.isEmpty) return;
    _patch((s) => s['timeline_tours'] = _uniqueAdd(s['timeline_tours'] as List?, id));
  }

  void recordTopicVisit(String id) {
    if (id.isEmpty) return;
    _patch((s) => s['topic_ids'] = _uniqueAdd(s['topic_ids'] as List?, id));
  }

  void recordParallelChapter() {
    _patch((s) =>
        s['parallel_chapters'] = ((s['parallel_chapters'] ?? 0) as int) + 1);
  }

  void recordXiaoAiQuestion({String? scene, String? ref}) {
    _patch((s) {
      s['xiaoai_questions'] = ((s['xiaoai_questions'] ?? 0) as int) + 1;
      if (scene != null && scene.isNotEmpty) {
        s['scenes_used'] = _uniqueAdd(s['scenes_used'] as List?, scene);
      }
      if (ref != null && ref.isNotEmpty && scene != null && scene.isNotEmpty) {
        final rs = Map<String, dynamic>.from(s['ref_scenes'] as Map? ?? {});
        final scenes = _uniqueAdd(rs[ref] as List?, scene);
        rs[ref] = scenes;
        s['ref_scenes'] = rs;
      }
      final h = DateTime.now().hour;
      if (h >= 23 || h < 5) s['night_xiaoai'] = true;
    });
  }

  void recordXiaoAiFollowup(int countInSession) {
    _patch((s) {
      final prev = (s['max_followups_session'] ?? 0) as int;
      if (countInSession > prev) s['max_followups_session'] = countInSession;
    });
  }

  void recordCitationClick() {
    _patch((s) => s['citation_clicks'] = ((s['citation_clicks'] ?? 0) as int) + 1);
  }

  void recordSaveAnswerNote() {
    _patch((s) => s['save_answer_notes'] = ((s['save_answer_notes'] ?? 0) as int) + 1);
  }

  void recordShareAnswer() {
    _patch((s) => s['share_answers'] = ((s['share_answers'] ?? 0) as int) + 1);
  }

  void recordHalfSheetXiaoAi() {
    _patch((s) => s['half_sheet_xiaoai'] = ((s['half_sheet_xiaoai'] ?? 0) as int) + 1);
  }

  void recordGroupCheckin({String? groupId}) {
    _patch((s) {
      s['group_checkins'] = ((s['group_checkins'] ?? 0) as int) + 1;
      if (groupId != null && groupId.isNotEmpty) {
        final dates = Map<String, dynamic>.from(
            s['group_checkin_dates'] as Map? ?? {});
        final day = _ymd();
        final list = _uniqueAdd(dates[groupId] as List?, day);
        dates[groupId] = list;
        s['group_checkin_dates'] = dates;
      }
    });
  }

  void recordGroupResponse() {
    _patch((s) => s['group_responses'] = ((s['group_responses'] ?? 0) as int) + 1);
  }

  void recordGroupCreated() {
    _patch((s) => s['groups_created'] = ((s['groups_created'] ?? 0) as int) + 1);
  }

  void recordPlanSharedGroup() {
    _patch((s) => s['plan_shared_group'] = true);
  }

  void recordInviteAccepted() {
    _patch((s) => s['invites_accepted'] = ((s['invites_accepted'] ?? 0) as int) + 1);
  }

  void recordMemoryReview() {
    _patch((s) => s['memory_reviews'] = ((s['memory_reviews'] ?? 0) as int) + 1);
  }

  void recordWrongRevived() {
    _patch((s) => s['wrong_revived'] = ((s['wrong_revived'] ?? 0) as int) + 1);
  }
}
