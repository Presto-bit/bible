/// AI 听经全屏播放面。
library;

import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'bible_listen_api.dart';
import 'bible_listen_controller.dart';
import 'models.dart';

/// 对齐 PWA `SHEET_OPEN_GUARD_MS`：刚打开时忽略遮罩误触。
const _kListenSheetOpenGuard = Duration(milliseconds: 400);

Future<void> showBibleListenSheet(
  BuildContext context,
  WidgetRef ref, {
  required List<BibleBook> books,
  required BibleBook book,
  required int chapter,
  required String Function(String name) bookAbbr,
  required bool canPrevChapter,
  required bool canNextChapter,
  required Future<void> Function(int delta) onNavChapter,
  required Future<void> Function(BibleBook book, int chapter) onPickChapter,
  bool englishUI = false,
}) async {
  final ctrl = ref.read(bibleListenProvider.notifier);
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    // 对齐 PWA backdrop 终态 ~0.48；误触由 sheet 内 guard 处理
    barrierColor: const Color(0x7A1C1814),
    isDismissible: false,
    enableDrag: true,
    builder: (ctx) {
      return _ListenSheetDismissGuard(
        child: _BibleListenSheetBody(
          books: books,
          book: book,
          chapter: chapter,
          bookAbbr: bookAbbr,
          canPrevChapter: canPrevChapter,
          canNextChapter: canNextChapter,
          onNavChapter: onNavChapter,
          onPickChapter: onPickChapter,
          englishUI: englishUI,
        ),
      );
    },
  ).whenComplete(() {
    ctrl.closeSheet();
  });
}

/// 遮罩点击需过开场保护窗（对齐 PWA guardedClose）；拖拽 / 返回键仍可关。
class _ListenSheetDismissGuard extends StatefulWidget {
  const _ListenSheetDismissGuard({required this.child});
  final Widget child;

  @override
  State<_ListenSheetDismissGuard> createState() =>
      _ListenSheetDismissGuardState();
}

class _ListenSheetDismissGuardState extends State<_ListenSheetDismissGuard> {
  late final DateTime _openedAt = DateTime.now();

  bool get _canClose =>
      DateTime.now().difference(_openedAt) >= _kListenSheetOpenGuard;

  void _tryClose() {
    if (!_canClose) return;
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _tryClose,
            child: const ColoredBox(color: Colors.transparent),
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: widget.child,
        ),
      ],
    );
  }
}

class _BibleListenSheetBody extends ConsumerStatefulWidget {
  const _BibleListenSheetBody({
    required this.books,
    required this.book,
    required this.chapter,
    required this.bookAbbr,
    required this.canPrevChapter,
    required this.canNextChapter,
    required this.onNavChapter,
    required this.onPickChapter,
    this.englishUI = false,
  });

  final List<BibleBook> books;
  final BibleBook book;
  final int chapter;
  final String Function(String name) bookAbbr;
  final bool canPrevChapter;
  final bool canNextChapter;
  final Future<void> Function(int delta) onNavChapter;
  final Future<void> Function(BibleBook book, int chapter) onPickChapter;
  final bool englishUI;

  @override
  ConsumerState<_BibleListenSheetBody> createState() =>
      _BibleListenSheetBodyState();
}

