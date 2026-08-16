/// 经文阅读器：选卷 → 选章 → 逐节阅读；点节锚定问小爱。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/app_shell.dart' show navIndexProvider, readerImmersiveProvider;
import '../../core/badge_stats.dart';
import '../../core/api_client.dart' show prefsProvider;
import '../../core/config.dart';
import '../../core/gamification.dart' show maybeNotifyBookComplete;
import '../../core/theme.dart';
import '../assistant/answer_text.dart';
import '../assistant/assistant_format.dart';
import '../assistant/assistant_repository.dart';
import '../assistant/assistant_scenes.dart';
import '../assistant/assistant_seed.dart';
import '../assistant/models.dart' as am;
import '../assistant/models.dart' show Citation;
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
import 'reader_catalog_view.dart';
import 'reader_experience.dart';
import 'reader_preferences.dart';
import 'reader_settings_menu.dart';
import 'reader_sheet.dart';
import 'reader_thoughts_sheet.dart';
import 'summary_sheet.dart';
import 'group_checkin_sheet.dart';
import 'reading_repository.dart';
import '../../core/peiai_haptics.dart';

/// 小爱半屏：同 ref 短时会话缓存（进程内，重新打开可恢复上次答案）。
final Map<String, String> _xiaoAiHalfSheetCache = {};

/// 阅读器跳转目标（串珠/词典点选后跳章）。
class ReaderJumpNotifier extends Notifier<({String book, int chapter})?> {
  @override
  ({String book, int chapter})? build() => null;
  void jump(String book, int chapter) =>
      state = (book: book.toUpperCase(), chapter: chapter);
  void clear() => state = null;
}

