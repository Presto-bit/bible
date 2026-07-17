/// 经文阅读器：选卷 → 选章 → 逐节阅读；点节锚定问小爱。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart' show navIndexProvider, readerImmersiveProvider;
import '../../core/badge_stats.dart';
import '../../core/api_client.dart' show prefsProvider;
import '../../core/gamification.dart' show maybeNotifyBookComplete;
import '../../core/theme.dart';
import '../assistant/answer_text.dart';
import '../assistant/assistant_format.dart';
import '../assistant/assistant_repository.dart';
import '../assistant/assistant_scenes.dart';
import '../assistant/assistant_seed.dart';
import '../assistant/models.dart' as am;
import '../search/search_screen.dart';
import '../plans/plan_navigation.dart';
import '../plans/plan_reading.dart';
import '../plans/plan_session.dart';
import '../plans/plan_steps.dart';
import 'offline_notice.dart';
import 'bible_repository.dart';
import 'models.dart';
import 'reader_experience.dart';
import 'reader_settings_menu.dart';
import '../plans/plans_repository.dart';
import 'reading_repository.dart';

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
  Timer? _chromeTimer;
  bool _chromeHidden = false;
  String _versionLabel = '和合本';
  String? _compareVersionId;
  String? _mainVersionId;
  PlanReadingMeta? _planMeta;

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
    _scheduleChromeHide();
    final prefs = ref.read(prefsProvider);
    final savedCompare = prefs.getString('reader_parallel_version');
    final savedMain = prefs.getString('reader_main_version');
    if (savedMain != null && savedMain.isNotEmpty) {
      _mainVersionId = savedMain;
      _versionLabel = savedMain.toUpperCase();
    } else if (savedCompare != null && savedCompare.isNotEmpty) {
      _compareVersionId = savedCompare;
      _versionLabel = '和合本 · ${savedCompare.toUpperCase()}';
    }
  }

  void _setChrome(bool hidden) {
    if (mounted) setState(() => _chromeHidden = hidden);
    if (ref.read(readerImmersiveProvider) != hidden) {
      ref.read(readerImmersiveProvider.notifier).set(hidden);
    }
  }

  void _scheduleChromeHide() {
    _chromeTimer?.cancel();
    if (_book == null) {
      _setChrome(false);
      return;
    }
    _setChrome(false);
    _chromeTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && _book != null) _setChrome(true);
    });
  }

  void _onReaderInteract() => _scheduleChromeHide();

  @override
  void dispose() {
    _timer?.cancel();
    _chromeTimer?.cancel();
    // 离开阅读器时复位，避免其它 Tab 误隐藏底部导航。
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
          _scheduleChromeHide();
        });

    return Scaffold(
      backgroundColor: ref.watch(readerExperienceThemeProvider).background,
      appBar: _chromeHidden
          ? null
          : AppBar(
        titleSpacing: 16,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 卷/章（缩写）→ 点击弹目录
            InkWell(
              onTap: () {
                _onReaderInteract();
                _pickBookChapter(context);
              },
              borderRadius: BorderRadius.circular(6),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(0, 4, 8, 4),
                child: Text(
                  _book == null
                      ? '选择经卷'
                      : '${bibleBookAbbr(_book!.name)} $_chapter',
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
            ),
            Container(width: 1, height: 16, color: AppColors.line),
            // 版本 → 点击弹版本选择
            InkWell(
              onTap: () => _pickVersions(context),
              borderRadius: BorderRadius.circular(6),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 4, 0, 4),
                child: Text(_versionLabel,
                    style: const TextStyle(
                        fontSize: 14, color: AppColors.inkSoft)),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: '搜索',
            icon: const Icon(Icons.search),
            onPressed: () {
              _onReaderInteract();
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SearchScreen()),
              );
            },
          ),
          IconButton(
            tooltip: '更多设置',
            icon: const Icon(Icons.more_vert),
            onPressed: () {
              _onReaderInteract();
              showReaderMoreMenu(context, ref);
            },
          ),
        ],
      ),
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () {
          if (_chromeHidden) {
            _setChrome(false);
            _scheduleChromeHide();
          } else {
            _onReaderInteract();
          }
        },
        child: booksAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(message: '$e', onRetry: () => ref.refresh(booksProvider)),
        data: (books) {
          if (!_seeded) {
            var target = widget.initialBook ?? 'JHN';
            // 无显式起点时，回到上次阅读进度
            if (widget.initialBook == null && widget.initialChapter == null) {
              final saved = ref.read(readingProgressStreamProvider).value;
              if (saved != null) {
                target = saved.book;
                _chapter = saved.chapter;
              }
            }
            _book = books.firstWhere(
              (b) => b.id == target.toUpperCase() || b.name == target,
              orElse: () => books.firstWhere((b) => b.id == 'JHN',
                  orElse: () => books.first),
            );
            _seeded = true;
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
              });
            },
            onNav: (d) {
              _nav(d);
              _scheduleChromeHide();
            },
            onInteract: _onReaderInteract,
            onAskAi: (refStr, refLabel, selectionText, explainOnly) {
              _onReaderInteract();
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
      floatingActionButton: _book == null || _chromeHidden
          ? null
          : Padding(
              padding: const EdgeInsets.only(bottom: 4, right: 4),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (_planMeta != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: FloatingActionButton.small(
                        heroTag: 'reader-plan-exit',
                        backgroundColor: AppColors.surface,
                        foregroundColor: AppColors.inkSoft,
                        onPressed: () {
                          _onReaderInteract();
                          setState(() => _planMeta = null);
                        },
                        child: const Text('退出', style: TextStyle(fontSize: 12)),
                      ),
                    ),
                  FloatingActionButton(
                    heroTag: 'reader-xiaoai',
                    backgroundColor: AppColors.accentDeep,
                    foregroundColor: Colors.white,
                    onPressed: () {
                      _onReaderInteract();
                      _openXiaoAiSheet(context);
                    },
                    child: const Icon(Icons.auto_awesome, size: 22),
                  ),
                ],
              ),
            ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
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
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
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
            child: SingleChildScrollView(
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
              Text(
                  _mainVersionId == 'kjv'
                      ? 'Select up to 2 versions for parallel reading'
                      : '最多勾选 2 本译本；选 2 本时为对照阅读',
                  style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
              const SizedBox(height: 8),
              Consumer(builder: (ctx, ref, _) {
                final async = ref.watch(bibleVersionsProvider);
                return async.when(
                  loading: () => const Padding(
                      padding: EdgeInsets.all(20),
                      child: Center(child: CircularProgressIndicator())),
                  error: (e, _) => Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text('加载失败：$e',
                          style: const TextStyle(color: AppColors.inkFaint))),
                  data: (versions) {
                    final primary =
                        versions.where((v) => v.primary).firstOrNull;
                    final primaryLabel = primary?.label ?? '和合本';
                    final isParallel = _compareVersionId != null &&
                        _mainVersionId == null;
                    return Column(
                    mainAxisSize: MainAxisSize.min,
                    children: versions.map((v) {
                      final isMainDisplay = v.primary
                          ? _mainVersionId == null && !isParallel
                          : _mainVersionId == v.id;
                      final isCompare =
                          isParallel && _compareVersionId == v.id;
                      return ListTile(
                        leading: Icon(
                          isMainDisplay || isCompare
                              ? Icons.check_circle
                              : (v.available
                                  ? Icons.translate
                                  : Icons.download_outlined),
                          color: isMainDisplay || isCompare
                              ? AppColors.accentDeep
                              : (v.available
                                  ? AppColors.accent
                                  : AppColors.inkFaint),
                        ),
                        title: Text(v.label),
                        subtitle: Text(isMainDisplay
                            ? '正文 ✓'
                            : isCompare
                                ? '对照 ✓'
                                : (v.primary
                                    ? '主译本'
                                    : (v.available ? '点选' : '尚未下载'))),
                        enabled: v.available,
                        onTap: () {
                          final prefs = ref.read(prefsProvider);
                          if (v.primary) {
                            setState(() {
                              _mainVersionId = null;
                              prefs.remove('reader_main_version');
                              if (isCompare) {
                                _versionLabel =
                                    '$primaryLabel · ${versions.where((x) => x.id == _compareVersionId).map((x) => x.label).firstOrNull ?? _compareVersionId}';
                              } else {
                                _compareVersionId = null;
                                prefs.remove('reader_parallel_version');
                                _versionLabel = v.label;
                              }
                            });
                          } else if (isMainDisplay) {
                            setState(() {
                              _mainVersionId = null;
                              _versionLabel = primaryLabel;
                            });
                            prefs.remove('reader_main_version');
                          } else if (isCompare) {
                            setState(() {
                              _compareVersionId = null;
                              _versionLabel = primaryLabel;
                            });
                            prefs.remove('reader_parallel_version');
                          } else if (_mainVersionId == null && !isParallel) {
                            setState(() {
                              _mainVersionId = v.id;
                              _compareVersionId = null;
                              _versionLabel = v.label;
                            });
                            prefs.setString('reader_main_version', v.id);
                            prefs.remove('reader_parallel_version');
                          } else {
                            setState(() {
                              _mainVersionId = null;
                              _compareVersionId = v.id;
                              _versionLabel = '$primaryLabel · ${v.label}';
                            });
                            prefs.remove('reader_main_version');
                            prefs.setString('reader_parallel_version', v.id);
                          }
                          Navigator.pop(ctx);
                        },
                      );
                    }).toList(),
                  );
                  },
                );
              }),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
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

    final next = _chapter + delta;
    if (next < 1 || next > b.chapterCount) return;
    setState(() => _chapter = next);
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
    final picked = await showModalBottomSheet<({BibleBook book, int chapter})>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (_) => _BookSheet(books: books, planSteps: _planMeta?.steps),
    );
    if (picked != null) {
      setState(() {
        _book = picked.book;
        _chapter = picked.chapter;
      });
    }
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

