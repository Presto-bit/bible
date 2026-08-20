/// 月/年度读经回顾（对齐 Web wrapped.ts）。
library;

import '../../core/gamification.dart';
import '../../core/mark_ref.dart';
import '../../core/ref_label.dart';
import 'reading_repository.dart';

enum WrappedSlideKind {
  cover,
  time,
  rhythm,
  scripture,
  book,
  verse,
  quotes,
  marks,
  close,
}

enum WrappedDaypart { morning, afternoon, evening, night }

class WrappedVerseQuote {
  WrappedVerseQuote({required this.ref, required this.label, this.text});
  final String ref;
  final String label;
  final String? text;

  WrappedVerseQuote copyWith({String? text}) =>
      WrappedVerseQuote(ref: ref, label: label, text: text ?? this.text);
}

class WrappedSlide {
  WrappedSlide({
    required this.kind,
    required this.kicker,
    required this.title,
    this.body,
    this.metrics = const [],
    required this.wallpaperDay,
    this.verse,
    this.quotes,
  });

  final WrappedSlideKind kind;
  final String kicker;
  final String title;
  final String? body;
  final List<(String value, String label)> metrics;
  final int wallpaperDay;
  final WrappedVerseQuote? verse;
  final List<WrappedVerseQuote>? quotes;

  WrappedSlide copyWith({
    String? title,
    String? body,
    WrappedVerseQuote? verse,
    List<WrappedVerseQuote>? quotes,
  }) =>
      WrappedSlide(
        kind: kind,
        kicker: kicker,
        title: title ?? this.title,
        body: body ?? this.body,
        metrics: metrics,
        wallpaperDay: wallpaperDay,
        verse: verse ?? this.verse,
        quotes: quotes ?? this.quotes,
      );
}

class WrappedStats {
  WrappedStats({
    required this.period,
    required this.label,
    required this.shortLabel,
    required this.totalMinutes,
    required this.activeDays,
    required this.streak,
    required this.notesCount,
    required this.favoritesCount,
    required this.marksCount,
    required this.chapters,
    required this.highlight,
    required this.slides,
    this.topBookId,
    this.topBookName,
    this.topMarkColorLabel,
    this.yearVerse,
    this.quotes = const [],
    this.daypart,
    this.daypartLabel,
  });

  final String period; // month | year
  final String label;
  final String shortLabel;
  final int totalMinutes;
  final int activeDays;
  final int streak;
  final int notesCount;
  final int favoritesCount;
  final int marksCount;
  final int chapters;
  final String highlight;
  final List<WrappedSlide> slides;
  final String? topBookId;
  final String? topBookName;
  final String? topMarkColorLabel;
  final WrappedVerseQuote? yearVerse;
  final List<WrappedVerseQuote> quotes;
  final WrappedDaypart? daypart;
  final String? daypartLabel;

  WrappedStats copyWith({
    WrappedVerseQuote? yearVerse,
    List<WrappedVerseQuote>? quotes,
    List<WrappedSlide>? slides,
  }) =>
      WrappedStats(
        period: period,
        label: label,
        shortLabel: shortLabel,
        totalMinutes: totalMinutes,
        activeDays: activeDays,
        streak: streak,
        notesCount: notesCount,
        favoritesCount: favoritesCount,
        marksCount: marksCount,
        chapters: chapters,
        highlight: highlight,
        slides: slides ?? this.slides,
        topBookId: topBookId,
        topBookName: topBookName,
        topMarkColorLabel: topMarkColorLabel,
        yearVerse: yearVerse ?? this.yearVerse,
        quotes: quotes ?? this.quotes,
        daypart: daypart,
        daypartLabel: daypartLabel,
      );
}

const _daypartLabel = {
  WrappedDaypart.morning: '清晨',
  WrappedDaypart.afternoon: '白昼',
  WrappedDaypart.evening: '傍晚',
  WrappedDaypart.night: '夜里',
};

const _daypartBody = {
  WrappedDaypart.morning: '你常在晨光里打开话语',
  WrappedDaypart.afternoon: '你在白昼中与话语同行',
  WrappedDaypart.evening: '你常在傍晚停下脚步默想',
  WrappedDaypart.night: '夜里安静时，你仍与话语相遇',
};

const _brandCloseKicker = '彼爱 · 读经回顾';

int bookThemeDay(String? bookId) {
  if (bookId == null || bookId.isEmpty) return 21;
  final id = bookId.toUpperCase();
  if (['PSA', 'JOB', 'PRO', 'ECC', 'SNG', 'LAM'].contains(id)) return 3;
  if (['MAT', 'MRK', 'LUK', 'JHN'].contains(id)) return 12;
  if ([
    'ROM',
    '1CO',
    '2CO',
    'GAL',
    'EPH',
    'PHP',
    'COL',
    'HEB',
    'JAS',
    '1PE',
    '1JN',
  ].contains(id)) {
    return 22;
  }
  if (['GEN', 'EXO', 'JOS', 'RUT', 'EST', 'JON', 'DAN'].contains(id)) {
    return 15;
  }
  if (id == 'REV') return 28;
  return 18;
}

