import 'badge_stats.dart';

class BadgeCtx {
  BadgeCtx({
    required this.streak,
    required this.readBooks,
    required this.ntBooksRead,
    required this.otBooksRead,
    required this.totalBooks,
    required this.noteCount,
    required this.monthDays,
    required this.totalMinutes,
    required this.totalChapters,
    required this.highlightCount,
    required this.highlightColors,
    required this.bookmarkCount,
    required this.thoughtCount,
    required this.maxNoteLen,
    required this.planDays,
    required this.friendCount,
    required this.bookTotals,
    required this.chapterEvents,
    required this.verseEvents,
    required this.stats,
  });

  final int streak;
  final int readBooks;
  final int ntBooksRead;
  final int otBooksRead;
  final int totalBooks;
  final int noteCount;
  final int monthDays;
  final int totalMinutes;
  final int totalChapters;
  final int highlightCount;
  final int highlightColors;
  final int bookmarkCount;
  final int thoughtCount;
  final int maxNoteLen;
  final int planDays;
  final int friendCount;
  final Map<String, int> bookTotals;
  final List<Map<String, dynamic>> chapterEvents;
  final List<Map<String, dynamic>> verseEvents;
  final BadgeStats stats;
}

class BadgeDef {
  BadgeDef({
    required this.id,
    required this.label,
    required this.desc,
    required this.hint,
    required this.icon,
    required this.category,
    required this.interesting,
    required this.done,
    required this.progress,
    this.unlockedAt,
  });

  final String id;
  final String label;
  final String desc;
  final String hint;
  final String icon;
  final String category;
  final bool interesting;
  final bool done;
  final String progress;
  final int? unlockedAt;
}