class _BookSheet extends StatefulWidget {
  const _BookSheet({required this.books, this.planSteps});
  final List<BibleBook> books;
  final List<PlanStep>? planSteps;

  @override
  State<_BookSheet> createState() => _BookSheetState();
}

class _BookSheetState extends State<_BookSheet> {
  @override
  Widget build(BuildContext context) {
    final planIds = widget.planSteps != null && widget.planSteps!.isNotEmpty
        ? planBooksInSteps(widget.planSteps!).toSet()
        : null;
    final filtered = planIds == null
        ? widget.books
        : widget.books.where((b) => planIds.contains(b.id)).toList();
    final ot = filtered.where((b) => b.isOldTestament).toList();
    final nt = filtered.where((b) => !b.isOldTestament).toList();
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.92,
      builder: (_, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.all(16),
        children: [
          Center(
            child: Text(
              widget.planSteps != null ? '圣经目录 · 计划模式' : '圣经目录',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
          ),
          if (widget.planSteps != null) ...[
            const SizedBox(height: 6),
            const Text(
              '仅显示今日计划经卷与章节',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AppColors.inkSoft),
            ),
          ],
          const SizedBox(height: 12),
          if (ot.isNotEmpty) _section('旧约', ot),
          if (nt.isNotEmpty) _section('新约', nt),
        ],
      ),
    );
  }

  Widget _section(String title, List<BibleBook> books) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(title,
              style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w600)),
        ),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 1.55,
          ),
          itemCount: books.length,
          itemBuilder: (_, i) {
            final b = books[i];
            return GestureDetector(
              onTap: () => _pickChapter(b),
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.line),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(bibleBookAbbr(b.name),
                        style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            height: 1.2,
                            color: AppColors.ink)),
                    const SizedBox(height: 2),
                    Text(b.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 10, color: AppColors.inkSoft)),
                    const SizedBox(height: 1),
                    Text('${b.chapterCount} 章',
                        style: const TextStyle(
                            fontSize: 9, color: AppColors.inkFaint)),
                  ],
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Future<void> _pickChapter(BibleBook book) async {
    if (widget.planSteps != null &&
        !isChapterInPlan(widget.planSteps!, book.id, 1) &&
        allowedChaptersForBook(widget.planSteps!, book.id).isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('该经卷不在今日计划内')),
        );
      }
      return;
    }
    final chapter = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: AppColors.surface,
      builder: (_) => _ChapterGrid(book: book, planSteps: widget.planSteps),
    );
    if (chapter != null && mounted) {
      if (widget.planSteps != null &&
          !isChapterInPlan(widget.planSteps!, book.id, chapter)) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('该章节不在今日计划内')),
        );
        return;
      }
      Navigator.pop(context, (book: book, chapter: chapter));
    }
  }
}

