/// 经文阅读器：选卷 → 选章 → 逐节阅读；点节锚定问小爱。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart'
    show
        navIndexProvider,
        peiaiTabBarOverlayExtent,
        PeiaiShellMetrics,
        readerChromeToggleProvider,
        readerImmersiveProvider;
import '../../core/badge_stats.dart';
import '../../core/api_client.dart' show prefsProvider;
import '../../core/gamification.dart' show maybeNotifyBookComplete;
import '../../core/theme.dart';
import '../assistant/assistant_repository.dart';
import '../assistant/assistant_scenes.dart';
import '../search/search_screen.dart';
import '../plans/plan_navigation.dart';
import '../plans/plan_reading.dart';
import '../plans/plan_session.dart';
import '../plans/plan_steps.dart';
import '../plans/plans_repository.dart';
import 'offline_notice.dart';
import 'offline_bible.dart';
import 'bible_repository.dart';
import 'models.dart';
import 'reader_audio.dart';
import 'reader_catalog_view.dart';
import 'feed_activity.dart';
import 'reader_experience.dart';
import 'verse_selection_gesture.dart' show shouldYieldPageTurn;
import 'reader_loc_popover.dart';
import 'reader_preferences.dart';
import 'reader_settings_menu.dart';
import 'reader_sheet.dart';
import 'summary_sheet.dart';
import 'xiaoai_half_sheet.dart';
import 'reading_repository.dart';
import '../../core/peiai_haptics.dart';

/// 阅读器跳转目标（串珠/词典点选后跳章；可选 verse 触发滚到并轻闪）。
class ReaderJumpState {
  const ReaderJumpState({
    required this.book,
    required this.chapter,
    this.verse,
    this.feedHint,
  });

  final String book;
  final int chapter;
  final int? verse;
  final FeedActivityHint? feedHint;
}

class ReaderJumpNotifier extends Notifier<ReaderJumpState?> {
  @override
  ReaderJumpState? build() => null;

  void jump(
    String book,
    int chapter, {
    int? verse,
    FeedActivityHint? feedHint,
  }) =>
      state = ReaderJumpState(
        book: book.toUpperCase(),
        chapter: chapter,
        verse: verse,
        feedHint: feedHint,
      );

  void clear() => state = null;
}

final readerJumpProvider =
    NotifierProvider<ReaderJumpNotifier, ReaderJumpState?>(
      ReaderJumpNotifier.new,
    );

/// 跨入口返回（搜索/笔记等跳读经后显示顶栏返回）。
class ReaderReturnTarget {
  const ReaderReturnTarget({required this.label, required this.onBack});
  final String label;
  final VoidCallback onBack;
}

class ReaderReturnNotifier extends Notifier<ReaderReturnTarget?> {
  @override
  ReaderReturnTarget? build() => null;
  void set(ReaderReturnTarget target) => state = target;
  void clear() => state = null;
}

final readerReturnProvider =
    NotifierProvider<ReaderReturnNotifier, ReaderReturnTarget?>(
      ReaderReturnNotifier.new,
    );

class ReaderScreen extends ConsumerStatefulWidget {
  const ReaderScreen({
    super.key,
    this.initialBook,
    this.initialChapter,
    this.planMeta,
    this.initialStepIndex,
  });

  /// 从计划/继续阅读进入时指定起始位置。
  final String? initialBook;
  final int? initialChapter;
  final PlanReadingMeta? planMeta;
  final int? initialStepIndex;

