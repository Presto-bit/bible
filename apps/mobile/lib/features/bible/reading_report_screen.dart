/// 读经回顾：日历式回顾（日/周/月/年 + 日期切换）+ 常读卷/章/金句（可跳转）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/theme.dart';
import 'bible_repository.dart';
import 'models.dart';
import 'reader_screen.dart' show readerJumpProvider;
import 'reading_repository.dart';

enum _Mode { day, week, month, year }

class _Cell {
  _Cell({
    required this.label,
    this.sub,
    required this.start,
    required this.end,
    required this.minutes,
    this.blank = false,
  });
  final String label;
  final String? sub;
  final int start;
  final int end;
  final int minutes;
  final bool blank;
}

class ReadingReportScreen extends ConsumerStatefulWidget {
  const ReadingReportScreen({super.key});

  @override
  ConsumerState<ReadingReportScreen> createState() =>
      _ReadingReportScreenState();
}

class _ReadingReportScreenState extends ConsumerState<ReadingReportScreen> {
  _Mode _mode = _Mode.day;
  DateTime _cursor = DateTime.now();
  ({int start, int end, String label})? _sel;

  int _startOfDay(DateTime d) => DateTime(d.year, d.month, d.day).millisecondsSinceEpoch;

  ({String label, List<_Cell> cells}) _grid(ReviewData data) {
    final c = _cursor;
    if (_mode == _Mode.day) {
      final y = c.year, mo = c.month;
      final first = DateTime(y, mo, 1);
      final daysInMonth = DateTime(y, mo + 1, 0).day;
      final lead = first.weekday % 7; // 周日=0
      final cells = <_Cell>[];
      for (var i = 0; i < lead; i++) {
        cells.add(_Cell(label: '', start: 0, end: 0, minutes: 0, blank: true));
      }
      for (var d = 1; d <= daysInMonth; d++) {
        final s = DateTime(y, mo, d).millisecondsSinceEpoch;
        final e = DateTime(y, mo, d + 1).millisecondsSinceEpoch;
        cells.add(_Cell(label: '$d', start: s, end: e, minutes: data.minutesIn(s, e)));
      }
      return (label: '$y 年 $mo 月', cells: cells);
    }
    if (_mode == _Mode.week) {
      final y = c.year, mo = c.month;
      final first = DateTime(y, mo, 1);
      final daysInMonth = DateTime(y, mo + 1, 0).day;
      final cells = <_Cell>[];
      var weekStart = DateTime(y, mo, 1 - (first.weekday % 7));
      var idx = 1;
      final monthEnd = DateTime(y, mo, daysInMonth + 1);
      while (weekStart.isBefore(monthEnd)) {
        final s = _startOfDay(weekStart);
        final we = weekStart.add(const Duration(days: 7));
        final e = _startOfDay(we);
        final ed = we.subtract(const Duration(days: 1));
        cells.add(_Cell(
          label: '第$idx周',
          sub: '${weekStart.month}/${weekStart.day}–${ed.month}/${ed.day}',
          start: s,
          end: e,
          minutes: data.minutesIn(s, e),
        ));
        weekStart = we;
        idx++;
      }
      return (label: '$y 年 $mo 月', cells: cells);
    }
    if (_mode == _Mode.month) {
      final y = c.year;
      final cells = <_Cell>[];
      for (var mo = 1; mo <= 12; mo++) {
        final s = DateTime(y, mo, 1).millisecondsSinceEpoch;
        final e = DateTime(y, mo + 1, 1).millisecondsSinceEpoch;
        cells.add(_Cell(label: '$mo月', start: s, end: e, minutes: data.minutesIn(s, e)));
      }
      return (label: '$y 年', cells: cells);
    }
    // year：不做筛选，固定显示「注册年（首个活动年）→ 当年」。
    final endY = DateTime.now().year;
    final startY = data.firstYear() <= endY ? data.firstYear() : endY;
    final cells = <_Cell>[];
    for (var y = startY; y <= endY; y++) {
      final s = DateTime(y, 1, 1).millisecondsSinceEpoch;
      final e = DateTime(y + 1, 1, 1).millisecondsSinceEpoch;
      cells.add(_Cell(label: '$y', start: s, end: e, minutes: data.minutesIn(s, e)));
    }
    return (label: startY == endY ? '$endY' : '$startY–$endY', cells: cells);
  }

  void _move(int dir) {
    setState(() {
      if (_mode == _Mode.day || _mode == _Mode.week) {
        _cursor = DateTime(_cursor.year, _cursor.month + dir, 1);
      } else if (_mode == _Mode.month) {
        _cursor = DateTime(_cursor.year + dir, _cursor.month, 1);
      } else {
        _cursor = DateTime(_cursor.year + dir * 8, _cursor.month, 1);
      }
      _sel = null;
    });
  }