final readerJumpProvider =
    NotifierProvider<ReaderJumpNotifier, ({String book, int chapter})?>(
        ReaderJumpNotifier.new);

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
    _setChrome(!_chromeHidden);
  }

  /// 打开半屏 / 设置 / AI 时强制恢复 chrome（对齐 PWA overlay 规则）。
  void _onOpenOverlay() => _revealChrome();

  @override
  void dispose() {
    _timer?.cancel();
    ref.read(readerImmersiveProvider.notifier).set(false);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final booksAsync = ref.watch(booksProvider);

    // 串珠/词典跳转：解析目标卷并切换。
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
      });
      ref.read(readerJumpProvider.notifier).clear();
      _revealChrome();
    });

    // 回到圣经 Tab：若 session 内仍沉浸，恢复底栏隐藏。
    ref.listen(navIndexProvider, (prev, next) {
      if (next == 1 && _chromeHidden) {
        ref.read(readerImmersiveProvider.notifier).set(true);
      }
    });

    return Scaffold(
      backgroundColor: ref.watch(readerExperienceThemeProvider).background,
      appBar: _chromeHidden
          ? null
          : AppBar(
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
                child: Text(_versionLabel,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: AppColors.inkSoft)),
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
                      ? '选择经卷'
                      : '${bibleBookAbbr(_book!.name)} $_chapter',
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w600),
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
              child: const Padding(
                padding: EdgeInsets.fromLTRB(8, 4, 4, 4),
                child: Text(
                  '概要',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: AppColors.inkSoft),
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
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        // 对齐 PWA：点按切换 chrome，无 idle 自动藏；目录态不藏栏。
        onTap: _book == null || _catalogOverlay ? null : _toggleChrome,
        child: booksAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(message: '$e', onRetry: () => ref.refresh(booksProvider)),
        data: (books) {
          final progressAsync = ref.watch(readingProgressStreamProvider);
          if (!_seeded) {
            if (widget.initialBook != null) {
              final target = widget.initialBook!;
              _book = books.firstWhere(
                (b) => b.id == target.toUpperCase() || b.name == target,
                orElse: () => books.firstWhere((b) => b.id == 'JHN',
                    orElse: () => books.first),
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
                  orElse: () => books.firstWhere((b) => b.id == 'JHN',
                      orElse: () => books.first),
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
            book: _book!,
            chapter: _chapter,
            books: books,
            compareVersionId: _compareVersionId,
            mainVersionId: _mainVersionId,
            chromeHidden: _chromeHidden,
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
            onNav: _nav,
            onInteract: () {},
            onSelectionChanged: (has) {
              if (_hasSelection == has) return;
              setState(() => _hasSelection = has);
            },
            onNextChapter: () => _nav(1),
            onAskAi: (refStr, refLabel, selectionText, explainOnly) {
              _onOpenOverlay();
              _openXiaoAiSheet(
                context,
                refStr: refStr,
                refLabel: refLabel,
                selectionText: selectionText,
                explainOnly: explainOnly,
              );
            },
            onRead: (b, c) {
              ref.read(readingRepoProvider).record(b, c);
              if (_compareVersionId != null) {
                ref.read(badgeStatsRecorderProvider).recordParallelChapter();
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
      // 全屏 / 专注 / 选中经文时隐藏打卡与小爱（对齐 PWA hasSel）。
      floatingActionButton:
          (_book == null ||
                  _catalogOverlay ||
                  _chromeHidden ||
                  _hasSelection ||
                  ref.watch(readingModeProvider) == ReadingMode.focus)
              ? null
              : _readerFab(),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      floatingActionButtonAnimator: FloatingActionButtonAnimator.noAnimation,
    );
  }

  /// ⋮ 直接打开阅读设置（可下滑/点遮罩关闭）；打卡走独立 FAB。
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

  Future<void> _openCheckin() async {
    final b = _book;
    if (b == null) return;
    peiaiHapticSelection(context);
    _onOpenOverlay();
    await showGroupCheckinSheet(
      context,
      ref,
      bookId: b.id,
      bookName: b.name,
      chapter: _chapter,
    );
  }

  Widget _readerFab() {
    return Padding(
      padding: EdgeInsets.only(
        bottom: 4,
        right: 4,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (_planMeta != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: FloatingActionButton.small(
                heroTag: 'reader-plan-exit',
                backgroundColor: AppColors.paper,
                foregroundColor: AppColors.inkSoft,
                elevation: 1.5,
                onPressed: () {
                  _revealChrome();
                  setState(() => _planMeta = null);
                },
                child: const Text('退出', style: TextStyle(fontSize: 12)),
              ),
            ),
          // 打卡在小爱上方（对齐 PWA check-in 按钮栈）
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: FloatingActionButton.small(
              heroTag: 'reader-checkin',
              backgroundColor: AppColors.paper,
              foregroundColor: AppColors.accentDeep,
              elevation: 1.5,
              tooltip: '打卡到共读群',
              onPressed: _openCheckin,
              child: const Icon(Icons.groups_outlined, size: 20),
            ),
          ),
          FloatingActionButton.extended(
            heroTag: 'reader-xiaoai',
            backgroundColor: AppColors.accentDeep,
            foregroundColor: Colors.white,
            elevation: 3,
            tooltip: '问小爱',
            icon: const Icon(Icons.auto_awesome, size: 20),
            label: const Text('小爱', style: TextStyle(fontWeight: FontWeight.w700)),
            onPressed: () {
              peiaiHapticLight(context);
              _onOpenOverlay();
              _openXiaoAiSheet(context);
            },
          ),
        ],
      ),
    );
  }

  void _openXiaoAiSheet(
    BuildContext context, {
    String? refStr,
    String? refLabel,
    String selectionText = '',
    bool explainOnly = false,
  }) {
    ref.read(badgeStatsRecorderProvider).recordHalfSheetXiaoAi();
    final b = _book;
    if (b == null) return;
    final r = refStr ?? '${b.id}.$_chapter';
    final label = refLabel ?? '${bibleBookAbbr(b.name)} $_chapter';
    showReaderSheet(
      context: context,
      builder: (_) => _XiaoAiHalfSheet(
        refStr: r,
        refLabel: label,
        selectionText: selectionText,
        explainOnly: explainOnly,
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
              top: MediaQuery.of(ctx).padding.top + 52, left: 12),
          constraints: const BoxConstraints(maxWidth: 320, maxHeight: 460),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x29000000), blurRadius: 32, offset: Offset(0, 12)),
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

  Future<void> _nav(int delta) async {
    final b = _book;
    if (b == null) return;
    final books = ref.read(booksProvider).value;
    if (books == null) return;

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
    await ref.read(planProgressRepoProvider).mark(
          meta.planId,
          meta.day,
          status: 'active',
          session: session,
        );
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
    if (books == null) return;
    // 对齐 PWA：用全屏目录（含继续条），而非仅锚点弹层。
    setState(() {
      _catalogOverlay = true;
      _chromeHidden = false;
      _hasSelection = false;
    });
    ref.read(readerImmersiveProvider.notifier).set(false);
  }
}

/// 书卷简称（对齐 canvas BOOK_ABBR）。
const Map<String, String> _kBookAbbr = {
  '创世记': '创', '出埃及记': '出', '利未记': '利', '民数记': '民', '申命记': '申',
  '约书亚记': '书', '士师记': '士', '路得记': '得', '撒母耳记上': '撒上', '撒母耳记下': '撒下',
  '列王纪上': '王上', '列王纪下': '王下', '历代志上': '代上', '历代志下': '代下', '以斯拉记': '拉',
  '尼希米记': '尼', '以斯帖记': '斯', '约伯记': '伯', '诗篇': '诗', '箴言': '箴', '传道书': '传', '雅歌': '歌',
  '以赛亚书': '赛', '耶利米书': '耶', '耶利米哀歌': '哀', '以西结书': '结', '但以理书': '但',
  '何西阿书': '何', '约珥书': '珥', '阿摩司书': '摩', '俄巴底亚书': '俄', '约拿书': '拿', '弥迦书': '弥',
  '那鸿书': '鸿', '哈巴谷书': '哈', '西番雅书': '番', '哈该书': '该', '撒迦利亚书': '亚', '玛拉基书': '玛',
  '马太福音': '太', '马可福音': '可', '路加福音': '路', '约翰福音': '约', '使徒行传': '徒',
  '罗马书': '罗', '哥林多前书': '林前', '哥林多后书': '林后', '加拉太书': '加', '以弗所书': '弗',
  '腓立比书': '腓', '歌罗西书': '西', '帖撒罗尼迦前书': '帖前', '帖撒罗尼迦后书': '帖后',
  '提摩太前书': '提前', '提摩太后书': '提后', '提多书': '多', '腓利门书': '门', '希伯来书': '来',
  '雅各书': '雅', '彼得前书': '彼前', '彼得后书': '彼后', '约翰一书': '约一', '约翰二书': '约二',
  '约翰三书': '约三', '犹大书': '犹', '启示录': '启',
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
            Text('加载失败\n$message',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.inkFaint)),
            const SizedBox(height: 16),
            FilledButton.tonal(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      ),
    );
  }
}

