import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

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
    final raw = prefs.getString(_key);
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
