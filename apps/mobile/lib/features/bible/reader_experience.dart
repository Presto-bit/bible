/// 阅读体验增强：主题、进度条、情境头、Focus 模式、轻问小爱、章节缓存。
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/app_shell.dart' show peiaiTabContentBottomPad;
import '../../core/api_client.dart' show prefsProvider;
import '../../core/mark_notes.dart';
import '../../core/mark_ref.dart' show selectionRef;
import 'summary_sheet.dart';
import '../../core/database/app_database.dart';
import '../../core/theme.dart';
import '../plans/plan_bar.dart';
import '../plans/plan_reading.dart';
import '../plans/plan_session.dart';
import '../plans/plans_repository.dart';
import '../plans/plan_steps.dart';
import '../notes/notes_for_chapter.dart';
import '../notes/notes_repository.dart';
import 'bible_repository.dart';
import 'chapter_guide_tip.dart';
import 'content_repository.dart' hide SectionMark;
import 'dictionary_match.dart';
import 'entity_knowledge_sheet.dart';
import 'inline_ref.dart';
import 'group_checkin_sheet.dart';
import 'markings_repository.dart';
import 'models.dart';
import 'outlines.dart';
import 'paragraphs.dart';
import 'reader_focus_bar.dart';
import 'reader_marking_models.dart';
import 'reader_preferences.dart';
import 'reader_thoughts_sheet.dart';
import 'reading_repository.dart';
import 'selection_range.dart';
import 'thoughts_repository.dart' hide selectionRef;
import 'verse_card_sheet.dart';
import 'verse_compare_sheet.dart';
import 'verse_diff.dart';
import 'verse_selection_gesture.dart';
import 'verse_words.dart';
import '../../core/peiai_haptics.dart';
import '../social/social_repository.dart' show myGroupsProvider;

/// 阅读字号（对齐 H5 中/大/特大）。
enum ReaderFontSize { medium, large, xlarge }

extension ReaderFontSizeX on ReaderFontSize {
  String get label => switch (this) {
    ReaderFontSize.medium => '中',
    ReaderFontSize.large => '大',
    ReaderFontSize.xlarge => '特大',
  };
  double get px => switch (this) {
    ReaderFontSize.medium => 18,
    ReaderFontSize.large => 20,
    ReaderFontSize.xlarge => 24,
  };
}

const _fontSizeKey = 'reader_font_size';

class ReaderFontNotifier extends Notifier<ReaderFontSize> {
  @override
  ReaderFontSize build() {
    final raw = ref.read(prefsProvider).getString(_fontSizeKey);
    return ReaderFontSize.values.firstWhere(
      (e) => e.name == raw,
      orElse: () => ReaderFontSize.medium,
    );
  }

  void set(ReaderFontSize size) {
    state = size;
    ref.read(prefsProvider).setString(_fontSizeKey, size.name);
  }
}

final readerFontProvider = NotifierProvider<ReaderFontNotifier, ReaderFontSize>(
  ReaderFontNotifier.new,
);

enum ReaderExperienceTheme { morning, sepia, night }

extension ReaderExperienceThemeX on ReaderExperienceTheme {
  String get label => switch (this) {
    ReaderExperienceTheme.morning => '清晨',
    ReaderExperienceTheme.sepia => '护眼黄',
    ReaderExperienceTheme.night => '夜深',
  };

  Color get background => switch (this) {
    ReaderExperienceTheme.morning => const Color(0xFFFFFCFA),
    ReaderExperienceTheme.sepia => const Color(0xFFF5F0E1),
    ReaderExperienceTheme.night => const Color(0xFF12181C),
  };

  Color get ink => switch (this) {
    ReaderExperienceTheme.night => const Color(0xFFD8E0E6),
    _ => AppColors.ink,
  };
}

enum ReaderVerseNumberMode { inline, margin, hidden }

const _themeKey = 'reader_experience_theme';
const _verseNoKey = 'reader_verse_number_mode';
const _chapterCachePrefix = 'presto_ch_cnv_';

class ReaderExperienceThemeNotifier extends Notifier<ReaderExperienceTheme> {
  @override
  ReaderExperienceTheme build() {
    final prefs = ref.read(prefsProvider);
    final raw = prefs.getString(_themeKey);
    if (raw == 'night') return ReaderExperienceTheme.night;
    if (raw == 'sepia') return ReaderExperienceTheme.sepia;
    if (raw == 'paper') {
      prefs.setString(_themeKey, 'morning');
    }
    return ReaderExperienceTheme.morning;
  }

  void set(ReaderExperienceTheme t) {
    state = t;
    ref.read(prefsProvider).setString(_themeKey, t.name);
  }
}

final readerExperienceThemeProvider =
    NotifierProvider<ReaderExperienceThemeNotifier, ReaderExperienceTheme>(
      ReaderExperienceThemeNotifier.new,
    );

class ReaderVerseNumberNotifier extends Notifier<ReaderVerseNumberMode> {
  @override
  ReaderVerseNumberMode build() {
    final raw = ref.read(prefsProvider).getString(_verseNoKey);
    return ReaderVerseNumberMode.values.firstWhere(
      (e) => e.name == raw,
      orElse: () => ReaderVerseNumberMode.inline,
    );
  }

  void set(ReaderVerseNumberMode m) {
    state = m;
    ref.read(prefsProvider).setString(_verseNoKey, m.name);
  }
}

final readerVerseNumberProvider =
    NotifierProvider<ReaderVerseNumberNotifier, ReaderVerseNumberMode>(
      ReaderVerseNumberNotifier.new,
    );

class ChapterContextInfo {
  const ChapterContextInfo({this.era, this.place, this.summary});
  final String? era;
  final String? place;
  final String? summary;
}

ChapterContextInfo? chapterContextInfo(String bookId, int chapter) {
  const data = <String, Map<int, ChapterContextInfo>>{
    'GEN': {
      1: ChapterContextInfo(
        era: '创造之初',
        place: '宇宙',
        summary: '神六日创造天地万物，第七日安息。',
      ),
      3: ChapterContextInfo(era: '伊甸园', place: '东方', summary: '人的堕落与救恩的应许。'),
    },
    'EXO': {
      14: ChapterContextInfo(
        era: '出埃及',
        place: '红海',
        summary: '神使海水分开，以色列人走干地。',
      ),
      20: ChapterContextInfo(era: '西奈山', place: '旷野', summary: '神颁布十诫。'),
    },
    'PSA': {
      23: ChapterContextInfo(era: '大卫时代', place: '牧野', summary: '耶和华是我的牧者。'),
    },
    'MAT': {
      5: ChapterContextInfo(era: '耶稣事工', place: '加利利', summary: '登山宝训：天国伦理。'),
    },
    'JHN': {
      1: ChapterContextInfo(era: '道成肉身', place: '犹太', summary: '太初有道，道成了肉身。'),
      3: ChapterContextInfo(era: '耶稣事工', place: '耶路撒冷', summary: '尼哥底母与重生的对话。'),
    },
  };
  return data[bookId.toUpperCase()]?[chapter];
}

double bookProgressInBible(List<BibleBook> books, String bookId, int chapter) {
  if (books.isEmpty) return 0;
  var total = 0;
  var before = 0;
  var found = false;
  for (final b in books) {
    total += b.chapterCount;
    if (b.id == bookId) {
      found = true;
      before += chapter - 1;
      break;
    }
    if (!found) before += b.chapterCount;
  }
  return total > 0 ? before / total : 0;
}

Chapter? readChapterCache(SharedPreferences prefs, String book, int chapter) {
  final raw = prefs.getString('$_chapterCachePrefix${book}_$chapter');
  if (raw == null) return null;
  try {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    final ts = j['ts'] as int? ?? 0;
    if (DateTime.now().millisecondsSinceEpoch - ts > 7 * 86400000) return null;
    return Chapter.fromJson(j['data'] as Map<String, dynamic>);
  } catch (_) {
    return null;
  }
}

void writeChapterCache(
  SharedPreferences prefs,
  String book,
  int chapter,
  Chapter ch,
) {
  prefs.setString(
    '$_chapterCachePrefix${book}_$chapter',
    jsonEncode({
      'ts': DateTime.now().millisecondsSinceEpoch,
      'data': {
        'book': ch.bookId,
        'name': ch.bookName,
        'chapter': ch.chapter,
        'verses': ch.verses
            .map((v) => {'verse': v.verse, 'text': v.text})
            .toList(),
      },
    }),
  );
}

/// 增强版章阅读主体（对齐 H5 ReaderView，不含听读同步）。
class ReaderChapterBody extends ConsumerStatefulWidget {
  const ReaderChapterBody({
    super.key,
    required this.book,
    required this.chapter,
    required this.books,
    required this.chromeHidden,
    required this.onNav,
    required this.onInteract,
    required this.onRead,
    required this.onAskAi,
    this.onNextChapter,
    this.onSelectionChanged,
    this.compareVersionId,
    this.mainVersionId,
    this.planMeta,
    this.onPlanMetaChange,
    this.onPlanJump,
    this.onEnableParallel,
    this.flashVerse,
    this.onFlashConsumed,
  });

  final BibleBook book;
  final int chapter;
  final List<BibleBook> books;
  final bool chromeHidden;
  final void Function(int delta) onNav;
  final VoidCallback onInteract;
  final void Function(String book, int chapter) onRead;
  final String? compareVersionId;

  /// 正文译本；null 为默认主译本（和合本 cuvs）。
  final String? mainVersionId;
  final PlanReadingMeta? planMeta;
  final ValueChanged<PlanReadingMeta?>? onPlanMetaChange;
  final void Function(String bookId, int chapter)? onPlanJump;
  final VoidCallback? onNextChapter;

  /// 选区变化：用于父级隐藏 FAB（对齐 PWA hasSel）。
  final ValueChanged<bool>? onSelectionChanged;

  /// 从单节对照开启章节双语对照（写入 compareVersionId）。
  final void Function(String versionId)? onEnableParallel;

  /// 外部指定轻闪节（每日经文等）；含第 1 节。
  final int? flashVerse;
  final VoidCallback? onFlashConsumed;

  /// 打开小爱解读弹窗。explainOnly=true 时仅解释选中经文。
  final void Function(
    String refStr,
    String refLabel,
    String selectionText,
    bool explainOnly,
  )
  onAskAi;

  @override
  ConsumerState<ReaderChapterBody> createState() => _ReaderChapterBodyState();
}