/// 小爱半屏解释（覆盖 80%）：进入即按逻辑解释当前经文，底部「去问小爱」跳转。
class _XiaoAiHalfSheet extends ConsumerStatefulWidget {
  const _XiaoAiHalfSheet({
    required this.refStr,
    required this.refLabel,
    this.selectionText = '',
    this.explainOnly = false,
  });
  final String refStr;
  final String refLabel;
  final String selectionText;
  final bool explainOnly;

  @override
  ConsumerState<_XiaoAiHalfSheet> createState() => _XiaoAiHalfSheetState();
}

class _XiaoAiHalfSheetState extends ConsumerState<_XiaoAiHalfSheet> {
  late final AssistantScene _scene;
  late final String _userQuestion;
  late final String _lockedQuestion;
  late final String _cacheKey;

  String _answer = '';
  bool _busy = false;
  bool _copied = false;
  bool _expanded = false;
  bool _fromCache = false;
  List<am.Citation> _citations = const [];
  StreamSubscription<am.ChatEvent>? _sub;
  String _pending = '';
  bool _scheduled = false;

  @override
  void initState() {
    super.initState();
    _scene = widget.explainOnly
        ? AssistantScene.verseQuick
        : AssistantScene.verseFull;
    final snippet = widget.selectionText.trim();
    if (snippet.isNotEmpty) {
      final short =
          snippet.length > 80 ? '${snippet.substring(0, 80)}…' : snippet;
      _userQuestion = '请解读：${widget.refLabel}\n「$short」';
    } else {
      _userQuestion = '请解读：${widget.refLabel}';
    }
    _lockedQuestion = snippet.isEmpty
        ? _userQuestion
        : '$_userQuestion\n\n经文：$snippet';
    _expanded = !widget.explainOnly;
    _cacheKey =
        '${widget.refStr}\u001e${widget.explainOnly}\u001e${snippet.hashCode}';
    final cached = _xiaoAiHalfSheetCache[_cacheKey];
    if (cached != null && cached.trim().isNotEmpty) {
      _answer = cached;
      _pending = cached;
      _fromCache = true;
      _busy = false;
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _ask());
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    final clean = bodyText(_answer).trim();
    if (clean.isNotEmpty && !clean.startsWith('⚠️')) {
      _xiaoAiHalfSheetCache[_cacheKey] = _answer;
      if (_xiaoAiHalfSheetCache.length > 24) {
        _xiaoAiHalfSheetCache.remove(_xiaoAiHalfSheetCache.keys.first);
      }
    }
    super.dispose();
  }

