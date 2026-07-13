/// 闯关进度与读完卷弱推送。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'challenge_levels.dart';
import '../../core/user_storage.dart';

const _levelProgressKey = 'presto_challenge_level_progress';
const _pendingBookKey = 'presto_pending_book_challenge';
const _pushedBooksKey = 'presto_book_challenge_pushed';
const _legacyQuizKey = 'presto_quiz_progress';

class LevelProgressEntry {
  const LevelProgressEntry({
    required this.done,
    required this.correct,
    required this.total,
  });

  final bool done;
  final int correct;
  final int total;

  Map<String, dynamic> toJson() => {
        'done': done,
        'correct': correct,
        'total': total,
      };

  factory LevelProgressEntry.fromJson(Map<String, dynamic> json) =>
      LevelProgressEntry(
        done: json['done'] == true,
        correct: (json['correct'] as num?)?.toInt() ?? 0,
        total: (json['total'] as num?)?.toInt() ?? 0,
      );
}

typedef LevelProgress = Map<String, LevelProgressEntry>;

LevelProgress levelProgress(SharedPreferences prefs) {
  try {
    final raw = userPrefGetString(prefs, _levelProgressKey);
    if (raw == null || raw.isEmpty) return {};
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    return decoded.map(
      (k, v) => MapEntry(
        k,
        LevelProgressEntry.fromJson(v as Map<String, dynamic>),
      ),
    );
  } catch (_) {
    return {};
  }
}

void markLevelProgress(
  SharedPreferences prefs,
  String levelId,
  int correct,
  int total,
) {
  final p = levelProgress(prefs);
  final entry = LevelProgressEntry(
    done: correct >= (total * 0.6).ceil(),
    correct: correct,
    total: total,
  );
  p[levelId] = entry;
  userPrefSetString(prefs, _levelProgressKey,
    jsonEncode(p.map((k, v) => MapEntry(k, v.toJson()))),
  );

  // 同步旧 quiz key 兼容徽章
  try {
    final legacyRaw = userPrefGetString(prefs, _legacyQuizKey) ?? '{}';
    final legacy = Map<String, dynamic>.from(jsonDecode(legacyRaw) as Map);
    legacy[levelId] = entry.done;
    userPrefSetString(prefs, _legacyQuizKey, jsonEncode(legacy));
  } catch (_) {}
}

class ChallengeSummary {
  const ChallengeSummary({
    required this.completedLevels,
    required this.totalLevels,
    required this.totalQ,
    required this.correctQ,
    required this.nextLevel,
    required this.progressPct,
  });

  final int completedLevels;
  final int totalLevels;
  final int totalQ;
  final int correctQ;
  final ChallengeLevel? nextLevel;
  final int progressPct;
}

ChallengeSummary challengeSummary(
  SharedPreferences prefs, [
  List<ChallengeLevel>? levels,
]) {
  final lv = levels ?? allChallengeLevels();
  final prog = levelProgress(prefs);
  var completedLevels = 0;
  var totalQ = 0;
  var correctQ = 0;
  ChallengeLevel? nextLevel;

  for (final item in lv) {
    final p = prog[item.id];
    totalQ += item.questions.length;
    correctQ += p?.correct ?? 0;
    if (p?.done == true) {
      completedLevels++;
    } else if (nextLevel == null) {
      nextLevel = item;
    }
  }

  return ChallengeSummary(
    completedLevels: completedLevels,
    totalLevels: lv.length,
    totalQ: totalQ,
    correctQ: correctQ,
    nextLevel: nextLevel,
    progressPct: totalQ > 0 ? ((correctQ / totalQ) * 100).round() : 0,
  );
}

class PendingBookChallenge {
  const PendingBookChallenge({
    required this.bookId,
    required this.bookName,
    required this.levelId,
  });

  final String bookId;
  final String bookName;
  final String levelId;

  Map<String, dynamic> toJson() => {
        'bookId': bookId,
        'bookName': bookName,
        'levelId': levelId,
      };

  factory PendingBookChallenge.fromJson(Map<String, dynamic> json) =>
      PendingBookChallenge(
        bookId: '${json['bookId']}',
        bookName: '${json['bookName']}',
        levelId: '${json['levelId']}',
      );
}

PendingBookChallenge? getPendingBookChallenge(SharedPreferences prefs) {
  try {
    final raw = userPrefGetString(prefs, _pendingBookKey);
    if (raw == null || raw.isEmpty) return null;
    return PendingBookChallenge.fromJson(
      jsonDecode(raw) as Map<String, dynamic>,
    );
  } catch (_) {
    return null;
  }
}

void setPendingBookChallenge(
  SharedPreferences prefs,
  String bookId,
  String bookName,
) {
  final pushed = <String>{};
  final pr = userPrefGetString(prefs, _pushedBooksKey);
  if (pr != null && pr.isNotEmpty) {
    try {
      pushed.addAll((jsonDecode(pr) as List).cast<String>());
    } catch (_) {}
  }
  final id = bookId.toUpperCase();
  if (pushed.contains(id)) return;
  pushed.add(id);
  userPrefSetString(prefs, _pushedBooksKey, jsonEncode(pushed.toList()));

  final lv = bookChallengeLevel(bookId, bookName);
  userPrefSetString(prefs, _pendingBookKey,
    jsonEncode(PendingBookChallenge(
      bookId: id,
      bookName: bookName,
      levelId: lv.id,
    ).toJson()),
  );
}

void clearPendingBookChallenge(SharedPreferences prefs) {
  userPrefRemove(prefs, _pendingBookKey);
}

List<ChallengeLevel> levelsIncludingPending(SharedPreferences prefs) {
  final pending = getPendingBookChallenge(prefs);
  final extra = pending != null
      ? [bookChallengeLevel(pending.bookId, pending.bookName)]
      : <ChallengeLevel>[];
  return allChallengeLevels(extra);
}