  void _go(String bookId, int chapter) {
    ref.read(readerJumpProvider.notifier).jump(bookId, chapter);
    ref.read(navIndexProvider.notifier).set(1);
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final reviewAsync = ref.watch(reviewDataProvider);
    final booksAsync = ref.watch(booksProvider);
    final names = <String, String>{
      for (final b in (booksAsync.value ?? const <BibleBook>[])) b.id: b.name,
    };

    return Scaffold(
      appBar: AppBar(title: const Text('读经回顾')),
      body: reviewAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (data) {
          final grid = _grid(data);
          final cells = grid.cells;
          final realCells = cells.where((c) => !c.blank).toList();
          final windowStart = realCells.isEmpty ? _startOfDay(DateTime.now()) : realCells.first.start;
          final windowEnd = realCells.isEmpty
              ? DateTime.now().millisecondsSinceEpoch
              : realCells.last.end;
          final statStart = _sel?.start ?? windowStart;
          final statEnd = _sel?.end ?? windowEnd;
          final statLabel = _sel?.label ?? grid.label;
          final stats = data.rangeStats(statStart, statEnd);
          final maxMin = cells.fold<int>(1, (m, c) => c.minutes > m ? c.minutes : m);
          final isCalendar = _mode == _Mode.day;
          final cols = _mode == _Mode.day ? 7 : (_mode == _Mode.week ? 3 : 4);

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _ModeTabs(
                mode: _mode,
                onChanged: (m) => setState(() {
                  _mode = m;
                  _sel = null;
                }),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_mode != _Mode.year)
                    IconButton(
                        onPressed: () => _move(-1),
                        icon: const Icon(Icons.chevron_left)),
                  Text(grid.label,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  if (_mode != _Mode.year)
                    IconButton(
                        onPressed: () => _move(1),
                        icon: const Icon(Icons.chevron_right)),
                ],
              ),
              const SizedBox(height: 8),
              if (isCalendar)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: ['日', '一', '二', '三', '四', '五', '六']
                        .map((d) => Expanded(
                              child: Center(
                                child: Text(d,
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: AppColors.inkFaint)),
                              ),
                            ))
                        .toList(),
                  ),
                ),
              GridView.count(
                crossAxisCount: cols,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 6,
                crossAxisSpacing: 6,
                childAspectRatio: isCalendar ? 1 : 1.5,
                children: cells.map((c) {
                  if (c.blank) return const SizedBox.shrink();
                  final active = _sel?.start == c.start;
                  final intensity =
                      c.minutes > 0 ? (0.18 + 0.82 * (c.minutes / maxMin)) : 0.0;
                  return GestureDetector(
                    onTap: () => setState(() {
                      _sel = active
                          ? null
                          : (
                              start: c.start,
                              end: c.end,
                              label: c.sub != null ? '${c.label} ${c.sub}' : c.label
                            );
                    }),
                    child: Container(
                      decoration: BoxDecoration(
                        color: c.minutes > 0
                            ? AppColors.accentDeep.withValues(alpha: intensity)
                            : AppColors.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                            color: active ? AppColors.accentDeep : AppColors.line,
                            width: active ? 2 : 1),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(c.label,
                              style: const TextStyle(
                                  fontSize: 13, fontWeight: FontWeight.w600)),
                          if (c.sub != null)
                            Text(c.sub!,
                                style: const TextStyle(
                                    fontSize: 10, color: AppColors.inkFaint)),
                          if (c.minutes > 0)
                            Text('${c.minutes}′',
                                style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.accentDeep)),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _Tile(value: '${stats.minutes}', unit: '分钟', label: '阅读时长'),
                  const SizedBox(width: 10),
                  _Tile(value: '${stats.days}', unit: '天', label: '阅读天数'),
                  const SizedBox(width: 10),
                  _Tile(value: '${stats.chapters}', unit: '章', label: '完成章节'),
                ],
              ),
              const SizedBox(height: 8),
              Text('当前统计：$statLabel',
                  style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
              const SizedBox(height: 20),
              _RankSection(
                title: '常读的卷',
                empty: '该时段暂无记录',
                items: stats.topBooks,
                labelOf: (k) => names[k] ?? k,
                onTap: (k) => _go(k, 1),
                twoColumn: true,
              ),
              _RankSection(
                title: '常读的章',
                empty: '该时段暂无记录',
                items: stats.topChapters,
                labelOf: (k) {
                  final p = k.split('.');
                  return '${names[p[0]] ?? p[0]} ${p[1]}';
                },
                onTap: (k) {
                  final p = k.split('.');
                  _go(p[0], int.tryParse(p[1]) ?? 1);
                },
                twoColumn: true,
              ),
              _VerseRankList(
                items: stats.topVerses,
                names: names,
                onTap: (b, c) => _go(b, c),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ModeTabs extends StatelessWidget {
  const _ModeTabs({required this.mode, required this.onChanged});
  final _Mode mode;
  final ValueChanged<_Mode> onChanged;

  @override
  Widget build(BuildContext context) {
    const labels = {
      _Mode.day: '日',
      _Mode.week: '周',
      _Mode.month: '月',
      _Mode.year: '年',
    };
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceSunken,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: _Mode.values.map((m) {
          final active = m == mode;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(m),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: active ? AppColors.surface : Colors.transparent,
                  borderRadius: BorderRadius.circular(9),
                  border: active
                      ? Border.all(color: AppColors.accent)
                      : null,
                ),
                child: Center(
                  child: Text(labels[m]!,
                      style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: active
                              ? AppColors.accentDeep
                              : AppColors.inkSoft)),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

/// 常读金句：直接展示经文内容。
class _VerseRankList extends ConsumerWidget {
  const _VerseRankList({
    required this.items,
    required this.names,
    required this.onTap,
  });
  final List<RankItem> items;
  final Map<String, String> names;
  final void Function(String book, int chapter) onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 4, bottom: 8),
          child: Text('常读的金句',
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
        ),
        if (items.isEmpty)
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: Text('阅读时点选经文即可记录金句',
                style: TextStyle(color: AppColors.inkFaint, fontSize: 13)),
          )
        else
          ...items.asMap().entries.map((entry) {
            final i = entry.key;
            final it = entry.value;
            final p = it.key.split('.');
            final bid = p[0];
            final ch = int.tryParse(p.length > 1 ? p[1] : '1') ?? 1;
            final vs = p.length > 2 ? int.tryParse(p[2]) : null;
            final chapAsync = ref.watch(chapterProvider((book: bid, chapter: ch)));
            final verseText = chapAsync.maybeWhen(
              data: (c) {
                if (vs == null) return '';
                for (final v in c.verses) {
                  if (v.verse == vs) return v.text;
                }
                return '';
              },
              orElse: () => '',
            );
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: InkWell(
                onTap: () => onTap(bid, ch),
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.surface, AppColors.accentWash],
                    ),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                          color: AppColors.accentDeep,
                          shape: BoxShape.circle,
                        ),
                        child: Text('#${i + 1}',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '${names[bid] ?? bid} ${p.length > 1 ? p[1] : ''}${vs != null ? ':$vs' : ''}',
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.accentDeep),
                                  ),
                                ),
                                Text('${it.count} 次',
                                    style: const TextStyle(
                                        color: AppColors.inkFaint,
                                        fontSize: 11)),
                              ],
                            ),
                            if (verseText.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Text('「$verseText」',
                                  style: const TextStyle(
                                      fontSize: 15,
                                      height: 1.7,
                                      fontStyle: FontStyle.italic,
                                      color: AppColors.ink)),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _RankSection extends StatelessWidget {
  const _RankSection({
    required this.title,
    required this.empty,
    required this.items,
    required this.labelOf,
    required this.onTap,
    this.twoColumn = false,
  });
  final String title;
  final String empty;
  final List<RankItem> items;
  final String Function(String key) labelOf;
  final void Function(String key) onTap;
  // 常读卷/章：一行 2 列，最多 2 个。
  final bool twoColumn;

  Widget _row(RankItem it) => InkWell(
        onTap: () => onTap(it.key),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(labelOf(it.key),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14, color: AppColors.ink)),
              ),
              Text('${it.count} 次 ›',
                  style: const TextStyle(
                      color: AppColors.inkFaint, fontSize: 12)),
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final shown = twoColumn ? items.take(2).toList() : items;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 8),
          child: Text(title,
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
        ),
        if (shown.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(empty,
                style: const TextStyle(color: AppColors.inkFaint, fontSize: 13)),
          )
        else if (twoColumn)
          Row(
            children: [
              for (var i = 0; i < 2; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: i < shown.length
                      ? _row(shown[i])
                      : const SizedBox.shrink(),
                ),
              ],
            ],
          )
        else
          ...shown.map((it) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _row(it),
              )),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.value, required this.unit, required this.label});
  final String value;
  final String unit;
  final String label;
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
        decoration: BoxDecoration(
          color: AppColors.accentWash,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            RichText(
              textAlign: TextAlign.center,
              text: TextSpan(
                text: value,
                style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: AppColors.accentDeep),
                children: [
                  TextSpan(
                      text: ' $unit',
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: AppColors.inkSoft)),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Text(label,
                style: const TextStyle(color: AppColors.inkSoft, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