class _ReaderChapterBodyState extends ConsumerState<ReaderChapterBody>
    with SingleTickerProviderStateMixin {
  Set<int> _selected = {};
  WordRange? _wordRange;
  bool _bookDone = false;
  bool _chapterTipVisible = false;
  bool _chapterBottomFired = false;
  bool _guideTipVisible = false;
  bool _guideTipCompact = false;
  Timer? _guideDwellTimer;
  int? _resumeFlashVerse;
  final _resumeAnchorKey = GlobalKey();
  final _scroll = ScrollController();
  final _selectionAnchorKey = GlobalKey();
  double? _focusBarTop;
  bool _resumeScheduled = false;
  bool _planDayFinishScheduled = false;
  Chapter? _cachedChapter;
  Chapter? _liveChapter;

  /// 横滑翻章视觉位移（已含边界阻力）
  double _pageDragDx = 0;

  /// 横滑原始累计位移（未乘边界阻力；松手判定用）
  double _pageDragRaw = 0;

  /// 邻章是否已触发预取
  bool _pageTurnPrefetched = false;

  /// 横滑轴锁：null 未判定 / x 横翻（由 HorizontalDrag 手势识别器完成）
  String? _pageDragAxis;

  /// 松手后把当前页送出或弹回；时长与 PWA reader-turn-track 一致。
  late final AnimationController _pageTurnController;
  late Animation<double> _pageTurnAnimation;
  bool _pageTurnAnimating = false;

  /// 划词手势中：禁止横滑翻章（对齐 PWA swipeIgnore）
  bool _selectionGestureActive = false;

  @override
  void initState() {
    super.initState();
    _pageTurnController =
        AnimationController(
          vsync: this,
          duration: const Duration(milliseconds: 280),
        )..addListener(() {
          if (!mounted) return;
          setState(() => _pageDragDx = _pageTurnAnimation.value);
        });
    _pageTurnAnimation = const AlwaysStoppedAnimation(0);
    _scroll.addListener(_onScroll);
    final prefs = ref.read(prefsProvider);
    _cachedChapter = readChapterCache(prefs, widget.book.id, widget.chapter);
    _scheduleGuideTips(fromSwipe: false, prevBookId: null, prevChapter: null);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _prefetchAdjacentChapters();
    });
  }

  @override
  void didUpdateWidget(ReaderChapterBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.book.id != widget.book.id ||
        oldWidget.chapter != widget.chapter ||
        oldWidget.planMeta?.day != widget.planMeta?.day) {
      final fromSwipe =
          oldWidget.book.id == widget.book.id &&
          (widget.chapter - oldWidget.chapter).abs() == 1;
      setState(() {
        _selected.clear();
        _wordRange = null;
        _bookDone = false;
        _chapterTipVisible = false;
        _chapterBottomFired = false;
        _guideTipVisible = false;
        _guideTipCompact = false;
        _resumeFlashVerse = null;
        _planDayFinishScheduled = false;
        _resumeScheduled = false;
        _liveChapter = null;
        _pageDragDx = 0;
        _pageDragRaw = 0;
        _pageTurnPrefetched = false;
        _pageDragAxis = null;
        _selectionGestureActive = false;
        _cachedChapter = readChapterCache(
          ref.read(prefsProvider),
          widget.book.id,
          widget.chapter,
        );
      });
      _notifySelection();
      _guideDwellTimer?.cancel();
      _scheduleGuideTips(
        fromSwipe: fromSwipe,
        prevBookId: oldWidget.book.id,
        prevChapter: oldWidget.chapter,
      );
      _persistPlanRef();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (_scroll.hasClients) _scroll.jumpTo(0);
        _prefetchAdjacentChapters();
      });
    } else if (widget.flashVerse != null &&
        widget.flashVerse != oldWidget.flashVerse) {
      // 同章再次跳入（如每日经文第 1 节）：强制再滚再闪。
      _resumeScheduled = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _selected.isNotEmpty) return;
        if (!_resumeScheduled) {
          _resumeScheduled = true;
          _maybeResume();
        }
      });
    }
  }

  Future<void> _persistPlanRef() async {
    final meta = widget.planMeta;
    if (meta == null || widget.onPlanMetaChange == null) return;
    final refStr = '${widget.book.id}.${widget.chapter}';
    if (meta.session.lastRef == refStr) return;
    final session = updateSessionRef(meta.session, refStr);
    await savePlanSession(ref.read(prefsProvider), session);
    await ref
        .read(planProgressRepoProvider)
        .mark(meta.planId, meta.day, status: 'active', session: session);
    if (!mounted) return;
    widget.onPlanMetaChange!(
      PlanReadingMeta(
        planId: meta.planId,
        planTitle: meta.planTitle,
        day: meta.day,
        totalDays: meta.totalDays,
        steps: meta.steps,
        session: session,
        source: meta.source,
      ),
    );
  }

  @override
  void dispose() {
    _guideDwellTimer?.cancel();
    _pageTurnController.dispose();
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  void _scheduleGuideTips({
    required bool fromSwipe,
    String? prevBookId,
    int? prevChapter,
  }) {
    if (widget.planMeta != null) return;
    final prefs = ref.read(prefsProvider);
    final nav = resolveChapterGuideNavKind(
      fromSwipe: fromSwipe,
      prevBookId: prevBookId,
      prevChapter: prevChapter,
      bookId: widget.book.id,
      chapter: widget.chapter,
    );
    if (nav == ChapterGuideNavKind.jump &&
        shouldShowChapterGuideTip(
          prefs: prefs,
          bookId: widget.book.id,
          chapter: widget.chapter,
          intent: ChapterGuideIntent.jump,
        )) {
      unawaited(
        recordChapterGuideTipShown(prefs, widget.book.id, widget.chapter),
      );
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          setState(() {
            _guideTipVisible = true;
            _guideTipCompact = false;
          });
        }
      });
      return;
    }
    // 连翻 / 邻章：仅 dwell
    _guideDwellTimer = Timer(
      const Duration(milliseconds: chapterGuideDwellMs),
      () {
        if (!mounted) return;
        final p = ref.read(prefsProvider);
        if (shouldShowChapterGuideTip(
          prefs: p,
          bookId: widget.book.id,
          chapter: widget.chapter,
          intent: ChapterGuideIntent.dwell,
        )) {
          unawaited(
            recordChapterGuideTipShown(p, widget.book.id, widget.chapter),
          );
          setState(() {
            _guideTipVisible = true;
            _guideTipCompact = true;
          });
        }
      },
    );
  }

  double _lastOffset = 0;

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final cur = _scroll.position.pixels;
    _lastOffset = cur;

    // 章末读完轻提示（对齐 PWA ChapterCompleteTip；专注模式 / 计划模式关闭）
    if (!_chapterBottomFired &&
        widget.planMeta == null &&
        cur >= _scroll.position.maxScrollExtent - 100) {
      _chapterBottomFired = true;
      final mode = ref.read(readingModeProvider);
      final tipOn = ref.read(chapterCompleteTipOnProvider);
      final prefs = ref.read(readerPreferencesProvider);
      if (tipOn &&
          mode != ReadingMode.focus &&
          !prefs.hasShownChapterCompleteTip(widget.book.id, widget.chapter)) {
        unawaited(
          prefs.markChapterCompleteTipShown(widget.book.id, widget.chapter),
        );
        if (mounted) setState(() => _chapterTipVisible = true);
      }
    }

    if (_bookDone) return;
    // 仅在「读完整卷」（本卷最后一章滚动到底）时庆祝，避免每章都打扰。
    if (widget.chapter < widget.book.chapterCount) return;
    if (cur >= _scroll.position.maxScrollExtent - 80) {
      setState(() => _bookDone = true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('🎉 恭喜读完《${widget.book.name}》'),
            duration: const Duration(milliseconds: 2200),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
    if (_selected.isNotEmpty) _scheduleFocusBarLayout();
  }

  void _maybeResume() {
    final forced = widget.flashVerse;
    if (forced != null && forced >= 1) {
      _triggerResumeFlash(forced);
      widget.onFlashConsumed?.call();
      return;
    }
    final saved = ref.read(readingProgressStreamProvider).value;
    // 普通续读：第 1 节不闪，避免每次进章都打扰。
    if (saved == null ||
        saved.book != widget.book.id ||
        saved.chapter != widget.chapter ||
        saved.verse <= 1) {
      return;
    }
    _triggerResumeFlash(saved.verse);
  }

  void _triggerResumeFlash(int verse) {
    setState(() => _resumeFlashVerse = verse);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final ctx = _resumeAnchorKey.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(
          ctx,
          alignment: 0.38,
          duration: const Duration(milliseconds: 420),
          curve: Curves.easeOutCubic,
        );
      }
      Future.delayed(const Duration(milliseconds: 2400), () {
        if (mounted) setState(() => _resumeFlashVerse = null);
      });
    });
  }

  void _markRead(int verse) {
    ref
        .read(readingRepoProvider)
        .logVerseRead('${widget.book.id}.${widget.chapter}.$verse');
    ref
        .read(readingRepoProvider)
        .record(widget.book.id, widget.chapter, verse: verse);
  }

  void _notifySelection() {
    widget.onSelectionChanged?.call(_selected.isNotEmpty);
  }

  // 长按：进入选中（整节）。
  void _startSelect(int verse, String text) {
    widget.onInteract();
    peiaiHapticSelection(context);
    final range = wholeVerseRange(verse, text);
    setState(() {
      _wordRange = range;
      _selected = {verse};
    });
    _notifySelection();
    _markRead(verse);
    _scheduleFocusBarLayout();
  }

  /// PWA applyWordRange：词锚点区间（拖选中可不 commit 进度）。
  void _applyWordRange(
    WordAnchor anchor,
    WordAnchor focus, {
    bool commit = true,
  }) {
    final range = WordRange(anchor: anchor, focus: focus);
    if (wordRangesEqual(_wordRange, range) &&
        _selected.containsAll(wordRangeToSpan(range).verses)) {
      if (commit) _commitWordRangeProgress();
      return;
    }
    widget.onInteract();
    if (commit || _wordRange == null) peiaiHapticSelection(context);
    final picked = wordRangeToSpan(range).verses.toSet();
    setState(() {
      _wordRange = range;
      _selected = picked;
    });
    _notifySelection();
    if (commit) {
      for (final v in picked) {
        _markRead(v);
      }
    }
    _scheduleFocusBarLayout();
  }

  void _commitWordRangeProgress() {
    if (_wordRange == null) return;
    final picked = wordRangeToSpan(_wordRange!).verses;
    for (final v in picked) {
      _markRead(v);
    }
  }

  // 词块长按：半节/词选起点（兼容节号旧路径）。
  void _startWordSelect(int verse, int start, int end) {
    final a = WordAnchor(verse: verse, start: start, end: end);
    _applyWordRange(a, a, commit: true);
  }

  // 词块点按：扩展选区焦点。
  void _extendWordSelect(int verse, int start, int end) {
    if (_wordRange == null) {
      _startWordSelect(verse, start, end);
      return;
    }
    final f = WordAnchor(verse: verse, start: start, end: end);
    _applyWordRange(_wordRange!.anchor, f, commit: true);
  }

  // 点按：扩展为连续区间（整节）。
  void _toggleSelect(int verse, String text) {
    if (_selected.isEmpty) return;
    widget.onInteract();
    if (_wordRange != null) {
      _extendWordSelect(verse, 0, text.length);
      return;
    }
    final lo = _selected.reduce((a, b) => a < b ? a : b);
    final hi = _selected.reduce((a, b) => a > b ? a : b);
    final start = verse < lo ? verse : lo;
    final end = verse > hi ? verse : hi;
    setState(() {
      _selected = {for (var i = start; i <= end; i++) i};
      _wordRange = WordRange(
        anchor: WordAnchor(verse: start, start: 0, end: 0),
        focus: WordAnchor(verse: end, start: 0, end: text.length),
      );
    });
    _notifySelection();
    _markRead(verse);
    _scheduleFocusBarLayout();
  }

  void _clearSelection() {
    setState(() {
      _selected.clear();
      _wordRange = null;
      _focusBarTop = null;
    });
    _notifySelection();
  }

  int? get _selectionAnchorVerse {
    final sel = _sortedSel;
    if (sel.isEmpty) return null;
    return sel[sel.length ~/ 2];
  }

  void _scheduleFocusBarLayout() {
    WidgetsBinding.instance.addPostFrameCallback((_) => _layoutFocusBar());
  }

  void _layoutFocusBar() {
    if (!mounted || _selected.isEmpty) {
      if (_focusBarTop != null) setState(() => _focusBarTop = null);
      return;
    }
    final ctx = _selectionAnchorKey.currentContext;
    if (ctx == null) return;
    final box = ctx.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final offset = box.localToGlobal(Offset.zero);
    final size = box.size;
    final media = MediaQuery.of(context);
    const barEstimate = 112.0;
    const margin = 10.0;
    final topReserve = media.padding.top + (widget.chromeHidden ? 8 : 56);
    final bottomReserve =
        media.padding.bottom + (widget.chromeHidden ? 16 : 72);
    var top = offset.dy - barEstimate - margin;
    if (top < topReserve) top = offset.dy + size.height + margin;
    final maxTop = media.size.height - barEstimate - bottomReserve;
    top = top.clamp(topReserve, maxTop);
    if (_focusBarTop != top) setState(() => _focusBarTop = top);
  }

  List<int> get _sortedSel => _selected.toList()..sort();

  String _selectionText(Chapter? ch) {
    if (ch == null) return '';
    final wr = _wordRange;
    if (wr != null) {
      return textFromWordRange(
        wr,
        (v) =>
            ch.verses
                .where((x) => x.verse == v)
                .map((x) => x.text)
                .firstOrNull ??
            '',
      );
    }
    return ch.verses
        .where((v) => _selected.contains(v.verse))
        .map((v) => v.text)
        .join();
  }

  Widget _sectionTitle(String title) {
    final muted = _selected.isNotEmpty;
    final baseColor = muted
        ? AppColors.inkFaint.withValues(alpha: 0.45)
        : AppColors.accentDeep;
    // 对齐 PWA：字号随正文缩放，字体继承读经衬线栈。
    final readerPx = ref.watch(readerFontProvider).px;
    final fontFamily = ref.watch(readerFontFamilyProvider);
    final style = TextStyle(
      fontSize: (readerPx * 0.88).roundToDouble().clamp(13, 32),
      fontWeight: FontWeight.w700,
      color: baseColor,
      fontFamily: fontFamily.fontFamily,
      fontFamilyFallback: fontFamily.fontFamilyFallback,
    );
    final parts = splitInlineRefs(title);
    return Padding(
      // PWA `.section-title` 为 `margin: 16px 0 4px; padding-left: 2px`。
      padding: const EdgeInsets.fromLTRB(2, 16, 0, 4),
      child: Text.rich(
        TextSpan(
          children: [
            for (final p in parts)
              if (p.kind == InlineRefKind.ref && p.osis != null)
                TextSpan(
                  text: p.value,
                  style: style.copyWith(
                    decoration: TextDecoration.underline,
                    decorationColor: baseColor,
                  ),
                  recognizer: TapGestureRecognizer()
                    ..onTap = () {
                      final m = RegExp(
                        r'^([A-Za-z0-9]+)\.(\d+)',
                      ).firstMatch(p.osis!);
                      if (m == null) return;
                      showInlineVersePreview(
                        context,
                        label: p.value,
                        bookId: m.group(1)!,
                        chapter: int.parse(m.group(2)!),
                      );
                    },
                )
              else
                TextSpan(text: p.value, style: style),
          ],
        ),
      ),
    );
  }

  String get _selectionRefStr {
    final wr = _wordRange;
    if (wr == null) {
      return selectionRef(widget.book.id, widget.chapter, _sortedSel);
    }
    final p = wordRangeToSpan(wr);
    int? spanStart = p.span?.start;
    int? spanEnd = p.span?.end;
    if (p.verses.length == 1 && spanStart != null && spanEnd != null) {
      final ch = _liveChapter ?? _cachedChapter;
      final text =
          ch?.verses
              .where((x) => x.verse == p.verses.first)
              .map((x) => x.text)
              .firstOrNull ??
          '';
      if (spanStart <= 0 && spanEnd >= text.length) {
        spanStart = null;
        spanEnd = null;
      }
    }
    return selectionRef(
      widget.book.id,
      widget.chapter,
      p.verses,
      spanStart: spanStart,
      spanEnd: spanEnd,
    );
  }

  String get _refStr => _selectionRefStr;

  String get _refLabel {
    final sel = _sortedSel;
    final name = widget.book.name;
    if (sel.isEmpty) return '$name ${widget.chapter}';
    if (sel.first == sel.last) return '$name ${widget.chapter}:${sel.first}';
    return '$name ${widget.chapter}:${sel.first}-${sel.last}';
  }

  HighlightMark? _currentSelectionMark(Map<String, HighlightMark> map) {
    if (_selected.isEmpty) return null;
    final storage = _highlightStorageRef(map, _sortedSel);
    if (storage == null) return null;
    return map[storage];
  }

  Future<void> _pickHighlightColor(String color) async {
    final sel = _sortedSel;
    if (sel.isEmpty) return;
    final map = ref.read(highlightMapProvider).value ?? {};
    final storageRef = _highlightStorageRef(map, sel) ?? _selectionRefStr;
    final added = await ref
        .read(markingsRepoProvider)
        .toggleHighlight(storageRef, color: color);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(added ? '已划线' : '已取消划线'),
        duration: const Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
    if (added) _promptMarkNote(storageRef);
  }

  Future<void> _promptMarkNote(String refStr) async {
    final versePreview = _selectionText(_liveChapter ?? _cachedChapter).trim();
    final controller = TextEditingController();
    final body = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 18,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '写灵修笔记 · $_refLabel',
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 15,
                color: AppColors.ink,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.goldWash,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '所选经文',
                    style: TextStyle(fontSize: 11, color: AppColors.inkFaint),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    versePreview.isNotEmpty ? versePreview : '（未选中具体经文内容）',
                    style: const TextStyle(
                      fontSize: 14,
                      height: 1.55,
                      color: AppColors.ink,
                      fontFamily: 'Songti SC',
                      fontFamilyFallback: ['STSong', 'Noto Serif SC', 'serif'],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              '笔记仅保存在本机，可随时在经文旁查看',
              style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: '记录领受、疑问或祷告…',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: () => Navigator.pop(ctx, controller.text),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.accentDeep,
                ),
                child: const Text('保存'),
              ),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (body == null || body.trim().isEmpty) return;
    final note = await ref
        .read(notesRepoProvider)
        .create(body: body.trim(), ref: refStr);
    await bindNoteToMark(ref.read(prefsProvider), refStr, note.id);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('笔记已保存'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _clearHighlight() async {
    final sel = _sortedSel;
    if (sel.isEmpty) return;
    final map = ref.read(highlightMapProvider).value ?? {};
    final storageRef = _highlightStorageRef(map, sel);
    if (storageRef == null) return;
    await ref
        .read(markingsRepoProvider)
        .toggleHighlight(storageRef, color: map[storageRef]?.color ?? 'yellow');
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('已取消划线'),
        duration: Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  String? _highlightStorageRef(Map<String, HighlightMark> map, List<int> sel) {
    final selRef = _selectionRefStr;
    if (map.containsKey(selRef)) return selRef;
    final base = selectionRef(widget.book.id, widget.chapter, sel);
    if (map.containsKey(base)) return base;
    for (final v in sel) {
      final k = '${widget.book.id}.${widget.chapter}.$v';
      if (map.containsKey(k)) return k;
    }
    final min = sel.first;
    final max = sel.last;
    for (final k in map.keys) {
      final parts = k.split('@').first.split('.');
      if (parts.length < 3) continue;
      if (parts[0] != widget.book.id ||
          int.tryParse(parts[1]) != widget.chapter) {
        continue;
      }
      final tail = parts[2];
      if (tail.contains('-')) {
        final r = tail.split('-');
        final a = int.tryParse(r[0]);
        final b = int.tryParse(r.length > 1 ? r[1] : r[0]);
        if (a == min && b == max) return k;
        if (a != null && b != null && a <= min && b >= max) return k;
      }
    }
    return null;
  }

  Future<void> _writeThought(Chapter? ch) async {
    final sel = _sortedSel;
    if (sel.isEmpty) return;
    final refStr = _selectionRefStr;
    await showWriteThoughtSheet(
      context,
      ref,
      refStr: refStr,
      refLabel: _refLabel,
      verseText: _selectionText(ch),
    );
    _clearSelection();
  }

  void _openThoughtsForVerse(int verse, String text) {
    final refStr = '${widget.book.id}.${widget.chapter}.$verse';
    showThoughtsListSheet(
      context,
      ref,
      refStr: refStr,
      refLabel: '${widget.book.name} ${widget.chapter}:$verse',
      verseText: text,
    );
  }

  void _showChapterSummary({String initialTab = 'chapter'}) {
    showBibleSummarySheet(
      context,
      ref,
      bookId: widget.book.id,
      bookName: widget.book.name,
      chapter: widget.chapter,
      initialTab: initialTab,
    );
  }

  void _viewNote(Note note) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '经文笔记',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 16,
                color: AppColors.ink,
              ),
            ),
            if (note.ref != null) ...[
              const SizedBox(height: 6),
              Text(
                note.ref!,
                style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
            ],
            const SizedBox(height: 12),
            Text(note.body, style: const TextStyle(fontSize: 15, height: 1.75)),
          ],
        ),
      ),
    );
  }

  Future<void> _persistPlanSession(PlanSession session) async {
    final meta = widget.planMeta;
    if (meta == null || widget.onPlanMetaChange == null) return;
    final prefs = ref.read(prefsProvider);
    await savePlanSession(prefs, session);
    await ref
        .read(planProgressRepoProvider)
        .mark(meta.planId, meta.day, status: 'active', session: session);
    widget.onPlanMetaChange!(
      PlanReadingMeta(
        planId: meta.planId,
        planTitle: meta.planTitle,
        day: meta.day,
        totalDays: meta.totalDays,
        steps: meta.steps,
        session: session,
        source: meta.source,
      ),
    );
  }

  Future<void> _continuePlanSegment() async {
    final meta = widget.planMeta;
    if (meta == null || widget.onPlanJump == null) return;
    final idx = stepForChapter(meta.steps, widget.book.id, widget.chapter);
    if (idx < 0) return;
    final step = meta.steps[idx];
    var session = await markStepDone(
      ref.read(prefsProvider),
      meta.session,
      step.id,
      meta.steps,
    );
    await _persistPlanSession(session);
    final next = nextIncompleteStep(meta.steps, session.stepsDone);
    if (next != null) {
      final ni = meta.steps.indexWhere((s) => s.id == next.id);
      session = session.copyWith(currentStepIndex: ni);
      await _persistPlanSession(session);
      widget.onPlanJump!(next.bookId, next.chapterStart);
    }
  }

  Future<void> _completePlanDay({bool clearMeta = true}) async {
    final meta = widget.planMeta;
    if (meta == null) return;
    var session = meta.session;
    final idx = stepForChapter(meta.steps, widget.book.id, widget.chapter);
    if (idx >= 0) {
      final step = meta.steps[idx];
      if (!session.stepsDone.contains(step.id)) {
        session = await markStepDone(
          ref.read(prefsProvider),
          session,
          step.id,
          meta.steps,
        );
      }
    }
    await ref
        .read(planProgressRepoProvider)
        .mark(meta.planId, meta.day, status: 'done', session: session);
    await clearPlanSession(ref.read(prefsProvider), meta.planId, meta.day);
    if (meta.day < meta.totalDays) {
      await ref
          .read(planProgressRepoProvider)
          .mark(meta.planId, meta.day + 1, status: 'active');
    }
    if (clearMeta) widget.onPlanMetaChange?.call(null);
  }

  Future<void> _continueNextPlanDay() async {
    final meta = widget.planMeta;
    if (meta == null || meta.day >= meta.totalDays) return;
    await _completePlanDay(clearMeta: false);
    final next = await buildPlanReadingMeta(
      ref,
      ref.read(prefsProvider),
      planId: meta.planId,
      planTitle: meta.planTitle,
      day: meta.day + 1,
      totalDays: meta.totalDays,
      source: meta.source,
    );
    if (next == null || !mounted) {
      widget.onPlanMetaChange?.call(null);
      return;
    }
    widget.onPlanMetaChange?.call(next);
    final step = next.steps[resumeStepIndex(next)];
    widget.onPlanJump?.call(step.bookId, step.chapterStart);
  }

  Future<void> _showPlanDayCelebration() async {
    final meta = widget.planMeta;
    if (meta == null || !mounted) return;
    final prog = sessionProgress(meta.steps, meta.session.stepsDone);
    final hasGroups = (ref.read(myGroupsProvider).value ?? const []).isNotEmpty;
    final reflection = TextEditingController();
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            16,
            20,
            MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '第 ${meta.day} 天已完成',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 17,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${prog.total}/${prog.total} 段已读完'
                '${meta.day < meta.totalDays ? ' · 可以开始第 ${meta.day + 1} 天' : ' · 计划已全部完成'}',
                style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
              ),
              const SizedBox(height: 14),
              const Text(
                '用一两句话记下今天的感动或应用（可选）',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: reflection,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: '今天神对我说…',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              if (meta.day < meta.totalDays)
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, 'next'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accentDeep,
                  ),
                  child: Text('继续下一天 · 第 ${meta.day + 1} 天 ›'),
                ),
              if (meta.day < meta.totalDays) const SizedBox(height: 8),
              if (hasGroups)
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx, 'share'),
                  child: const Text('分享到共读群'),
                ),
              if (hasGroups) const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.pop(ctx, 'done'),
                child: const Text('完成'),
              ),
            ],
          ),
        );
      },
    );
    final note = reflection.text.trim();
    reflection.dispose();
    if (note.isNotEmpty) {
      await ref
          .read(thoughtsRepoProvider)
          .addThought(
            '${widget.book.id}.${widget.chapter}',
            note,
            visibility: ThoughtVisibility.private,
          );
    }
    if (!mounted) return;
    switch (action) {
      case 'next':
        await _continueNextPlanDay();
      case 'share':
        await _completePlanDay();
        if (!mounted) return;
        await showGroupCheckinSheet(
          context,
          ref,
          bookId: widget.book.id,
          bookName: widget.book.name,
          chapter: widget.chapter,
        );
      case 'done':
      default:
        if (action != null) await _completePlanDay();
    }
  }

  Widget? _planSegmentFooter() {
    final meta = widget.planMeta;
    if (meta == null) return null;

    if (allStepsDone(meta.steps, meta.session.stepsDone)) {
      final prog = sessionProgress(meta.steps, meta.session.stepsDone);
      if (!_planDayFinishScheduled) {
        _planDayFinishScheduled = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _showPlanDayCelebration();
        });
      }
      return Container(
        margin: const EdgeInsets.only(top: 16, bottom: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.goldWash,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '今日 ${prog.total} 段全部读完',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _showPlanDayCelebration,
              child: const Text('写下今日反思 ›'),
            ),
          ],
        ),
      );
    }

    final idx = stepForChapter(meta.steps, widget.book.id, widget.chapter);
    if (idx < 0) return null;
    final step = meta.steps[idx];
    if (!isLastChapterOfStep(step, widget.chapter)) return null;
    final next = pendingNextStep(
      meta.steps,
      meta.session.stepsDone,
      widget.book.id,
      widget.chapter,
    );
    if (next == null) return null;
    return Container(
      margin: const EdgeInsets.only(top: 16, bottom: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.accentWash,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.accent),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '✓ ${step.label} 已读完',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          const SizedBox(height: 6),
          Text(
            '下一段：${next.label}',
            style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _continuePlanSegment,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.accentDeep,
            ),
            child: Text('继续读 ${next.label} ›'),
          ),
        ],
      ),
    );
  }

  /// 相邻章（用于横滑翻页 peek）。
  ({BibleBook book, int chapter})? _adjacentTarget(int delta) {
    final books = widget.books;
    final bi = books.indexWhere((b) => b.id == widget.book.id);
    if (bi < 0) return null;
    if (delta > 0) {
      if (widget.chapter < widget.book.chapterCount) {
        return (book: widget.book, chapter: widget.chapter + 1);
      }
      if (bi + 1 < books.length) {
        return (book: books[bi + 1], chapter: 1);
      }
    } else if (delta < 0) {
      if (widget.chapter > 1) {
        return (book: widget.book, chapter: widget.chapter - 1);
      }
      if (bi > 0) {
        final prev = books[bi - 1];
        return (book: prev, chapter: prev.chapterCount);
      }
    }
    return null;
  }

  /// 与当前主文同译本预取邻章，避免 peek 空白/错译本。
  void _prefetchAdjacentChapters() {
    for (final delta in const [-1, 1]) {
      final target = _adjacentTarget(delta);
      if (target == null) continue;
      // 默认 chapterProvider（布局/目录用）始终预热，保证段落分段一致。
      unawaited(
        ref
            .read(
              chapterProvider((
                book: target.book.id,
                chapter: target.chapter,
              )).future,
            )
            .then((_) {}, onError: (_) {}),
      );
      if (widget.mainVersionId != null) {
        unawaited(
          ref
              .read(
                chapterVersionProvider((
                  book: target.book.id,
                  chapter: target.chapter,
                  version: widget.mainVersionId!,
                )).future,
              )
              .then((_) {}, onError: (_) {}),
        );
      }
    }
  }

  double _clampPageDrag(double raw, double width) {
    var o = raw.clamp(-width, width);
    if (o < 0 && _adjacentTarget(1) == null) o *= 0.28;
    if (o > 0 && _adjacentTarget(-1) == null) o *= 0.28;
    return o;
  }

  void _resetPageDrag() {
    _pageDragDx = 0;
    _pageDragRaw = 0;
    _pageTurnPrefetched = false;
    _pageDragAxis = null;
    _pageTurnAnimating = false;
  }

  void _onPageDragUpdate(double deltaDx) {
    if (_pageTurnAnimating) return;
    final width = MediaQuery.sizeOf(context).width;
    if (width <= 0) return;
    setState(() {
      // HorizontalDragRecognizer 已完成横轴锁定；此处记录轴态供复位。
      _pageDragAxis = 'x';
      _pageDragRaw = (_pageDragRaw + deltaDx).clamp(-width, width);
      _pageDragDx = _clampPageDrag(_pageDragRaw, width);
    });
    if (!_pageTurnPrefetched && _pageDragRaw.abs() / width >= 0.04) {
      _pageTurnPrefetched = true;
      _prefetchAdjacentChapters();
    }
  }

  bool _shouldCommitPageTurn({
    required double dx,
    required double width,
    required double velocityPxPerSec,
  }) {
    if (width <= 0) return false;
    final ratio = dx.abs() / width;
    final goingPrev = dx > 0;
    // 对齐 PWA useReaderPageTurn：下一页 13%/24%，上一页更松 9%/18%；
    // 速度单位 Flutter 为 px/s，对应 PWA 0.09–0.12 px/ms。
    final threshold = goingPrev ? 0.09 : 0.13;
    final force = goingPrev ? 0.18 : 0.24;
    final velMin = goingPrev ? 90.0 : 120.0;
    final soft = goingPrev ? 0.07 : 0.09;
    return ratio >= force ||
        ratio >= threshold ||
        (ratio >= soft && velocityPxPerSec.abs() >= velMin);
  }

  Future<void> _animatePageDragTo(double target) async {
    final start = _pageDragDx;
    if ((start - target).abs() < 0.5) return;
    setState(() => _pageTurnAnimating = true);
    _pageTurnAnimation = Tween<double>(begin: start, end: target).animate(
      CurvedAnimation(parent: _pageTurnController, curve: Curves.easeOut),
    );
    await _pageTurnController.forward(from: 0);
  }

  Future<void> _finishPageTurn(DragEndDetails d) async {
    if (_pageTurnAnimating) return;
    widget.onInteract();
    final width = MediaQuery.sizeOf(context).width;
    // 用原始位移判定方向/阈值，避免边界阻力压扁后永远翻不过去
    final dx = _pageDragRaw;
    final v = d.primaryVelocity ?? 0;
    final goingNext = dx < 0 || (dx == 0 && v < 0);
    final can = _adjacentTarget(goingNext ? 1 : -1) != null;
    final ratio = width > 0 ? dx.abs() / width : 0.0;
    final commit = _shouldCommitPageTurn(
      dx: dx,
      width: width,
      velocityPxPerSec: v,
    );
    if (commit && can) {
      // 对齐 PWA：翻页无震动，跟手阈值见 _shouldCommitPageTurn。
      await _animatePageDragTo(goingNext ? -width : width);
      if (!mounted) return;
      setState(_resetPageDrag);
      widget.onNav(goingNext ? 1 : -1);
      return;
    }
    // 未提交或章节边界均回弹至当前页，避免松手瞬移。
    await _animatePageDragTo(0);
    if (!mounted) return;
    setState(_resetPageDrag);
    if (!can && ratio >= 0.1) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(goingNext ? '已是最后一章' : '已是第一章'),
          duration: const Duration(milliseconds: 1200),
        ),
      );
    }
  }

  Widget _chapterPeekPanel({
    required ReaderExperienceTheme theme,
    required int delta,
    required double width,
  }) {
    final target = _adjacentTarget(delta);
    final topPad = _readerListTopPad();
    if (target == null) {
      return ColoredBox(
        color: theme.background,
        child: Center(
          child: Text(
            delta > 0 ? '已是最后一章' : '已是第一章',
            style: TextStyle(
              fontSize: 14,
              color: theme.ink.withValues(alpha: 0.45),
            ),
          ),
        ),
      );
    }
    final async = widget.mainVersionId != null
        ? ref.watch(
            chapterVersionProvider((
              book: target.book.id,
              chapter: target.chapter,
              version: widget.mainVersionId!,
            )),
          )
        : ref.watch(
            chapterProvider((book: target.book.id, chapter: target.chapter)),
          );
    final fontPx = ref.watch(readerFontProvider).px;
    final fontFamily = ref.watch(readerFontFamilyProvider);
    final verseNo = ref.watch(readerVerseNumberProvider);
    final highlights = ref.watch(highlightMapProvider).value ?? const {};
    final underlinesEnabled = ref
        .watch(readerFeatureTogglesProvider)
        .underlines;
    final compareId = widget.mainVersionId == null
        ? widget.compareVersionId
        : null;
    final layoutAsync = widget.mainVersionId != null
        ? ref.watch(
            chapterProvider((book: target.book.id, chapter: target.chapter)),
          )
        : null;
    final compareAsync = compareId == null
        ? null
        : ref.watch(
            chapterVersionProvider((
              book: target.book.id,
              chapter: target.chapter,
              version: compareId,
            )),
          );
    final outline = outlineFor(target.book.id, target.chapter);
    final sectionByVerse = {for (final s in outline) s.verse: s.title};
    final apiSections = ref
        .watch(
          sectionTitlesProvider((
            book: target.book.id,
            chapter: target.chapter,
          )),
        )
        .value;
    if (apiSections != null) {
      for (final s in apiSections) {
        final t = s.title.trim();
        if (t.isNotEmpty) sectionByVerse[s.verse] = t;
      }
    }

    return ColoredBox(
      color: theme.background,
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Text(
            '加载失败',
            style: TextStyle(color: theme.ink.withValues(alpha: 0.45)),
          ),
        ),
        data: (ch) {
          // 有独立译本时须等默认布局章就绪，避免用译本经文做分段导致预览标题/段落错位。
          if (widget.mainVersionId != null &&
              (layoutAsync == null || !layoutAsync.hasValue)) {
            return const Center(child: CircularProgressIndicator());
          }
          return _ChapterPeekContent(
            book: target.book,
            chapter: target.chapter,
            primary: ch,
            structure: layoutAsync?.value ?? ch,
            parallel: compareAsync?.value,
            sectionByVerse: sectionByVerse,
            verseNo: verseNo,
            fontPx: fontPx,
            fontFamily: fontFamily,
            highlights: highlights,
            underlinesEnabled: underlinesEnabled,
            theme: theme,
            topPad: topPad,
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = ref.watch(readerExperienceThemeProvider);
    final verseNo = ref.watch(readerVerseNumberProvider);
    final async = widget.mainVersionId != null
        ? ref.watch(
            chapterVersionProvider((
              book: widget.book.id,
              chapter: widget.chapter,
              version: widget.mainVersionId!,
            )),
          )
        : ref.watch(
            chapterProvider((book: widget.book.id, chapter: widget.chapter)),
          );
    final highlights = ref.watch(highlightMapProvider).value ?? const {};
    final toggles = ref.watch(readerFeatureTogglesProvider);
    final pageTurn = ref.watch(readerPageTurnProvider);
    final fontFamily = ref.watch(readerFontFamilyProvider);
    final readingMode = ref.watch(readingModeProvider);
    final thoughtsByVerse = ref.watch(
      thoughtsByChapterProvider((
        book: widget.book.id,
        chapter: widget.chapter,
      )),
    );
    final myThoughtsByVerse = ref.watch(
      myThoughtsByChapterProvider((
        book: widget.book.id,
        chapter: widget.chapter,
      )),
    );
    final dictList = ref.watch(dictionaryProvider('')).value ?? const [];
    final dictIndex = buildDictIndex(dictList);
    final dictKeys = dictSortedKeys(dictIndex);
    final outline = outlineFor(widget.book.id, widget.chapter);
    final sectionByVerse = {for (final s in outline) s.verse: s.title};
    // API 分段优先；本地 outlines 作兜底
    final apiSections = ref
        .watch(
          sectionTitlesProvider((
            book: widget.book.id,
            chapter: widget.chapter,
          )),
        )
        .value;
    if (apiSections != null) {
      for (final s in apiSections) {
        final t = s.title.trim();
        if (t.isNotEmpty) sectionByVerse[s.verse] = t;
      }
    }
    final poetry = const {
      'PSA',
      'PRO',
      'ECC',
      'SNG',
      'LAM',
      'AMO',
      'MIC',
      'HAB',
      'ZEP',
      'NAH',
      'HAG',
      'ZEC',
      'MAL',
      'JOB',
    }.contains(widget.book.id.toUpperCase());

    final compareId = widget.mainVersionId == null
        ? widget.compareVersionId
        : null;
    final notesByVerse = ref
        .watch(notesStreamProvider)
        .maybeWhen(
          data: (list) => notesForChapter(list, widget.book.id, widget.chapter),
          orElse: () => const <int, List<Note>>{},
        );
    final compareAsync = compareId != null
        ? ref.watch(
            chapterVersionProvider((
              book: widget.book.id,
              chapter: widget.chapter,
              version: compareId,
            )),
          )
        : null;
    final layoutAsync = widget.mainVersionId != null
        ? ref.watch(
            chapterProvider((book: widget.book.id, chapter: widget.chapter)),
          )
        : null;

    Widget buildBody(
      Chapter ch,
      Chapter? compareCh,
      Chapter? layoutCh, {
      String? compareStatus,
    }) {
      _liveChapter = ch;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onRead(widget.book.id, widget.chapter);
        if (widget.mainVersionId == null) {
          writeChapterCache(
            ref.read(prefsProvider),
            widget.book.id,
            widget.chapter,
            ch,
          );
        }
        if (!_resumeScheduled && _selected.isEmpty) {
          _resumeScheduled = true;
          _maybeResume();
        }
      });
      return _buildList(
        ch,
        theme,
        verseNo,
        dictIndex,
        dictKeys,
        highlights,
        sectionByVerse,
        null,
        poetry,
        layoutChapter: layoutCh ?? ch,
        compareChapter: compareCh,
        compareStatus: compareStatus,
        notesByVerse: notesByVerse,
        underlinesEnabled: toggles.underlines,
        thoughtsEnabled: toggles.thoughts,
        thoughtsByVerse: thoughtsByVerse,
        myThoughtsByVerse: myThoughtsByVerse,
        pageTurn: pageTurn,
        fontFamily: fontFamily,
      );
    }

    return ColoredBox(
      color: theme.background,
      child: Stack(
        children: [
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            // 对齐 PWA：非沉浸也不显示顶栏下进度横线
            child: const SizedBox.shrink(),
          ),
          Column(
            children: [
              Expanded(
                child: async.when(
                  loading: () {
                    if (_cachedChapter != null) {
                      return _buildList(
                        _cachedChapter!,
                        theme,
                        verseNo,
                        dictIndex,
                        dictKeys,
                        highlights,
                        sectionByVerse,
                        null,
                        poetry,
                        layoutChapter: _cachedChapter!,
                        compareChapter: null,
                        notesByVerse: notesByVerse,
                      );
                    }
                    return const Center(child: CircularProgressIndicator());
                  },
                  error: (e, _) => Center(child: Text('$e')),
                  data: (ch) {
                    final layoutCh = layoutAsync?.asData?.value;
                    if (compareAsync == null)
                      return buildBody(ch, null, layoutCh);
                    return compareAsync.when(
                      loading: () => buildBody(
                        ch,
                        null,
                        layoutCh,
                        compareStatus: 'loading',
                      ),
                      error: (_, _) =>
                          buildBody(ch, null, layoutCh, compareStatus: 'error'),
                      data: (ch2) => buildBody(ch, ch2, layoutCh),
                    );
                  },
                ),
              ),
            ],
          ),
          if (_selected.isNotEmpty)
            Positioned(
              top:
                  _focusBarTop ??
                  (MediaQuery.of(context).size.height -
                      (widget.chromeHidden ? 140 : 200)),
              left: 12,
              right: 12,
              child: ReaderFocusBar(
                readingMode: readingMode,
                currentMark: toggles.underlines
                    ? _currentSelectionMark(highlights)
                    : null,
                underlinesEnabled: toggles.underlines,
                thoughtsEnabled: toggles.thoughts,
                onLightAi: () {
                  final text = _selectionText(async.value);
                  _clearSelection();
                  widget.onAskAi(_refStr, _refLabel, text, false);
                },
                onCopy: () {
                  final t = _selectionText(async.value);
                  Clipboard.setData(ClipboardData(text: '$_refLabel $t'));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('已复制'),
                      duration: Duration(milliseconds: 1200),
                    ),
                  );
                  _clearSelection();
                },
                onThought: () {
                  _writeThought(async.value);
                  _clearSelection();
                },
                onVerseCard: () {
                  final t = _selectionText(
                    _liveChapter ?? _cachedChapter ?? async.value,
                  ).trim();
                  if (t.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('经文加载中'),
                        duration: Duration(milliseconds: 1200),
                      ),
                    );
                    return;
                  }
                  final label = _refLabel;
                  _clearSelection();
                  showVerseCardSheet(context, refLabel: label, text: t);
                },
                onCompare: () {
                  final refParam = _selectionRefStr;
                  final label = _refLabel;
                  final text = _selectionText(async.value);
                  _clearSelection();
                  showVerseCompareSheet(
                    context,
                    refParam: refParam,
                    refLabel: label,
                    selectionText: text,
                    onOpenChapterParallel: () {
                      widget.onEnableParallel?.call(
                        widget.compareVersionId ?? 'cnv',
                      );
                    },
                  );
                },
                onPickColor: (c) {
                  _pickHighlightColor(c);
                },
                onClearMark: _clearHighlight,
                onClose: _clearSelection,
              ),
            ),
          if (_guideTipVisible && _selected.isEmpty && widget.planMeta == null)
            Positioned(
              left: 12,
              right: 12,
              top: widget.chromeHidden
                  ? (MediaQuery.paddingOf(context).top + 56)
                  : 56,
              child: _ChapterGuideTipBar(
                bookName: widget.book.name,
                chapter: widget.chapter,
                compact: _guideTipCompact,
                onOpen: () {
                  setState(() => _guideTipVisible = false);
                  _showChapterSummary(initialTab: 'chapter');
                },
                onSkipSession: () {
                  skipChapterGuideThisSession(widget.book.id, widget.chapter);
                  setState(() => _guideTipVisible = false);
                },
                onDisableForever: () async {
                  await disableChapterGuideAuto(ref.read(prefsProvider));
                  if (mounted) setState(() => _guideTipVisible = false);
                },
              ),
            ),
          if (_chapterTipVisible &&
              _selected.isEmpty &&
              widget.planMeta == null)
            Positioned(
              left: 12,
              right: 12,
              bottom: widget.chromeHidden ? 24 : 80,
              child: _ChapterCompleteTip(
                bookName: widget.book.name,
                chapter: widget.chapter,
                meditate: readingMode == ReadingMode.meditate,
                onThought: () {
                  setState(() => _chapterTipVisible = false);
                  showWriteThoughtSheet(
                    context,
                    ref,
                    refStr: '${widget.book.id}.${widget.chapter}.1',
                    refLabel: '${widget.book.name} ${widget.chapter}:1',
                  );
                },
                onNext: () {
                  setState(() => _chapterTipVisible = false);
                  widget.onNextChapter?.call();
                  if (widget.onNextChapter == null) widget.onNav(1);
                },
                onDismiss: () => setState(() => _chapterTipVisible = false),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildList(
    Chapter ch,
    ReaderExperienceTheme theme,
    ReaderVerseNumberMode verseNo,
    Map<String, List<DictEntity>> dictIndex,
    List<String> dictKeys,
    Map<String, HighlightMark> highlights,
    Map<int, String> sectionByVerse,
    ChapterContextInfo? ctx,
    bool poetry, {
    required Chapter layoutChapter,
    Chapter? compareChapter,
    String? compareStatus,
    Map<int, List<Note>> notesByVerse = const {},
    bool underlinesEnabled = true,
    bool thoughtsEnabled = true,
    Map<int, int> thoughtsByVerse = const {},
    Map<int, int> myThoughtsByVerse = const {},
    ReaderPageTurn pageTurn = ReaderPageTurn.swipe,
    ReaderFontFamily fontFamily = ReaderFontFamily.serif,
  }) {
    if (compareChapter != null || compareStatus != null) {
      return _buildParallelList(
        layoutChapter,
        ch,
        compareChapter,
        theme,
        verseNo,
        ctx,
        poetry,
        compareStatus: compareStatus,
        sectionByVerse: sectionByVerse,
      );
    }

    final rows = <Object>[];
    final breakVerses = sectionByVerse.keys.toList()..sort();
    final paras = groupVersesIntoParagraphs(
      widget.book.id,
      layoutChapter.verses,
      breakVerses,
    );
    for (final para in paras) {
      final t = sectionByVerse[para.startVerse];
      if (t != null) rows.add(t);
      rows.add(para);
    }

    VerseParagraph displayPara(VerseParagraph para) {
      if (identical(layoutChapter, ch)) return para;
      return VerseParagraph(
        startVerse: para.startVerse,
        endVerse: para.endVerse,
        verses: para.verses
            .map(
              (v) => ch.verses.firstWhere(
                (x) => x.verse == v.verse,
                orElse: () => v,
              ),
            )
            .toList(),
      );
    }

    final segmentFooter = _planSegmentFooter();
    final planHead = widget.planMeta != null ? 1 : 0;
    final planTail = segmentFooter != null ? 1 : 0;
    final reduceMotion = peiaiReduceMotion(context);
    final pageW = MediaQuery.sizeOf(context).width;
    final swipeOn =
        pageTurn == ReaderPageTurn.swipe &&
        !reduceMotion &&
        !_pageTurnAnimating &&
        !_selectionGestureActive;
    final dx = _pageDragDx;

    final listBody = VerseSelectionSurface(
      enabled: true,
      onApplyRange: (a, f, {commit = true}) =>
          _applyWordRange(a, f, commit: commit),
      onCommitRange: _commitWordRangeProgress,
      onClearIfEmptyTap: _selected.isNotEmpty ? _clearSelection : null,
      onSelectionGestureChanged: (on) {
        if (_selectionGestureActive != on) {
          setState(() => _selectionGestureActive = on);
        }
      },
      child: ListView.builder(
        controller: _scroll,
        physics: dx.abs() > 8 ? const NeverScrollableScrollPhysics() : null,
        scrollCacheExtent: const ScrollCacheExtent.pixels(900),
        // 沉浸：顶垫给固定卷章条；非沉浸：底垫对齐胶囊底栏（peiaiTabContentBottomPad）
        padding: EdgeInsets.fromLTRB(
          16,
          _readerListTopPad(),
          20,
          widget.chromeHidden
              ? (MediaQuery.paddingOf(context).bottom + 8)
              : peiaiTabContentBottomPad(context, includeSafe: false),
        ),
        itemCount: rows.length + 1 + planHead + planTail,
        itemBuilder: (_, i) {
          if (planHead == 1 && i == 0) {
            final meta = widget.planMeta!;
            final stepIdx = stepForChapter(
              meta.steps,
              widget.book.id,
              widget.chapter,
            );
            return PlanReadingBar(
              planTitle: meta.planTitle,
              day: meta.day,
              totalDays: meta.totalDays,
              steps: meta.steps,
              session: meta.session,
              onJumpStep: (index) {
                final s = meta.steps[index];
                widget.onPlanJump?.call(s.bookId, s.chapterStart);
              },
              onOpenSheet: () => showPlanDaySheet(
                context,
                day: meta.day,
                steps: meta.steps,
                session: meta.session,
                currentStepIndex: stepIdx >= 0
                    ? stepIdx
                    : meta.session.currentStepIndex,
                onJump: (index) {
                  final s = meta.steps[index];
                  widget.onPlanJump?.call(s.bookId, s.chapterStart);
                },
              ),
            );
          }
          if (i == planHead) {
            // 卷章固定在轨道外叠层，避免横滑时标题跟着正文移走。
            return const SizedBox.shrink();
          }
          if (planTail == 1 && i == rows.length + 1 + planHead) {
            return segmentFooter!;
          }
          final r = rows[i - 1 - planHead];
          if (r is String) {
            return _sectionTitle(r);
          }
          final para = r as VerseParagraph;
          return _ParagraphBlock(
            book: widget.book,
            chapter: widget.chapter,
            paragraph: displayPara(para),
            verseNo: verseNo,
            poetry: poetry,
            selected: _selected,
            wordRange: _wordRange,
            highlightMarks: highlights,
            underlinesEnabled: underlinesEnabled,
            thoughtsEnabled: thoughtsEnabled,
            thoughtsByVerse: thoughtsByVerse,
            myThoughtsByVerse: myThoughtsByVerse,
            notesByVerse: notesByVerse,
            fontFamily: fontFamily,
            dictIndex: dictIndex,
            dictKeys: dictKeys,
            selectionAnchorVerse: _selectionAnchorVerse,
            selectionAnchorKey: _selectionAnchorKey,
            resumeFlashVerse: _resumeFlashVerse,
            resumeAnchorKey: _resumeAnchorKey,
            onViewNote: _viewNote,
            onStart: _startSelect,
            onToggle: _toggleSelect,
            onWordStart: _startWordSelect,
            onWordExtend: _extendWordSelect,
            onOpenThoughts: _openThoughtsForVerse,
            onOpenDict: (entity, name, candidates) {
              showEntityKnowledgeSheet(
                context,
                ref,
                entity: entity,
                displayName: name,
                candidates: candidates,
              );
            },
          );
        },
      ),
    );

    return _pageTurnViewport(
      swipeOn: swipeOn,
      dx: dx,
      pageW: pageW,
      theme: theme,
      listBody: listBody,
    );
  }

  Widget _chapterLocTitle(
    ReaderExperienceTheme theme, {
    String? bookName,
    int? chapter,
  }) {
    final name = bookName ?? widget.book.name;
    final ch = chapter ?? widget.chapter;
    return Row(
      children: [
        GestureDetector(
          onTap: () => _showChapterSummary(initialTab: 'book'),
          child: Text(
            name,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: theme.ink,
            ),
          ),
        ),
        const SizedBox(width: 10),
        GestureDetector(
          onTap: () => _showChapterSummary(initialTab: 'chapter'),
          child: Text(
            '第 $ch 章',
            style: TextStyle(
              fontSize: 13,
              color: theme.ink.withValues(alpha: 0.55),
            ),
          ),
        ),
      ],
    );
  }

  /// 横滑时卷名保持，仅章节号跟随邻章；不随正文轨道移走。
  Widget _stableLocOverlay(ReaderExperienceTheme theme, double dx) {
    var bookName = widget.book.name;
    var chapter = widget.chapter;
    if (dx.abs() > 8) {
      final target = _adjacentTarget(dx < 0 ? 1 : -1);
      if (target != null) {
        bookName = target.book.name;
        chapter = target.chapter;
      }
    }
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Material(
        color: theme.background,
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, _locOverlayTopPad(), 20, 10),
          child: _chapterLocTitle(
            theme,
            bookName: bookName,
            chapter: chapter,
          ),
        ),
      ),
    );
  }

  double _locOverlayTopPad() => widget.chromeHidden
      ? MediaQuery.paddingOf(context).top + 8
      : 12.0;

  /// 固定卷章条高度，正文从条下开始，避免标题随横滑轨道移走。
  double _readerListTopPad() => _locOverlayTopPad() + 34;

  Widget _pageTurnViewport({
    required bool swipeOn,
    required double dx,
    required double pageW,
    required ReaderExperienceTheme theme,
    required Widget listBody,
  }) {
    return MediaQuery(
      data: MediaQuery.of(context).copyWith(
        gestureSettings: const DeviceGestureSettings(touchSlop: 8),
      ),
      child: GestureDetector(
        onHorizontalDragUpdate: swipeOn
            ? (d) => _onPageDragUpdate(d.delta.dx)
            : null,
        onHorizontalDragEnd: swipeOn ? _finishPageTurn : null,
        onHorizontalDragCancel: () {
          if (_pageDragDx != 0 || _pageDragRaw != 0 || _pageDragAxis != null) {
            setState(_resetPageDrag);
          }
        },
        child: Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            ClipRect(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (dx < -2)
                    Positioned(
                      left: pageW + dx,
                      top: 0,
                      bottom: 0,
                      width: pageW,
                      child: _chapterPeekPanel(
                        theme: theme,
                        delta: 1,
                        width: pageW,
                      ),
                    ),
                  if (dx > 2)
                    Positioned(
                      left: dx - pageW,
                      top: 0,
                      bottom: 0,
                      width: pageW,
                      child: _chapterPeekPanel(
                        theme: theme,
                        delta: -1,
                        width: pageW,
                      ),
                    ),
                  Transform.translate(
                    offset: Offset(dx, 0),
                    child: RepaintBoundary(
                      child: ColoredBox(
                        color: theme.background,
                        child: listBody,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            _stableLocOverlay(theme, dx),
          ],
        ),
      ),
    );
  }

  Widget _buildParallelList(
    Chapter structure,
    Chapter primary,
    Chapter? compare,
    ReaderExperienceTheme theme,
    ReaderVerseNumberMode verseNo,
    ChapterContextInfo? ctx,
    bool poetry, {
    String? compareStatus,
    Map<int, String>? sectionByVerse,
  }) {
    final fontPx = ref.watch(readerFontProvider).px;
    final fontFamily = ref.watch(readerFontFamilyProvider);
    final showDiff =
        compare != null &&
        ref.watch(parallelDiffOnProvider) &&
        ref.watch(readingModeProvider) == ReadingMode.study;
    final sections =
        sectionByVerse ??
        {
          for (final s in outlineFor(widget.book.id, widget.chapter))
            s.verse: s.title,
        };
    final paras = groupVersesIntoParagraphs(
      widget.book.id,
      structure.verses,
      sections.keys.toList()..sort(),
    );
    final rows = <Object>[];
    for (final para in paras) {
      final t = sections[para.startVerse];
      if (t != null) rows.add(t);
      rows.add(para);
    }

    String verseText(Chapter? ch, int verseNum) {
      if (ch == null) {
        if (compareStatus == 'loading') return '加载中…';
        if (compareStatus == 'error') return '译本加载失败';
        return '—';
      }
      return ch.verses
              .where((x) => x.verse == verseNum)
              .map((x) => x.text)
              .firstOrNull ??
          '—';
    }

    List<InlineSpan> textSpans({
      required String text,
      required List<DiffSpan> diffs,
      required TextStyle base,
      TextStyle? diffStyle,
      bool selected = false,
      Paint? selBg,
    }) {
      if (!showDiff || diffs.isEmpty) {
        return [
          TextSpan(
            text: '$text ',
            style: selected ? base.copyWith(background: selBg) : base,
          ),
        ];
      }
      final parts = renderTextWithDiffSpans(text, diffs);
      return [
        for (final p in parts)
          TextSpan(
            text: p.text,
            style: p.diff
                ? (diffStyle ??
                      base.copyWith(
                        backgroundColor: const Color(0x22C4A35A),
                        color: base.color,
                      ))
                : (selected ? base.copyWith(background: selBg) : base),
          ),
        TextSpan(text: ' ', style: base),
      ];
    }

    final pageTurn = ref.watch(readerPageTurnProvider);
    final reduceMotion = peiaiReduceMotion(context);
    final swipeOn =
        pageTurn == ReaderPageTurn.swipe &&
        !reduceMotion &&
        !_pageTurnAnimating &&
        !_selectionGestureActive;
    final pageW = MediaQuery.sizeOf(context).width;
    final dx = _pageDragDx;

    final listBody = ListView.builder(
      controller: _scroll,
      physics: dx.abs() > 8 ? const NeverScrollableScrollPhysics() : null,
      scrollCacheExtent: const ScrollCacheExtent.pixels(900),
      // 对照模式同样沿用 PWA 的 16px 阅读边距，并垫开胶囊底栏。
      padding: EdgeInsets.fromLTRB(
        16,
        _readerListTopPad(),
        16,
        widget.chromeHidden
            ? (MediaQuery.paddingOf(context).bottom + 8)
            : peiaiTabContentBottomPad(context, includeSafe: false),
      ),
      itemCount: rows.length + 1,
      itemBuilder: (_, i) {
        if (i == 0) {
          if (compareStatus != 'loading' && compareStatus != 'error') {
            return const SizedBox.shrink();
          }
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              compareStatus == 'loading' ? '对照译本加载中…' : '译本加载失败，请稍后重试',
              style: TextStyle(
                fontSize: 13,
                color: compareStatus == 'loading'
                    ? AppColors.inkFaint
                    : AppColors.inkSoft,
              ),
            ),
          );
        }
        final r = rows[i - 1];
        if (r is String) {
          return _sectionTitle(r);
        }
        final para = r as VerseParagraph;
        final primarySpans = <InlineSpan>[];
        final compareSpans = <InlineSpan>[];
        final selBg = Paint()..color = AppColors.accentWash;
        final mainBase = TextStyle(
          color: theme.ink,
          fontSize: fontPx,
          // 对齐 PWA 单栏：诗体 2.1，散文 2.05；不在对照模式硬编码 Georgia。
          height: poetry ? 2.1 : 2.05,
          letterSpacing: fontPx * 0.015,
          fontFamily: fontFamily.fontFamily,
          fontFamilyFallback: fontFamily.fontFamilyFallback,
        );
        final parallelBase = TextStyle(
          color: theme.ink.withValues(alpha: 0.55),
          fontSize: fontPx * 0.92,
          // PWA `.reader-parallel-secondary` 使用 0.92em / 1.55。
          height: 1.55,
          letterSpacing: fontPx * 0.015,
          fontFamily: fontFamily.fontFamily,
          fontFamilyFallback: fontFamily.fontFamilyFallback,
        );
        for (final v in para.verses) {
          final isSel = _selected.contains(v.verse);
          final mainT = verseText(primary, v.verse);
          final parallelT = verseText(compare, v.verse);
          final diff = showDiff && sameScriptRoughly(mainT, parallelT)
              ? cachedVerseDiff(
                  '${widget.book.id}.${widget.chapter}.${v.verse}',
                  mainT,
                  parallelT,
                )
              : const VerseDiffResult(main: [], parallel: [], heavy: false);
          if (verseNo != ReaderVerseNumberMode.hidden) {
            primarySpans.add(
              TextSpan(
                text: '${v.verse}\u2009',
                style: TextStyle(
                  color: AppColors.accentDeep,
                  fontSize: fontPx * 0.65,
                  fontWeight: FontWeight.w700,
                  height: 1.0,
                  background: isSel ? selBg : null,
                ),
              ),
            );
          }
          if (diff.heavy) {
            primarySpans.add(
              TextSpan(
                text: '$mainT ',
                style: mainBase.copyWith(
                  backgroundColor: isSel
                      ? AppColors.accentWash
                      : const Color(0x18B8860B),
                ),
              ),
            );
          } else {
            primarySpans.addAll(
              textSpans(
                text: mainT,
                diffs: diff.main,
                base: mainBase,
                selected: isSel,
                selBg: selBg,
              ),
            );
          }
          if (verseNo != ReaderVerseNumberMode.hidden) {
            compareSpans.add(
              TextSpan(
                text: '${v.verse} ',
                style: TextStyle(
                  color: AppColors.accentDeep.withValues(alpha: 0.55),
                  fontSize: fontPx * 0.6,
                  fontWeight: FontWeight.w700,
                ),
              ),
            );
          }
          if (diff.heavy) {
            compareSpans.add(
              TextSpan(
                text: '$parallelT ',
                style: parallelBase.copyWith(
                  backgroundColor: const Color(0x18B8860B),
                ),
              ),
            );
          } else {
            compareSpans.addAll(
              textSpans(
                text: parallelT,
                diffs: diff.parallel,
                base: parallelBase,
                diffStyle: parallelBase.copyWith(
                  backgroundColor: const Color(0x22C4A35A),
                ),
              ),
            );
          }
        }
        return Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RichText(
                textAlign: TextAlign.justify,
                text: TextSpan(style: mainBase, children: primarySpans),
              ),
              const SizedBox(height: 6),
              RichText(
                textAlign: TextAlign.justify,
                text: TextSpan(style: parallelBase, children: compareSpans),
              ),
            ],
          ),
        );
      },
    );

    return _pageTurnViewport(
      swipeOn: swipeOn,
      dx: dx,
      pageW: pageW,
      theme: theme,
      listBody: listBody,
    );
  }
}

