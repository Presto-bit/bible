/// 月/年度读经回顾（对齐 Web wrapped.ts）。
library;

import '../../core/gamification.dart';
import 'reading_repository.dart';

class WrappedStats {
  WrappedStats({
    required this.period,
    required this.label,
    required this.totalMinutes,
    required this.activeDays,
    required this.streak,
    required this.notesCount,
    required this.favoritesCount,
    required this.marksCount,
    required this.chapters,
    required this.highlight,
  });

  final String period; // month | year
  final String label;
  final int totalMinutes;
  final int activeDays;
  final int streak;
  final int notesCount;
  final int favoritesCount;
  final int marksCount;
  final int chapters;
  final String highlight;
}

({int start, int end, String label}) _periodRange(String period) {
  final now = DateTime.now();
  if (period == 'year') {
    final start = DateTime(now.year, 1, 1);
    final end = DateTime(now.year + 1, 1, 1);
    return (start: start.millisecondsSinceEpoch, end: end.millisecondsSinceEpoch, label: '${now.year} 年度回顾');
  }
  final start = DateTime(now.year, now.month, 1);
  final end = DateTime(now.year, now.month + 1, 1);
  return (
    start: start.millisecondsSinceEpoch,
    end: end.millisecondsSinceEpoch,
    label: '${now.year} 年 ${now.month} 月回顾',
  );
}

WrappedStats buildWrapped({
  required ReviewData review,
  required String period,
  required int notesCount,
  required int favoritesCount,
  required int marksCount,
}) {
  final range = _periodRange(period);
  final stats = review.rangeStats(range.start, range.end);
  final streak = readingStreak(review);
  final highlight = marksCount >= 50
      ? '你标记了 $marksCount 处经文，记忆深刻'
      : stats.days >= 20
          ? '你是持之以恒的读经伙伴'
          : stats.days >= 7
              ? '这个月你留下了稳定的足迹'
              : stats.chapters > 0
                  ? '读了 ${stats.chapters} 章，每一步都算数'
                  : '新的开始，从一节经文就好';

  return WrappedStats(
    period: period,
    label: range.label,
    totalMinutes: stats.minutes,
    activeDays: stats.days,
    streak: streak,
    notesCount: notesCount,
    favoritesCount: favoritesCount,
    marksCount: marksCount,
    chapters: stats.chapters,
    highlight: highlight,
  );
}

String wrappedShareText(WrappedStats s) {
  final buf = StringBuffer('${s.label}\n');
  buf.writeln('活跃 $s.activeDays 天 · 读经 ${s.totalMinutes} 分钟');
  if (s.streak > 0) buf.writeln('连续读经 ${s.streak} 天');
  if (s.notesCount > 0) buf.writeln('笔记 ${s.notesCount} 条');
  if (s.favoritesCount > 0) buf.writeln('收藏 ${s.favoritesCount} 处');
  if (s.marksCount > 0) buf.writeln('划线 ${s.marksCount} 处');
  buf.writeln(s.highlight);
  buf.write('\n— PrestoAI 读经');
  return buf.toString();
}
