/// 游戏化：连续打卡、知识卡、节期活动、小爱闯关（本地优先）。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/bible/bible_repository.dart';
import '../features/bible/reading_repository.dart';
import 'api_client.dart';
import 'user_storage.dart';

export 'badge_eval.dart' show BadgeDef, profilePreviewBadges;
export 'badge_engine.dart' show badgesProvider, badgeCatalogProvider;

const _quizKey = 'presto_quiz_progress';
const _aiQuizKey = 'presto_ai_quiz_progress';

class QuizCard {
  QuizCard({
    required this.id,
    required this.category,
    required this.question,
    required this.options,
    required this.answer,
    required this.explain,
    this.ref,
  });

  final String id;
  final String category;
  final String question;
  final List<String> options;
  final int answer;
  final String explain;
  final String? ref;
}

class AiQuizLevel {
  AiQuizLevel({
    required this.id,
    required this.title,
    required this.ref,
    required this.questions,
  });

  final String id;
  final String title;
  final String ref;
  final List<({String q, List<String> options, int answer})> questions;
}

class SeasonalEvent {
  SeasonalEvent({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.theme,
    required this.href,
    this.badge,
  });

  final String id;
  final String title;
  final String subtitle;
  final String theme;
  final String href;
  final String? badge;
}

String _ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

bool _activeDay(ReviewData data, String date) {
  final mins = data.minutesByDay[date] ?? 0;
  final ch = data.chaptersByDay[date] ?? 0;
  return mins > 0 || ch > 0;
}

int readingStreak(ReviewData data) {
  var d = DateTime.now();
  var streak = 0;
  if (!_activeDay(data, _ymd(d))) {
    d = d.subtract(const Duration(days: 1));
  }
  for (var i = 0; i < 400; i++) {
    if (!_activeDay(data, _ymd(d))) break;
    streak++;
    d = d.subtract(const Duration(days: 1));
  }
  return streak;
}

final quizCards = <QuizCard>[
  QuizCard(
    id: 'q1',
    category: '经文识记',
    question: '「神爱世人」出自哪卷书？',
    options: ['约翰福音', '罗马书', '诗篇', '创世记'],
    answer: 0,
    explain: '约翰福音 3:16 是福音核心经句。',
    ref: 'JHN.3.16',
  ),
  QuizCard(
    id: 'q2',
    category: '人物',
    question: '谁建造方舟？',
    options: ['亚伯拉罕', '挪亚', '摩西', '大卫'],
    answer: 1,
    explain: '挪亚照神吩咐建造方舟（创 6–9）。',
    ref: 'GEN.6.14',
  ),
  QuizCard(
    id: 'q3',
    category: '地理',
    question: '耶稣在哪个城市诞生？',
    options: ['耶路撒冷', '伯利恒', '拿撒勒', '迦百农'],
    answer: 1,
    explain: '弥迦书预言，耶稣生于伯利恒。',
    ref: 'MAT.2.1',
  ),
  QuizCard(
    id: 'q4',
    category: '经文识记',
    question: '「耶和华是我的牧者」出自？',
    options: ['诗篇 23', '箴言 3', '以赛亚 40', '约翰福音 10'],
    answer: 0,
    explain: '诗篇 23 篇开头。',
    ref: 'PSA.23.1',
  ),
  QuizCard(
    id: 'q5',
    category: '应用',
    question: '「爱人如己」出现在哪段教导中？',
    options: ['十诫', '登山宝训', '使徒行传', '启示录'],
    answer: 1,
    explain: '耶稣在登山宝训中总结律法和先知。',
    ref: 'MAT.22.39',
  ),
  QuizCard(
    id: 'q6',
    category: '人物',
    question: '谁写下大部分新约书信？',
    options: ['彼得', '保罗', '约翰', '雅各'],
    answer: 1,
    explain: '保罗写了罗马书至腓利门等多卷书信。',
    ref: 'ROM.1.1',
  ),
];