/// 邻章预览和 PWA `ReaderChapterPeek` 使用同一层级：分段、划线、节号、
/// 对照译文均保留，但不承接选择、词典或阅读记录等交互。
class _ChapterPeekContent extends StatelessWidget {
  const _ChapterPeekContent({
    required this.book,
    required this.chapter,
    required this.primary,
    required this.structure,
    required this.parallel,
    required this.sectionByVerse,
    required this.verseNo,
    required this.fontPx,
    required this.fontFamily,
    required this.highlights,
    required this.underlinesEnabled,
    required this.theme,
    required this.topPad,
  });

  final BibleBook book;
  final int chapter;
  final Chapter primary;
  final Chapter structure;
  final Chapter? parallel;
  final Map<int, String> sectionByVerse;
  final ReaderVerseNumberMode verseNo;
  final double fontPx;
  final ReaderFontFamily fontFamily;
  final Map<String, HighlightMark> highlights;
  final bool underlinesEnabled;
  final ReaderExperienceTheme theme;
  final double topPad;

  bool get _poetry => const {
    'PSA',
    'PRO',
    'ECC',
    'SNG',
    'LAM',
    'AMO',
    'MIC',
    'HAB',
    'ZEP',
    'NAH',
    'HAG',
    'ZEC',
    'MAL',
    'JOB',
  }.contains(book.id.toUpperCase());