String _ymd(int ts) {
  final d = DateTime.fromMillisecondsSinceEpoch(ts);
  return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

bool _hasChapter(BadgeCtx ctx, String book, int chapter) {
  return ctx.chapterEvents.any(
    (e) => e['book'] == book && (e['chapter'] as num).toInt() == chapter,
  );
}

bool _hasVerseRef(BadgeCtx ctx, String ref) {
  final norm = ref.toUpperCase();
  if (ctx.verseEvents.any((e) => '${e['ref']}'.toUpperCase() == norm)) {
    return true;
  }
  final parts = norm.split('.');
  if (parts.length < 2) return false;
  return _hasChapter(ctx, parts[0], int.tryParse(parts[1]) ?? 0);
}

int _psalmsToday(BadgeCtx ctx) {
  final today = _ymd(DateTime.now().millisecondsSinceEpoch);
  final chs = <int>{};
  for (final e in ctx.chapterEvents) {
    if (e['book'] != 'PSA') continue;
    if (_ymd((e['ts'] as num).toInt()) != today) continue;
    chs.add((e['chapter'] as num).toInt());
  }
  return chs.length;
}

int _gospelsStarted(BadgeCtx ctx) {
  const gospels = ['MAT', 'MRK', 'LUK', 'JHN'];
  final set = <String>{};
  for (final e in ctx.chapterEvents) {
    final b = '${e['book']}';
    if (gospels.contains(b)) set.add(b);
  }
  return set.length;
}

bool _shortBookCompleted(BadgeCtx ctx) {
  final distinct = <String, Set<int>>{};
  for (final e in ctx.chapterEvents) {
    final book = '${e['book']}';
    distinct.putIfAbsent(book, () => <int>{});
    distinct[book]!.add((e['chapter'] as num).toInt());
  }
  for (final entry in ctx.bookTotals.entries) {
    final total = entry.value;
    if (total > 10 || total <= 0) continue;
    if ((distinct[entry.key]?.length ?? 0) >= total) return true;
  }
  return false;
}

int _ctxNumber(BadgeCtx ctx, String field) {
  if (field.startsWith('stats.')) {
    return _statsNumber(ctx.stats, field.substring(7));
  }
  switch (field) {
    case 'streak':
      return ctx.streak;
    case 'readBooks':
      return ctx.readBooks;
    case 'ntBooksRead':
      return ctx.ntBooksRead;
    case 'otBooksRead':
      return ctx.otBooksRead;
    case 'noteCount':
      return ctx.noteCount;
    case 'maxNoteLen':
      return ctx.maxNoteLen;
    case 'highlightColors':
      return ctx.highlightColors;
    case 'bookmarkCount':
      return ctx.bookmarkCount;
    case 'thoughtCount':
      return ctx.thoughtCount;
    default:
      return 0;
  }
}

int _statsNumber(BadgeStats stats, String path) {
  if (path.endsWith('.length')) {
    final key = path.substring(0, path.length - 7);
    switch (key) {
      case 'dict_entities':
        return stats.dictEntities.length;
      case 'map_tours':
        return stats.mapTours.length;
      case 'timeline_tours':
        return stats.timelineTours.length;
      case 'topic_ids':
        return stats.topicIds.length;
      default:
        return 0;
    }
  }
  switch (path) {
    case 'crossref_open':
      return stats.crossrefOpen;
    case 'strongs_open':
      return stats.strongsOpen;
    case 'parallel_chapters':
      return stats.parallelChapters;
    case 'xiaoai_questions':
      return stats.xiaoaiQuestions;
    case 'citation_clicks':
      return stats.citationClicks;
    case 'save_answer_notes':
      return stats.saveAnswerNotes;
    case 'share_answers':
      return stats.shareAnswers;
    case 'half_sheet_xiaoai':
      return stats.halfSheetXiaoai;
    case 'max_followups_session':
      return stats.maxFollowupsSession;
    case 'group_checkins':
      return stats.groupCheckins;
    case 'group_responses':
      return stats.groupResponses;
    case 'groups_created':
      return stats.groupsCreated;
    case 'invites_accepted':
      return stats.invitesAccepted;
    case 'memory_reviews':
      return stats.memoryReviews;
    case 'wrong_revived':
      return stats.wrongRevived;
    default:
      return 0;
  }
}

bool _evalCustom(BadgeCtx ctx, String name, Map<String, dynamic>? args) {
  final min = (args?['min'] as num?)?.toInt() ?? 0;
  switch (name) {
    case 'short_book_complete':
      return _shortBookCompleted(ctx);
    case 'psalm_day':
      return _psalmsToday(ctx) >= min;
    case 'gospels_started':
      return _gospelsStarted(ctx) >= min;
    case 'triple_scene':
      return ctx.stats.refScenes.values.any((s) => s.length >= min);
    case 'group_checkin_streak':
      return maxGroupCheckinStreak(ctx.stats) >= min;
    case 'has_verse_ref':
      return _hasVerseRef(ctx, '${args?['ref'] ?? ''}');
    case 'has_chapter':
      return _hasChapter(ctx, '${args?['book'] ?? ''}', (args?['chapter'] as num?)?.toInt() ?? 0);
    default:
      return false;
  }
}

bool evaluateRule(Map<String, dynamic> rule, BadgeCtx ctx) {
  final type = rule['type'] as String? ?? '';
  switch (type) {
    case 'ctx_gte':
      return _ctxNumber(ctx, rule['field'] as String) >= (rule['value'] as num).toInt();
    case 'stats_gte':
      return _statsNumber(ctx.stats, rule['field'] as String) >= (rule['value'] as num).toInt();
    case 'stats_array_len_gte':
      return _statsNumber(ctx.stats, '${rule['field']}.length') >= (rule['value'] as num).toInt();
    case 'stats_includes':
      final field = rule['field'] as String;
      final value = rule['value'] as String;
      if (field == 'scenes_used') return ctx.stats.scenesUsed.contains(value);
      return false;
    case 'stats_bool':
      final field = rule['field'] as String;
      if (field == 'night_xiaoai') return ctx.stats.nightXiaoai;
      if (field == 'plan_shared_group') return ctx.stats.planSharedGroup;
      return false;
    case 'custom':
      return _evalCustom(ctx, rule['name'] as String, rule['args'] as Map<String, dynamic>?);
    default:
      return false;
  }
}

String formatProgress(Map<String, dynamic> progress, BadgeCtx ctx, bool done) {
  final type = progress['type'] as String? ?? '';
  if (type == 'bool') return done ? '1/1' : '0/1';
  if (type == 'ratio') {
    final max = (progress['max'] as num).toInt();
    final cur = _ctxNumber(ctx, progress['field'] as String);
    return '${cur > max ? max : cur}/$max';
  }
  if (type == 'custom') {
    final min = (progress['args']?['min'] as num?)?.toInt() ?? 1;
    switch (progress['name']) {
      case 'psalm_day':
        final n = _psalmsToday(ctx);
        return '${n > min ? min : n}/$min';
      case 'gospels_started':
        final n = _gospelsStarted(ctx);
        return '${n > min ? min : n}/$min';
      case 'group_checkin_streak':
        final n = maxGroupCheckinStreak(ctx.stats);
        return '${n > min ? min : n}/$min';
      case 'triple_scene':
        var n = 0;
        for (final s in ctx.stats.refScenes.values) {
          if (s.length > n) n = s.length;
        }
        return done ? '$min/$min' : '$n/$min';
      default:
        return done ? '1/1' : '0/1';
    }
  }
  return done ? '1/1' : '0/1';
}

List<BadgeDef> profilePreviewBadges(List<BadgeDef> badges, {int limit = 4}) {
  final earned = badges.where((b) => b.done).toList();
  final interesting = earned.where((b) => b.interesting).toList();
  final pool = interesting.length >= limit ? interesting : earned;
  pool.sort((a, b) => (b.unlockedAt ?? 0).compareTo(a.unlockedAt ?? 0));
  return pool.take(limit).toList();
}

BadgeDef evaluateBadge(Map<String, dynamic> spec, BadgeCtx ctx) {
  final done = evaluateRule(spec['rule'] as Map<String, dynamic>, ctx);
  return BadgeDef(
    id: spec['id'] as String,
    label: spec['label'] as String,
    desc: spec['desc'] as String,
    hint: spec['hint'] as String,
    icon: spec['icon'] as String,
    category: spec['category'] as String,
    interesting: spec['interesting'] as bool? ?? true,
    done: done,
    progress: formatProgress(spec['progress'] as Map<String, dynamic>, ctx, done),
  );
}

List<BadgeDef> evaluateAllBadges(List<Map<String, dynamic>> specs, BadgeCtx ctx) {
  return specs.map((s) => evaluateBadge(s, ctx)).toList();
}
