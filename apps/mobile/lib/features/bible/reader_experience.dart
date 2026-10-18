/// 阅读体验增强：主题、进度条、情境头、Focus 模式、轻问小爱、章节缓存。
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart' show peiaiTabContentBottomPad, navIndexProvider;
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
import 'bible_book_names.dart';
import 'bible_repository.dart';
import 'chapter_cache.dart';
import 'chapter_guide_tip.dart';
import 'reader_scroll_physics.dart';
import 'content_repository.dart' hide SectionMark;
import 'discourse_ranges.dart';
import 'poetry_lines.dart';
import 'quote_display.dart';
import 'dictionary_match.dart';
import 'entity_knowledge_sheet.dart';
import 'inline_ref.dart';
import 'group_checkin_sheet.dart';
import 'markings_repository.dart';
import 'models.dart';
import 'section_title_i18n.dart';
import 'paragraphs.dart';
import 'reader_typography.dart';
import 'reader_focus_bar.dart';
import 'reader_marking_models.dart';
import 'reader_audio.dart';
import 'bible_listen_controller.dart';
import 'reader_preferences.dart';
import 'reader_thoughts_sheet.dart';
import 'feed_activity.dart';
import '../social/plan_share_sheet.dart';
import 'reading_repository.dart';
import 'selection_range.dart';
import 'thoughts_repository.dart' hide selectionRef;
import 'verse_card_sheet.dart';
import 'verse_compare_sheet.dart';
import 'verse_diff.dart';
import 'reader_verse_spans.dart';
import 'verse_selection_gesture.dart';
import 'verse_words.dart';
import '../../core/peiai_haptics.dart';
import '../social/social_repository.dart' show myGroupsProvider;


part 'reader_experience_peek.dart';
part 'reader_experience_blocks.dart';
part 'reader_experience_selection.dart';

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
    this.feedHint,
  });

  final BibleBook book;
  final int chapter;
  final List<BibleBook> books;
  final bool chromeHidden;
  final Future<void> Function(int delta, {bool fromSwipe}) onNav;
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

  /// 发现动态回跳提示（群打卡/想法分享等）。
  final FeedActivityHint? feedHint;

  /// 打开小爱解读弹窗。explainOnly=true 时仅解释选中经文。
  final void Function(
    String refStr,
    String refLabel,
    String selectionText,
    bool explainOnly,
  )
  onAskAi;

  @override
  ConsumerState<ReaderChapterBody> createState() => ReaderChapterBodyState();
}