  TextStyle get _mainStyle => TextStyle(
    color: theme.ink,
    fontSize: fontPx,
    height: _poetry ? 2.1 : 2.05,
    letterSpacing: fontPx * 0.015,
    fontFamily: fontFamily.fontFamily,
    fontFamilyFallback: fontFamily.fontFamilyFallback,
  );

  TextStyle get _parallelStyle => _mainStyle.copyWith(
    color: theme.ink.withValues(alpha: 0.55),
    fontSize: fontPx * 0.92,
    height: 1.55,
  );

  String _textFor(Chapter source, int verse) =>
      source.verses.where((v) => v.verse == verse).firstOrNull?.text ?? '—';

  List<InlineSpan> _verseSpans(
    Verse verse, {
    required TextStyle style,
    required bool showNumber,
  }) {
    final spans = <InlineSpan>[];
    if (showNumber && verseNo != ReaderVerseNumberMode.hidden) {
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: Transform.translate(
            offset: Offset(0, -fontPx * 0.32),
            child: Text(
              '${verse.verse}',
              style: TextStyle(
                color: AppColors.accentDeep,
                fontSize: fontPx * 0.65,
                fontWeight: FontWeight.w700,
                height: 1,
                fontFamily: fontFamily.fontFamily,
                fontFamilyFallback: fontFamily.fontFamilyFallback,
              ),
            ),
          ),
        ),
      );
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: SizedBox(width: fontPx * 0.22),
        ),
      );
    }

    final mark = underlinesEnabled
        ? markForVerse(highlights, book.id, chapter, verse.verse)
        : null;
    final text = verse.text;
    final start = mark?.spanStart?.clamp(0, text.length);
    final end = mark?.spanEnd?.clamp(0, text.length);
    if (mark == null || start == null || end == null || start >= end) {
      spans.add(
        TextSpan(
          text: '$text ',
          style: applyHighlightStyle(style, mark: mark?.mark, disabled: false),
        ),
      );
      return spans;
    }
    if (start > 0) {
      spans.add(TextSpan(text: text.substring(0, start), style: style));
    }
    spans.add(
      TextSpan(
        text: text.substring(start, end),
        style: applyHighlightStyle(style, mark: mark.mark, disabled: false),
      ),
    );
    if (end < text.length) {
      spans.add(TextSpan(text: text.substring(end), style: style));
    }
    spans.add(TextSpan(text: ' ', style: style));
    return spans;
  }

  Widget _sectionTitle(String title) => Padding(
    padding: const EdgeInsets.fromLTRB(0, 10, 0, 8),
    child: Text(
      title,
      style: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: theme.ink.withValues(alpha: 0.55),
        letterSpacing: 0.4,
      ),
    ),
  );

  Widget _proseParagraph(VerseParagraph para) {
    final display = para.verses
        .map((v) => Verse(verse: v.verse, text: _textFor(primary, v.verse)))
        .toList();
    if (verseNo == ReaderVerseNumberMode.margin) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(
          children: [
            for (final verse in display)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: fontPx * 1.8,
                    child: Text(
                      '${verse.verse}',
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        color: AppColors.accentDeep,
                        fontSize: fontPx * 0.65,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  SizedBox(width: fontPx * 0.35),
                  Expanded(
                    child: RichText(
                      textAlign: TextAlign.justify,
                      text: TextSpan(
                        style: _mainStyle,
                        children: _verseSpans(
                          verse,
                          style: _mainStyle,
                          showNumber: false,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: RichText(
        textAlign: TextAlign.justify,
        text: TextSpan(
          style: _mainStyle,
          children: [
            for (final verse in display)
              ..._verseSpans(verse, style: _mainStyle, showNumber: true),
          ],
        ),
      ),
    );
  }

  Widget _parallelParagraph(VerseParagraph para) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final layoutVerse in para.verses) ...[
          RichText(
            textAlign: TextAlign.justify,
            text: TextSpan(
              style: _mainStyle,
              children: _verseSpans(
                Verse(
                  verse: layoutVerse.verse,
                  text: _textFor(primary, layoutVerse.verse),
                ),
                style: _mainStyle,
                showNumber: true,
              ),
            ),
          ),
          const SizedBox(height: 6),
          RichText(
            textAlign: TextAlign.justify,
            text: TextSpan(
              style: _parallelStyle,
              text: '${_textFor(parallel!, layoutVerse.verse)} ',
            ),
          ),
          const SizedBox(height: 8),
        ],
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final rows = <Object>[];
    final paragraphs = groupVersesIntoParagraphs(
      book.id,
      structure.verses,
      sectionByVerse.keys.toList()..sort(),
    );
    for (final paragraph in paragraphs) {
      final title = sectionByVerse[paragraph.startVerse];
      if (title != null && title.trim().isNotEmpty) rows.add(title.trim());
      rows.add(paragraph);
    }
    return ExcludeSemantics(
      child: ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, topPad, 20, 24),
        // 预览与 PWA ReaderChapterPeek 一致：不显示卷/章头，只渲经文。
        children: [
          for (final row in rows.take(12))
            row is String
                ? _sectionTitle(row)
                : parallel == null
                ? _proseParagraph(row as VerseParagraph)
                : _parallelParagraph(row as VerseParagraph),
        ],
      ),
    );
  }
}

class _ParagraphBlock extends ConsumerStatefulWidget {
  const _ParagraphBlock({
    required this.book,
    required this.chapter,
    required this.paragraph,
    required this.verseNo,
    required this.poetry,
    required this.selected,
    this.wordRange,
    required this.highlightMarks,
    required this.underlinesEnabled,
    required this.thoughtsEnabled,
    required this.thoughtsByVerse,
    required this.myThoughtsByVerse,
    required this.notesByVerse,
    required this.fontFamily,
    required this.dictIndex,
    required this.dictKeys,
    this.selectionAnchorVerse,
    this.selectionAnchorKey,
    this.resumeFlashVerse,
    this.resumeAnchorKey,
    required this.onViewNote,
    required this.onStart,
    required this.onToggle,
    required this.onWordStart,
    required this.onWordExtend,
    required this.onOpenThoughts,
    required this.onOpenDict,
  });

  final BibleBook book;
  final int chapter;
  final VerseParagraph paragraph;
  final ReaderVerseNumberMode verseNo;
  final bool poetry;
  final Set<int> selected;
  final WordRange? wordRange;
  final Map<String, HighlightMark> highlightMarks;
  final bool underlinesEnabled;
  final bool thoughtsEnabled;
  final Map<int, int> thoughtsByVerse;
  final Map<int, int> myThoughtsByVerse;
  final Map<int, List<Note>> notesByVerse;
  final ReaderFontFamily fontFamily;
  final Map<String, List<DictEntity>> dictIndex;
  final List<String> dictKeys;
  final int? selectionAnchorVerse;
  final GlobalKey? selectionAnchorKey;
  final int? resumeFlashVerse;
  final GlobalKey? resumeAnchorKey;
  final void Function(Note note) onViewNote;
  final void Function(int verse, String text) onStart;
  final void Function(int verse, String text) onToggle;
  final void Function(int verse, int start, int end) onWordStart;
  final void Function(int verse, int start, int end) onWordExtend;
  final void Function(int verse, String text) onOpenThoughts;
  final void Function(
    DictEntity entity,
    String name,
    List<DictEntity> candidates,
  )
  onOpenDict;

  @override
  ConsumerState<_ParagraphBlock> createState() => _ParagraphBlockState();
}

class _ParagraphBlockState extends ConsumerState<_ParagraphBlock> {
  final List<GestureRecognizer> _recognizers = [];

  void _clearRecognizers() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _clearRecognizers();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _clearRecognizers();
    final fontPx = ref.watch(readerFontProvider).px;
    final selectionActive = widget.selected.isNotEmpty;
    // 选中节高亮即可；不压暗其他节（对齐 PWA，避免「白蒙层」观感）
    // PWA 晨光/护眼：line-height 2.05 + letter-spacing 0.015em
    final baseStyle = TextStyle(
      color: AppColors.ink,
      fontSize: fontPx,
      height: widget.poetry ? 2.1 : 2.05,
      letterSpacing: fontPx * 0.015,
      fontFamily: widget.fontFamily.fontFamily,
      fontFamilyFallback: widget.fontFamily.fontFamilyFallback,
    );
    const selBg = Color(0x333390FF);
    final marginMode = widget.verseNo == ReaderVerseNumberMode.margin;

    if (marginMode) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final v in widget.paragraph.verses)
            _MarginVerseRow(
              verse: v,
              book: widget.book,
              chapter: widget.chapter,
              baseStyle: baseStyle,
              fontPx: fontPx,
              selectionActive: selectionActive,
              selBg: selBg,
              wordRange: widget.wordRange,
              selected: widget.selected,
              markInfo: widget.underlinesEnabled
                  ? markForVerse(
                      widget.highlightMarks,
                      widget.book.id,
                      widget.chapter,
                      v.verse,
                    )
                  : null,
              resumeFlash: widget.resumeFlashVerse == v.verse,
              anchorKey: v.verse == widget.selectionAnchorVerse
                  ? widget.selectionAnchorKey
                  : (widget.resumeFlashVerse == v.verse
                        ? widget.resumeAnchorKey
                        : null),
              dictIndex: widget.dictIndex,
              dictKeys: widget.dictKeys,
              notes: widget.notesByVerse[v.verse],
              thoughtsCount: widget.thoughtsByVerse[v.verse] ?? 0,
              hasMyThought: (widget.myThoughtsByVerse[v.verse] ?? 0) > 0,
              thoughtsEnabled: widget.thoughtsEnabled,
              onStart: widget.onStart,
              onToggle: widget.onToggle,
              onWordStart: widget.onWordStart,
              onWordExtend: widget.onWordExtend,
              onOpenDict: widget.onOpenDict,
              onViewNote: widget.onViewNote,
              onOpenThoughts: widget.onOpenThoughts,
            ),
        ],
      );
    }

    final spans = <InlineSpan>[];
    for (final v in widget.paragraph.verses) {
      final markInfo = widget.underlinesEnabled
          ? markForVerse(
              widget.highlightMarks,
              widget.book.id,
              widget.chapter,
              v.verse,
            )
          : null;
      final mark = markInfo?.mark;
      final hasThought =
          widget.thoughtsEnabled && (widget.thoughtsByVerse[v.verse] ?? 0) > 0;
      final hasMyThought = (widget.myThoughtsByVerse[v.verse] ?? 0) > 0;

      final verseInSel = widget.selected.contains(v.verse);
      final resumeFlash = widget.resumeFlashVerse == v.verse;
      final GlobalKey? verseKey = v.verse == widget.selectionAnchorVerse
          ? widget.selectionAnchorKey
          : resumeFlash
          ? widget.resumeAnchorKey
          : null;

      // 节号：inline 真上标（对齐 PWA .verse-sup：0.65em + super + 0.25em）
      if (widget.verseNo == ReaderVerseNumberMode.inline) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: Transform.translate(
              offset: Offset(0, -fontPx * 0.32),
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTap: selectionActive
                    ? () => widget.onToggle(v.verse, v.text)
                    : null,
                onLongPress: selectionActive
                    ? null
                    : () => widget.onStart(v.verse, v.text),
                child: Text(
                  '${v.verse}',
                  style: TextStyle(
                    color: verseInSel ? AppColors.ink : AppColors.accentDeep,
                    fontWeight: FontWeight.w700,
                    fontSize: fontPx * 0.65,
                    height: 1.0,
                    letterSpacing: 0,
                    // 词级选中时节号不再单独铺底，避免与词块叠成双层
                    backgroundColor: verseInSel && widget.wordRange == null
                        ? selBg
                        : null,
                    fontFamily: widget.fontFamily.fontFamily,
                    fontFamilyFallback: widget.fontFamily.fontFamilyFallback,
                  ),
                ),
              ),
            ),
          ),
        );
        // 紧间距，避免完整半角空格 + WidgetSpan 缝过大
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: SizedBox(width: fontPx * 0.22),
          ),
        );
      }

      final dictSpans = !selectionActive && widget.dictKeys.isNotEmpty
          ? dictSpansForText(
              v.text,
              widget.dictIndex,
              widget.dictKeys,
              bookId: widget.book.id,
              chapter: widget.chapter,
              verse: v.verse,
            )
          : const <DictSpanHit>[];
      final words = sliceVerseWords(
        v.text,
        splitOffsets: dictSpans.expand((span) => [span.start, span.end]),
      );
      if (words.isEmpty) {
        final emptyRec = selectionActive
            ? (TapGestureRecognizer()
                ..onTap = () => widget.onToggle(v.verse, v.text))
            : (LongPressGestureRecognizer()
                ..onLongPress = () => widget.onStart(v.verse, v.text));
        _recognizers.add(emptyRec);
        spans.add(TextSpan(text: ' ', style: baseStyle, recognizer: emptyRec));
      } else {
        var cursor = 0;
        var anchorAttached = false;
        for (final w in words) {
          final wr = widget.wordRange;
          if (w.start > cursor) {
            final gap = v.text.substring(cursor, w.start);
            final gapInSel =
                wr != null && wordOverlapsRange(v.verse, cursor, w.start, wr);
            spans.addAll(
              readerGapSpans(
                gap,
                baseStyle: baseStyle,
                fontPx: fontPx,
                highlight: gapInSel ? const Color(0x473390FF) : null,
              ),
            );
          }
          final activeWord =
              wr != null && wordOverlapsRange(v.verse, w.start, w.end, wr);
          final edge = wr != null && activeWord
              ? wordSelectionEdge(v.verse, w.start, w.end, wr)
              : (left: false, right: false);
          final markOnWord =
              mark != null &&
              (markInfo?.spanStart == null ||
                  (w.start < (markInfo!.spanEnd ?? 0) &&
                      w.end > (markInfo.spanStart ?? 0)));
          TextStyle wordStyle = baseStyle;
          if (!activeWord && markOnWord) {
            wordStyle = applyHighlightStyle(
              baseStyle,
              mark: mark!,
              disabled: false,
            );
          }
          if (resumeFlash && !activeWord) {
            wordStyle = wordStyle.copyWith(
              backgroundColor: AppColors.accent.withValues(alpha: 0.28),
            );
          }
          // 对齐 PWA `.verse-has-thought`：想法直接标在对应经文下方；
          // 自己写的想法使用更深的强调色。
          if (hasThought && !activeWord) {
            wordStyle = wordStyle.copyWith(
              decoration: TextDecoration.underline,
              decorationStyle: TextDecorationStyle.dashed,
              decorationColor: AppColors.accentDeep.withValues(
                alpha: hasMyThought ? 1 : 0.5,
              ),
              decorationThickness: 1.5,
            );
          }

          // 词典：整节最长匹配后的跨度命中（对齐 PWA dictionary_match）
          final dictHit = !selectionActive
              ? matchDictSpanAt(w.start, w.end, dictSpans)
              : null;
          if (dictHit != null) {
            wordStyle = wordStyle.copyWith(
              decoration: TextDecoration.underline,
              decorationStyle: switch (dictHit.$1.type) {
                'place' => TextDecorationStyle.dashed,
                'person' => TextDecorationStyle.dotted,
                'artifact' => TextDecorationStyle.wavy,
                _ => TextDecorationStyle.dotted,
              },
              decorationColor: (wordStyle.color ?? AppColors.ink).withValues(
                alpha: 0.35,
              ),
              decorationThickness: 1.2,
            );
          }

          final anchor = WordAnchor(verse: v.verse, start: w.start, end: w.end);
          if (verseKey != null && !anchorAttached) {
            anchorAttached = true;
            spans.add(
              WidgetSpan(
                alignment: PlaceholderAlignment.baseline,
                baseline: TextBaseline.alphabetic,
                child: SizedBox(key: verseKey, width: 0, height: 0),
              ),
            );
          }
          // 普通正文与词典命中均用 TextSpan，让 Flutter 连续断行；
          // 仅进入逐词选择时改用 WidgetSpan 交互。
          if (!selectionActive) {
            if (dictHit == null) {
              spans.add(TextSpan(text: w.text, style: wordStyle));
            } else {
              final rec = TapGestureRecognizer()
                ..onTap = () => widget.onOpenDict(
                  dictHit.$1,
                  dictHit.$2,
                  widget.dictIndex[dictHit.$2] ?? [dictHit.$1],
                );
              _recognizers.add(rec);
              spans.add(
                TextSpan(text: w.text, style: wordStyle, recognizer: rec),
              );
            }
          } else {
            spans.add(
              WidgetSpan(
                alignment: PlaceholderAlignment.baseline,
                baseline: TextBaseline.alphabetic,
                child: SelectableWordChip(
                  anchor: anchor,
                  text: w.text,
                  style: wordStyle,
                  selected: activeWord,
                  edgeLeft: edge.left,
                  edgeRight: edge.right,
                  onTap: () => widget.onWordExtend(v.verse, w.start, w.end),
                  onDictTap: null,
                  onDoubleTap: () => widget.onStart(v.verse, v.text),
                ),
              ),
            );
          }
          cursor = w.end;
        }
        if (cursor < v.text.length) {
          final gap = v.text.substring(cursor);
          final wrTail = widget.wordRange;
          final gapInSel =
              wrTail != null &&
              wordOverlapsRange(v.verse, cursor, v.text.length, wrTail);
          spans.addAll(
            readerGapSpans(
              gap,
              baseStyle: baseStyle,
              fontPx: fontPx,
              highlight: gapInSel ? const Color(0x473390FF) : null,
            ),
          );
        }
        // 节间薄缝：定宽，避免半角空格被 justify 拉宽或软断行
        spans.addAll(
          readerGapSpans(
            ' ',
            baseStyle: baseStyle,
            fontPx: fontPx,
            highlight: null,
          ),
        );
      }

      final note = widget.notesByVerse[v.verse]?.firstOrNull;
      if (note != null) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: GestureDetector(
              onTap: () => widget.onViewNote(note),
              child: Padding(
                padding: const EdgeInsets.only(left: 1, right: 4),
                child: Icon(
                  Icons.sticky_note_2_outlined,
                  size: 11,
                  color: selectionActive
                      ? AppColors.inkFaint
                      : AppColors.accentDeep.withValues(alpha: 0.55),
                ),
              ),
            ),
          ),
        );
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          // PWA `.verse-paragraph` 仅保留段后 14px；此前上下 margin +
          // padding 累积成约 20px，视觉上像每节都另起一行。
          margin: const EdgeInsets.only(bottom: 14),
          child: SelectionContainer.disabled(
            child: RichText(
              textAlign: TextAlign.justify,
              text: TextSpan(style: baseStyle, children: spans),
            ),
          ),
        ),
      ],
    );
  }
}