final aiQuizLevels = <AiQuizLevel>[
  AiQuizLevel(
    id: 'jhn3',
    title: '约翰福音 3 章',
    ref: 'JHN.3',
    questions: [
      (
        q: '「重生」在本章主要指什么？',
        options: ['从母腹再生', '从圣灵生', '遵守律法', '受割礼'],
        answer: 1,
      ),
      (
        q: '神赐下儿子的目的是？',
        options: ['审判世界', '叫世人灭亡', '叫世人因祂得救', '建立国度'],
        answer: 2,
      ),
    ],
  ),
  AiQuizLevel(
    id: 'psa23',
    title: '诗篇 23 篇',
    ref: 'PSA.23',
    questions: [
      (
        q: '「牧者」在本诗象征什么？',
        options: ['君王', '耶和华看顾', '大卫自己', '祭司'],
        answer: 1,
      ),
      (
        q: '「我虽然行过死荫的幽谷」表达？',
        options: ['绝望', '神同在的安慰', '惩罚', '迷路'],
        answer: 1,
      ),
    ],
  ),
];

Map<String, bool> quizProgress(SharedPreferences prefs) {
  try {
    final raw = jsonDecode(userPrefGetString(prefs, _quizKey) ?? '{}') as Map;
    return raw.map((k, v) => MapEntry('$k', v == true));
  } catch (_) {
    return {};
  }
}

void markQuizCorrect(SharedPreferences prefs, String id) {
  final p = quizProgress(prefs);
  p[id] = true;
  userPrefSetString(prefs, _quizKey, jsonEncode(p));
}

void markAiQuizWin(SharedPreferences prefs, String id) {
  final raw = jsonDecode(userPrefGetString(prefs, _aiQuizKey) ?? '{}') as Map;
  raw[id] = true;
  userPrefSetString(prefs, _aiQuizKey, jsonEncode(raw));
}

List<SeasonalEvent> currentSeasonalEvents() {
  final m = DateTime.now().month;
  final events = <SeasonalEvent>[];
  if (m == 12 || m == 1) {
    events.add(SeasonalEvent(
      id: 'advent',
      title: '圣诞季 · 道成肉身',
      subtitle: '12月–1月专题读经',
      theme: '降生',
      href: '/reader?book=MAT&chapter=2',
      badge: '圣诞',
    ));
  }
  if (m >= 3 && m <= 4) {
    events.add(SeasonalEvent(
      id: 'easter',
      title: '复活节 · 胜过死亡',
      subtitle: '受难周与复活专题',
      theme: '复活',
      href: '/reader?book=MRK&chapter=16',
      badge: '复活节',
    ));
  }
  if (m == 9) {
    events.add(SeasonalEvent(
      id: 'autumn',
      title: '秋收感恩',
      subtitle: '数算恩典专题',
      theme: '感恩',
      href: '/reader?book=PSA&chapter=100',
      badge: '感恩',
    ));
  }
  return events;
}

const _pendingBookKey = 'presto_pending_book_challenge';
const _pushedBooksKey = 'presto_book_challenge_pushed';

/// 读完某卷后弱推送知识挑战（每卷仅一次）。
void maybeNotifyBookComplete(
  SharedPreferences prefs,
  String bookId,
  String bookName,
  int chapterCount,
) {
  if (chapterCount <= 0) return;
  final events = <Map<String, dynamic>>[];
  final raw = userPrefGetString(prefs, 'read_chapter_events');
  if (raw != null && raw.isNotEmpty) {
    try {
      events.addAll((jsonDecode(raw) as List).cast<Map<String, dynamic>>());
    } catch (_) {}
  }
  final reads = events.where((e) => e['book'] == bookId.toUpperCase()).length;
  if (reads < chapterCount) return;
  final pushed = <String>{};
  final pr = userPrefGetString(prefs, _pushedBooksKey);
  if (pr != null) {
    try {
      pushed.addAll((jsonDecode(pr) as List).cast<String>());
    } catch (_) {}
  }
  final id = bookId.toUpperCase();
  if (pushed.contains(id)) return;
  pushed.add(id);
  userPrefSetString(prefs, _pushedBooksKey, jsonEncode(pushed.toList()));
  userPrefSetString(prefs, _pendingBookKey,
    jsonEncode({'bookId': id, 'bookName': bookName, 'levelId': 'book-$id'}),
  );
}

Map<String, String>? getPendingBookChallenge(SharedPreferences prefs) {
  final raw = userPrefGetString(prefs, _pendingBookKey);
  if (raw == null) return null;
  try {
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return {
      'bookId': '${m['bookId']}',
      'bookName': '${m['bookName']}',
      'levelId': '${m['levelId']}',
    };
  } catch (_) {
    return null;
  }
}

void clearPendingBookChallenge(SharedPreferences prefs) {
  userPrefRemove(prefs, _pendingBookKey);
}