  @override
  ConsumerState<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends ConsumerState<ReaderScreen>
    with WidgetsBindingObserver {
  BibleBook? _book;
  int _chapter = 1;
  bool _seeded = false;
  Timer? _timer;
  bool _chromeHidden = false;
  bool _hasSelection = false;
  bool _catalogOverlay = false;
  String _versionLabel = '和合本';
  String? _compareVersionId;
  String? _mainVersionId;
  PlanReadingMeta? _planMeta;
  final _locKey = GlobalKey();
  final _chapterBodyKey = GlobalKey<ReaderChapterBodyState>();
  Offset? _chromeTapStart;
  /// 外部跳转指定轻闪节（如每日经文）；消费后清空。
  int? _pendingFlashVerse;
  FeedActivityHint? _pendingFeedHint;
  String? _lastAudioBindKey;
  bool _lastHasSelectionForAudio = false;
  String? _lastPrewarmChapterKey;
  Timer? _prewarmTimer;

  void _scheduleChapterPrewarm(String bookId, int chapter) {
    final key = '$bookId.$chapter';
    if (_lastPrewarmChapterKey == key) return;
    _lastPrewarmChapterKey = key;
    _prewarmTimer?.cancel();
    _prewarmTimer = Timer(const Duration(milliseconds: 800), () {
      if (!mounted || _book?.id != bookId || _chapter != chapter) return;
      unawaited(
        ref.read(assistantRepoProvider).prewarmAnswer(
          '$bookId.$chapter.1',
          scene: AssistantScene.verseQuick,
        ),
      );
    });
  }

  void _syncReaderAudio() {
    if (!kReaderAudioEnabled) return;
    final b = _book;
    if (b == null) return;
    final screenVer = _mainVersionId ?? 'cuvs';
    final key = '${b.id}|$_chapter|$screenVer|$_catalogOverlay';
    if (_lastAudioBindKey != key) {
      _lastAudioBindKey = key;
      ref.read(readerAudioProvider.notifier).bindChapter(
            bookId: b.id,
            bookName: b.name,
            chapter: _chapter,
            screenVersion: screenVer,
            pausedByOverlay: _catalogOverlay,
          );
    }
    _wireReaderAudioHandlers();
  }

  void _wireReaderAudioHandlers() {
    final b = _book;
    if (b == null) return;
    ref.read(readerAudioProvider.notifier).setNotificationHandlers(
          onPrevious:
              _chapter > 1 ? () => unawaited(_navWithAudio(-1)) : null,
          onNext: _chapter < b.chapterCount
              ? () => unawaited(_navWithAudio(1))
              : null,
          onContinuousNext: _chapter < b.chapterCount
              ? () => unawaited(_navWithAudio(1))
              : null,
        );
  }

  Future<void> _navWithAudio(int delta, {bool forcePlay = false}) async {
    final ctrl = ref.read(readerAudioProvider.notifier);
    final wasPlaying =
        ref.read(readerAudioProvider).state == ReaderAudioState.playing;
    final continuous = ctrl.settings.continuousChapter;
    await _nav(delta);
    if (!mounted) return;
    final b = _book;
    if (b == null) return;
    if (wasPlaying || continuous || forcePlay) {
      await ctrl.play(
        bookId: b.id,
        bookName: b.name,
        chapter: _chapter,
        screenVersion: _mainVersionId ?? 'cuvs',
        skipCheckpoint: true,
      );
    }
  }

  bool _canNavChapter(int delta) {
    final b = _book;
    if (b == null || delta == 0) return false;
    final books = ref.read(booksProvider).value;
    if (books == null) return false;
    if (_planMeta != null && _planMeta!.steps.isNotEmpty) {
      return resolvePlanNav(
            books,
            _planMeta!.steps,
            b.id,
            _chapter,
            delta,
          ) !=
          null;
    }
    final bi = books.indexWhere((x) => x.id == b.id);
    if (bi < 0) return false;
    final chapter = _chapter + delta;
    if (chapter > books[bi].chapterCount) {
      return bi < books.length - 1;
    }
    if (chapter < 1) {
      return bi > 0;
    }
    return true;
  }

  Future<void> _navWithAudioFromPanel(int delta) =>
      _navWithAudio(delta, forcePlay: true);

  @override
  void initState() {
    super.initState();
    _planMeta = widget.planMeta;
    if (widget.initialChapter != null) _chapter = widget.initialChapter!;
    WidgetsBinding.instance.addObserver(this);
    // 前台阅读计时：圣经 Tab 活跃时每分钟累计 1 分钟阅读时长。
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (!mounted) return;
      final lifecycle = WidgetsBinding.instance.lifecycleState;
      final active = ref.read(navIndexProvider) == 1;
      if (active && lifecycle == AppLifecycleState.resumed) {
        ref.read(readingRepoProvider).addMinutes(1);
      }
    });
    final prefs = ref.read(prefsProvider);
    final savedCompare = prefs.getString('reader_parallel_version');
    final savedMain = prefs.getString('reader_main_version');
    final layout = prefs.getString('reader_layout');
    if (savedMain != null && savedMain.isNotEmpty) {
      _mainVersionId = savedMain;
      _versionLabel = _versionLabelFor(savedMain);
    } else if (savedCompare != null && savedCompare.isNotEmpty) {
      _compareVersionId = savedCompare;
      _versionLabel = '和合本 · ${_versionLabelFor(savedCompare)}';
    } else if (layout == 'parallel') {
      _compareVersionId = 'cnv';
      _versionLabel = '和合本 · ${_versionLabelFor('cnv')}';
    } else {
      _versionLabel = '和合本';
    }
  }

  static String _versionLabelFor(String id) {
    switch (id.toLowerCase()) {
      case 'cuvs':
        return '和合本';
      case 'cnv':
        return '新译本';
      case 'contemporary':
        return '当代译本';
      case 'kjv':
        return 'King James Version';
      default:
        return id.toUpperCase();
    }
  }

  /// 对齐 PWA：顶栏 + 底栏一体沉浸；点按切换，无 idle 自动藏。
  void _setChrome(bool hidden) {
    if (!mounted) return;
    if (_chromeHidden != hidden) {
      setState(() => _chromeHidden = hidden);
    }
    final want = hidden && ref.read(navIndexProvider) == 1;
    if (ref.read(readerImmersiveProvider) != want) {
      ref.read(readerImmersiveProvider.notifier).set(want);
    }
  }

  void _revealChrome() => _setChrome(false);

  void _toggleChrome() {
    if (_book == null) return;
    if (kReaderAudioEnabled) {
      final audio = ref.read(readerAudioProvider);
      if (audio.focusOpen) {
        ref.read(readerAudioProvider.notifier).minimizePanel();
      }
    }
    _setChrome(!_chromeHidden);
  }

  /// 打开半屏 / 设置 / AI 时强制恢复 chrome（对齐 PWA overlay 规则）。
  void _onOpenOverlay() {
    _chapterBodyKey.currentState?.releaseReaderGestures();
    _revealChrome();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _chapterBodyKey.currentState?.releaseReaderGestures();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _prewarmTimer?.cancel();
    ref.read(readerImmersiveProvider.notifier).set(false);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final booksAsync = ref.watch(booksProvider);

    // 串珠/词典/每日经文跳转：解析目标卷并切换。
    ref.listen(readerJumpProvider, (prev, next) {
      if (next == null) return;
      final books = ref.read(booksProvider).value;
      if (books == null) return;
      final b = books.firstWhere(
        (x) => x.id == next.book,
        orElse: () => _book ?? books.first,
      );
      final ch = next.chapter.clamp(1, b.chapterCount);
      setState(() {
        _book = b;
        _chapter = ch;
        _seeded = true;
        _pendingFlashVerse = next.verse;
        _pendingFeedHint = next.feedHint;
      });
      ref.read(readerJumpProvider.notifier).clear();
      _revealChrome();
    });

    // 回到圣经 Tab：若 session 内仍沉浸，恢复底栏隐藏。
    ref.listen(navIndexProvider, (prev, next) {
      if (next != 1) {
        _chapterBodyKey.currentState?.releaseReaderGestures();
      }
      if (next == 1 && _chromeHidden) {
        ref.read(readerImmersiveProvider.notifier).set(true);
      }
    });

    // 底栏再次点「圣经」：切换顶栏/沉浸（对齐 PWA peiai-reader-toggle-chrome）。
    ref.listen(readerChromeToggleProvider, (prev, next) {
      if (prev == next) return;
      if (_book == null || _catalogOverlay) return;
      _toggleChrome();
    });

    final readerReturn = ref.watch(readerReturnProvider);
    final englishUI = _mainVersionId == 'kjv';
    final audioSession = ref.watch(readerAudioProvider);
    final audioCtrl = ref.read(readerAudioProvider.notifier);
    final screenVer = _mainVersionId ?? 'cuvs';

    _syncReaderAudio();
    if (_book != null) {
      _scheduleChapterPrewarm(_book!.id, _chapter);
    }
    if (_hasSelection != _lastHasSelectionForAudio) {
      _lastHasSelectionForAudio = _hasSelection;
      audioCtrl.setCollapsed(_hasSelection);
    }

    ref.listen(navIndexProvider, (prev, next) {
      if (prev == 1 && next != 1) {
        final s = ref.read(readerAudioProvider.notifier).settings;
        if (s.pauseOnTabLeave) {
          ref.read(readerAudioProvider.notifier).stop();
        }
      }
    });

    ref.listen(readerAudioProvider, (prev, next) {
      if (next.focusOpen && prev?.focusOpen != true) {
        _revealChrome();
      }
      if (next.state != ReaderAudioState.error) return;
      if (prev?.state != ReaderAudioState.loading) return;
      final net = ref.read(networkOkProvider).value;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            net == false ? '需要网络加载本章朗读' : '朗读加载失败',
          ),
          duration: const Duration(milliseconds: 2200),
          behavior: SnackBarBehavior.floating,
        ),
      );
    });

    return Scaffold(
      backgroundColor: ref.watch(readerExperienceThemeProvider).background,
      appBar: _chromeHidden
          ? null
          : AppBar(
              leading: readerReturn != null
                  ? IconButton(
                      icon: const Icon(Icons.arrow_back),
                      tooltip: '返回${readerReturn.label}',
                      onPressed: () {
                        ref.read(readerReturnProvider.notifier).clear();
                        readerReturn.onBack();
                      },
                    )
                  : null,
              titleSpacing: 8,
              title: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  InkWell(
                    onTap: () {
                      _onOpenOverlay();
                      _pickVersions(context);
                    },
                    borderRadius: BorderRadius.circular(6),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
                      child: Text(
                        _versionLabel,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: AppColors.inkSoft,
                        ),
                      ),
                    ),
                  ),
                  Container(width: 1, height: 14, color: AppColors.line),
                  InkWell(
                    key: _locKey,
                    onTap: () {
                      _onOpenOverlay();
                      _pickBookChapter(context);
                    },
                    borderRadius: BorderRadius.circular(6),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
                      child: Text(
                        _book == null
                            ? (englishUI ? 'Select book' : '选择经卷')
                            : englishUI
                            ? '${bibleBookAbbr(_book!.name)} $_chapter'
                            : '${bibleBookAbbr(_book!.name)} $_chapter',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  Container(width: 1, height: 14, color: AppColors.line),
                  InkWell(
                    onTap: () {
                      _onOpenOverlay();
                      _openChapterSummary();
                    },
                    borderRadius: BorderRadius.circular(6),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(8, 4, 4, 4),
                      child: Text(
                        englishUI ? 'Summary' : '概要',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: AppColors.inkSoft,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              actions: [
                IconButton(
                  tooltip: '搜索',
                  icon: const Icon(Icons.search),
                  onPressed: () {
                    _onOpenOverlay();
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const SearchScreen()),
                    );
                  },
                ),
                if (kReaderAudioEnabled)
                  ReaderAudioTopButton(
                    session: audioSession,
                    onTap: () {
                      final b = _book;
                      if (b == null) return;
                      _onOpenOverlay();
                      audioCtrl.tapTopBar(
                        bookId: b.id,
                        bookName: b.name,
                        chapter: _chapter,
                        screenVersion: screenVer,
                      );
                    },
                    onLongPress: () {
                      _onOpenOverlay();
                      audioCtrl.setSettingsOpen(true);
                      showReaderAudioSettingsSheet(context, ref);
                    },
                  ),
                IconButton(
                  tooltip: '阅读设置',
                  icon: const Icon(Icons.more_vert),
                  onPressed: () {
                    _onOpenOverlay();
                    _openReaderSettings(context);
                  },
                ),
              ],
            ),
      body: Stack(
        clipBehavior: Clip.none,
        children: [
          Listener(
            behavior: HitTestBehavior.deferToChild,
            onPointerDown: (e) {
              if (_book == null || _catalogOverlay) return;
              _chromeTapStart = e.position;
            },
            onPointerUp: (e) {
              if (_book == null || _catalogOverlay || _hasSelection) return;
              final start = _chromeTapStart;
              _chromeTapStart = null;
              if (start == null) return;
              if ((e.position - start).distance >= 8) return;
              if (shouldYieldPageTurn(context, e.position)) return;
              _toggleChrome();
            },
            onPointerCancel: (_) => _chromeTapStart = null,
            child: booksAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErrorView(
            message: '$e',
            onRetry: () => ref.refresh(booksProvider),
          ),
          data: (books) {
            final progressAsync = ref.watch(readingProgressStreamProvider);
            if (!_seeded) {
              if (widget.initialBook != null) {
                final target = widget.initialBook!;
                _book = books.firstWhere(
                  (b) => b.id == target.toUpperCase() || b.name == target,
                  orElse: () => books.firstWhere(
                    (b) => b.id == 'JHN',
                    orElse: () => books.first,
                  ),
                );
                _seeded = true;
              } else if (progressAsync.isLoading) {
                return const Center(child: CircularProgressIndicator());
              } else {
                final saved = progressAsync.asData?.value;
                if (saved != null) {
                  _book = books.firstWhere(
                    (b) =>
                        b.id == saved.book.toUpperCase() ||
                        b.name == saved.book,
                    orElse: () => books.firstWhere(
                      (b) => b.id == 'JHN',
                      orElse: () => books.first,
                    ),
                  );
                  _chapter = saved.chapter.clamp(1, _book!.chapterCount);
                }
                // 无进度：保持 _book == null → 全屏目录（对齐 PWA）
                _seeded = true;
              }
            }

            if (_book == null || _catalogOverlay) {
              final saved = progressAsync.asData?.value;
              return Column(
                children: [
                  const OfflineBibleCard(),
                  Expanded(
                    child: ReaderCatalogView(
                      books: books,
                      showBack: _catalogOverlay && _book != null,
                      onBack: () => setState(() => _catalogOverlay = false),
                      resumeBookId: _book?.id ?? saved?.book,
                      resumeChapter: _book != null ? _chapter : saved?.chapter,
                      planSteps: _planMeta?.steps,
                      onPickChapter: (b, ch) {
                        setState(() {
                          _book = b;
                          _chapter = ch.clamp(1, b.chapterCount);
                          _catalogOverlay = false;
                          _hasSelection = false;
                          _seeded = true;
                        });
                        ref.read(readingRepoProvider).record(b.id, ch);
                      },
                    ),
                  ),
                ],
              );
            }

            return Column(
              children: [
                const OfflineBibleCard(),
                Expanded(
                  child: ReaderChapterBody(
                    key: _chapterBodyKey,
                    book: _book!,
                    chapter: _chapter,
                    books: books,
                    compareVersionId: _compareVersionId,
                    mainVersionId: _mainVersionId,
                    chromeHidden: _chromeHidden,
                    flashVerse: _pendingFlashVerse,
                    feedHint: _pendingFeedHint,
                    onFlashConsumed: () {
                      if (_pendingFlashVerse != null ||
                          _pendingFeedHint != null) {
                        setState(() {
                          _pendingFlashVerse = null;
                          _pendingFeedHint = null;
                        });
                      }
                    },
                    planMeta: _planMeta,
                    onPlanMetaChange: (m) => setState(() => _planMeta = m),
                    onPlanJump: (bookId, ch) {
                      final b = books.firstWhere(
                        (x) => x.id == bookId.toUpperCase(),
                        orElse: () => _book!,
                      );
                      setState(() {
                        _book = b;
                        _chapter = ch.clamp(1, b.chapterCount);
                        _hasSelection = false;
                      });
                    },
                    onEnableParallel: (id) {
                      final prefs = ref.read(prefsProvider);
                      setState(() {
                        _compareVersionId = id;
                        _versionLabel = '和合本 · ${_versionLabelFor(id)}';
                      });
                      prefs.setString('reader_parallel_version', id);
                    },
                    onNav: (d, {fromSwipe = false}) =>
                        _nav(d, fromSwipe: fromSwipe),
                    onInteract: _onOpenOverlay,
                    onSelectionChanged: (has) {
                      if (_hasSelection == has) return;
                      setState(() => _hasSelection = has);
                    },
                    onNextChapter: () => unawaited(_nav(1)),
                    onAskAi: (refStr, refLabel, selectionText, explainOnly) {
                      _onOpenOverlay();
                      _openXiaoAiSheet(
                        context,
                        refStr: refStr,
                        refLabel: refLabel,
                        selectionText: selectionText,
                        explicitSelection: !explainOnly &&
                            selectionText.trim().isNotEmpty,
                      );
                    },
                    onRead: (b, c) {
                      ref.read(readingRepoProvider).record(b, c);
                      if (_compareVersionId != null) {
                        ref
                            .read(badgeStatsRecorderProvider)
                            .recordParallelChapter();
                      }
                      final book = _book;
                      if (book != null && book.id == b) {
                        maybeNotifyBookComplete(
                          ref.read(prefsProvider),
                          b,
                          book.name,
                          book.chapterCount,
                        );
                      }
                    },
                  ),
                ),
              ],
            );
          },
        ),
          ),
          // 不用 Scaffold.floatingActionButton：父壳 extendBody 下会沉到胶囊底栏下。
          if (_book != null &&
              !_catalogOverlay &&
              !_chromeHidden &&
              !_hasSelection &&
              ref.watch(readingModeProvider) != ReadingMode.focus)
            Positioned(
              right: 16,
              bottom: _readerFabBottomInset(context),
              child: _readerFab(),
            ),
          if (kReaderAudioEnabled &&
              _book != null &&
              audioSession.visible &&
              audioSession.minimized &&
              !audioSession.focusOpen &&
              !audioSession.settingsOpen &&
              !_catalogOverlay &&
              ref.watch(readingModeProvider) != ReadingMode.focus)
            ReaderAudioOrb(
              session: audioSession,
              bottomInset: _readerFabBottomInset(context),
              immersive: _chromeHidden,
              onToggle: () {
                audioCtrl.toggle(
                  bookId: _book!.id,
                  bookName: _book!.name,
                  chapter: _chapter,
                  screenVersion: screenVer,
                );
              },
              onRestore: audioCtrl.restorePanel,
              onStop: () => audioCtrl.stop(),
            ),
          if (kReaderAudioEnabled)
            ReaderAudioFocusOverlay(
              canPrevChapter: _canNavChapter(-1),
              canNextChapter: _canNavChapter(1),
              onPrevChapter: () => unawaited(_navWithAudioFromPanel(-1)),
              onNextChapter: () => unawaited(_navWithAudioFromPanel(1)),
            ),
        ],
      ),
    );
  }

  /// 对齐壳层胶囊底栏真实高度，避免 extendBody 把 inset 清零后 FAB 沉到底栏下。
  double _readerFabBottomInset(BuildContext context) {
    final fromShell = PeiaiShellMetrics.maybeOf(context)?.tabOverlayExtent;
    final overlay = fromShell ?? peiaiTabBarOverlayExtent(context);
    return overlay + 12;
  }

  /// ⋮ 直接打开阅读设置（可下滑/点遮罩关闭）。
  Future<void> _openReaderSettings(BuildContext context) async {
    await showReaderSettingsSheet(
      context,
      ref,
      onLayoutApplied: (mainId, compareId, label) {
        final prefs = ref.read(prefsProvider);
        setState(() {
          _mainVersionId = mainId;
          _compareVersionId = compareId;
          _versionLabel = label;
        });
        if (mainId == null) {
          prefs.remove('reader_main_version');
        } else {
          prefs.setString('reader_main_version', mainId);
        }
        if (compareId == null) {
          prefs.remove('reader_parallel_version');
        } else {
          prefs.setString('reader_parallel_version', compareId);
        }
      },
    );
  }

  Widget _readerFab() {
    // bottom 由外层 Positioned(_readerFabBottomInset) 负责，避免被五 Tab 遮挡。
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (_planMeta != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Material(
              color: AppColors.paper,
              elevation: 1.5,
              shape: StadiumBorder(
                side: BorderSide(color: AppColors.line),
              ),
              child: InkWell(
                customBorder: const StadiumBorder(),
                onTap: () {
                  _revealChrome();
                  setState(() => _planMeta = null);
                },
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  child: Text(
                    '退出计划',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkSoft,
                      height: 1,
                    ),
                  ),
                ),
              ),
            ),
          ),
        Tooltip(
          message: '问小爱',
          child: Material(
            color: AppColors.accentDeep,
            elevation: 3,
            shape: const StadiumBorder(),
            child: InkWell(
              customBorder: const StadiumBorder(),
              onTap: () {
                peiaiHapticLight(context);
                _onOpenOverlay();
                _openXiaoAiSheet(context, explicitSelection: false);
              },
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                child: Text(
                  '✦ 小爱',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    height: 1,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _openXiaoAiSheet(
    BuildContext context, {
    String? refStr,
    String? refLabel,
    String selectionText = '',
    bool explicitSelection = false,
  }) {
    final b = _book;
    if (b == null) return;
    final r = refStr ?? '${b.id}.$_chapter';
    final label = refLabel ?? '${bibleBookAbbr(b.name)} $_chapter';
    showReaderSheet(
      context: context,
      heightFactor: 0.90,
      transparentBarrier: true,
      barrierTapDismiss: false,
      builder: (_) => XiaoAiHalfSheet(
        refStr: r,
        refLabel: label,
        selectionText: selectionText,
        explicitSelection: explicitSelection,
      ),
    );
  }

  Future<void> _pickVersions(BuildContext context) async {
    // 从顶部左侧弹出（对齐顶栏版本按钮），而非底部抽屉。
    await showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: '选择版本',
      barrierColor: Colors.black.withValues(alpha: 0.25),
      transitionDuration: const Duration(milliseconds: 160),
      pageBuilder: (ctx, _, _) => Align(
        alignment: Alignment.topLeft,
        child: Container(
          margin: EdgeInsets.only(
            top: MediaQuery.of(ctx).padding.top + 52,
            left: 12,
          ),
          constraints: const BoxConstraints(maxWidth: 320, maxHeight: 460),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(
                color: Color(0x29000000),
                blurRadius: 32,
                offset: Offset(0, 12),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: _VersionPickerBody(
              mainVersionId: _mainVersionId,
              compareVersionId: _compareVersionId,
              onApplied: (mainId, compareId, label) {
                final prefs = ref.read(prefsProvider);
                setState(() {
                  _mainVersionId = mainId;
                  _compareVersionId = compareId;
                  _versionLabel = label;
                });
                if (mainId == null) {
                  prefs.remove('reader_main_version');
                } else {
                  prefs.setString('reader_main_version', mainId);
                }
                if (compareId == null) {
                  prefs.remove('reader_parallel_version');
                } else {
                  prefs.setString('reader_parallel_version', compareId);
                }
              },
              onClose: () => Navigator.pop(ctx),
            ),
          ),
        ),
      ),
    );
  }

  void _openChapterSummary() {
    final book = _book;
    if (book == null) return;
    showBibleSummarySheet(
      context,
      ref,
      bookId: book.id,
      bookName: book.name,
      chapter: _chapter,
      initialTab: 'chapter',
    );
  }

  Future<void> _nav(int delta, {bool fromSwipe = false}) async {
    final b = _book;
    if (b == null) return;
    final books = ref.read(booksProvider).value;
    if (books == null) return;

    if (!fromSwipe) {
      await _chapterBodyKey.currentState?.playChapterExit(delta);
      if (!mounted) return;
    }

    if (_planMeta != null && _planMeta!.steps.isNotEmpty) {
      final target = resolvePlanNav(
        books,
        _planMeta!.steps,
        b.id,
        _chapter,
        delta,
      );
      if (target == null) return;
      if (delta > 0 &&
          isForwardStepBoundary(
            _planMeta!.steps,
            b.id,
            _chapter,
            target.book.id,
            target.chapter,
          )) {
        await _continuePlanSegmentTo(target.book.id, target.chapter);
        return;
      }
      setState(() {
        _book = target.book;
        _chapter = target.chapter;
      });
      return;
    }

    // 对齐 PWA resolveChapterNav：章末/章首横滑可跨卷。
    final bi = books.indexWhere((x) => x.id == b.id);
    if (bi < 0 || delta == 0) return;
    var bookIdx = bi;
    var chapter = _chapter + delta;
    if (chapter > books[bookIdx].chapterCount) {
      if (bookIdx >= books.length - 1) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('已到尽头'),
              duration: Duration(milliseconds: 1200),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
        return;
      }
      bookIdx += 1;
      chapter = 1;
    } else if (chapter < 1) {
      if (bookIdx <= 0) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('已到开头'),
              duration: Duration(milliseconds: 1200),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
        return;
      }
      bookIdx -= 1;
      chapter = books[bookIdx].chapterCount;
    }
    setState(() {
      _book = books[bookIdx];
      _chapter = chapter;
      _hasSelection = false;
    });
  }

  Future<void> _continuePlanSegmentTo(String bookId, int chapter) async {
    final meta = _planMeta;
    if (meta == null) return;
    final idx = stepForChapter(meta.steps, _book!.id, _chapter);
    if (idx >= 0) {
      final step = meta.steps[idx];
      var session = meta.session;
      if (!session.stepsDone.contains(step.id)) {
        session = await markStepDone(
          ref.read(prefsProvider),
          session,
          step.id,
          meta.steps,
        );
      }
      final ni = meta.steps.indexWhere(
        (s) => s.bookId == bookId.toUpperCase() && chapter >= s.chapterStart,
      );
      if (ni >= 0) {
        session = session.copyWith(currentStepIndex: ni);
      }
      await _persistPlanSessionFromReader(session);
    }
    final books = ref.read(booksProvider).value;
    if (books == null) return;
    final book = books.firstWhere(
      (x) => x.id == bookId.toUpperCase(),
      orElse: () => _book!,
    );
    if (!mounted) return;
    setState(() {
      _book = book;
      _chapter = chapter.clamp(1, book.chapterCount);
    });
  }

  Future<void> _persistPlanSessionFromReader(PlanSession session) async {
    final meta = _planMeta;
    if (meta == null) return;
    await savePlanSession(ref.read(prefsProvider), session);
    await ref
        .read(planProgressRepoProvider)
        .mark(meta.planId, meta.day, status: 'active', session: session);
    if (!mounted) return;
    setState(() {
      _planMeta = PlanReadingMeta(
        planId: meta.planId,
        planTitle: meta.planTitle,
        day: meta.day,
        totalDays: meta.totalDays,
        steps: meta.steps,
        session: session,
        source: meta.source,
      );
    });
  }

  Future<void> _pickBookChapter(BuildContext context) async {
    final books = ref.read(booksProvider).value;
    final book = _book;
    if (books == null || book == null) return;
    // 对齐 PWA：读经中点卷章用锚点弹层；无书卷时仍走全屏目录。
    final picked = await showReaderLocPopover(
      context,
      anchorKey: _locKey,
      books: books,
      currentBook: book,
      currentChapter: _chapter,
      planSteps: _planMeta?.steps,
    );
    if (picked == null || !mounted) return;
    setState(() {
      _book = picked.book;
      _chapter = picked.chapter.clamp(1, picked.book.chapterCount);
      _hasSelection = false;
      _seeded = true;
    });
    ref.read(readingRepoProvider).record(picked.book.id, _chapter);
  }
}