/// 行首节号（margin 模式）：左约 1.8em 节号 + 0.35em 间距 + 右正文（对齐 PWA）。
class _MarginVerseRow extends StatefulWidget {
  const _MarginVerseRow({
    required this.verse,
    required this.book,
    required this.chapter,
    required this.baseStyle,
    required this.fontPx,
    required this.selectionActive,
    required this.selBg,
    required this.wordRange,
    required this.selected,
    required this.markInfo,
    required this.resumeFlash,
    required this.anchorKey,
    required this.dictIndex,
    required this.dictKeys,
    required this.notes,
    required this.thoughtsCount,
    required this.hasMyThought,
    required this.thoughtsEnabled,
    required this.onStart,
    required this.onToggle,
    required this.onWordStart,
    required this.onWordExtend,
    required this.onOpenDict,
    required this.onViewNote,
    required this.onOpenThoughts,
  });

  final Verse verse;
  final BibleBook book;
  final int chapter;
  final TextStyle baseStyle;
  final double fontPx;
  final bool selectionActive;
  final Color selBg;
  final WordRange? wordRange;
  final Set<int> selected;
  final VerseMarkInfo? markInfo;
  final bool resumeFlash;
  final GlobalKey? anchorKey;
  final Map<String, List<DictEntity>> dictIndex;
  final List<String> dictKeys;
  final List<Note>? notes;
  final int thoughtsCount;
  final bool hasMyThought;
  final bool thoughtsEnabled;
  final void Function(int verse, String text) onStart;
  final void Function(int verse, String text) onToggle;
  final void Function(int verse, int start, int end) onWordStart;
  final void Function(int verse, int start, int end) onWordExtend;
  final void Function(
    DictEntity entity,
    String name,
    List<DictEntity> candidates,
  )
  onOpenDict;
  final void Function(Note note) onViewNote;
  final void Function(int verse, String text) onOpenThoughts;