  void _flush() {
    _scheduled = false;
    if (!mounted) return;
    setState(() => _answer = _pending);
  }

  void _schedule() {
    if (_scheduled) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _flush());
  }

  void _ask() {
    _sub?.cancel();
    setState(() {
      _answer = '';
      _pending = '';
      _busy = true;
      _fromCache = false;
      _citations = const [];
    });
    final stream = ref.read(assistantRepoProvider).chat(
          ref: widget.refStr,
          question: _lockedQuestion,
          mode: am.AssistantMode.explain,
          scene: _scene,
        );
    _sub = stream.listen((evt) {
      if (!mounted) return;
      switch (evt) {
        case am.MetaEvent(:final meta):
          setState(() => _citations = meta.citations);
        case am.DeltaEvent(:final text):
          _pending += text;
          _schedule();
        case am.ErrorEvent(:final message):
          setState(() {
            _answer = _pending.isEmpty ? '⚠️ $message' : _pending;
            _busy = false;
          });
        case am.DoneEvent():
          setState(() {
            _answer = _pending;
            _busy = false;
          });
          if (_pending.trim().isNotEmpty) {
            _xiaoAiHalfSheetCache[_cacheKey] = _pending;
          }
        default:
          break;
      }
    }, onDone: () {
      if (mounted) setState(() => _busy = false);
    }, onError: (_) {
      if (mounted) {
        setState(() {
          if (_answer.isEmpty && _pending.isEmpty) {
            _answer = '⚠️ 请求超时，请重试或前往小爱 Tab 继续对话';
          }
          _busy = false;
        });
      }
    });
    Future.delayed(Duration(milliseconds: _scene.timeoutMs), () {
      if (!mounted || !_busy) return;
      _sub?.cancel();
      setState(() {
        if (_pending.isEmpty && _answer.isEmpty) {
          _answer = '⚠️ 请求超时，请重试或前往小爱 Tab 继续对话';
        } else {
          _answer = _pending;
        }
        _busy = false;
      });
    });
  }

  void _goAssistant() {
    Navigator.of(context).pop();
    final clean = bodyText(_answer).trim();
    final seeds = <AssistantSeedMessage>[];
    if (clean.isNotEmpty && !clean.startsWith('⚠️')) {
      seeds.add(AssistantSeedMessage(role: 'user', text: _userQuestion));
      seeds.add(AssistantSeedMessage(
        role: 'assistant',
        text: clean,
        citations: _citations
            .map((c) => Citation(
                  n: c.n,
                  title: c.title,
                  score: c.score,
                  snippet: c.snippet,
                ))
            .toList(),
      ));
    }
    ref.read(assistantSeedProvider.notifier).open(
          ref: widget.refStr,
          question: seeds.isEmpty ? _userQuestion : null,
          seedMessages: seeds,
        );
    ref.read(navIndexProvider.notifier).set(2);
  }

  Future<void> _copyAnswer() async {
    final text = bodyText(_answer);
    if (text.isEmpty || text.startsWith('⚠️')) return;
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    setState(() => _copied = true);
    Future.delayed(const Duration(milliseconds: 1800), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  Future<void> _saveAsThought() async {
    final text = bodyText(_answer).trim();
    if (text.isEmpty || text.startsWith('⚠️')) return;
    await showWriteThoughtSheet(
      context,
      ref,
      refStr: widget.refStr,
      refLabel: widget.refLabel,
      verseText: widget.selectionText.trim().isEmpty
          ? null
          : widget.selectionText.trim(),
    );
  }

  Future<void> _shareAnalysis() async {
    final text = bodyText(_answer).trim();
    if (text.isEmpty || text.startsWith('⚠️')) return;
    var payload = text;
    try {
      final id = await ref.read(assistantRepoProvider).createAnalysisShareSnapshot(
            answerMarkdown: text,
            refLabel: widget.refLabel,
            refParam: widget.refStr,
          );
      if (id != null && id.isNotEmpty) {
        final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
        payload = '$text\n$base/share/analysis/$id';
      }
    } catch (_) {/* 快照失败则纯文案 */}
    try {
      await SharePlus.instance.share(ShareParams(text: payload));
    } catch (_) {
      await Clipboard.setData(ClipboardData(text: payload));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('已复制，可粘贴分享'),
        duration: Duration(milliseconds: 1500),
      ));
    }
  }

  String get _cleanAnswer => bodyText(_answer);

  void _openCitation(am.Citation citation) {
    ref.read(badgeStatsRecorderProvider).recordCitationClick();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _HalfSheetCitationDetail(citation: citation),
    );
  }

  String? get _summary {
    final m = RegExp(r'【摘要】\s*([^\n【]+)').firstMatch(_cleanAnswer);
    return m?.group(1)?.trim();
  }

  bool get _showCollapsed =>
      !_expanded &&
      !_cleanAnswer.startsWith('⚠️') &&
      (_summary?.isNotEmpty ?? false) &&
      _cleanAnswer.length > (_summary?.length ?? 0) + 20;

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height * 0.8;
    return Container(
      height: h,
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 10),
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: AppColors.line,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
            child: Row(
              children: [
                const Icon(Icons.auto_awesome,
                    size: 18, color: AppColors.accentDeep),
                const SizedBox(width: 8),
                const Text('小爱解经',
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: AppColors.ink)),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.accentWash,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(widget.refLabel,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.accentDeep)),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.goldWash,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                    widget.explainOnly
                        ? '已预读选中经文 · 即时解释'
                        : '已预读这节 · 背景·经文解释',
                    style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.accentDeep)),
              ),
            ),
          ),
          const Divider(height: 1, color: AppColors.line),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: constraints.maxHeight - 32),
                    child: Column(
                      // 提问应始终从内容区顶部开始；此前 end 会在短回答时把
                      // 用户气泡推到屏幕下方，看起来像没有显示输入内容。
                      mainAxisAlignment: MainAxisAlignment.start,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.goldWash.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.line),
                    ),
                    child: Text(
                      widget.selectionText.trim().isEmpty
                          ? _userQuestion
                          : '「${widget.selectionText.trim()}」',
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.55,
                        color: AppColors.inkSoft,
                        fontFamily: 'Songti SC',
                        fontFamilyFallback: [
                          'STSong',
                          'Noto Serif SC',
                          'serif'
                        ],
                      ),
                    ),
                  ),
                  if (_answer.isEmpty && _busy)
                    const Row(
                      children: [
                        SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2)),
                        SizedBox(width: 10),
                        Text('小爱正在思考…',
                            style: TextStyle(color: AppColors.inkFaint)),
                      ],
                    )
                  else if (_showCollapsed)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _summary!,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            height: 1.7,
                            color: AppColors.ink,
                          ),
                        ),
                        TextButton(
                          onPressed: () => setState(() => _expanded = true),
                          child: const Text('展开完整解读'),
                        ),
                      ],
                    )
                  else
                    AnswerText(
                      text: _cleanAnswer.isEmpty
                          ? (_busy ? '' : '暂无内容')
                          : _cleanAnswer,
                      fontSize: 16,
                      onCitationTap: (n) {
                        final citation = _citations
                            .where((item) => item.n == n)
                            .firstOrNull;
                        if (citation != null) _openCitation(citation);
                      },
                    ),
                  // 引用轨：有 meta 即展示（流式中途也显示，对齐 PWA CitationEvidenceRail）
                  if (_citations.isNotEmpty &&
                      !_cleanAnswer.startsWith('⚠️'))
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: _HalfSheetCitations(citations: _citations),
                    ),
          if (!_busy && _cleanAnswer.isNotEmpty && !_cleanAnswer.startsWith('⚠️'))
            const Padding(
              padding: EdgeInsets.only(top: 10),
              child: Text('内容由 AI 生成，请以圣经原文为准。请用下方「复制」按钮。',
                  style: TextStyle(
                      fontSize: 12, color: AppColors.inkFaint)),
            ),
          if (_cleanAnswer.startsWith('⚠️'))
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: OutlinedButton(
                onPressed: _ask,
                child: const Text('重试'),
              ),
            ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!_busy &&
                      _citations.isNotEmpty &&
                      !_cleanAnswer.startsWith('⚠️'))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '已结束 · 参考 ${_citations.length} 条来源',
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.inkFaint),
                      ),
                    ),
                  Row(
                children: [
                  if (!_busy && _cleanAnswer.isNotEmpty && !_cleanAnswer.startsWith('⚠️'))
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _copyAnswer,
                        child: Text(_copied ? '已复制' : '复制'),
                      ),
                    ),
                  if (!_busy && _cleanAnswer.isNotEmpty && !_cleanAnswer.startsWith('⚠️'))
                    const SizedBox(width: 10),
                  Expanded(
                    flex: 1,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accentDeep,
                      ),
                      onPressed: _goAssistant,
                      child: const Text('与小爱继续聊',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
                  if (!_busy &&
                      _cleanAnswer.isNotEmpty &&
                      !_cleanAnswer.startsWith('⚠️')) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text('继续读'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _saveAsThought,
                            child: const Text('存为想法'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _shareAnalysis,
                            child: const Text('分享解读'),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (_fromCache && !_busy)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(
                        children: [
                          const Text('已恢复上次解读',
                              style: TextStyle(
                                  fontSize: 11, color: AppColors.inkFaint)),
                          TextButton(
                            onPressed: _ask,
                            child: const Text('重新生成',
                                style: TextStyle(fontSize: 12)),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HalfSheetCitations extends ConsumerWidget {
  const _HalfSheetCitations({required this.citations});
  final List<am.Citation> citations;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '参考来源 · ${citations.length} 条',
          style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 72,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: citations.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              final c = citations[i];
              final snip = (c.snippet ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();
              return InkWell(
                onTap: () {
                  ref.read(badgeStatsRecorderProvider).recordCitationClick();
                  showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    builder: (_) => _HalfSheetCitationDetail(citation: c),
                  );
                },
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  width: 144,
                  padding: const EdgeInsets.fromLTRB(9, 7, 9, 7),
                  decoration: BoxDecoration(
                    color: AppColors.goldWash,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('[${c.n}] ${c.title}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.gold)),
                      if (snip.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          snip.length > 36 ? '${snip.substring(0, 36)}…' : snip,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11, height: 1.3, color: AppColors.inkSoft),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _HalfSheetCitationDetail extends ConsumerStatefulWidget {
  const _HalfSheetCitationDetail({required this.citation});
  final am.Citation citation;

  @override
  ConsumerState<_HalfSheetCitationDetail> createState() =>
      _HalfSheetCitationDetailState();
}

class _HalfSheetCitationDetailState
    extends ConsumerState<_HalfSheetCitationDetail> {
  String? _explain;
  String? _err;
  bool _loading = true;
  bool _snipExpanded = false;
  String _disclaimer =
      '以下中文为便于阅读的释义，非官方译本；请以圣经与原文摘录为准。';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final snip = widget.citation.snippet?.trim() ?? '';
    if (snip.isEmpty) {
      setState(() {
        _loading = false;
        _err = '暂无摘录内容';
      });
      return;
    }
    try {
      var res = await ref.read(assistantRepoProvider).explainCitation(
            snippet: snip,
            title: widget.citation.title,
          );
      // 首次生成偶有网关超时；再尝试一次，避免用户只看到空的中文释义。
      if (res.explainZh.trim().isEmpty && res.error != null) {
        res = await ref.read(assistantRepoProvider).explainCitation(
              snippet: snip,
              title: widget.citation.title,
              force: true,
            );
      }
      if (!mounted) return;
      setState(() {
        _explain = res.explainZh;
        _disclaimer = res.disclaimer;
        _err = res.error;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _err = '暂无法生成中文释义';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final snip = widget.citation.snippet?.trim() ?? '';
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('[${widget.citation.n}] ${widget.citation.title}',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 14),
              const Text('中文释义',
                  style: TextStyle(fontSize: 12, color: AppColors.inkFaint)),
              const SizedBox(height: 6),
              if (_loading)
                const Text('正在生成释义…',
                    style: TextStyle(color: AppColors.inkFaint))
              else if ((_explain ?? '').isNotEmpty)
                Text(_explain!, style: const TextStyle(height: 1.6, fontSize: 15))
              else
                Text(_err ?? '暂无法生成中文释义',
                    style: const TextStyle(color: AppColors.inkFaint)),
              const SizedBox(height: 14),
              const Text('原文摘录',
                  style: TextStyle(fontSize: 12, color: AppColors.inkFaint)),
              const SizedBox(height: 6),
              if (snip.isEmpty)
                const Text('暂无摘录内容',
                    style: TextStyle(color: AppColors.inkFaint))
              else ...[
                Text(
                  snip,
                  maxLines: _snipExpanded ? null : 5,
                  overflow: _snipExpanded
                      ? TextOverflow.visible
                      : TextOverflow.ellipsis,
                  style: const TextStyle(height: 1.55, fontSize: 14),
                ),
                if (snip.length > 180)
                  TextButton(
                    onPressed: () =>
                        setState(() => _snipExpanded = !_snipExpanded),
                    child: Text(_snipExpanded ? '收起' : '展开更多'),
                  ),
              ],
              const SizedBox(height: 14),
              Text(_disclaimer,
                  style: const TextStyle(
                      fontSize: 11, height: 1.45, color: AppColors.inkFaint)),
            ],
          ),
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
  final void Function(String? mainId, String? compareId, String label) onApplied;
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
      _offlineable(v.id) && _offlineOk[v.id] != true;

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
      if (v.available) return '下载离线';
      return '下载';
    }
    return v.available ? '可用' : '暂不可用';
  }

  Future<void> _downloadVersion(BibleVersion v, List<BibleVersion> versions) async {
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
            const Text('选择版本',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: AppColors.ink)),
            const SizedBox(height: 4),
            const Text('最多勾选 2 本译本；选 2 本时为对照阅读',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint)),
            const SizedBox(height: 8),
            async.when(
              loading: () => const Padding(
                  padding: EdgeInsets.all(20),
                  child: Center(child: CircularProgressIndicator())),
              error: (e, _) => Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text('加载失败：$e',
                      style: const TextStyle(color: AppColors.inkFaint))),
              data: (versions) {
                final isParallel = widget.compareVersionId != null &&
                    widget.mainVersionId == null;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: versions.map((v) {
                    final selectable = _selectable(v);
                    final downloading =
                        svc.isDownloading && svc.downloadingId == v.id;
                    final needsDl =
                        _needsDownload(v) || _failedId == v.id;
                    final isMainDisplay = v.primary
                        ? widget.mainVersionId == null && !isParallel
                        : widget.mainVersionId == v.id;
                    final isCompare =
                        isParallel && widget.compareVersionId == v.id;
                    final checked =
                        selectable && (isMainDisplay || isCompare);
                    final trailing = _trailing(v, svc);

                    void handle() {
                      if (_needsDownload(v) || _failedId == v.id) {
                        unawaited(_downloadVersion(v, versions));
                        return;
                      }
                      if (selectable) _applyTap(v, versions);
                    }

                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        checked
                            ? Icons.check_circle
                            : (downloading
                                ? Icons.downloading
                                : (selectable
                                    ? Icons.translate
                                    : Icons.download_outlined)),
                        color: checked
                            ? AppColors.accentDeep
                            : (selectable
                                ? AppColors.accent
                                : AppColors.inkFaint),
                      ),
                      title: Text(v.label),
                      trailing: TextButton(
                        onPressed: downloading ? null : handle,
                        child: Text(
                          trailing,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: needsDl || _failedId == v.id
                                ? FontWeight.w600
                                : FontWeight.w400,
                            color: needsDl || downloading || _failedId == v.id
                                ? AppColors.accentDeep
                                : AppColors.inkFaint,
                          ),
                        ),
                      ),
                      onTap: downloading ? null : handle,
                    );
                  }).toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