({int start, int end, String label, String shortLabel}) _periodRange(
  String period,
) {
  final now = DateTime.now();
  if (period == 'year') {
    final y = now.year;
    return (
      start: DateTime(y, 1, 1).millisecondsSinceEpoch,
      end: DateTime(y + 1, 1, 1).millisecondsSinceEpoch,
      label: '$y 年度回顾',
      shortLabel: '$y',
    );
  }
  final y = now.year;
  final m = now.month;
  return (
    start: DateTime(y, m, 1).millisecondsSinceEpoch,
    end: DateTime(y, m + 1, 1).millisecondsSinceEpoch,
    label: '$y 年 $m 月回顾',
    shortLabel: '$m 月',
  );
}

String _formatMinutes(int mins) {
  if (mins >= 60) {
    final h = mins ~/ 60;
    final m = mins % 60;
    return m > 0 ? '$h 小时 $m 分' : '$h 小时';
  }
  return '$mins 分钟';
}

WrappedVerseQuote? _quoteFromRef(String ref) {
  final label = refToChineseLabel(ref);
  if (label == null || label.isEmpty) return null;
  return WrappedVerseQuote(ref: ref, label: label);
}

({WrappedDaypart daypart, int count})? _detectDaypart(
  ReviewData review,
  int start,
  int end,
) {
  final buckets = {
    WrappedDaypart.morning: 0,
    WrappedDaypart.afternoon: 0,
    WrappedDaypart.evening: 0,
    WrappedDaypart.night: 0,
  };
  var total = 0;
  for (final e in review.chapterEvents) {
    final ts = (e['ts'] as num?)?.toInt();
    if (ts == null || ts < start || ts >= end) continue;
    total += 1;
    final h = DateTime.fromMillisecondsSinceEpoch(ts).hour;
    if (h >= 5 && h < 11) {
      buckets[WrappedDaypart.morning] = buckets[WrappedDaypart.morning]! + 1;
    } else if (h >= 11 && h < 17) {
      buckets[WrappedDaypart.afternoon] =
          buckets[WrappedDaypart.afternoon]! + 1;
    } else if (h >= 17 && h < 22) {
      buckets[WrappedDaypart.evening] = buckets[WrappedDaypart.evening]! + 1;
    } else {
      buckets[WrappedDaypart.night] = buckets[WrappedDaypart.night]! + 1;
    }
  }
  if (total < 3) return null;
  WrappedDaypart best = WrappedDaypart.morning;
  var bestN = -1;
  for (final entry in buckets.entries) {
    if (entry.value > bestN) {
      bestN = entry.value;
      best = entry.key;
    }
  }
  return (daypart: best, count: bestN);
}

String _buildHighlight({
  required String period,
  required int activeDays,
  required int chapters,
  required int marksCount,
  String? topMarkColorLabel,
  String? topBookName,
  String? yearVerseLabel,
  String? daypartLabel,
}) {
  final span = period == 'year' ? '今年' : '这个月';
  if (yearVerseLabel != null && yearVerseLabel.isNotEmpty) {
    return '$span与你同行的一节：$yearVerseLabel';
  }
  if (topBookName != null && chapters >= 10) {
    return '$span你常在《$topBookName》停留';
  }
  if (daypartLabel != null && daypartLabel.isNotEmpty) {
    return '$span你偏爱$daypartLabel读经';
  }
  if (marksCount >= 50) {
    if (topMarkColorLabel != null && topMarkColorLabel.isNotEmpty) {
      return '$span你标记了 $marksCount 处经文，以「$topMarkColorLabel」最多';
    }
    return '$span你标记了 $marksCount 处经文，记忆深刻';
  }
  if (activeDays >= 20) return '你是持之以恒的读经伙伴';
  if (activeDays >= 7) return '$span你留下了稳定的足迹';
  if (chapters > 0) return '读了 $chapters 章，每一步都算数';
  return '新的开始，从一节经文就好';
}

String? _topColorLabel(Map<String, int> colorCounts) {
  if (colorCounts.isEmpty) return null;
  var best = '';
  var bestN = -1;
  colorCounts.forEach((color, count) {
    if (count > bestN) {
      bestN = count;
      best = color;
    }
  });
  if (best.isEmpty) return null;
  return markColorLabel(best);
}