class ReaderChapterBodyState extends ConsumerState<ReaderChapterBody>
    with TickerProviderStateMixin {
  Set<int> _selected = {};
  WordRange? _wordRange;
  bool _bookDone = false;
  bool _guideTipVisible = false;
  bool _guideTipCompact = false;
  Timer? _guideDwellTimer;
  int? _resumeFlashVerse;
  final _resumeAnchorKey = GlobalKey();
  final _scrollVerseKeys = <int, GlobalKey>{};
  int? _lastProgressVerse;
  bool _feedHintDismissed = false;
  final _scroll = ScrollController();
  final _selectionAnchorKey = GlobalKey();
  final _selectionSurfaceKey = GlobalKey<VerseSelectionSurfaceState>();
  final _readerOverlayKey = GlobalKey();
  final _focusBarTopN = ValueNotifier<double?>(null);
  final _focusBarLeftN = ValueNotifier<double?>(null);
  final _focusBarKey = GlobalKey();
  bool _resumeScheduled = false;
  bool _planDayFinishScheduled = false;
  bool _navFromSwipe = false;
  /// 横滑落地后抑制「续读跳节」（对齐 PWA skipResumeOnLoad）；不跟 _navFromSwipe 同帧清掉。
  String? _suppressResumeChapterKey;
  /// 无缓存快滑：peek 盖住直到主文有内容再归零。
  bool _swipeHandoffPending = false;
  int _swipeHandoffWaitFrames = 0;
  /// 仅首次进读经体（Tab 续读）允许 _maybeResume；章内跳转对齐 PWA skipResumeOnLoad。
  bool _allowTabResume = true;
  /// 按钮/目录切章 enter 动画（对齐 PWA chapter-enter）。
  late final AnimationController _chapterEnterController;
  late final AnimationController _chapterExitController;
  bool _chapterEnterGoingNext = true;
  /// 对照差异 idle 分片结果（避免 build 同步 LCS 卡翻页）。
  Map<int, VerseDiffResult> _parallelDiffMap = const {};
  int _parallelDiffEpoch = 0;
  String? _diffScheduledFor;
  List<(int, int)>? _swipeCommittedParagraphRanges;
  List<(int, int)>? _lockedParagraphRanges;
  String? _lockedParagraphKey;
  Timer? _scrollProgressTimer;
  Chapter? _cachedChapter;
  Chapter? _liveChapter;

  /// 横滑翻章视觉位移（已含边界阻力）；跟手只改 notifier，不重建经文。
  final _pageDragDxN = ValueNotifier<double>(0);

  /// 对齐 PWA `turning` / `.is-turning`：仅横滑跟手时锁竖滚。
  final _pageTurningN = ValueNotifier<bool>(false);
  Timer? _pageTurnStuckTimer;
  static const _pageTurnStuckMs = 900;
  bool _wordDragRafScheduled = false;
  WordAnchor? _wordDragPendingAnchor;
  WordAnchor? _wordDragPendingFocus;
  double get _pageDragDx => _pageDragDxN.value;
  set _pageDragDx(double v) {
    if (_pageDragDxN.value == v) return;
    _pageDragDxN.value = v;
  }

  set _focusBarTop(double? v) {
    if (_focusBarTopN.value == v) return;
    _focusBarTopN.value = v;
  }

  set _focusBarLeft(double? v) {
    if (_focusBarLeftN.value == v) return;
    _focusBarLeftN.value = v;
  }

  /// 横滑原始累计位移（未乘边界阻力；松手判定用）
  double _pageDragRaw = 0;

  /// 邻章是否已触发预取
  bool _pageTurnPrefetched = false;

  /// 横滑轴锁：null 未判定 / x 横翻 / y 竖滚（对齐 PWA useReaderPageTurn）
  String? _pageDragAxis;

  /// 翻页指针跟手（window 级语义：viewport Listener + 轴锁，不用 HorizontalDrag）
  int? _pagePointerId;
  Offset _pagePointerStart = Offset.zero;
  int _pagePointerStartMs = 0;

  /// 松手后把当前页送出或弹回；时长与 PWA reader-turn-track 一致。
  late final AnimationController _pageTurnController;
  late Animation<double> _pageTurnAnimation;
  final _pageTurnAnimatingN = ValueNotifier<bool>(false);
  bool get _pageTurnAnimating => _pageTurnAnimatingN.value;
  set _pageTurnAnimating(bool v) => _pageTurnAnimatingN.value = v;

  /// 邻章预览实例缓存：避免正文 provider 抖动时反复 rebuild peek 树。
  Object? _cachedPeekKey;
  Widget? _cachedPeekNext;
  Widget? _cachedPeekPrev;

  void _invalidatePeekCache() {
    _cachedPeekKey = null;
    _cachedPeekNext = null;
    _cachedPeekPrev = null;
  }

  void _ensurePeekPanels(ReaderExperienceTheme theme, double topPad) {
    final turning =
        _navFromSwipe || _pageTurnAnimating || _pageDragDx.abs() > 2;
    if (!turning) {
      _cachedPeekNext ??= ColoredBox(color: theme.background);
      _cachedPeekPrev ??= ColoredBox(color: theme.background);
      return;
    }
    final key = (
      widget.book.id,
      widget.chapter,
      _selected.isNotEmpty,
      theme.background.toARGB32(),
      theme.ink.toARGB32(),
      widget.mainVersionId,
      widget.compareVersionId,
      _cachedDictRev,
      widget.planMeta != null,
    );
    if (_cachedPeekKey == key &&
        _cachedPeekNext != null &&
        _cachedPeekPrev != null) {
      return;
    }
    _cachedPeekKey = key;
    _cachedPeekNext = _buildAdjacentPeekPanel(1, theme, topPad);
    _cachedPeekPrev = _buildAdjacentPeekPanel(-1, theme, topPad);
  }

  /// 划词手势中：禁止横滑翻章（对齐 PWA swipeIgnore）
  bool _selectionGestureActive = false;
  final _selectionGestureN = ValueNotifier<bool>(false);
  late final ReaderScrollPhysics _readerScrollPhysics = ReaderScrollPhysics(
    selectionLock: _selectionGestureN,
    pageTurnLock: _pageTurningN,
  );
  int _swipeIgnoreUntilMs = 0;

  void _armSwipeIgnore([int ms = 400]) {
    _swipeIgnoreUntilMs = DateTime.now().millisecondsSinceEpoch + ms;
  }

  bool get _swipeIgnored =>
      DateTime.now().millisecondsSinceEpoch < _swipeIgnoreUntilMs;

  void _releasePageTurnLock() {
    if (!_pageTurnAnimating) {
      _pageTurningN.value = false;
    }
  }

  /// 对齐 PWA cancelDrag / peiai-reader-unlock：半屏、选区、指针粘连后恢复横滑。
  void releaseReaderGestures() {
    _pagePointerId = null;
    _pageDragAxis = null;
    _swipeIgnoreUntilMs = 0;
    _setSelectionGestureActive(false);
    _cancelSelectionPointer();
    cancelPageTurn();
  }

  /// 对齐 PWA cancelDrag：半屏/Tab/前台/粘滞超时释放翻页态。
  void cancelPageTurn() {
    _pageTurnStuckTimer?.cancel();
    _pageTurnStuckTimer = null;
    if (_pageTurnAnimating) {
      _pageTurnController.stop(canceled: false);
    }
    if (_pageTurnAnimating ||
        _pageDragDx != 0 ||
        _pageDragRaw != 0 ||
        _pageTurningN.value) {
      if (_pageTurnAnimating) {
        setState(_resetPageDrag);
      } else {
        _resetPageDrag();
      }
    } else {
      _releasePageTurnLock();
    }
  }

  void _armPageTurnStuckTimer() {
    _pageTurnStuckTimer?.cancel();
    _pageTurnStuckTimer = Timer(
      const Duration(milliseconds: _pageTurnStuckMs),
      () {
        if (!mounted) return;
        cancelPageTurn();
      },
    );
  }

  void _cancelPagePointerTracking() {
    _pagePointerId = null;
    if (!_pageTurnAnimating && (_pageDragDx != 0 || _pageDragRaw != 0)) {
      _pageDragDx = 0;
      _pageDragRaw = 0;
      _pageDragAxis = null;
      _pageTurnPrefetched = false;
    }
    _releasePageTurnLock();
  }

  /// 横滑翻章跟手位移（Listener 指针轴锁，对齐 PWA useReaderPageTurn）

  void _cancelSelectionPointer() {
    _selectionSurfaceKey.currentState?.cancelPointerTracking();
  }

  void _beginPagePointer(PointerDownEvent e, {required bool swipeOn}) {
    if (!swipeOn || _pageTurnAnimating || _swipeIgnored) return;
    if (_pagePointerId != null) return;
    // 对齐 PWA：有选区 / 划词中不开始翻页
    if (_selectionGestureActive || _selected.isNotEmpty) return;
    if (shouldYieldPageTurn(context, e.position)) return;
    _pagePointerId = e.pointer;
    _pagePointerStart = e.position;
    _pagePointerStartMs = DateTime.now().millisecondsSinceEpoch;
    _pageDragAxis = null;
    _pageDragRaw = 0;
    _pageDragDx = 0;
    _pageTurnPrefetched = false;
  }

  void _movePagePointer(PointerMoveEvent e, {required bool swipeOn}) {
    if (_pagePointerId != e.pointer) return;
    if (!swipeOn && _pageDragAxis != 'x') return;
    // 划词抢手势：立刻放弃翻页
    if (_selectionGestureActive) {
      _pagePointerId = null;
      _pageDragAxis = null;
      cancelPageTurn();
      return;
    }

    final totalDx = e.position.dx - _pagePointerStart.dx;
    final totalDy = e.position.dy - _pagePointerStart.dy;

    if (_pageDragAxis == null) {
      final adx = totalDx.abs();
      final ady = totalDy.abs();
      if (adx < _pageAxisMinPx && ady < _pageAxisMinPx) return;
      // 轴未锁定前仍在词典/按钮上：让路（对齐 PWA begin 前 yield）
      if (shouldYieldPageTurn(context, e.position) && adx < _pageAxisMinPx * 2.5) {
        _pagePointerId = null;
        return;
      }
      if (adx >= _pageAxisMinPx && adx > ady * _pageAxisRatio) {
        _pageDragAxis = 'x';
      } else if (ady >= _pageAxisMinPx && ady >= adx * _pageAxisRatio) {
        _pageDragAxis = 'y';
        _pagePointerId = null;
        return;
      } else if (adx >= _pageAxisMinPx * 1.2 && adx > ady) {
        _pageDragAxis = 'x';
      } else {
        _pageDragAxis = 'y';
        _pagePointerId = null;
        return;
      }
      if (_pageDragAxis == 'x') {
        _pageTurningN.value = true;
        _armPageTurnStuckTimer();
        _cancelSelectionPointer();
        if (_selected.isNotEmpty) _clearSelection();
        _prefetchAdjacentChapters();
      }
    }

    if (_pageDragAxis != 'x') return;
    _setPageDragFromOffset(totalDx);
  }

  void _endPagePointer(PointerEvent e) {
    if (_pagePointerId != e.pointer) return;
    final axis = _pageDragAxis;
    final elapsed = DateTime.now().millisecondsSinceEpoch - _pagePointerStartMs;
    final vel = axis == 'x' && elapsed > 0
        ? (_pageDragRaw.abs() / elapsed) * 1000
        : 0.0;
    _pagePointerId = null;
    _pageDragAxis = null;
    if (axis != 'x') {
      _releasePageTurnLock();
      return;
    }
    unawaited(_finishPageTurn(velocityPxPerSec: vel));
  }

  void _setPageDragFromOffset(double rawDx) {
    if (_pageTurnAnimating) return;
    final width = _viewportWidth > 0
        ? _viewportWidth
        : MediaQuery.sizeOf(context).width;
    if (width <= 0) return;
    _pageDragAxis = 'x';
    _pageTurningN.value = true;
    _armPageTurnStuckTimer();
    _pageDragRaw = rawDx.clamp(-width, width);
    _pageDragDx = _clampPageDrag(_pageDragRaw, width);
    if (!_pageTurnPrefetched && _pageDragRaw.abs() / width >= 0.04) {
      _pageTurnPrefetched = true;
      _prefetchAdjacentChapters();
    }
  }

  bool get _englishUI => isEnglishBibleVersion(widget.mainVersionId);

  int? _lastAudioScrollVerse;

  void _scrollToAudioVerse(int verse) {
    if (!_scroll.hasClients || _liveChapter == null) return;
    final key = _scrollVerseKeys[verse];
    final ctx = key?.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        alignment: 0.28,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
      return;
    }
    final verses = _liveChapter!.verses;
    if (verses.isEmpty) return;
    final idx = verses.indexWhere((v) => v.verse == verse);
    if (idx < 0) return;
    final pos = _scroll.position;
    final extent = pos.maxScrollExtent + pos.viewportDimension;
    if (extent <= 0) return;
    final ratio = ((idx + 0.5) / verses.length).clamp(0.0, 1.0);
    final target = (ratio * pos.maxScrollExtent).clamp(0.0, pos.maxScrollExtent);
    _scroll.animateTo(target, duration: const Duration(milliseconds: 280), curve: Curves.easeOut);
  }

  /// 听读最小化后锚点可能尚未挂上，多帧重试直到能 ensureVisible。
  void _scheduleScrollToAudioVerse(int verse) {
    void attempt(int tries) {
      if (!mounted) return;
      _scrollToAudioVerse(verse);
      final ctx = _scrollVerseKeys[verse]?.currentContext;
      if (ctx == null && tries < 10) {
        WidgetsBinding.instance.addPostFrameCallback((_) => attempt(tries + 1));
      }
    }

    WidgetsBinding.instance.addPostFrameCallback((_) => attempt(0));
  }

  GlobalKey _scrollVerseKey(int verse) =>
      _scrollVerseKeys.putIfAbsent(verse, GlobalKey.new);

  double? _verseScrollOffset(GlobalKey? key) {
    final ctx = key?.currentContext;
    if (ctx == null) return null;
    final box = ctx.findRenderObject();
    if (box is! RenderBox || !box.hasSize) return null;
    final scrollable = Scrollable.maybeOf(ctx);
    if (scrollable == null) return null;
    final scrollBox = scrollable.context.findRenderObject();
    if (scrollBox is! RenderBox) return null;
    return box.localToGlobal(Offset.zero, ancestor: scrollBox).dy;
  }

  void _trackScrollProgress() {
    if (_pageDragDx.abs() > 2 || _pageTurnAnimating) return;
    _scrollProgressTimer?.cancel();
    _scrollProgressTimer = Timer(const Duration(milliseconds: 120), () {
      if (!mounted || !_scroll.hasClients || _liveChapter == null) return;
      final verses = _liveChapter!.verses;
      if (verses.isEmpty) return;

      final pos = _scroll.position;
      final viewportH = pos.viewportDimension;
      final top = pos.pixels;
      final bottom = top + viewportH;
      final mid = top + viewportH * 0.35;

      // 优先用语义锚点（margin 模式节容器 key）
      int? bestVerse;
      var bestDist = double.infinity;
      var maxPassed = 0;
      for (final v in verses) {
        final key = _scrollVerseKeys[v.verse];
        final y = _verseScrollOffset(key);
        if (y != null) {
          if (y <= bottom)
            maxPassed = v.verse > maxPassed ? v.verse : maxPassed;
          final dist = (y - mid).abs();
          if (dist < bestDist) {
            bestDist = dist;
            bestVerse = v.verse;
          }
        }
      }

      // inline 模式无逐节 key：按滚动比例估算，避免大量 WidgetSpan 拖慢竖滚
      if (bestVerse == null) {
        final extent = pos.maxScrollExtent + viewportH;
        if (extent <= 0) return;
        final ratio = (mid / extent).clamp(0.0, 1.0);
        final idx = (ratio * verses.length).floor().clamp(0, verses.length - 1);
        bestVerse = verses[idx].verse;
        maxPassed = bestVerse;
      }

      final progressVerse = maxPassed > 0 ? maxPassed : bestVerse;
      if (progressVerse != _lastProgressVerse) {
        _lastProgressVerse = progressVerse;
        ref
            .read(readingRepoProvider)
            .noteChapterVerseTouch(widget.book.id, widget.chapter, progressVerse);
      }

      final scrollMax = math.max(1.0, pos.maxScrollExtent);
      final scrollRatio = pos.pixels / scrollMax;
      ref.read(readingRepoProvider).confirmChapterLog(
            widget.book.id,
            widget.chapter,
            scrollRatio: scrollRatio,
            verseCount: verses.length,
            onLogged: () => widget.onRead(widget.book.id, widget.chapter),
          );
    });
  }

  void _beginChapterTracking({required int verseCount}) {
    final repo = ref.read(readingRepoProvider);
    repo.cancelPendingChapterLog();
    unawaited(repo.updateLocation(widget.book.id, widget.chapter));
    repo.scheduleChapterLog(
      widget.book.id,
      widget.chapter,
      verseCount: verseCount,
      onLogged: () => widget.onRead(widget.book.id, widget.chapter),
    );
  }

  static const _pageAxisMinPx = 8.0;
  static const _pageAxisRatio = 1.15;

  /// LayoutBuilder 实测宽，供翻页位移/阈值（勿用 MediaQuery 全屏宽）。
  double _viewportWidth = 0;

  @override
  void initState() {
    super.initState();
    _pageTurnController =
        AnimationController(
          vsync: this,
          duration: const Duration(milliseconds: 280),
        )..addListener(() {
          if (!mounted) return;
          _pageDragDx = _pageTurnAnimation.value;
        });
    _pageTurnAnimation = const AlwaysStoppedAnimation(0);
    _chapterEnterController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
      value: 1,
    );
    _chapterExitController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 180),
    );
    _scroll.addListener(_onScroll);
    final prefs = ref.read(prefsProvider);
    _cachedChapter = readChapterCache(
      prefs,
      widget.book.id,
      widget.chapter,
      versionId: widget.mainVersionId,
    );
    _scheduleGuideTips(fromSwipe: false, prevBookId: null, prevChapter: null);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(ref.read(contentRepoProvider).preloadParagraphRangesIndex());
        unawaited(ref.read(contentRepoProvider).preloadDiscourseCatalog());
        unawaited(ref.read(contentRepoProvider).preloadPoetryLinesIndex());
        if (isEnglishBibleVersion(widget.mainVersionId)) {
          unawaited(
            preloadSectionTitleTranslations(
              () => ref.read(contentRepoProvider).sectionTitleTranslations(),
            ),
          );
        }
        _prefetchAdjacentChapters();
      }
    });
  }

  List<(int, int)>? _paragraphRangesForChapter(String bookId, int chapter) {
    final chapterKey = '${bookId.toUpperCase()}.$chapter';
    if (_lockedParagraphKey != chapterKey) {
      _lockedParagraphKey = chapterKey;
      _lockedParagraphRanges = null;
    }
    if (_lockedParagraphRanges != null && _lockedParagraphRanges!.isNotEmpty) {
      return _lockedParagraphRanges;
    }

    final fromProvider = ref
        .read(paragraphRangesProvider((book: bookId, chapter: chapter)))
        .value;
    if (fromProvider != null && fromProvider.isNotEmpty) {
      _lockedParagraphRanges = fromProvider;
      return fromProvider;
    }
    final cached = ref
        .read(contentRepoProvider)
        .paragraphRangesCached(bookId, chapter);
    if (cached != null && cached.isNotEmpty) {
      _lockedParagraphRanges = cached;
      return cached;
    }
    if (_swipeCommittedParagraphRanges != null &&
        bookId == widget.book.id &&
        chapter == widget.chapter) {
      _lockedParagraphRanges = _swipeCommittedParagraphRanges;
      return _swipeCommittedParagraphRanges;
    }
    return null;
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
      void applyChapterChange() {
        _selected.clear();
        _wordRange = null;
        _bookDone = false;
        ref.read(readingRepoProvider).cancelPendingChapterLog();
        _guideTipVisible = false;
        _guideTipCompact = false;
        _resumeFlashVerse = null;
        _lastProgressVerse = null;
        _feedHintDismissed = false;
        _scrollVerseKeys.clear();
        _planDayFinishScheduled = false;
        _resumeScheduled = false;
        _liveChapter = null;
        if (!_navFromSwipe) {
          _lockedParagraphKey = null;
          _lockedParagraphRanges = null;
          _suppressResumeChapterKey = null;
          _swipeCommittedParagraphRanges = null;
          _pageDragDx = 0;
          _pageDragRaw = 0;
          _pageTurnPrefetched = false;
          _pageDragAxis = null;
        } else {
          // 横滑：保留已提交段落锁，避免落地二次重排（对齐 PWA paragraphRangesLock）
          _lockedParagraphKey =
              '${widget.book.id.toUpperCase()}.${widget.chapter}';
          _lockedParagraphRanges = _swipeCommittedParagraphRanges;
        }
        _selectionGestureActive = false;
        _selectionGestureN.value = false;
        _wordDragPendingAnchor = null;
        _wordDragPendingFocus = null;
        _wordDragRafScheduled = false;
        _cancelPagePointerTracking();
        _cachedChapter = readChapterCache(
          ref.read(prefsProvider),
          widget.book.id,
          widget.chapter,
          versionId: widget.mainVersionId,
        );
        if (!_navFromSwipe) {
          _invalidatePeekCache();
        }
      }

      if (_navFromSwipe) {
        applyChapterChange();
        _allowTabResume = false;
        _parallelDiffMap = const {};
        _diffScheduledFor = null;
      } else {
        setState(applyChapterChange);
      }
      _notifySelection();
      _guideDwellTimer?.cancel();
      if (!_navFromSwipe) {
        _scheduleGuideTips(
          fromSwipe: fromSwipe,
          prevBookId: oldWidget.book.id,
          prevChapter: oldWidget.chapter,
        );
      }
      _persistPlanRef();
      final wasSwipe = _navFromSwipe;
      if (wasSwipe) {
        _scheduleSwipeHandoffSettle();
      } else {
        // 非横滑切章：对齐 PWA chapter-enter（exit 由 playChapterExit 先播）
        _chapterEnterGoingNext = _isForwardChapterNav(
          oldWidget.book.id,
          oldWidget.chapter,
          widget.book.id,
          widget.chapter,
        );
        _chapterExitController.value = 0;
        _chapterEnterController.forward(from: 0);
        _parallelDiffMap = const {};
        _parallelDiffEpoch++;
        _diffScheduledFor = null;
        _allowTabResume = false;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          if (_scroll.hasClients && _scroll.position.pixels > 0.5) {
            _scroll.jumpTo(0);
          }
          _prefetchAdjacentChapters();
          _navFromSwipe = false;
        });
      }
    } else if (widget.flashVerse != null &&
        widget.flashVerse != oldWidget.flashVerse) {
      // 同章再次跳入（如每日经文第 1 节）：强制再滚再闪。
      _resumeScheduled = false;
      _allowTabResume = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _selected.isNotEmpty) return;
        if (!_resumeScheduled) {
          _resumeScheduled = true;
          _maybeResume();
        }
      });
    }
  }

  bool _isForwardChapterNav(
    String oldBook,
    int oldChapter,
    String newBook,
    int newChapter,
  ) {
    if (oldBook == newBook) return newChapter >= oldChapter;
    return true;
  }

  /// 按钮/目录切章前：轻 exit（对齐 PWA chapter-exit-* 180ms）。
  Future<void> playChapterExit(int delta) async {
    if (!mounted) return;
    if (_pageDragDx.abs() > 2 || _pageTurnAnimating || _swipeHandoffPending) {
      return;
    }
    _chapterEnterGoingNext = delta > 0;
    try {
      await _chapterExitController.forward(from: 0);
    } catch (_) {
      /* disposed */
    }
  }

  Widget _wrapChapterChrome(Widget child) {
    return AnimatedBuilder(
      animation: Listenable.merge([
        _chapterEnterController,
        _chapterExitController,
      ]),
      builder: (context, _) {
        final exitT = _chapterExitController.value;
        if (exitT > 0.001) {
          final dx = (_chapterEnterGoingNext ? -24.0 : 24.0) * exitT;
          return Opacity(
            opacity: (1 - exitT).clamp(0.0, 1.0),
            child: Transform.translate(offset: Offset(dx, 0), child: child),
          );
        }
        final t = _chapterEnterController.value.clamp(0.0, 1.0);
        final dx = (_chapterEnterGoingNext ? 12.0 : -12.0) * (1 - t);
        return Opacity(
          opacity: (0.35 + 0.65 * t).clamp(0.0, 1.0),
          child: Transform.translate(offset: Offset(dx, 0), child: child),
        );
      },
      child: child,
    );
  }

  void _completeSwipeHandoff() {
    if (!mounted || !_swipeHandoffPending) return;
    _swipeHandoffPending = false;
    _swipeHandoffWaitFrames = 0;
    if (_scroll.hasClients) _scroll.jumpTo(0);
    _resetPageDrag();
    _invalidatePeekCache();
    _prefetchAdjacentChapters();
    _navFromSwipe = false;
  }

  /// 无缓存快滑：peek 盖住直到主文有 cache/live 再归零（最多约 24 帧）。
  void _scheduleSwipeHandoffSettle() {
    _swipeHandoffPending = true;
    _swipeHandoffWaitFrames = 0;
    void trySettle() {
      if (!mounted || !_swipeHandoffPending) return;
      final hasContent = _cachedChapter != null || _liveChapter != null;
      _swipeHandoffWaitFrames++;
      if (!hasContent && _swipeHandoffWaitFrames < 24) {
        if (_swipeHandoffWaitFrames == 1) {
          _prefetchAdjacentChapters();
        }
        _pageTurningN.value = true;
        _armPageTurnStuckTimer();
        WidgetsBinding.instance.addPostFrameCallback((_) => trySettle());
        return;
      }
      _completeSwipeHandoff();
    }

    WidgetsBinding.instance.addPostFrameCallback((_) => trySettle());
  }

  void _scheduleParallelDiff({
    required Chapter primary,
    required Chapter? compare,
    required bool showDiff,
  }) {
    _parallelDiffEpoch++;
    final epoch = _parallelDiffEpoch;
    if (!showDiff || compare == null) {
      if (_parallelDiffMap.isNotEmpty) {
        _parallelDiffMap = const {};
      }
      return;
    }
    final bookId = widget.book.id;
    final chapter = widget.chapter;
    final verses = List<Verse>.from(primary.verses);
    final compareVerses = {
      for (final v in compare.verses) v.verse: v.text,
    };
    unawaited(() async {
      await Future<void>.delayed(const Duration(milliseconds: 60));
      if (!mounted || epoch != _parallelDiffEpoch) return;
      final next = <int, VerseDiffResult>{};
      var i = 0;
      for (final v in verses) {
        if (!mounted || epoch != _parallelDiffEpoch) return;
        final parallelT = compareVerses[v.verse];
        if (parallelT == null || parallelT.isEmpty || v.text.isEmpty) continue;
        if (!sameScriptRoughly(v.text, parallelT)) continue;
        next[v.verse] = cachedVerseDiff(
          '$bookId.$chapter.${v.verse}',
          v.text,
          parallelT,
        );
        i++;
        if (i % 8 == 0) {
          await Future<void>.delayed(Duration.zero);
        }
      }
      if (!mounted || epoch != _parallelDiffEpoch) return;
      setState(() => _parallelDiffMap = next);
    }());
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
    ref.read(readingRepoProvider).cancelPendingChapterLog();
    _guideDwellTimer?.cancel();
    _scrollProgressTimer?.cancel();
    _pageTurnController.dispose();
    _chapterEnterController.dispose();
    _chapterExitController.dispose();
    _pageDragDxN.dispose();
    _pageTurningN.dispose();
    _selectionGestureN.dispose();
    _pageTurnStuckTimer?.cancel();
    _pageTurnAnimatingN.dispose();
    _focusBarTopN.dispose();
    _focusBarLeftN.dispose();
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

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final audio = ref.read(readerAudioProvider);
    if (audio.state == ReaderAudioState.playing) {
      ref.read(readerAudioProvider.notifier).notifyManualScroll();
    }
    final cur = _scroll.position.pixels;
    _trackScrollProgress();
    if (_selected.isNotEmpty) {
      final now = DateTime.now().millisecondsSinceEpoch;
      if (now - _focusBarScrollThrottleMs > 80) {
        _focusBarScrollThrottleMs = now;
        _scheduleFocusBarLayout();
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
  }

  void _maybeResume() {
    final forced = widget.flashVerse;
    if (forced != null && forced >= 1) {
      _triggerResumeFlash(forced);
      widget.onFlashConsumed?.call();
      return;
    }
    final prefs = ref.read(prefsProvider);
    final saved = ref.read(readingProgressStreamProvider).value;
    final lastV = ref
        .read(readingRepoProvider)
        .getLastReadVerse(widget.book.id, widget.chapter);
    if (saved == null ||
        saved.book != widget.book.id ||
        saved.chapter != widget.chapter ||
        lastV == null ||
        lastV <= 1) {
      return;
    }
    if (!shouldShowResumeHint(prefs)) return;
    _triggerResumeFlash(lastV);
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
        .touchProgress(widget.book.id, widget.chapter, verse: verse);
  }


  bool _focusBarLayoutScheduled = false;
  int _focusBarScrollThrottleMs = 0;
  int? _cachedDictRev;
  Map<String, List<DictEntity>>? _cachedDictIndex;
  List<String>? _cachedDictKeys;

  void _ensureDictCache(List<DictEntity> dictList, int dictRev) {
    if (_cachedDictRev == dictRev &&
        _cachedDictIndex != null &&
        _cachedDictKeys != null) {
      return;
    }
    _cachedDictRev = dictRev;
    _cachedDictIndex = buildDictIndex(dictList);
    _cachedDictKeys = dictSortedKeys(_cachedDictIndex!);
  }

  void _scheduleFocusBarLayout() {
    if (_focusBarLayoutScheduled) return;
    _focusBarLayoutScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusBarLayoutScheduled = false;
      _layoutFocusBar();
    });
  }

  void _layoutFocusBar() {
    if (!mounted || _selected.isEmpty) {
      _focusBarTop = null;
      _focusBarLeft = null;
      return;
    }
    final media = MediaQuery.of(context);
    final barBox = _focusBarKey.currentContext?.findRenderObject() as RenderBox?;
    final barH = barBox?.hasSize == true ? barBox!.size.height : 112.0;
    final barW = barBox?.hasSize == true
        ? barBox!.size.width
        : math.min(media.size.width * 0.96, 420.0);
    const margin = 16.0;
    final topReserve = media.padding.top + (widget.chromeHidden ? 12 : 64);
    final bottomReserve =
        media.padding.bottom + (widget.chromeHidden ? 24 : 56);

    Rect? selRect;
    if (_wordRange != null) {
      final handles = locateSelectionHandles(context, _wordRange!);
      if (handles != null) {
        selRect = Rect.fromLTRB(
          math.min(handles.start.dx, handles.end.dx),
          math.min(handles.start.dy, handles.end.dy) - handles.lineHeight,
          math.max(handles.start.dx, handles.end.dx),
          math.max(handles.start.dy, handles.end.dy),
        );
      }
    }
    if (selRect == null) {
      final sorted = _sortedSel;
      RenderBox? firstBox;
      RenderBox? lastBox;
      for (final v in [sorted.first, sorted.last]) {
        final ctx = _scrollVerseKeys[v]?.currentContext;
        final box = ctx?.findRenderObject() as RenderBox?;
        if (box == null || !box.hasSize) continue;
        if (v == sorted.first) firstBox = box;
        if (v == sorted.last) lastBox = box;
      }
      firstBox ??= _selectionAnchorKey.currentContext?.findRenderObject()
          as RenderBox?;
      lastBox ??= firstBox;
      if (firstBox != null && firstBox.hasSize) {
        final a = firstBox.localToGlobal(Offset.zero);
        final b = (lastBox ?? firstBox).localToGlobal(Offset.zero);
        final bSize = (lastBox ?? firstBox).size;
        selRect = Rect.fromLTRB(
          math.min(a.dx, b.dx),
          math.min(a.dy, b.dy),
          math.max(a.dx + firstBox.size.width, b.dx + bSize.width),
          math.max(a.dy + firstBox.size.height, b.dy + bSize.height),
        );
      }
    }
    if (selRect == null) return;

    var top = selRect.bottom + margin;
    if (top + barH > media.size.height - bottomReserve) {
      top = selRect.top - barH - margin;
    }
    top = top.clamp(topReserve, media.size.height - barH - bottomReserve).toDouble();
    final selCenterX = selRect.center.dx;
    final left = (selCenterX - barW / 2).clamp(
      8.0,
      math.max(8.0, media.size.width - barW - 8),
    ).toDouble();
    _focusBarTop = top;
    _focusBarLeft = left;
    if (barBox?.hasSize != true) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _selected.isNotEmpty) _layoutFocusBar();
      });
    }
  }

  double _readerListBottomPad() {
    if (widget.chromeHidden) {
      return MediaQuery.paddingOf(context).bottom + 32;
    }
    // extendBody 下用 viewPadding 计入 Home 条，并多留一截给末节 / 划词手柄。
    return peiaiTabContentBottomPad(context, includeSafe: true) + 72;
  }


  Widget _sectionTitle(String title) {
    // 对齐 PWA `.section-title`：选区激活时标题颜色不变。
    final baseColor = AppColors.accentDeep;
    // 对齐 PWA：字号随正文缩放，字体继承读经衬线栈。
    final readerPx = ref.watch(readerFontProvider).px;
    final fontFamily = ref.watch(readerFontFamilyProvider);
    final stack = readerFontStack(family: fontFamily, english: _englishUI);
    final style = TextStyle(
      fontSize: (readerPx * 0.88).roundToDouble().clamp(13, 32),
      fontWeight: FontWeight.w700,
      color: baseColor,
      fontFamily: stack.fontFamily,
      fontFamilyFallback: stack.fontFamilyFallback,
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
                      showInlineVersePreview(
                        context,
                        refParam: p.osis!,
                        label: p.value,
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

  Widget? _feedHintForVerse(int verse) {
    final hint = widget.feedHint;
    if (hint == null || _feedHintDismissed) return null;
    final anchor = widget.flashVerse;
    if (anchor == null || anchor != verse) return null;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.accentWash,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            feedHintMessage(hint),
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.accentDeep,
            ),
          ),
          if (hint.body != null &&
              hint.body!.isNotEmpty &&
              hint.kind != FeedActivityKind.checkin) ...[
            const SizedBox(height: 4),
            Text(
              hint.body!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
            ),
          ],
        ],
      ),
    );
  }

  void _openThoughtsForVerse(int verse, String text) {
    final refStr = '${widget.book.id}.${widget.chapter}.$verse';
    showThoughtHubSheet(
      context,
      ref,
      refStr: refStr,
      refLabel: _englishUI
          ? '${widget.book.name} $verse'
          : '${widget.book.name} ${widget.chapter}:$verse',
      verseText: text,
      bookId: widget.book.id,
      chapter: widget.chapter,
      verse: verse,
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
                )
              else
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx, 'bind_plan'),
                  child: const Text('绑定计划到群'),
                ),
              const SizedBox(height: 8),
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
      case 'bind_plan':
        await _completePlanDay();
        if (!mounted) return;
        await showPlanShareToGroupSheet(
          context,
          ref,
          planId: meta.planId,
          planTitle: meta.planTitle,
        );
      case 'share':
        await _completePlanDay();
        if (!mounted) return;
        final groups = ref.read(myGroupsProvider).value ?? const [];
        if (groups.isEmpty) {
          await showPlanShareToGroupSheet(
            context,
            ref,
            planId: meta.planId,
            planTitle: meta.planTitle,
          );
        } else {
          await showGroupCheckinSheet(
            context,
            ref,
            bookId: widget.book.id,
            bookName: widget.book.name,
            chapter: widget.chapter,
          );
        }
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

  /// 与当前主文同译本预取邻章，并写入磁盘缓存，横滑 peek 可即时同构渲染。
  void _prefetchAdjacentChapters() {
    final prefs = ref.read(prefsProvider);
    final compareId = widget.compareVersionId;

    for (final delta in const [-1, 1]) {
      final target = _adjacentTarget(delta);
      if (target == null) continue;

      final layoutKey = (book: target.book.id, chapter: target.chapter);
      final sectionKey = (
        book: target.book.id,
        chapter: target.chapter,
        versionId: widget.mainVersionId,
      );

      unawaited(
        ref.read(chapterProvider(layoutKey).future).then((ch) {
          writeChapterCache(prefs, target.book.id, target.chapter, ch);
        }, onError: (_) {}),
      );

      if (widget.mainVersionId != null) {
        final versionId = widget.mainVersionId!;
        unawaited(
          ref
              .read(
                chapterVersionProvider((
                  book: target.book.id,
                  chapter: target.chapter,
                  version: versionId,
                )).future,
              )
              .then((ch) {
                writeChapterCache(
                  prefs,
                  target.book.id,
                  target.chapter,
                  ch,
                  versionId: versionId,
                );
              }, onError: (_) {}),
        );
      }

      unawaited(
        ref
            .read(sectionTitlesProvider(sectionKey).future)
            .then((_) {}, onError: (_) {}),
      );
      unawaited(
        ref
            .read(paragraphRangesProvider(layoutKey).future)
            .then((_) {}, onError: (_) {}),
      );

      if (compareId != null) {
        unawaited(
          ref
              .read(
                chapterVersionProvider((
                  book: target.book.id,
                  chapter: target.chapter,
                  version: compareId,
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
    _pagePointerId = null;
    _pageTurnAnimating = false;
    _pageTurningN.value = false;
    _pageTurnStuckTimer?.cancel();
    _pageTurnStuckTimer = null;
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

  Future<void> _animatePageDragTo(
    double target, {
    bool keepTurningLock = false,
  }) async {
    final start = _pageDragDx;
    if ((start - target).abs() < 0.5) {
      if (!keepTurningLock) {
        _pageTurnAnimating = false;
        _pageTurningN.value = false;
        _pageTurnStuckTimer?.cancel();
      }
      return;
    }
    _pageTurnAnimating = true;
    _pageTurningN.value = true;
    _armPageTurnStuckTimer();
    _pageTurnAnimation = Tween<double>(begin: start, end: target).animate(
      CurvedAnimation(parent: _pageTurnController, curve: Curves.easeOutCubic),
    );
    await _pageTurnController.forward(from: 0);
    if (!mounted) return;
    _pageTurnAnimating = false;
    if (keepTurningLock) {
      // handoff：保持 turning + dx=±width，等 didUpdateWidget 新章 paint 后再归零
      _pageTurningN.value = true;
      _pageDragDx = target;
      _pageDragRaw = target;
      _armPageTurnStuckTimer();
    } else {
      _pageTurningN.value = false;
      _pageTurnStuckTimer?.cancel();
    }
  }

  Future<void> _finishPageTurn({
    DragEndDetails? details,
    double? velocityPxPerSec,
  }) async {
    if (_pageTurnAnimating) return;
    final width = _viewportWidth > 0
        ? _viewportWidth
        : MediaQuery.sizeOf(context).width;
    // 用原始位移判定方向/阈值，避免边界阻力压扁后永远翻不过去
    final dx = _pageDragRaw;
    final v = velocityPxPerSec ?? details?.primaryVelocity ?? 0;
    final goingNext = dx < 0 || (dx == 0 && v < 0);
    final can = _adjacentTarget(goingNext ? 1 : -1) != null;
    final ratio = width > 0 ? dx.abs() / width : 0.0;
    final commit = _shouldCommitPageTurn(
      dx: dx,
      width: width,
      velocityPxPerSec: v,
    );
    if (commit && can) {
      final settleDx = goingNext ? -width : width;
      await _animatePageDragTo(settleDx, keepTurningLock: true);
      if (!mounted) return;
      _navFromSwipe = true;
      final target = _adjacentTarget(goingNext ? 1 : -1);
      if (target != null) {
        _suppressResumeChapterKey =
            '${target.book.id.toUpperCase()}.${target.chapter}';
        _cachedChapter = readChapterCache(
          ref.read(prefsProvider),
          target.book.id,
          target.chapter,
          versionId: widget.mainVersionId,
        );
        _swipeCommittedParagraphRanges =
            ref
                .read(contentRepoProvider)
                .paragraphRangesCached(target.book.id, target.chapter) ??
            ref
                .read(
                  paragraphRangesProvider((
                    book: target.book.id,
                    chapter: target.chapter,
                  )),
                )
                .value;
        _lockedParagraphKey =
            '${target.book.id.toUpperCase()}.${target.chapter}';
        _lockedParagraphRanges = _swipeCommittedParagraphRanges;
      }
      unawaited(widget.onNav(goingNext ? 1 : -1, fromSwipe: true));
      // 仍盖住 peek：预滚主文；轨道归零改到 didUpdateWidget（新章 props 已到）
      if (_scroll.hasClients) _scroll.jumpTo(0);
      return;
    }
    // 未提交或章节边界均回弹至当前页，避免松手瞬移。
    await _animatePageDragTo(0);
    if (!mounted) return;
    _resetPageDrag();
    if (!can && ratio >= 0.1) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(goingNext ? '已是最后一章' : '已是第一章'),
          duration: const Duration(milliseconds: 1200),
        ),
      );
    }
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
    final audioSession = ref.watch(readerAudioProvider);
    final listenSession = ref.watch(bibleListenProvider);
    final listenCurrentVerse =
        listenSession.ui == BibleListenUi.playing
            ? listenSession.currentVerse
            : null;
    // 仅播放中高亮；暂停后清掉底色（不再用 echo）
    final listenHighlightStrong = listenCurrentVerse != null;
    final audioCurrentVerse =
        listenCurrentVerse ??
        (audioSession.state == ReaderAudioState.playing
            ? audioSession.currentVerse
            : null);
    final audioHighlightStrong = listenCurrentVerse != null
        ? listenHighlightStrong
        : audioSession.state == ReaderAudioState.playing;
    ref.listen<int?>(
      bibleListenProvider.select((s) => s.currentVerse),
      (prev, next) {
        if (next == null || next == _lastAudioScrollVerse) return;
        final listen = ref.read(bibleListenProvider);
        if (listen.ui != BibleListenUi.playing) return;
        // 听读面打开时只滚面内列表，避免背后阅读页跟着抖
        if (listen.sheetOpen) return;
        _lastAudioScrollVerse = next;
        _scheduleScrollToAudioVerse(next);
      },
    );
    ref.listen<bool>(
      bibleListenProvider.select((s) => s.sheetOpen),
      (prev, next) {
        // 关掉听读面 → 阅读页滚到正在听的节
        if (prev != true || next) return;
        final listen = ref.read(bibleListenProvider);
        final v = listen.currentVerse;
        if (v == null) return;
        if (listen.ui != BibleListenUi.playing &&
            listen.ui != BibleListenUi.paused) {
          return;
        }
        _lastAudioScrollVerse = v;
        _scheduleScrollToAudioVerse(v);
      },
    );
    ref.listen<int>(navIndexProvider, (prev, next) {
      // 从其它 Tab 回到圣经 → 滚到正在听的节
      if (next != 1 || prev == 1) return;
      final listen = ref.read(bibleListenProvider);
      final v = listen.currentVerse;
      if (v == null) return;
      if (listen.ui != BibleListenUi.playing &&
          listen.ui != BibleListenUi.paused) {
        return;
      }
      if (listen.sheetOpen) return;
      _lastAudioScrollVerse = v;
      _scheduleScrollToAudioVerse(v);
    });
    ref.listen<int?>(
      readerAudioProvider.select((s) => s.currentVerse),
      (prev, next) {
        if (next == null || next == _lastAudioScrollVerse) return;
        if (ref.read(bibleListenProvider).sessionActive) return;
        final st = ref.read(readerAudioProvider).state;
        if (st != ReaderAudioState.playing) return;
        _lastAudioScrollVerse = next;
        _scheduleScrollToAudioVerse(next);
      },
    );
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
    final dictPack = ref.watch(readerDictIndexProvider);
    if (dictPack != null) {
      _cachedDictRev = dictPack.rev;
      _cachedDictIndex = dictPack.index;
      _cachedDictKeys = dictPack.keys;
    } else {
      final dictList = ref.watch(dictionaryProvider('')).value ?? const [];
      _ensureDictCache(dictList, dictListRevision(dictList));
    }
    final dictIndex = _cachedDictIndex ?? const {};
    final dictKeys = _cachedDictKeys ?? const [];
    final dictRev = _cachedDictRev ?? 0;
    final sectionByVerse = <int, String>{};
    final outline = outlineForVersion(
      widget.book.id,
      widget.chapter,
      versionId: widget.mainVersionId,
    );
    sectionByVerse.addAll({for (final s in outline) s.verse: s.title});
    // API 分段优先；本地 outlines 作兜底
    final apiSections = ref
        .watch(
          sectionTitlesProvider((
            book: widget.book.id,
            chapter: widget.chapter,
            versionId: widget.mainVersionId,
          )),
        )
        .value;
    if (apiSections != null) {
      for (final s in apiSections) {
        final t = s.title.trim();
        if (t.isNotEmpty) sectionByVerse[s.verse] = t;
      }
    }
    final paragraphRangesFromProvider = ref
        .watch(
          paragraphRangesProvider((
            book: widget.book.id,
            chapter: widget.chapter,
          )),
        )
        .value;
    final paragraphRanges =
        (paragraphRangesFromProvider != null &&
            paragraphRangesFromProvider.isNotEmpty)
        ? paragraphRangesFromProvider
        : _paragraphRangesForChapter(widget.book.id, widget.chapter);
    if (paragraphRanges != null && paragraphRanges.isNotEmpty) {
      _lockedParagraphKey =
          '${widget.book.id.toUpperCase()}.${widget.chapter}';
      _lockedParagraphRanges = paragraphRanges;
    }
    final poetry = isPoetryBook(widget.book.id);

    final compareId = widget.compareVersionId;
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
      if (_swipeHandoffPending && (_cachedChapter != null || ch.verses.isNotEmpty)) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _completeSwipeHandoff();
        });
      }
      final showDiffNow =
          compareCh != null &&
          ref.read(parallelDiffOnProvider) &&
          ref.read(readingModeProvider) == ReadingMode.study;
      final diffKey =
          '${widget.book.id}.${widget.chapter}:${compareCh?.verses.length ?? 0}:$showDiffNow';
      if (_diffScheduledFor != diffKey) {
        _diffScheduledFor = diffKey;
        _scheduleParallelDiff(
          primary: ch,
          compare: compareCh,
          showDiff: showDiffNow,
        );
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _beginChapterTracking(verseCount: ch.verses.length);
        ref.read(readerAudioProvider.notifier).setChapterVerses(
          ch.verses.map((v) => {'verse': v.verse, 'text': v.text}).toList(),
        );
        writeChapterCache(
          ref.read(prefsProvider),
          widget.book.id,
          widget.chapter,
          ch,
          versionId: widget.mainVersionId,
        );
        if (!_resumeScheduled && _selected.isEmpty) {
          final chapKey =
              '${widget.book.id.toUpperCase()}.${widget.chapter}';
          // 横滑 / 章内跳转：保持章首；仅首次 Tab 进读经或 flashVerse 续读
          if (_suppressResumeChapterKey == chapKey ||
              _navFromSwipe ||
              !_allowTabResume) {
            _suppressResumeChapterKey = null;
            _resumeScheduled = true;
            _allowTabResume = false;
          } else {
            _resumeScheduled = true;
            _allowTabResume = false;
            _maybeResume();
          }
        }
      });
      return _buildList(
        ch,
        theme,
        verseNo,
        dictIndex,
        dictKeys,
        dictRev,
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
        paragraphRanges: paragraphRanges,
        audioCurrentVerse: audioCurrentVerse,
        audioHighlightStrong: audioHighlightStrong,
      );
    }

    return ColoredBox(
      color: theme.background,
      child: Stack(
        key: _readerOverlayKey,
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
                        dictRev,
                        highlights,
                        sectionByVerse,
                        null,
                        poetry,
                        layoutChapter: _cachedChapter!,
                        compareChapter: null,
                        notesByVerse: notesByVerse,
                        paragraphRanges: paragraphRanges,
                        audioCurrentVerse: audioCurrentVerse,
                        audioHighlightStrong: audioHighlightStrong,
                      );
                    }
                    if (_navFromSwipe) {
                      return ColoredBox(color: theme.background);
                    }
                    return const Center(child: CircularProgressIndicator());
                  },
                  error: (e, _) => Center(child: Text('$e')),
                  data: (ch) {
                    final layoutCh = layoutAsync?.asData?.value;
                    if (compareAsync == null) {
                      return buildBody(ch, null, layoutCh);
                    }
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
            ValueListenableBuilder<double?>(
              valueListenable: _focusBarTopN,
              builder: (context, focusTop, _) {
                return ValueListenableBuilder<double?>(
                  valueListenable: _focusBarLeftN,
                  builder: (context, focusLeft, _) {
                    if (focusTop == null || focusLeft == null) {
                      return const SizedBox.shrink();
                    }
                    final barW = math.min(
                      MediaQuery.sizeOf(context).width * 0.96,
                      420.0,
                    );
                    return Positioned(
                      top: focusTop,
                      left: focusLeft,
                      width: barW,
                      child: PageTurnYield(
                        key: _focusBarKey,
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
                    );
                  },
                );
              },
            ),
          if (_wordRange != null)
            Positioned.fill(
              child: WordRangeHighlightOverlay(
                overlayKey: _readerOverlayKey,
                rangeListenable: _scroll,
                range: _wordRange!,
              ),
            ),
          if (_wordRange != null)
            Positioned.fill(
              child: _SelectionHandlesOverlay(
                overlayKey: _readerOverlayKey,
                rangeListenable: _scroll,
                range: _wordRange!,
                onDrag: _dragSelectionHandle,
                onCommit: _commitWordRangeProgress,
                onGestureChanged: _onSelectionHandleGesture,
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
    int dictRev,
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
    List<(int, int)>? paragraphRanges,
    int? audioCurrentVerse,
    bool audioHighlightStrong = true,
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
        paragraphRanges: paragraphRanges,
      );
    }

    final rows = <Object>[];
    final breakVerses = sectionByVerse.keys.toList()..sort();
    final paras = groupVersesIntoParagraphs(
      widget.book.id,
      layoutChapter.verses,
      sectionStarts: breakVerses,
      paragraphRanges: paragraphRanges,
    );
    for (final para in paras) {
      rows.add(para);
    }

    final quoteMode = ref.watch(quoteDisplayProvider);
    final underlinePlan = underlinesEnabled && dictKeys.isNotEmpty
        ? buildChapterDictUnderlinePlan(
            verses: [
              for (final v in layoutChapter.verses)
                (
                  verse: v.verse,
                  text: formatQuotesForDisplay(v.text, quoteMode),
                ),
            ],
            index: dictIndex,
            sortedKeys: dictKeys,
            bookId: widget.book.id,
            chapter: widget.chapter,
          )
        : ChapterDictUnderlinePlan.empty;

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
    final swipeOn =
        pageTurn == ReaderPageTurn.swipe &&
        !reduceMotion &&
        !_pageTurnAnimating &&
        !_selectionGestureActive;

    final listBody = VerseSelectionSurface(
          key: _selectionSurfaceKey,
          enabled: true,
          selectionPrimed: _selected.isNotEmpty,
          primedRange: _wordRange,
          onApplyRange: (a, f, {commit = true}) {
            if (commit) {
              _applyWordRange(a, f, commit: true);
            } else {
              _scheduleWordRangeDuringDrag(a, f);
            }
          },
          onCommitRange: _commitWordRangeProgress,
          onClearIfEmptyTap: _selected.isNotEmpty ? _clearSelection : null,
          onSelectionGestureChanged: (on) {
            if (on) {
              _armSwipeIgnore();
              _cancelPagePointerTracking();
            }
            _setSelectionGestureActive(on);
          },
          child: ListView.builder(
            controller: _scroll,
            physics: _readerScrollPhysics,
            scrollCacheExtent: const ScrollCacheExtent.pixels(320),
            addAutomaticKeepAlives: false,
            addSemanticIndexes: false,
            padding: EdgeInsets.fromLTRB(
              kReaderContentPadH,
              _readerListTopPad(),
              kReaderContentPadH,
              _readerListBottomPad(),
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
                return PageTurnYield(
                  child: PlanReadingBar(
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
                  ),
                );
              }
              if (i == planHead) {
                return const SizedBox.shrink();
              }
              if (planTail == 1 && i == rows.length + 1 + planHead) {
                return segmentFooter!;
              }
              final r = rows[i - 1 - planHead];
              final para = r as VerseParagraph;
              return _ParagraphBlock(
                book: widget.book,
                chapter: widget.chapter,
                paragraph: displayPara(para),
                sectionByVerse: sectionByVerse,
                verseNo: verseNo,
                poetry: poetry,
                english: _englishUI,
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
                dictRev: dictRev,
                underlinePlan: underlinePlan,
                inkColor: theme.ink,
                selectionAnchorVerse: _selectionAnchorVerse,
                selectionAnchorKey: _selectionAnchorKey,
                resumeFlashVerse: _resumeFlashVerse,
                resumeAnchorKey: _resumeAnchorKey,
                // 听读跟读：inline / margin 都挂锚点，最小化后才能滚到高亮节
                scrollVerseKey: _scrollVerseKey,
                audioCurrentVerse: audioCurrentVerse,
                audioHighlightStrong: audioHighlightStrong,
                feedHintForVerse: _feedHintForVerse,
                onViewNote: _viewNote,
                onStart: _startSelect,
                onToggle: _toggleSelect,
                onWordStart: _startWordSelect,
                onWordExtend: _extendWordSelect,
                onOpenThoughts: _openThoughtsForVerse,
                onOpenDict: (entity, name, candidates) {
                  widget.onInteract();
                  unawaited(
                    showEntityKnowledgeSheet(
                      context,
                      ref,
                      entity: entity,
                      displayName: name,
                      candidates: candidates,
                    ),
                  );
                },
              );
            },
          ),
        );

    final topPad = _readerListTopPad();
    _ensurePeekPanels(theme, topPad);
    return _readerViewport(
      pageTurn: pageTurn,
      swipeOn: swipeOn,
      theme: theme,
      listBody: listBody,
      peekNext: _cachedPeekNext!,
      peekPrev: _cachedPeekPrev!,
    );
  }

  Widget _buildAdjacentPeekPanel(
    int delta,
    ReaderExperienceTheme theme,
    double topPad,
  ) {
    return _AdjacentChapterPeekPanel(
      key: ValueKey('peek-$delta-${widget.book.id}-${widget.chapter}'),
      delta: delta,
      books: widget.books,
      book: widget.book,
      chapter: widget.chapter,
      mainVersionId: widget.mainVersionId,
      compareVersionId: widget.compareVersionId,
      theme: theme,
      topPad: topPad,
      selectionActive: _selected.isNotEmpty,
      pageDragDx: _pageDragDxN,
      pageTurnAnimating: _pageTurnAnimatingN,
      dictIndex: _cachedDictIndex,
      dictKeys: _cachedDictKeys,
      dictRev: _cachedDictRev,
      planHeader: _peekPlanHeader(),
    );
  }

  Widget? _peekPlanHeader() {
    final meta = widget.planMeta;
    if (meta == null) return null;
    return IgnorePointer(
      child: PlanReadingBar(
        planTitle: meta.planTitle,
        day: meta.day,
        totalDays: meta.totalDays,
        steps: meta.steps,
        session: meta.session,
        onJumpStep: (_) {},
        onOpenSheet: () {},
      ),
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
            _englishUI ? 'Chapter $ch' : '第 $ch 章',
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
      child: PageTurnYield(
        child: RepaintBoundary(
          child: Material(
            color: theme.background,
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                kReaderContentPadH,
                _locOverlayTopPad(),
                kReaderContentPadH,
                10,
              ),
              child: _chapterLocTitle(
                theme,
                bookName: bookName,
                chapter: chapter,
              ),
            ),
          ),
        ),
      ),
    );
  }

  double _locOverlayTopPad() =>
      widget.chromeHidden ? MediaQuery.paddingOf(context).top + 8 : 12.0;

  /// 固定卷章条高度，正文从条下开始，避免标题随横滑轨道移走。
  double _readerListTopPad() => _locOverlayTopPad() + 34;

  Widget _readerViewport({
    required ReaderPageTurn pageTurn,
    required bool swipeOn,
    required ReaderExperienceTheme theme,
    required Widget listBody,
    required Widget peekNext,
    required Widget peekPrev,
  }) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final pageW = constraints.maxWidth;
        _viewportWidth = pageW;
        final panelH = constraints.maxHeight;

        // 上下滚动：正文裸 ListView，无 Transform / 翻页 overlay（对齐 PWA scroll panel）。
        if (pageTurn == ReaderPageTurn.scroll) {
          return Stack(
            clipBehavior: Clip.hardEdge,
            children: [
              Positioned.fill(child: _wrapChapterChrome(listBody)),
              _stableLocOverlay(theme, 0),
            ],
          );
        }

        // 左右滑动：viewport Listener 轴锁横翻（对齐 PWA）；idle 时不 Transform 正文。
        return Listener(
          behavior: HitTestBehavior.translucent,
          onPointerDown: !swipeOn
              ? null
              : (e) => _beginPagePointer(e, swipeOn: swipeOn),
          onPointerMove: !swipeOn
              ? null
              : (e) => _movePagePointer(e, swipeOn: swipeOn),
          onPointerUp: !swipeOn ? null : _endPagePointer,
          onPointerCancel: !swipeOn
              ? null
              : (e) {
                  if (_pagePointerId == e.pointer &&
                      _pageDragAxis == 'x' &&
                      _pageDragRaw.abs() > 1) {
                    unawaited(_finishPageTurn(velocityPxPerSec: 0));
                  } else {
                    cancelPageTurn();
                  }
                },
          child: AnimatedBuilder(
            animation: Listenable.merge([_pageDragDxN, _pageTurnAnimatingN]),
            builder: (context, _) {
              final dx = _pageDragDxN.value;
              final trackVisible =
                  dx.abs() > 1 || _pageTurnAnimating || _pageTurningN.value;

              return Stack(
                clipBehavior: Clip.hardEdge,
                children: [
                  if (trackVisible)
                    ClipRect(
                      child: Transform.translate(
                        offset: Offset(-pageW + dx, 0),
                        transformHitTests: false,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: pageW,
                              height: panelH,
                              child: IgnorePointer(
                                child: RepaintBoundary(
                                  child: ColoredBox(
                                    color: theme.background,
                                    child: peekPrev,
                                  ),
                                ),
                              ),
                            ),
                            SizedBox(
                              width: pageW,
                              height: panelH,
                              child: ColoredBox(color: theme.background),
                            ),
                            SizedBox(
                              width: pageW,
                              height: panelH,
                              child: IgnorePointer(
                                child: RepaintBoundary(
                                  child: ColoredBox(
                                    color: theme.background,
                                    child: peekNext,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  Transform.translate(
                    offset: Offset(trackVisible ? dx : 0, 0),
                    transformHitTests: trackVisible,
                    child: SizedBox(
                      width: pageW,
                      height: panelH,
                      child: _wrapChapterChrome(listBody),
                    ),
                  ),
                  _stableLocOverlay(theme, dx),
                ],
              );
            },
          ),
        );
      },
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
    List<(int, int)>? paragraphRanges,
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
          for (final s in outlineForVersion(
            widget.book.id,
            widget.chapter,
            versionId: widget.mainVersionId,
          ))
            s.verse: s.title,
        };
    final paras = groupVersesIntoParagraphs(
      widget.book.id,
      structure.verses,
      sectionStarts: sections.keys.toList()..sort(),
      paragraphRanges: paragraphRanges,
    );
    final rows = <Object>[];
    for (final para in paras) {
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
      int? selStart,
      int? selEnd,
    }) {
      final hasCharSel =
          selected &&
          selBg != null &&
          selStart != null &&
          selEnd != null &&
          selEnd > selStart;
      if (!showDiff || diffs.isEmpty) {
        if (!hasCharSel) {
          return [
            TextSpan(
              text: '$text ',
              // 有 wordRange 时整节底色交给 overlay；对照无 overlay 才用 selStart/selEnd
              style: selected && selStart == null
                  ? base.copyWith(background: selBg)
                  : base,
            ),
          ];
        }
        final lo = selStart.clamp(0, text.length);
        final hi = selEnd.clamp(0, text.length);
        return [
          if (lo > 0) TextSpan(text: text.substring(0, lo), style: base),
          TextSpan(
            text: text.substring(lo, hi),
            style: base.copyWith(background: selBg),
          ),
          if (hi < text.length)
            TextSpan(text: text.substring(hi), style: base),
          TextSpan(text: ' ', style: base),
        ];
      }
      final parts = renderTextWithDiffSpans(text, diffs);
      if (!hasCharSel) {
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
                  : (selected && selStart == null
                        ? base.copyWith(background: selBg)
                        : base),
            ),
          TextSpan(text: ' ', style: base),
        ];
      }
      // 有 diff 时仍按字符选区切片上色（对照局部选）
      final lo = selStart.clamp(0, text.length);
      final hi = selEnd.clamp(0, text.length);
      var cursor = 0;
      final out = <InlineSpan>[];
      for (final p in parts) {
        final start = cursor;
        final end = cursor + p.text.length;
        cursor = end;
        if (p.diff) {
          out.add(
            TextSpan(
              text: p.text,
              style: diffStyle ??
                  base.copyWith(
                    backgroundColor: const Color(0x22C4A35A),
                    color: base.color,
                  ),
            ),
          );
          continue;
        }
        if (end <= lo || start >= hi) {
          out.add(TextSpan(text: p.text, style: base));
          continue;
        }
        final a = lo > start ? lo - start : 0;
        final b = hi < end ? hi - start : p.text.length;
        if (a > 0) {
          out.add(TextSpan(text: p.text.substring(0, a), style: base));
        }
        out.add(
          TextSpan(
            text: p.text.substring(a, b),
            style: base.copyWith(background: selBg),
          ),
        );
        if (b < p.text.length) {
          out.add(TextSpan(text: p.text.substring(b), style: base));
        }
      }
      out.add(TextSpan(text: ' ', style: base));
      return out;
    }

    final pageTurn = ref.watch(readerPageTurnProvider);
    final reduceMotion = peiaiReduceMotion(context);
    final swipeOn =
        pageTurn == ReaderPageTurn.swipe &&
        !reduceMotion &&
        !_pageTurnAnimating &&
        !_selectionGestureActive;
    final listBody = VerseSelectionSurface(
      key: _selectionSurfaceKey,
      enabled: true,
      selectionPrimed: _selected.isNotEmpty,
      primedRange: _wordRange,
      onApplyRange: (a, f, {commit = true}) {
        if (commit) {
          _applyWordRange(a, f, commit: true);
        } else {
          _scheduleWordRangeDuringDrag(a, f);
        }
      },
      onCommitRange: _commitWordRangeProgress,
      onClearIfEmptyTap: _selected.isNotEmpty ? _clearSelection : null,
      onSelectionGestureChanged: (on) {
        if (on) {
          _armSwipeIgnore();
          _cancelPagePointerTracking();
        }
        _setSelectionGestureActive(on);
      },
      child: ListView.builder(
      controller: _scroll,
      physics: _readerScrollPhysics,
      scrollCacheExtent: const ScrollCacheExtent.pixels(480),
      addAutomaticKeepAlives: false,
      addSemanticIndexes: false,
      // 对照模式同样沿用 PWA 的 16px 阅读边距，并垫开胶囊底栏。
      padding: EdgeInsets.fromLTRB(
        kReaderContentPadH,
        _readerListTopPad(),
        kReaderContentPadH,
        _readerListBottomPad(),
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
        final para = r as VerseParagraph;
        final selBg = Paint()..color = AppColors.accentWash;
        final fontStack = readerFontStack(
          family: fontFamily,
          english: _englishUI,
        );
        final mainBase = readerBodyTextStyle(
          color: theme.ink,
          fontPx: fontPx,
          poetry: poetry,
          fontFamily: fontStack.fontFamily,
          fontFamilyFallback: fontStack.fontFamilyFallback,
          english: _englishUI,
        );
        final parallelBase = mainBase.copyWith(
          color: theme.ink.withValues(alpha: 0.55),
          fontSize: fontPx * 0.92,
          height: kReaderParallelSecondaryLineHeight,
        );
        final bodyAlign = readerBodyTextAlign(english: _englishUI);
        return RepaintBoundary(
          child: Container(
            margin: EdgeInsets.only(
              bottom: readerParagraphGapBottom(poetry: poetry, fontPx: fontPx),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final (vi, v) in para.verses.indexed) ...[
                  if (sections[v.verse] case final t?) _sectionTitle(t),
                  Builder(
                    builder: (context) {
                      final isSel = _selected.contains(v.verse);
                      final wr = _wordRange;
                      int? selStart;
                      int? selEnd;
                      if (wr != null && isSel) {
                        final chars = () {
                          final n = normalizeWordRange(wr);
                          if (!n.verses.contains(v.verse)) return null;
                          final loV = n.anchor.verse;
                          final hiV = n.focus.verse;
                          if (loV == hiV) {
                            final lo = n.anchor.start < n.focus.start
                                ? n.anchor.start
                                : n.focus.start;
                            final hi = n.anchor.end > n.focus.end
                                ? n.anchor.end
                                : n.focus.end;
                            return (lo, hi);
                          }
                          if (v.verse == loV) {
                            return (n.anchor.start, 1 << 30);
                          }
                          if (v.verse == hiV) {
                            return (0, n.focus.end);
                          }
                          return (0, 1 << 30);
                        }();
                        if (chars != null) {
                          selStart = chars.$1;
                          selEnd = chars.$2;
                        }
                      }
                      final mainT = verseText(primary, v.verse);
                      final parallelT = verseText(compare, v.verse);
                      final diff = showDiff
                          ? (_parallelDiffMap[v.verse] ??
                              const VerseDiffResult(
                                main: [],
                                parallel: [],
                                heavy: false,
                              ))
                          : const VerseDiffResult(
                              main: [],
                              parallel: [],
                              heavy: false,
                            );
                      final versePrimary = <InlineSpan>[];
                      final verseCompare = <InlineSpan>[];
                      if (!poetry && vi == 0) {
                        versePrimary.add(
                          readerProseIndentSpan(fontPx: fontPx),
                        );
                      }
                      if (verseNo != ReaderVerseNumberMode.hidden) {
                        versePrimary.add(
                          TextSpan(
                            text: '${v.verse}\u2009',
                            style: TextStyle(
                              color: AppColors.accentDeep,
                              fontSize: fontPx * 0.65,
                              fontWeight: FontWeight.w700,
                              height: 1.0,
                              // 局部词选不给节号整块底色
                              background: isSel && wr == null ? selBg : null,
                            ),
                          ),
                        );
                      }
                      if (diff.heavy) {
                        if (isSel && selStart != null && selEnd != null) {
                          final lo = selStart.clamp(0, mainT.length);
                          final hi = selEnd.clamp(0, mainT.length);
                          if (lo > 0) {
                            versePrimary.add(
                              TextSpan(
                                text: mainT.substring(0, lo),
                                style: mainBase.copyWith(
                                  backgroundColor: const Color(0x18B8860B),
                                ),
                              ),
                            );
                          }
                          versePrimary.add(
                            TextSpan(
                              text: mainT.substring(lo, hi),
                              style: mainBase.copyWith(
                                backgroundColor: AppColors.accentWash,
                              ),
                            ),
                          );
                          if (hi < mainT.length) {
                            versePrimary.add(
                              TextSpan(
                                text: mainT.substring(hi),
                                style: mainBase.copyWith(
                                  backgroundColor: const Color(0x18B8860B),
                                ),
                              ),
                            );
                          }
                          versePrimary.add(TextSpan(text: ' ', style: mainBase));
                        } else {
                          versePrimary.add(
                            TextSpan(
                              text: '$mainT ',
                              style: mainBase.copyWith(
                                backgroundColor: isSel && wr == null
                                    ? AppColors.accentWash
                                    : const Color(0x18B8860B),
                              ),
                            ),
                          );
                        }
                      } else {
                        versePrimary.addAll(
                          textSpans(
                            text: mainT,
                            diffs: diff.main,
                            base: mainBase,
                            selected: isSel,
                            selBg: selBg,
                            selStart: selStart,
                            selEnd: selEnd,
                          ),
                        );
                      }
                      if (verseNo != ReaderVerseNumberMode.hidden) {
                        verseCompare.add(
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
                        verseCompare.add(
                          TextSpan(
                            text: '$parallelT ',
                            style: parallelBase.copyWith(
                              backgroundColor: const Color(0x18B8860B),
                            ),
                          ),
                        );
                      } else {
                        verseCompare.addAll(
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
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          RichText(
                            textAlign: bodyAlign,
                            text: TextSpan(style: mainBase, children: versePrimary),
                          ),
                          const SizedBox(height: 6),
                          RichText(
                            textAlign: bodyAlign,
                            text: TextSpan(style: parallelBase, children: verseCompare),
                          ),
                          if (v != para.verses.last) const SizedBox(height: 8),
                        ],
                      );
                    },
                  ),
                ],
              ],
            ),
          ),
        );
      },
    ),
        );

    final topPad = _readerListTopPad();
    _ensurePeekPanels(theme, topPad);
    return _readerViewport(
      pageTurn: pageTurn,
      swipeOn: swipeOn,
      theme: theme,
      listBody: listBody,
      peekNext: _cachedPeekNext!,
      peekPrev: _cachedPeekPrev!,
    );
  }
}