  @override
  State<_MarginVerseRow> createState() => _MarginVerseRowState();
}

class _MarginVerseRowState extends State<_MarginVerseRow> {
  final List<GestureRecognizer> _recognizers = [];

  void _clearRecognizers() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _clearRecognizers();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _clearRecognizers();
    final v = widget.verse;
    final mark = widget.markInfo?.mark;
    final selectionActive = widget.selectionActive;
    final dictKeys = widget.dictKeys;
    final dictIndex = widget.dictIndex;
    final book = widget.book;
    final chapter = widget.chapter;
    final wordRange = widget.wordRange;
    final baseStyle = widget.baseStyle;
    final fontPx = widget.fontPx;
    final thoughtsEnabled = widget.thoughtsEnabled;
    final thoughtsCount = widget.thoughtsCount;
    final hasMyThought = widget.hasMyThought;
    final resumeFlash = widget.resumeFlash;
    final onStart = widget.onStart;
    final onToggle = widget.onToggle;
    final onWordExtend = widget.onWordExtend;
    final onOpenDict = widget.onOpenDict;
    final onViewNote = widget.onViewNote;
    final onOpenThoughts = widget.onOpenThoughts;
    final notes = widget.notes;
    final markInfo = widget.markInfo;
    final anchorKey = widget.anchorKey;
    final dictSpans = !selectionActive && dictKeys.isNotEmpty
        ? dictSpansForText(
            v.text,
            dictIndex,
            dictKeys,
            bookId: book.id,
            chapter: chapter,
            verse: v.verse,
          )
        : const <DictSpanHit>[];
    final words = sliceVerseWords(
      v.text,
      splitOffsets: dictSpans.expand((span) => [span.start, span.end]),
    );
    final bodyChildren = <InlineSpan>[];
    var cursor = 0;
    for (final w in words) {
      if (w.start > cursor) {
        final gap = v.text.substring(cursor, w.start);
        final gapInSel =
            wordRange != null &&
            wordOverlapsRange(v.verse, cursor, w.start, wordRange!);
        bodyChildren.addAll(
          readerGapSpans(
            gap,
            baseStyle: baseStyle,
            fontPx: fontPx,
            highlight: gapInSel ? const Color(0x473390FF) : null,
          ),
        );
      }
      final activeWord =
          wordRange != null &&
          wordOverlapsRange(v.verse, w.start, w.end, wordRange!);
      final edge = wordRange != null && activeWord
          ? wordSelectionEdge(v.verse, w.start, w.end, wordRange!)
          : (left: false, right: false);
      final mi = markInfo;
      final markOnWord =
          mark != null &&
          (mi?.spanStart == null ||
              (w.start < (mi!.spanEnd ?? 0) && w.end > (mi.spanStart ?? 0)));
      var wordStyle = baseStyle;
      if (!activeWord && markOnWord) {
        wordStyle = applyHighlightStyle(
          baseStyle,
          mark: mark!,
          disabled: false,
        );
      }
      if (resumeFlash && !activeWord) {
        wordStyle = wordStyle.copyWith(
          backgroundColor: AppColors.accent.withValues(alpha: 0.28),
        );
      }
      if (thoughtsEnabled && thoughtsCount > 0 && !activeWord) {
        wordStyle = wordStyle.copyWith(
          decoration: TextDecoration.underline,
          decorationStyle: TextDecorationStyle.dashed,
          decorationColor: AppColors.accentDeep.withValues(
            alpha: hasMyThought ? 1 : 0.5,
          ),
          decorationThickness: 1.5,
        );
      }
      final dictHit = !selectionActive
          ? matchDictSpanAt(w.start, w.end, dictSpans)
          : null;
      if (dictHit != null) {
        wordStyle = wordStyle.copyWith(
          decoration: TextDecoration.underline,
          decorationStyle: switch (dictHit.$1.type) {
            'place' => TextDecorationStyle.dashed,
            'person' => TextDecorationStyle.dotted,
            'artifact' => TextDecorationStyle.wavy,
            _ => TextDecorationStyle.dotted,
          },
          decorationColor: (wordStyle.color ?? AppColors.ink).withValues(
            alpha: 0.35,
          ),
          decorationThickness: 1.2,
        );
      }
      final a = WordAnchor(verse: v.verse, start: w.start, end: w.end);
      if (!selectionActive) {
        if (dictHit == null) {
          bodyChildren.add(TextSpan(text: w.text, style: wordStyle));
        } else {
          final rec = TapGestureRecognizer()
            ..onTap = () => onOpenDict(
              dictHit.$1,
              dictHit.$2,
              dictIndex[dictHit.$2] ?? [dictHit.$1],
            );
          _recognizers.add(rec);
          bodyChildren.add(
            TextSpan(text: w.text, style: wordStyle, recognizer: rec),
          );
        }
      } else {
        bodyChildren.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: SelectableWordChip(
              anchor: a,
              text: w.text,
              style: wordStyle,
              selected: activeWord,
              edgeLeft: edge.left,
              edgeRight: edge.right,
              onTap: () => onWordExtend(v.verse, w.start, w.end),
              onDictTap: null,
              onDoubleTap: () => onStart(v.verse, v.text),
            ),
          ),
        );
      }
      cursor = w.end;
    }
    if (cursor < v.text.length) {
      final gap = v.text.substring(cursor);
      final gapInSel =
          wordRange != null &&
          wordOverlapsRange(v.verse, cursor, v.text.length, wordRange!);
      bodyChildren.addAll(
        readerGapSpans(
          gap,
          baseStyle: baseStyle,
          fontPx: fontPx,
          highlight: gapInSel ? const Color(0x473390FF) : null,
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onLongPress: selectionActive
                ? null
                : () => onStart(v.verse, v.text),
            onTap: selectionActive ? () => onToggle(v.verse, v.text) : null,
            child: SizedBox(
              width: fontPx * 1.8,
              child: Text(
                '${v.verse}',
                textAlign: TextAlign.right,
                style: baseStyle.copyWith(
                  fontSize: fontPx * 0.65,
                  fontWeight: FontWeight.w700,
                  color: AppColors.accentDeep.withValues(alpha: 0.85),
                  height: 1.0,
                  letterSpacing: 0,
                  backgroundColor:
                      widget.selected.contains(v.verse) && wordRange == null
                      ? widget.selBg
                      : null,
                ),
              ),
            ),
          ),
          SizedBox(width: fontPx * 0.35),
          Expanded(
            child: GestureDetector(
              onLongPress: selectionActive
                  ? null
                  : () => onStart(v.verse, v.text),
              onTap: selectionActive ? () => onToggle(v.verse, v.text) : null,
              child: Container(
                key: anchorKey,
                padding: const EdgeInsets.only(right: 4),
                child: RichText(
                  textAlign: TextAlign.justify,
                  text: TextSpan(style: baseStyle, children: bodyChildren),
                ),
              ),
            ),
          ),
          if (notes?.firstOrNull != null)
            GestureDetector(
              onTap: () => onViewNote(notes!.first),
              child: Padding(
                padding: const EdgeInsets.only(left: 2, top: 2),
                child: Icon(
                  Icons.sticky_note_2_outlined,
                  size: 12,
                  color: AppColors.accentDeep.withValues(alpha: 0.5),
                ),
              ),
            ),
          if (thoughtsEnabled && thoughtsCount > 0)
            GestureDetector(
              onTap: () => onOpenThoughts(v.verse, v.text),
              child: const Padding(
                padding: EdgeInsets.only(left: 2, top: 2),
                child: Icon(Icons.notes, size: 12, color: AppColors.inkFaint),
              ),
            ),
        ],
      ),
    );
  }
}