/// 书卷简称（对齐 canvas BOOK_ABBR）。
const Map<String, String> _kBookAbbr = {
  '创世记': '创',
  '出埃及记': '出',
  '利未记': '利',
  '民数记': '民',
  '申命记': '申',
  '约书亚记': '书',
  '士师记': '士',
  '路得记': '得',
  '撒母耳记上': '撒上',
  '撒母耳记下': '撒下',
  '列王纪上': '王上',
  '列王纪下': '王下',
  '历代志上': '代上',
  '历代志下': '代下',
  '以斯拉记': '拉',
  '尼希米记': '尼',
  '以斯帖记': '斯',
  '约伯记': '伯',
  '诗篇': '诗',
  '箴言': '箴',
  '传道书': '传',
  '雅歌': '歌',
  '以赛亚书': '赛',
  '耶利米书': '耶',
  '耶利米哀歌': '哀',
  '以西结书': '结',
  '但以理书': '但',
  '何西阿书': '何',
  '约珥书': '珥',
  '阿摩司书': '摩',
  '俄巴底亚书': '俄',
  '约拿书': '拿',
  '弥迦书': '弥',
  '那鸿书': '鸿',
  '哈巴谷书': '哈',
  '西番雅书': '番',
  '哈该书': '该',
  '撒迦利亚书': '亚',
  '玛拉基书': '玛',
  '马太福音': '太',
  '马可福音': '可',
  '路加福音': '路',
  '约翰福音': '约',
  '使徒行传': '徒',
  '罗马书': '罗',
  '哥林多前书': '林前',
  '哥林多后书': '林后',
  '加拉太书': '加',
  '以弗所书': '弗',
  '腓立比书': '腓',
  '歌罗西书': '西',
  '帖撒罗尼迦前书': '帖前',
  '帖撒罗尼迦后书': '帖后',
  '提摩太前书': '提前',
  '提摩太后书': '提后',
  '提多书': '多',
  '腓利门书': '门',
  '希伯来书': '来',
  '雅各书': '雅',
  '彼得前书': '彼前',
  '彼得后书': '彼后',
  '约翰一书': '约一',
  '约翰二书': '约二',
  '约翰三书': '约三',
  '犹大书': '犹',
  '启示录': '启',
};