String _trimQuote(String text, int max) {
  final t = text.replaceAll(RegExp(r'\s+'), ' ').trim();
  final runes = t.runes.toList();
  if (runes.length <= max) return t;
  return '${String.fromCharCodes(runes.take(max))}…';
}

WrappedStats buildWrapped({
  required ReviewData review,
  required String period,
  required int notesCount,
  required int favoritesCount,
  required int marksCount,
  Map<String, String>? highlightColors,
}) {
  final range = _periodRange(period);
  final stats = review.rangeStats(range.start, range.end);
  final streak = readingStreak(review);
  final topFromRead = stats.topBooks.isEmpty ? null : stats.topBooks.first.key;
  final topBookId = topFromRead;
  final topBookName =
      topBookId != null ? bookIdToChineseName(topBookId) : null;

  final colorCounts = <String, int>{};
  highlightColors?.forEach((_, color) {
    colorCounts[color] = (colorCounts[color] ?? 0) + 1;
  });
  final topMarkColorLabel = _topColorLabel(colorCounts);

  final quotes = stats.topVerses
      .map((v) => _quoteFromRef(v.key))
      .whereType<WrappedVerseQuote>()
      .take(3)
      .toList();
  final yearVerse = quotes.isEmpty ? null : quotes.first;
  final daypartInfo = _detectDaypart(review, range.start, range.end);
  final daypart = daypartInfo?.daypart;
  final daypartLabel = daypart != null ? _daypartLabel[daypart] : null;

  final highlight = _buildHighlight(
    period: period,
    activeDays: stats.days,
    chapters: stats.chapters,
    marksCount: marksCount,
    topMarkColorLabel: topMarkColorLabel,
    topBookName: topBookName,
    yearVerseLabel: yearVerse?.label,
    daypartLabel: daypartLabel,
  );

  final spanWord = period == 'year' ? '这一年' : '这个月';
  final coverDay = period == 'year' ? 21 : 14;
  final slides = <WrappedSlide>[
    WrappedSlide(
      kind: WrappedSlideKind.cover,
      kicker: range.label,
      title: highlight,
      body: '滑动查看你的读经足迹',
      wallpaperDay: coverDay,
    ),
    WrappedSlide(
      kind: WrappedSlideKind.time,
      kicker: '$spanWord，你把时间给了话语',
      title: _formatMinutes(stats.minutes),
      body: stats.days > 0
          ? '分布在 ${stats.days} 个活跃的日子里'
          : '从今天起，留下第一分钟',
      metrics: [
        ('${stats.minutes}', '分钟'),
        ('${stats.days}', '活跃天'),
      ],
      wallpaperDay: 5,
    ),
  ];

  if (streak > 0 || daypart != null) {
    slides.add(
      WrappedSlide(
        kind: WrappedSlideKind.rhythm,
        kicker: '节奏',
        title: daypartLabel != null
            ? '偏爱$daypartLabel'
            : streak > 0
                ? '连续 $streak 天'
                : '从今天接上节奏',
        body: daypart != null
            ? _daypartBody[daypart]
            : streak >= 7
                ? '不是比拼，是陪伴——你让读经成为日常'
                : '轻轻继续就好，不需要赶',
        metrics: [
          if (streak > 0) ('$streak', '连续天'),
          if (daypartLabel != null) (daypartLabel, '常读时段'),
        ],
        wallpaperDay: 9,
      ),
    );
  }

  if (stats.chapters > 0) {
    slides.add(
      WrappedSlide(
        kind: WrappedSlideKind.scripture,
        kicker: '足迹',
        title: '${stats.chapters} 章',
        body: topBookName != null ? '常读《$topBookName》' : '一卷一卷，慢慢走进故事',
        metrics: [
          ('${stats.chapters}', '章'),
          if (topBookName != null) (topBookName, '常读卷'),
        ],
        wallpaperDay: 11,
      ),
    );
  }

  if (topBookName != null && topBookId != null) {
    slides.add(
      WrappedSlide(
        kind: WrappedSlideKind.book,
        kicker: period == 'year' ? '书卷印象' : '本月印象',
        title: '《$topBookName》',
        body: stats.chapters >= 10
            ? '$spanWord你常在这里停留，像回到一处熟悉的地方'
            : '$spanWord你在这里留下了足迹',
        wallpaperDay: bookThemeDay(topBookId),
      ),
    );
  }

  if (yearVerse != null) {
    slides.add(
      WrappedSlide(
        kind: WrappedSlideKind.verse,
        kicker: period == 'year' ? '年度经文' : '本月经文',
        title: yearVerse.label,
        body: '加载经文中…',
        verse: yearVerse,
        wallpaperDay: bookThemeDay(
          parseMarkRef(yearVerse.ref)?.bookId ?? topBookId,
        ),
      ),
    );
  }

  if (quotes.length >= 2) {
    slides.add(
      WrappedSlide(
        kind: WrappedSlideKind.quotes,
        kicker: '金句',
        title: '$spanWord与你相遇的经文',
        body: '收藏、划线与阅读，一起留下这些句子',
        quotes: quotes,
        wallpaperDay: 18,
      ),
    );
  }

  if (marksCount > 0 || notesCount > 0) {
    final bodyParts = <String>[
      if (marksCount > 0) '$marksCount 处划线',
      if (notesCount > 0) '$notesCount 条笔记',
      if (favoritesCount > 0) '$favoritesCount 处收藏',
    ];
    slides.add(
      WrappedSlide(
        kind: WrappedSlideKind.marks,
        kicker: '留下的痕迹',
        title: marksCount > 0 || notesCount > 0 ? '你把感动记了下来' : '祷告也算在足迹里',
        body: bodyParts.join(' · '),
        metrics: [
          ('$marksCount', '划线'),
          ('$notesCount', '笔记'),
        ],
        wallpaperDay: 16,
      ),
    );
  }

  slides.add(
    WrappedSlide(
      kind: WrappedSlideKind.close,
      kicker: _brandCloseKicker,
      title: period == 'year' ? '愿来年仍在话语中相遇' : '愿下个月仍安静同行',
      body: '选一张海报，把足迹分享给朋友',
      wallpaperDay: 28,
    ),
  );

  return WrappedStats(
    period: period,
    label: range.label,
    shortLabel: range.shortLabel,
    totalMinutes: stats.minutes,
    activeDays: stats.days,
    streak: streak,
    notesCount: notesCount,
    favoritesCount: favoritesCount,
    marksCount: marksCount,
    chapters: stats.chapters,
    highlight: highlight,
    slides: slides,
    topBookId: topBookId,
    topBookName: topBookName,
    topMarkColorLabel: topMarkColorLabel,
    yearVerse: yearVerse,
    quotes: quotes,
    daypart: daypart,
    daypartLabel: daypartLabel,
  );
}