class _BibleListenSheetBodyState extends ConsumerState<_BibleListenSheetBody>
    with TickerProviderStateMixin {
  String _panel = 'none';
  bool _catalogOpen = false;
  String _locTab = 'chapters';
  late String _selectedBookId;
  final Map<int, GlobalKey> _verseKeys = {};
  int? _lastScrolledVerse;
  String? _chapterFlash;
  bool _scriptureFading = false;
  late final AnimationController _enterCtl;
  late final AnimationController _breatheCtl;
  late final AnimationController _ringCtl;
  late final AnimationController _spinCtl;
  late final AnimationController _flashCtl;
  String _locKey = '';

  @override
  void initState() {
    super.initState();
    _selectedBookId = widget.book.id;
    _locKey = '${widget.book.id}:${widget.chapter}';
    _enterCtl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 720),
    )..forward();
    _breatheCtl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..repeat(reverse: true);
    _ringCtl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    )..repeat(reverse: true);
    _spinCtl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();
    _flashCtl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _scrollToVerse(ref.read(bibleListenProvider).currentVerse);
    });
  }

  @override
  void dispose() {
    _enterCtl.dispose();
    _breatheCtl.dispose();
    _ringCtl.dispose();
    _spinCtl.dispose();
    _flashCtl.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _BibleListenSheetBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.book.id != widget.book.id ||
        oldWidget.chapter != widget.chapter) {
      _selectedBookId = widget.book.id;
      _lastScrolledVerse = null;
      _verseKeys.clear();
      final key = '${widget.book.id}:${widget.chapter}';
      if (_locKey != key) {
        _locKey = key;
        setState(() {
          _scriptureFading = true;
          _chapterFlash =
              '${ref.read(bibleListenProvider).bookName} ${widget.chapter}';
        });
        _flashCtl.forward(from: 0);
        Future<void>.delayed(const Duration(milliseconds: 320), () {
          if (mounted) setState(() => _scriptureFading = false);
        });
        Future<void>.delayed(const Duration(milliseconds: 720), () {
          if (mounted) setState(() => _chapterFlash = null);
        });
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _scrollToVerse(ref.read(bibleListenProvider).currentVerse);
      });
    }
  }

  GlobalKey _keyFor(int verse) =>
      _verseKeys.putIfAbsent(verse, GlobalKey.new);

  void _scrollToVerse(int? verse) {
    if (verse == null || verse == _lastScrolledVerse) return;
    _lastScrolledVerse = verse;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _verseKeys[verse]?.currentContext;
      if (ctx == null || !mounted) return;
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 280),
        alignment: 0.28,
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(bibleListenProvider);
    final ctrl = ref.read(bibleListenProvider.notifier);
    final verses = ctrl.verses;
    final preparing = session.ui == BibleListenUi.preparing;
    final playing = session.ui == BibleListenUi.playing;
    final errored = session.ui == BibleListenUi.error;
    ref.listen<int?>(
      bibleListenProvider.select((s) => s.currentVerse),
      (prev, next) {
        if (next == null) return;
        // 仅在真正换节时滚；忽略间隙误判造成的回跳已在 resolve 层消除
        _scrollToVerse(next);
      },
    );
    final maxMs = session.duration.inMilliseconds <= 0
        ? 1.0
        : session.duration.inMilliseconds.toDouble();
    final posMs = session.position.inMilliseconds
        .clamp(0, session.duration.inMilliseconds)
        .toDouble();
    final selectedBook = widget.books.firstWhere(
      (b) => b.id == _selectedBookId,
      orElse: () => widget.book,
    );
    final ot = widget.books
        .where((b) => b.testament.toUpperCase().startsWith('O'))
        .toList();
    final nt = widget.books
        .where((b) => !b.testament.toUpperCase().startsWith('O'))
        .toList();

    return FadeTransition(
      opacity: Tween<double>(begin: 0.88, end: 1).animate(
        CurvedAnimation(
          parent: _enterCtl,
          curve: const Cubic(0.22, 1, 0.36, 1),
        ),
      ),
      child: SlideTransition(
        // 对齐 PWA listen-sheet-rise：自 18% 抬起
        position: Tween<Offset>(
          begin: const Offset(0, 0.18),
          end: Offset.zero,
        ).animate(
          CurvedAnimation(
            parent: _enterCtl,
            curve: const Cubic(0.22, 1, 0.36, 1),
          ),
        ),
        child: FractionallySizedBox(
      heightFactor: 0.95,
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // 底：纸感渐变
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFFF9F6F1),
                    Color(0xFFFAF8F4),
                  ],
                ),
              ),
            ),
            // 顶：径向 accent 光晕（对齐 PWA radial-gradient）
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              height: 220,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: const Alignment(0, -0.85),
                    radius: 1.15,
                    colors: [
                      AppColors.accent.withValues(alpha: 0.14),
                      AppColors.accent.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
            // 顶阴影
            const DecoratedBox(
              decoration: BoxDecoration(
                boxShadow: [
                  BoxShadow(
                    color: Color(0x2E281810),
                    blurRadius: 40,
                    offset: Offset(0, -8),
                  ),
                ],
              ),
            ),
            SafeArea(
          top: false,
          child: Stack(
            children: [
              Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 10, 22, 4),
                    child: Column(
                      children: [
                        Center(
                          child: Container(
                            width: 36,
                            height: 4,
                            margin: const EdgeInsets.only(bottom: 10),
                            decoration: BoxDecoration(
                              color: AppColors.inkSoft.withValues(alpha: 0.35),
                              borderRadius: BorderRadius.circular(99),
                            ),
                          ),
                        ),
                        Text(
                          widget.englishUI
                              ? 'Swipe down to keep listening'
                              : '下滑可继续听',
                          textAlign: TextAlign.center,
                          style:
                              TextStyle(fontSize: 12, color: AppColors.inkSoft),
                        ),
                        const SizedBox(height: 6),
                        InkWell(
                          onTap: () => setState(() {
                            _catalogOpen = true;
                            _locTab = 'chapters';
                            _selectedBookId = widget.book.id;
                          }),
                          borderRadius: BorderRadius.circular(10),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Flexible(
                                  child: Text(
                                    '${session.bookName} ${session.chapter}',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.ink,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 4),
                                const Text(
                                  '▾',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.inkSoft,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          session.translationLabel,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ClipRect(
                      child: Stack(
                        children: [
                          ImageFiltered(
                            imageFilter: _scriptureFading
                                ? ImageFilter.blur(sigmaX: 0.45, sigmaY: 0.45)
                                : ImageFilter.blur(sigmaX: 0, sigmaY: 0),
                            child: AnimatedOpacity(
                              opacity: _scriptureFading ? 0.28 : 1,
                              duration: const Duration(milliseconds: 320),
                              child: verses.isEmpty
                                  ? Center(
                                      child: Text(
                                        preparing
                                            ? (widget.englishUI
                                                ? 'Preparing listen…'
                                                : '正在准备听读…')
                                            : (widget.englishUI
                                                ? 'No verses'
                                                : '暂无经文'),
                                        style: const TextStyle(
                                          fontSize: 15,
                                          color: AppColors.inkSoft,
                                        ),
                                      ),
                                    )
                                  : ListView.builder(
                                      padding: EdgeInsets.fromLTRB(
                                        16,
                                        4,
                                        16,
                                        math.min(
                                          MediaQuery.sizeOf(context).height *
                                              0.46,
                                          360,
                                        ),
                                      ),
                                      itemCount: verses.length,
                                      itemBuilder: (context, i) {
                                        final v = verses[i];
                                        final isCurrent =
                                            session.currentVerse == v.verse;
                                        return AnimatedBuilder(
                                          key: _keyFor(v.verse),
                                          animation: _breatheCtl,
                                          builder: (context, _) {
                                            final breathe = isCurrent
                                                ? _breatheCtl.value
                                                : 0.0;
                                            final peak = isCurrent
                                                ? (breathe <= 0.5
                                                    ? breathe * 2
                                                    : (1 - breathe) * 2)
                                                : 0.0;
                                            return Padding(
                                              padding: const EdgeInsets.only(
                                                bottom: 2,
                                              ),
                                              child: Opacity(
                                                opacity:
                                                    session.currentVerse !=
                                                                null &&
                                                            !isCurrent
                                                        ? 0.58
                                                        : 1,
                                                child: Transform.scale(
                                                  scale: isCurrent
                                                      ? 1.012
                                                      : 1,
                                                  alignment:
                                                      Alignment.centerLeft,
                                                  child: Material(
                                                    color: isCurrent
                                                        ? Color.lerp(
                                                            const Color(
                                                              0xFFD4EAF6,
                                                            ),
                                                            Colors.white,
                                                            0.28 -
                                                                peak * 0.08,
                                                          )!
                                                        : Colors.transparent,
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                      8,
                                                    ),
                                                    child: InkWell(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                        8,
                                                      ),
                                                      onTap: !session
                                                                  .canSeek ||
                                                              preparing
                                                          ? null
                                                          : () => ctrl
                                                              .seekVerse(
                                                                v.verse,
                                                              ),
                                                      child: Container(
                                                        decoration: isCurrent
                                                            ? BoxDecoration(
                                                                borderRadius:
                                                                    BorderRadius
                                                                        .circular(
                                                                  8,
                                                                ),
                                                                border:
                                                                    Border.all(
                                                                  color: Color(
                                                                    0xFF8EC8E8,
                                                                  ).withValues(
                                                                    alpha: 0.4 +
                                                                        peak *
                                                                            0.15,
                                                                  ),
                                                                ),
                                                                boxShadow: [
                                                                  BoxShadow(
                                                                    color: const Color(
                                                                      0xFF8EC8E8,
                                                                    ).withValues(
                                                                      alpha: 0.18 +
                                                                          peak *
                                                                              0.18,
                                                                    ),
                                                                    blurRadius: 12 +
                                                                        peak *
                                                                            10,
                                                                  ),
                                                                ],
                                                              )
                                                            : null,
                                                        foregroundDecoration:
                                                            isCurrent
                                                                ? BoxDecoration(
                                                                    borderRadius:
                                                                        BorderRadius
                                                                            .circular(
                                                                      8,
                                                                    ),
                                                                    border:
                                                                        const Border(
                                                                      left:
                                                                          BorderSide(
                                                                        color: Color(
                                                                          0xBF5AA0C8,
                                                                        ),
                                                                        width: 3,
                                                                      ),
                                                                    ),
                                                                  )
                                                                : null,
                                                        child: Padding(
                                                          padding:
                                                              const EdgeInsets
                                                                  .symmetric(
                                                            horizontal: 10,
                                                            vertical: 5,
                                                          ),
                                                          child: Text.rich(
                                                            TextSpan(
                                                              children: [
                                                                TextSpan(
                                                                  text:
                                                                      '${v.verse} ',
                                                                  style:
                                                                      TextStyle(
                                                                    fontSize:
                                                                        13,
                                                                    fontWeight:
                                                                        FontWeight
                                                                            .w600,
                                                                    color: isCurrent
                                                                        ? const Color(
                                                                            0xFF3D7EA8,
                                                                          )
                                                                        : AppColors
                                                                            .inkSoft,
                                                                  ),
                                                                ),
                                                                TextSpan(
                                                                  text: v.text,
                                                                  style:
                                                                      TextStyle(
                                                                    fontSize:
                                                                        16,
                                                                    height:
                                                                        1.55,
                                                                    fontWeight:
                                                                        isCurrent
                                                                            ? FontWeight
                                                                                .w500
                                                                            : FontWeight
                                                                                .w400,
                                                                    color:
                                                                        AppColors
                                                                            .ink,
                                                                    letterSpacing:
                                                                        0.32,
                                                                  ),
                                                                ),
                                                              ],
                                                            ),
                                                          ),
                                                        ),
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            );
                                          },
                                        );
                                      },
                                    ),
                            ),
                          ),
                          if (_chapterFlash != null)
                            Positioned.fill(
                              child: IgnorePointer(
                                child: AnimatedBuilder(
                                  animation: _flashCtl,
                                  builder: (context, _) {
                                    // 对齐 PWA listen-chapter-flash keyframes
                                    final t = _flashCtl.value;
                                    double opacity;
                                    if (t < 0.18) {
                                      opacity = t / 0.18;
                                    } else if (t < 0.70) {
                                      opacity = 1;
                                    } else {
                                      opacity = (1 - t) / 0.30;
                                    }
                                    return Opacity(
                                      opacity: opacity.clamp(0.0, 1.0),
                                      child: ColoredBox(
                                        color: AppColors.surface
                                            .withValues(alpha: 0.55),
                                        child: Center(
                                          child: Text(
                                            _chapterFlash!,
                                            textAlign: TextAlign.center,
                                            style: const TextStyle(
                                              fontSize: 22,
                                              fontWeight: FontWeight.w600,
                                              letterSpacing: 0.64,
                                              color: AppColors.ink,
                                              shadows: [
                                                Shadow(
                                                  color: Color(0x99FFFFFF),
                                                  offset: Offset(0, 1),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  // 底栏：渐变盖住经文（对齐 PWA .listen-sheet-footer，非 Material 卡片）
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          AppColors.surface.withValues(alpha: 0),
                          AppColors.surface.withValues(alpha: 0.92),
                          AppColors.surface,
                        ],
                        stops: const [0, 0.18, 1],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.surface.withValues(alpha: 0.85),
                          blurRadius: 18,
                          offset: const Offset(0, -10),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(22, 10, 22, 16),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          SliderTheme(
                            data: SliderTheme.of(context).copyWith(
                              trackHeight: 3.5,
                              activeTrackColor: AppColors.accentDeep,
                              inactiveTrackColor:
                                  AppColors.line.withValues(alpha: 0.85),
                              thumbColor: AppColors.accentDeep,
                              overlayColor:
                                  AppColors.accentDeep.withValues(alpha: 0.12),
                              thumbShape: const RoundSliderThumbShape(
                                enabledThumbRadius: 8,
                              ),
                              trackShape:
                                  const RoundedRectSliderTrackShape(),
                            ),
                            child: Slider(
                              value: posMs,
                              max: maxMs,
                              onChanged: !session.canSeek || preparing
                                  ? null
                                  : (v) => ctrl.seekMs(v.round()),
                            ),
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                formatListenTime(session.position),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.inkSoft,
                                ),
                              ),
                              Text(
                                formatListenTime(session.duration),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.inkSoft,
                                ),
                              ),
                            ],
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                _chapterCtl(
                                  label: '‹‹',
                                  enabled:
                                      !preparing && widget.canPrevChapter,
                                  onTap: () => widget.onNavChapter(-1),
                                ),
                                const SizedBox(width: 28),
                                AnimatedBuilder(
                                  animation: Listenable.merge([
                                    _ringCtl,
                                    _spinCtl,
                                  ]),
                                  builder: (context, _) {
                                    final pulse =
                                        playing ? _ringCtl.value : 0.0;
                                    // 对齐 PWA .listen-sheet-play：实心圆 + ▶/‖，无 Material/Ink 中间多余层
                                    final bg = preparing
                                        ? Color.lerp(
                                            AppColors.accentDeep,
                                            const Color(0xFF6A7A72),
                                            0.22,
                                          )!
                                        : AppColors.accentDeep;
                                    return SizedBox(
                                      width: 96,
                                      height: 96,
                                      child: Stack(
                                        alignment: Alignment.center,
                                        children: [
                                          CustomPaint(
                                            size: const Size(96, 96),
                                            painter: _ListenPlayRingPainter(
                                              playing: playing,
                                              preparing: preparing,
                                              pulse: pulse,
                                              spin: _spinCtl.value,
                                              color: AppColors.accentDeep,
                                            ),
                                          ),
                                          GestureDetector(
                                            behavior: HitTestBehavior.opaque,
                                            onTap: preparing
                                                ? null
                                                : () =>
                                                    ctrl.togglePlayPause(),
                                            child: Container(
                                              width: 68,
                                              height: 68,
                                              decoration: BoxDecoration(
                                                shape: BoxShape.circle,
                                                color: bg,
                                                boxShadow: preparing
                                                    ? null
                                                    : [
                                                        BoxShadow(
                                                          color: AppColors
                                                              .accentDeep
                                                              .withValues(
                                                                alpha: 0.35,
                                                              ),
                                                          blurRadius: 18,
                                                          offset: const Offset(
                                                            0,
                                                            6,
                                                          ),
                                                        ),
                                                      ],
                                              ),
                                              alignment: Alignment.center,
                                              child: preparing
                                                  ? null
                                                  : Text(
                                                      playing ? '‖' : '▶',
                                                      style: TextStyle(
                                                        color: Colors.white,
                                                        fontSize:
                                                            playing ? 26 : 24,
                                                        height: 1,
                                                        fontWeight:
                                                            FontWeight.w600,
                                                        letterSpacing:
                                                            playing ? 0 : 2,
                                                      ),
                                                    ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  },
                                ),
                                const SizedBox(width: 28),
                                _chapterCtl(
                                  label: '››',
                                  enabled:
                                      !preparing && widget.canNextChapter,
                                  onTap: () => widget.onNavChapter(1),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            preparing
                                ? (widget.englishUI
                                    ? 'Preparing'
                                    : '正在准备')
                                : session.sleepClosing
                                    ? (widget.englishUI
                                        ? 'Rest well — softly closing'
                                        : '安歇吧 · 轻轻收束')
                                    : (errored
                                        ? (session.error ??
                                            (widget.englishUI
                                                ? 'Failed — tap to retry'
                                                : '准备失败，点按重试'))
                                        : ' '),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 13,
                              letterSpacing: session.sleepClosing ? 0.32 : 0,
                              color: errored
                                  ? const Color(0xFFA0483A)
                                  : session.sleepClosing
                                      ? AppColors.accentDeep
                                      : AppColors.inkSoft,
                            ),
                          ),
                          Wrap(
                            alignment: WrapAlignment.center,
                            spacing: 8,
                            runSpacing: 6,
                            children: [
                              _chip(
                                label: widget.englishUI
                                    ? 'Speed ${session.settings.speed}×'
                                    : '语速 ${session.settings.speed}×',
                                on: _panel == 'speed',
                                onTap: () => setState(
                                  () => _panel =
                                      _panel == 'speed' ? 'none' : 'speed',
                                ),
                              ),
                              _chip(
                                label: kListenVoices
                                        .where((v) =>
                                            v.id == session.settings.voice)
                                        .map((v) => v.label)
                                        .firstOrNull ??
                                    (widget.englishUI ? 'Voice' : '音色'),
                                on: _panel == 'voice',
                                onTap: () => setState(
                                  () => _panel =
                                      _panel == 'voice' ? 'none' : 'voice',
                                ),
                              ),
                              _chip(
                                label: session.settings.sleepMinutes == null
                                    ? (widget.englishUI ? 'Timer' : '定时')
                                    : (widget.englishUI
                                        ? 'Timer ${session.settings.sleepMinutes}′'
                                        : '定时 ${session.settings.sleepMinutes}′'),
                                on: _panel == 'sleep',
                                onTap: () => setState(
                                  () => _panel =
                                      _panel == 'sleep' ? 'none' : 'sleep',
                                ),
                              ),
                            ],
                          ),
                          if (_panel == 'speed')
                            Wrap(
                              alignment: WrapAlignment.center,
                              spacing: 8,
                              children: [0.8, 1.0, 1.25, 1.5].map((s) {
                                return _chip(
                                  label: '$s×',
                                  on: session.settings.speed == s,
                                  onTap: () {
                                    ctrl.updateSettings(
                                      session.settings.copyWith(speed: s),
                                    );
                                    setState(() => _panel = 'none');
                                  },
                                );
                              }).toList(),
                            ),
                          if (_panel == 'voice')
                            Wrap(
                              alignment: WrapAlignment.center,
                              spacing: 8,
                              children: kListenVoices.map((v) {
                                return _chip(
                                  label: v.label,
                                  on: session.settings.voice == v.id,
                                  onTap: () {
                                    unawaited(ctrl.selectVoice(v.id));
                                    setState(() => _panel = 'none');
                                  },
                                );
                              }).toList(),
                            ),
                          if (_panel == 'sleep')
                            Wrap(
                              alignment: WrapAlignment.center,
                              spacing: 8,
                              children: [
                                (null, widget.englishUI ? 'Off' : '关'),
                                (15, widget.englishUI ? '15 min' : '15 分'),
                                (30, widget.englishUI ? '30 min' : '30 分'),
                                (60, widget.englishUI ? '60 min' : '60 分'),
                              ].map((e) {
                                final minutes = e.$1;
                                return _chip(
                                  label: e.$2,
                                  on: session.settings.sleepMinutes ==
                                      minutes,
                                  onTap: () {
                                    ctrl.armSleep(minutes);
                                    setState(() => _panel = 'none');
                                  },
                                );
                              }).toList(),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              if (_catalogOpen)
                Positioned.fill(
                  child: Material(
                    color: AppColors.surface,
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(22)),
                    child: SafeArea(
                      top: false,
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 14, 12, 8),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    selectedBook.name,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                TextButton(
                                  onPressed: () =>
                                      setState(() => _catalogOpen = false),
                                  child: Text(
                                    widget.englishUI ? 'Close' : '关闭',
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Row(
                              children: [
                                _seg(
                                  widget.englishUI ? 'Books' : '卷',
                                  _locTab == 'books',
                                  () => setState(() => _locTab = 'books'),
                                ),
                                const SizedBox(width: 8),
                                _seg(
                                  widget.englishUI ? 'Chapters' : '章',
                                  _locTab == 'chapters',
                                  () => setState(() => _locTab = 'chapters'),
                                ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: _locTab == 'chapters'
                                ? GridView.builder(
                                    padding: const EdgeInsets.all(16),
                                    gridDelegate:
                                        const SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: 5,
                                      mainAxisSpacing: 8,
                                      crossAxisSpacing: 8,
                                    ),
                                    itemCount: selectedBook.chapterCount,
                                    itemBuilder: (context, i) {
                                      final n = i + 1;
                                      final current =
                                          selectedBook.id == widget.book.id &&
                                              n == widget.chapter;
                                      return Material(
                                        color: current
                                            ? AppColors.accent
                                                .withValues(alpha: 0.15)
                                            : AppColors.paper,
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          side: BorderSide(
                                            color: current
                                                ? AppColors.accentDeep
                                                : AppColors.line,
                                          ),
                                        ),
                                        child: InkWell(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          onTap: () async {
                                            await widget.onPickChapter(
                                              selectedBook,
                                              n,
                                            );
                                            if (mounted) {
                                              setState(
                                                () => _catalogOpen = false,
                                              );
                                            }
                                          },
                                          child: Center(
                                            child: Text(
                                              '$n',
                                              style: TextStyle(
                                                fontWeight: current
                                                    ? FontWeight.w700
                                                    : FontWeight.w500,
                                              ),
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                                  )
                                : ListView(
                                    padding: const EdgeInsets.all(16),
                                    children: [
                                      _bookGroup(
                                        widget.englishUI
                                            ? 'Old Testament'
                                            : '旧约',
                                        ot,
                                      ),
                                      _bookGroup(
                                        widget.englishUI
                                            ? 'New Testament'
                                            : '新约',
                                        nt,
                                      ),
                                    ],
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
            ],
          ),
        ),
      ),
      ),
    );
  }

  Widget _chapterCtl({
    required String label,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return SizedBox(
      width: 48,
      height: 48,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: enabled ? onTap : null,
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 22,
                color: enabled
                    ? AppColors.ink
                    : AppColors.ink.withValues(alpha: 0.35),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _seg(String label, bool on, VoidCallback onTap) {
    return Expanded(
      child: Material(
        color: on
            ? AppColors.accent.withValues(alpha: 0.12)
            : AppColors.surfaceSunken,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: on ? AppColors.accentDeep : AppColors.inkSoft,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _bookGroup(String label, List<BibleBook> list) {
    if (list.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.inkSoft,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: list.map((b) {
              final on = b.id == _selectedBookId;
              return Material(
                color: on
                    ? AppColors.accent.withValues(alpha: 0.12)
                    : AppColors.paper,
                shape: StadiumBorder(
                  side: BorderSide(
                    color: on ? AppColors.accentDeep : AppColors.line,
                  ),
                ),
                child: InkWell(
                  customBorder: const StadiumBorder(),
                  onTap: () => setState(() {
                    _selectedBookId = b.id;
                    _locTab = 'chapters';
                  }),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    child: Text(widget.bookAbbr(b.name)),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _chip({
    required String label,
    required bool on,
    required VoidCallback? onTap,
  }) {
    return Material(
      color: on
          ? AppColors.accent.withValues(alpha: 0.12)
          : AppColors.surface.withValues(alpha: 0.7),
      shape: StadiumBorder(
        side: BorderSide(
          color: on
              ? AppColors.accentDeep.withValues(alpha: 0.35)
              : AppColors.line,
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: on ? AppColors.accentDeep : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}

class _ListenPlayRingPainter extends CustomPainter {
  _ListenPlayRingPainter({
    required this.playing,
    required this.preparing,
    required this.pulse,
    required this.spin,
    required this.color,
  });

  final bool playing;
  final bool preparing;
  final double pulse;
  final double spin;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final buttonR = 34.0;

    if (preparing) {
      // 对齐 PWA .listen-sheet-play.is-preparing::before 转圈描边
      final rect = Rect.fromCircle(center: c, radius: buttonR + 5);
      final bg = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = Colors.white.withValues(alpha: 0.12);
      canvas.drawCircle(c, buttonR + 5, bg);
      final fg = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..strokeCap = StrokeCap.round
        ..color = Colors.white.withValues(alpha: 0.72);
      canvas.drawArc(
        rect,
        -math.pi / 2 + spin * math.pi * 2,
        math.pi * 1.15,
        false,
        fg,
      );
      return;
    }

    if (!playing) return;
    final t = pulse;
    final scaleA = 1.0 + 0.07 * _easePeak(t);
    final scaleB = 1.0 + 0.07 * _easePeak((t + 0.35) % 1.0);
    final opacityA = 0.55 + 0.4 * _easePeak(t);
    final opacityB = 0.35 + 0.3 * _easePeak((t + 0.35) % 1.0);

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = color.withValues(alpha: opacityA * 0.9);
    canvas.drawCircle(c, (buttonR + 7) * scaleA, paint);
    paint
      ..strokeWidth = 1
      ..color = color.withValues(alpha: opacityB * 0.45);
    canvas.drawCircle(c, (buttonR + 14) * scaleB, paint);
  }

  double _easePeak(double t) {
    final x = (t <= 0.5) ? t * 2 : (1 - t) * 2;
    return Curves.easeInOut.transform(x.clamp(0.0, 1.0));
  }

  @override
  bool shouldRepaint(covariant _ListenPlayRingPainter oldDelegate) {
    return oldDelegate.playing != playing ||
        oldDelegate.preparing != preparing ||
        oldDelegate.pulse != pulse ||
        oldDelegate.spin != spin ||
        oldDelegate.color != color;
  }
}