String bibleBookAbbr(String name) =>
    _kBookAbbr[name] ?? (name.isEmpty ? '' : name.substring(0, 1));

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, color: AppColors.inkFaint, size: 40),
            const SizedBox(height: 12),
            Text(
              '加载失败\n$message',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.inkFaint),
            ),
            const SizedBox(height: 16),
            FilledButton.tonal(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      ),
    );
  }
}

/// 选择版本弹层：已下载可勾选；CNV 未下载可下；下载中显示进度；失败可重试。
class _VersionPickerBody extends ConsumerStatefulWidget {
  const _VersionPickerBody({
    required this.mainVersionId,
    required this.compareVersionId,
    required this.onApplied,
    required this.onClose,
  });

  final String? mainVersionId;
  final String? compareVersionId;
  final void Function(String? mainId, String? compareId, String label)
  onApplied;
  final VoidCallback onClose;

  @override
  ConsumerState<_VersionPickerBody> createState() => _VersionPickerBodyState();
}

class _VersionPickerBodyState extends ConsumerState<_VersionPickerBody> {
  final Map<String, bool> _offlineOk = {};
  String? _failedId;

  @override
  void initState() {
    super.initState();
    final svc = ref.read(offlineBibleProvider);
    svc.addDownloadListener(_onTick);
    unawaited(_refreshInstalled());
  }