/// 经文间隙：全角敬空 `\u3000`、半角空格改为定宽，避免 justify 拉成「神」前大洞。
List<InlineSpan> readerGapSpans(
  String gap, {
  required TextStyle baseStyle,
  required double fontPx,
  Color? highlight,
}) {
  if (gap.isEmpty) return const [];
  final out = <InlineSpan>[];
  final buf = StringBuffer();
  void flushText() {
    if (buf.isEmpty) return;
    final t = buf.toString();
    buf.clear();
    out.add(
      TextSpan(
        text: t,
        style: highlight != null
            ? baseStyle.copyWith(backgroundColor: highlight)
            : baseStyle,
      ),
    );
  }

  for (final rune in gap.runes) {
    final ch = String.fromCharCode(rune);
    if (ch == '\u3000' || ch == ' ' || ch == '\u00a0') {
      flushText();
      final w = ch == '\u3000' ? fontPx * 0.42 : fontPx * 0.22;
      out.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: SizedBox(
            width: w,
            height: fontPx,
            child: highlight == null ? null : ColoredBox(color: highlight),
          ),
        ),
      );
    } else {
      buf.write(ch);
    }
  }
  flushText();
  return out;
}

/// 简单词典词条命中（保留兼容：优先精确键）。
(DictEntity, String)? matchDictToken(
  String text,
  Map<String, List<DictEntity>> index,
  List<String> keys,
) {
  final t = text.trim();
  if (t.isEmpty || t.length < 2) return null;
  final list = index[t];
  if (list != null && list.isNotEmpty) return (list.first, t);
  return null;
}