/// 异步补全年度经文 / 金句正文。
Future<WrappedStats> enrichWrappedTexts(
  WrappedStats w,
  Future<String?> Function(String ref) fetchVerseText,
) async {
  final refs = <String>{
    if (w.yearVerse != null) w.yearVerse!.ref,
    ...w.quotes.map((q) => q.ref),
  };
  if (refs.isEmpty) return w;

  final textMap = <String, String?>{};
  await Future.wait(
    refs.map((ref) async {
      textMap[ref] = await fetchVerseText(ref);
    }),
  );

  WrappedVerseQuote patchQuote(WrappedVerseQuote q) =>
      q.copyWith(text: textMap[q.ref]);

  final yearVerse = w.yearVerse != null ? patchQuote(w.yearVerse!) : null;
  final quotes = w.quotes.map(patchQuote).toList();
  final slides = w.slides.map((s) {
    if (s.kind == WrappedSlideKind.verse && s.verse != null) {
      final verse = patchQuote(s.verse!);
      final text = verse.text;
      return s.copyWith(
        verse: verse,
        title: text != null && text.isNotEmpty
            ? '「${_trimQuote(text, 42)}」'
            : verse.label,
        body: text != null && text.isNotEmpty
            ? verse.label
            : '打开圣经，读一读这节经文',
      );
    }
    if (s.kind == WrappedSlideKind.quotes && s.quotes != null) {
      return s.copyWith(quotes: s.quotes!.map(patchQuote).toList());
    }
    return s;
  }).toList();

  return w.copyWith(yearVerse: yearVerse, quotes: quotes, slides: slides);
}

String wrappedShareText(WrappedStats s) {
  final buf = StringBuffer('${s.label}\n');
  buf.writeln(s.highlight);
  if (s.yearVerse != null) {
    if (s.yearVerse!.text != null && s.yearVerse!.text!.isNotEmpty) {
      buf.writeln('「${s.yearVerse!.text}」');
    }
    buf.writeln(s.yearVerse!.label);
  }
  if (s.topBookName != null) {
    buf.writeln('${s.period == 'year' ? '今年' : '这个月'}常在《${s.topBookName}》');
  }
  buf.writeln('活跃 ${s.activeDays} 天 · 读经 ${s.totalMinutes} 分钟');
  if (s.streak > 0) buf.writeln('连续读经 ${s.streak} 天');
  if (s.notesCount > 0) buf.writeln('笔记 ${s.notesCount} 条');
  if (s.favoritesCount > 0) buf.writeln('收藏 ${s.favoritesCount} 处');
  if (s.marksCount > 0) buf.writeln('划线 ${s.marksCount} 处');
  buf.write('\n— 彼爱读经');
  return buf.toString();
}