  @override
  void dispose() {
    ref.read(offlineBibleProvider).removeDownloadListener(_onTick);
    super.dispose();
  }

  void _onTick() {
    if (mounted) setState(() {});
  }

  Future<void> _refreshInstalled() async {
    final svc = ref.read(offlineBibleProvider);
    for (final id in const ['cuvs', 'cnv', 'contemporary', 'kjv']) {
      _offlineOk[id] = await svc.checkInstalled(id);
    }
    if (mounted) setState(() {});
  }

  bool _offlineable(String id) =>
      const {'cuvs', 'cnv', 'contemporary', 'kjv'}.contains(id);

  bool _selectable(BibleVersion v) {
    if (_offlineable(v.id)) return _offlineOk[v.id] == true || v.available;
    return v.available;
  }

  bool _needsDownload(BibleVersion v) =>
      // 在线可用译本可立即选读（与 PWA 一致）；离线包仅用于断网。
      // 之前这里无条件要求下载，导致「选版本」实际只触发下载而未切换。
      _offlineable(v.id) && _offlineOk[v.id] != true && !v.available;

  String _trailing(BibleVersion v, OfflineBibleService svc) {
    if (_offlineable(v.id)) {
      if (svc.isDownloading && svc.downloadingId == v.id) {
        final p = svc.downloadProgress;
        if (p != null && p > 0) {
          return '下载中… ${(p * 100).clamp(0, 100).toStringAsFixed(0)}%';
        }
        return '下载中…';
      }
      if (_failedId == v.id) return '重试';
      if (_offlineOk[v.id] == true) return '已下载';
      // 在线可读；离线包是可选能力，不应拦截版本切换。
      if (v.available) return '可用';
      return '下载';
    }
    return v.available ? '可用' : '暂不可用';
  }