/// 章首导读轻条（对齐 PWA ChapterGuideTip）。
class _ChapterGuideTipBar extends StatelessWidget {
  const _ChapterGuideTipBar({
    required this.bookName,
    required this.chapter,
    required this.compact,
    required this.onOpen,
    required this.onSkipSession,
    required this.onDisableForever,
  });
  final String bookName;
  final int chapter;
  final bool compact;
  final VoidCallback onOpen;
  final VoidCallback onSkipSession;
  final VoidCallback onDisableForever;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 0.5,
      shadowColor: AppColors.ink.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(10),
      color: AppColors.paper,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.line.withValues(alpha: 0.85)),
          color: AppColors.goldWash.withValues(alpha: 0.35),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 9, 6, 9),
          child: Row(
            children: [
              Text(
                '✦',
                style: TextStyle(
                  color: AppColors.accentDeep.withValues(alpha: 0.8),
                  fontSize: 13,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  compact
                      ? '第 $chapter 章导读'
                      : '30 秒章导读 · $bookName 第 $chapter 章',
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.inkSoft,
                    height: 1.35,
                  ),
                ),
              ),
              TextButton(
                onPressed: onOpen,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.accentDeep,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('打开', style: TextStyle(fontSize: 12.5)),
              ),
              TextButton(
                onPressed: onSkipSession,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.inkFaint,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('本次忽略', style: TextStyle(fontSize: 11.5)),
              ),
              if (!compact)
                TextButton(
                  onPressed: onDisableForever,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.inkFaint,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('不再提示', style: TextStyle(fontSize: 11.5)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 章末轻提示：对齐 PWA ChapterCompleteTip。
class _ChapterCompleteTip extends StatelessWidget {
  const _ChapterCompleteTip({
    required this.bookName,
    required this.chapter,
    required this.meditate,
    required this.onThought,
    required this.onNext,
    required this.onDismiss,
  });
  final String bookName;
  final int chapter;
  final bool meditate;
  final VoidCallback onThought;
  final VoidCallback onNext;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 0.5,
      shadowColor: AppColors.ink.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(12),
      color: AppColors.paper,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.line.withValues(alpha: 0.9)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 11, 8, 11),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '本章读完 · $bookName 第 $chapter 章',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkSoft,
                  ),
                ),
              ),
              TextButton(
                onPressed: onThought,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.accentDeep,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  meditate ? '写想法' : '留一句',
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
              TextButton(
                onPressed: onNext,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.accentDeep,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('下一章', style: TextStyle(fontSize: 12.5)),
              ),
              IconButton(
                onPressed: onDismiss,
                icon: const Icon(Icons.close, size: 18),
                visualDensity: VisualDensity.compact,
                color: AppColors.inkFaint,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
