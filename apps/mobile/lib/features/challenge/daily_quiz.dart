/// 每日问答 / 随机 / 错题（与 Web daily_quiz + question_bank 对齐）。
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/user_storage.dart';

class QuestionBankEntry {
  QuestionBankEntry({
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

  factory QuestionBankEntry.fromJson(Map<String, dynamic> j) => QuestionBankEntry(
        id: (j['id'] ?? '') as String,
        category: (j['category'] ?? '') as String,
        question: (j['question'] ?? '') as String,
        options: ((j['options'] ?? []) as List).map((e) => '$e').toList(),
        answer: (j['answer'] as num?)?.toInt() ?? 0,
        explain: (j['explain'] ?? '') as String,
        ref: j['ref'] as String?,
      );
}

const _historyKey = 'presto_q_answer_history';
const _dailyKey = 'presto_daily_quiz_day';

List<QuestionBankEntry>? _cachedBank;

Future<List<QuestionBankEntry>> loadQuestionBank() async {
  if (_cachedBank != null) return _cachedBank!;
  final raw = await rootBundle.loadString('assets/question_bank.json');
  final list = jsonDecode(raw) as List;
  _cachedBank = list
      .map((e) => QuestionBankEntry.fromJson(e as Map<String, dynamic>))
      .toList();
  return _cachedBank!;
}

String _ymd([DateTime? d]) {
  final x = d ?? DateTime.now();
  return '${x.year}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
}

Map<String, ({bool correct, String at})> readHistory(SharedPreferences prefs) {
  final raw = userPrefGetString(prefs, _historyKey);
  if (raw == null || raw.isEmpty) return {};
  try {
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    return decoded.map(
      (k, v) => MapEntry(
        k,
        (
          correct: (v as Map)['correct'] as bool? ?? false,
          at: '${v['at']}',
        ),
      ),
    );
  } catch (_) {
    return {};
  }
}

Future<void> recordAnswer(
  SharedPreferences prefs,
  String questionId,
  bool correct,
) async {
  final h = readHistory(prefs);
  h[questionId] = (correct: correct, at: _ymd());
  await userPrefSetString(prefs, _historyKey,
    jsonEncode(h.map((k, v) => MapEntry(k, {'correct': v.correct, 'at': v.at}))),
  );
}

({int correct, int wrong, int total, int accuracyPct}) answerStats(
  SharedPreferences prefs,
) {
  final h = readHistory(prefs);
  var correct = 0;
  var wrong = 0;
  for (final v in h.values) {
    if (v.correct) {
      correct++;
    } else {
      wrong++;
    }
  }
  final total = correct + wrong;
  final accuracyPct = total > 0 ? ((correct / total) * 100).round() : 0;
  return (correct: correct, wrong: wrong, total: total, accuracyPct: accuracyPct);
}

List<String> wrongQuestionIds(SharedPreferences prefs) {
  return readHistory(prefs)
      .entries
      .where((e) => !e.value.correct)
      .map((e) => e.key)
      .toList();
}

List<T> _seededShuffle<T>(List<T> items, String seed) {
  final rng = Random(seed.hashCode);
  final copy = [...items]..shuffle(rng);
  return copy;
}

Future<List<QuestionBankEntry>> dailyQuizQuestions(
  SharedPreferences prefs, {
  int count = 5,
}) async {
  final bank = await loadQuestionBank();
  final today = _ymd();
  final cached = userPrefGetString(prefs, _dailyKey);
  if (cached != null && cached.isNotEmpty) {
    try {
      final parsed = jsonDecode(cached) as Map<String, dynamic>;
      if (parsed['day'] == today) {
        final ids = (parsed['ids'] as List).cast<String>();
        if (ids.length == count) {
          final map = {for (final q in bank) q.id: q};
          final qs = ids.map((id) => map[id]).whereType<QuestionBankEntry>().toList();
          if (qs.length == count) return qs;
        }
      }
    } catch (_) {}
  }

  final history = readHistory(prefs);
  final unseenOrWrong = bank.where((q) {
    final r = history[q.id];
    return r == null || !r.correct;
  }).toList();
  final wrongFirst = [
    ...unseenOrWrong.where((q) => history[q.id] != null && !history[q.id]!.correct),
    ...unseenOrWrong.where((q) => history[q.id] == null),
  ];
  var picked = _seededShuffle(wrongFirst, today).take(count).toList();
  if (picked.length < count) {
    final used = picked.map((q) => q.id).toSet();
    final rest = _seededShuffle(
      bank.where((q) => !used.contains(q.id)).toList(),
      '$today-fill',
    );
    picked = [...picked, ...rest.take(count - picked.length)];
  }
  await userPrefSetString(prefs, _dailyKey,
    jsonEncode({'day': today, 'ids': picked.map((q) => q.id).toList()}),
  );
  return picked;
}

Future<List<QuestionBankEntry>> randomQuizQuestions({int count = 10}) async {
  final bank = await loadQuestionBank();
  return _seededShuffle(bank, DateTime.now().millisecondsSinceEpoch.toString())
      .take(count)
      .toList();
}

Future<List<QuestionBankEntry>> wrongReviewQuestions(SharedPreferences prefs) async {
  final bank = await loadQuestionBank();
  final wrong = wrongQuestionIds(prefs).toSet();
  return bank.where((q) => wrong.contains(q.id)).toList();
}

Future<List<QuestionBankEntry>> themeQuestions(String theme) async {
  final bank = await loadQuestionBank();
  return bank.where((q) => q.category == theme).toList();
}

List<String> questionThemes(List<QuestionBankEntry> bank) {
  final seen = <String>{};
  final out = <String>[];
  for (final q in bank) {
    if (seen.add(q.category)) out.add(q.category);
  }
  return out;
}