  Future<void> _downloadVersion(
    BibleVersion v,
    List<BibleVersion> versions,
  ) async {
    setState(() => _failedId = null);
    final svc = ref.read(offlineBibleProvider);
    try {
      await svc.downloadPack(translationId: v.id);
      await _refreshInstalled();
      if (v.primary || v.id == 'cuvs') {
        final primary = versions.where((x) => x.primary).firstOrNull;
        final label = primary?.label ?? '和合本';
        widget.onApplied(null, null, label);
      }
      ref.invalidate(offlineInstalledProvider);
    } catch (_) {
      if (mounted) setState(() => _failedId = v.id);
    }
  }

  void _applyTap(BibleVersion v, List<BibleVersion> versions) {
    final primary = versions.where((x) => x.primary).firstOrNull;
    final primaryLabel = primary?.label ?? '和合本';
    final isParallel =
        widget.compareVersionId != null && widget.mainVersionId == null;
    final isMainDisplay = v.primary
        ? widget.mainVersionId == null && !isParallel
        : widget.mainVersionId == v.id;
    final isCompare = isParallel && widget.compareVersionId == v.id;

    if (v.primary) {
      if (isCompare) {
        final other = versions
            .where((x) => x.id == widget.compareVersionId)
            .map((x) => x.label)
            .firstOrNull;
        widget.onApplied(
          null,
          widget.compareVersionId,
          '$primaryLabel · ${other ?? widget.compareVersionId}',
        );
      } else {
        widget.onApplied(null, null, v.label);
      }
    } else if (isMainDisplay) {
      widget.onApplied(null, null, primaryLabel);
    } else if (isCompare) {
      widget.onApplied(null, null, primaryLabel);
    } else if (widget.mainVersionId == null && !isParallel) {
      widget.onApplied(v.id, null, v.label);
    } else {
      widget.onApplied(null, v.id, '$primaryLabel · ${v.label}');
    }
    widget.onClose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(bibleVersionsProvider);
    final svc = ref.watch(offlineBibleProvider);
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '选择版本',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 16,
                color: AppColors.ink,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              '最多勾选 2 本译本；选 2 本时为对照阅读',
              style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
            ),
            const SizedBox(height: 8),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(20),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  '加载失败：$e',
                  style: const TextStyle(color: AppColors.inkFaint),
                ),
              ),
              data: (versions) {
                final isParallel =
                    widget.compareVersionId != null &&
                    widget.mainVersionId == null;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ...versions.map((v) {
                      final selectable = _selectable(v);
                      final downloading =
                          svc.isDownloading && svc.downloadingId == v.id;
                      final needsDl = _needsDownload(v) || _failedId == v.id;
                      final isMainDisplay = v.primary
                          ? widget.mainVersionId == null && !isParallel
                          : widget.mainVersionId == v.id;
                      final isCompare =
                          isParallel && widget.compareVersionId == v.id;
                      final checked = selectable && (isMainDisplay || isCompare);
                      final trailing = _trailing(v, svc);
                      final actionClickable =
                          _failedId == v.id ||
                          (needsDl && !downloading && _offlineable(v.id));

                      void handle() {
                        if (_needsDownload(v) || _failedId == v.id) {
                          unawaited(_downloadVersion(v, versions));
                          return;
                        }
                        if (selectable) _applyTap(v, versions);
                      }

                      return Material(
                        color: checked
                            ? AppColors.accentWash
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(10),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: downloading ? null : handle,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 10,
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          v.label,
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: checked
                                                ? FontWeight.w600
                                                : FontWeight.w400,
                                            color: selectable
                                                ? AppColors.ink
                                                : AppColors.inkFaint,
                                          ),
                                        ),
                                      ),
                                      if (checked) ...[
                                        const SizedBox(width: 8),
                                        Text(
                                          '✓',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: AppColors.inkFaint
                                                .withValues(alpha: 0.85),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                if (actionClickable)
                                  TextButton(
                                    onPressed: downloading ? null : handle,
                                    style: TextButton.styleFrom(
                                      minimumSize: Size.zero,
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap,
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 2,
                                        vertical: 4,
                                      ),
                                    ),
                                    child: Text(
                                      trailing,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.accentDeep,
                                      ),
                                    ),
                                  )
                                else
                                  Text(
                                    trailing,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: downloading
                                          ? FontWeight.w500
                                          : FontWeight.w400,
                                      color: downloading
                                          ? AppColors.accentDeep
                                          : AppColors.inkFaint,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: widget.onClose,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.accentDeep,
                          foregroundColor: Colors.white,
                          minimumSize: const Size.fromHeight(44),
                        ),
                        child: const Text('完成'),
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