class _ChapterGrid extends StatelessWidget {
  const _ChapterGrid({required this.book, this.planSteps});
  final BibleBook book;
  final List<PlanStep>? planSteps;

  @override
  Widget build(BuildContext context) {
    final allowed = planSteps != null && planSteps!.isNotEmpty
        ? allowedChaptersForBook(planSteps!, book.id).toSet()
        : null;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${book.name} · 共 ${book.chapterCount} 章',
                style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            Flexible(
              child: GridView.builder(
                shrinkWrap: true,
                gridDelegate:
                    const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 6,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                ),
                itemCount: book.chapterCount,
                itemBuilder: (_, i) {
                  final n = i + 1;
                  final disabled = allowed != null && !allowed.contains(n);
                  return GestureDetector(
                    onTap: disabled ? null : () => Navigator.pop(context, n),
                    child: Opacity(
                      opacity: disabled ? 0.35 : 1,
                      child: Container(
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.line),
                        ),
                        child: Text('$n'),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

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

  String _answer = '';
  bool _busy = false;
  bool _copied = false;
  bool _expanded = false;
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
    WidgetsBinding.instance.addPostFrameCallback((_) => _ask());
  }

  @override
  void dispose() {
    _sub?.cancel();
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
    ref.read(assistantSeedProvider.notifier).open(
          ref: widget.refStr,
          question: _userQuestion,
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

  String get _cleanAnswer => bodyText(_answer);

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
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_answer.isEmpty && _busy)
                    const Row(
                      children: [
                        SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2)),
                        SizedBox(width: 10),
                        Text('小爱正在解读…',
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
                        text: _cleanAnswer.isEmpty ? '暂无内容' : _cleanAnswer),
                  if (!_busy &&
                      _citations.isNotEmpty &&
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
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: Row(
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
                    flex: _busy || _cleanAnswer.isEmpty || _cleanAnswer.startsWith('⚠️') ? 1 : 1,
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
          '已参考 ${citations.length} 条释经资料',
          style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: citations
              .map((c) => InkWell(
                    onTap: () {
                      ref.read(badgeStatsRecorderProvider).recordCitationClick();
                      showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        showDragHandle: true,
                        builder: (_) => _HalfSheetCitationDetail(citation: c),
                      );
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.goldWash,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text('[${c.n}] ${c.title}',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.gold)),
                    ),
                  ))
              .toList(),
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
      final res = await ref.read(assistantRepoProvider).explainCitation(
            snippet: snip,
            title: widget.citation.title,
          );
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
