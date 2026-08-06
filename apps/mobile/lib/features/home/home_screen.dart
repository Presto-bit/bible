/// 首页：问候 + 每日经文 hero + 今日推荐（左大右双）+ 折叠线下内容。
/// 区块对齐最新 PWA（`HomePage` / `HomeTodayPanel`）。
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/app_shell.dart';
import '../../core/api_client.dart';
import '../../core/daily_verse_engagement.dart';
import '../../core/daily_verse_wallpaper.dart';
import '../../core/gamification.dart';
import '../../core/home_greeting.dart';
import '../../core/open_h5.dart';
import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import '../assistant/assistant_screen.dart';
import '../plans/plan_reading.dart';
import '../plans/plans_repository.dart';
import '../bible/bible_repository.dart';
import '../bible/models.dart';
import '../bible/reading_repository.dart';
import '../bible/reader_screen.dart' show readerJumpProvider;
import 'daily_verse_react_sheet.dart';
import 'daily_verse_wallpaper_screen.dart';
import 'hero_b_campaign.dart';
import 'home_hero_carousel.dart';
import 'home_hero_metrics.dart';
import 'home_today_builder.dart';
import 'home_today_panel.dart';
import '../search/search_screen.dart';
import '../social/social_repository.dart';

class DailyVerse {
  DailyVerse({
    required this.ref,
    required this.theme,
    required this.text,
    required this.book,
    required this.chapter,
    required this.verseStart,
    required this.osisRef,
    required this.day,
    required this.liked,
    required this.likesCount,
    required this.sharesCount,
    this.reactsCount = 0,
    this.myReact,
    this.topPresets = const [],
  });
  final String ref;
  final String theme;
  final String text;
  final String book;
  final int chapter;
  final int verseStart;
  final String osisRef;
  final int day;
  final bool liked;
  final int likesCount;
  final int sharesCount;
  final int reactsCount;
  final DailyVerseReactPreset? myReact;
  final List<DailyVerseReactPreset> topPresets;

  factory DailyVerse.fromJson(Map<String, dynamic> j) {
    final book = ((j['book'] ?? '') as String).trim().toUpperCase();
    final ch = (j['chapter'] is num)
        ? (j['chapter'] as num).toInt()
        : int.tryParse('${j['chapter']}') ?? 0;
    final vs = (j['verse_start'] is num)
        ? (j['verse_start'] as num).toInt()
        : int.tryParse('${j['verse_start']}') ?? 0;
    final tops = <DailyVerseReactPreset>[];
    final tp = j['top_presets'];
    if (tp is List) {
      for (final e in tp) {
        if (e is Map) {
          final p = DailyVerseReactPreset.fromJson(
              Map<String, dynamic>.from(e));
          if (p.id.isNotEmpty) tops.add(p);
        }
      }
    }
    return DailyVerse(
      ref: (j['ref'] ?? '') as String,
      theme: (j['theme'] ?? '') as String,
      text: (j['text'] ?? '') as String,
      book: book,
      chapter: ch,
      verseStart: vs,
      osisRef: book.isNotEmpty && ch > 0
          ? (vs > 0 ? '$book.$ch.$vs' : '$book.$ch')
          : '',
      day: (j['day'] ?? 0) as int,
      liked: (j['liked'] ?? false) as bool,
      likesCount: (j['likes_count'] ?? 0) as int,
      sharesCount: (j['shares_count'] ?? 0) as int,
      reactsCount: (j['reacts_count'] is num)
          ? (j['reacts_count'] as num).toInt()
          : 0,
      myReact: parseReactPreset(j['my_react']),
      topPresets: tops,
    );
  }
}

final dailyVerseProvider = FutureProvider<DailyVerse>((ref) async {
  final boot = await ref.watch(homeBootstrapProvider.future);
  return boot.dailyVerse;
});

class HomeBootstrap {
  HomeBootstrap({
    required this.dailyVerse,
    this.heroBCampaign,
    this.railCampaigns = const [],
  });
  final DailyVerse dailyVerse;
  final HeroBCampaign? heroBCampaign;
  final List<HomeTodayCampaign> railCampaigns;
}

final homeBootstrapProvider = FutureProvider<HomeBootstrap>((ref) async {
  final Dio dio = ref.watch(dioProvider);
  final session = ref.watch(sessionProvider);
  final prefs = ref.watch(prefsProvider);
  final today = DateTime.now();
  final ymd =
      '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
  try {
    final res =
        await dio.get('/content/home/bootstrap', queryParameters: {'_d': ymd});
    final data = res.data as Map<String, dynamic>;
    final v = DailyVerse.fromJson(data['dailyVerse'] as Map<String, dynamic>);
    if (v.day > 0) {
      await writeLocalDailyVerseLike(prefs, session, v.day, v.liked);
    }
    HeroBCampaign? campaign;
    final raw = data['heroBCampaign'];
    if (raw is Map<String, dynamic> && '${raw['id'] ?? ''}'.isNotEmpty) {
      campaign = HeroBCampaign.fromJson(raw);
      await writeCachedHeroBCampaign(prefs, campaign);
    } else {
      await writeCachedHeroBCampaign(prefs, null);
    }
    final rails = <HomeTodayCampaign>[];
    final rc = data['railCampaigns'];
    if (rc is List) {
      for (final e in rc) {
        if (e is Map) {
          final c =
              HomeTodayCampaign.fromJson(Map<String, dynamic>.from(e));
          if (c.id.isNotEmpty && c.title.isNotEmpty) rails.add(c);
        }
      }
    }
    return HomeBootstrap(
      dailyVerse: v,
      heroBCampaign: campaign,
      railCampaigns: rails,
    );
  } on DioException catch (e) {
    // 弱网诚实：向上抛，UI 展示可重试文案，不静默假数据
    throw Exception(
      e.type == DioExceptionType.connectionError ||
              e.type == DioExceptionType.connectionTimeout
          ? '网络不可用，请检查连接后下拉重试'
          : '内容加载失败，请稍后重试',
    );
  }
});

/// 今日祷告（ACTS 计划）。
class PrayerToday {
  PrayerToday({
    required this.day,
    required this.title,
    required this.scriptureRef,
    required this.scriptureText,
    required this.acts,
    required this.prompt,
  });
  final int day;
  final String title;
  final String scriptureRef;
  final String scriptureText;
  final Map<String, String> acts;
  final String prompt;

  factory PrayerToday.fromJson(Map<String, dynamic> j) {
    final sc = (j['scripture'] ?? const {}) as Map<String, dynamic>;
    final acts = (j['acts'] ?? const {}) as Map<String, dynamic>;
    return PrayerToday(
      day: (j['day'] ?? 0) as int,
      title: (j['title'] ?? '') as String,
      scriptureRef: (sc['ref'] ?? '') as String,
      scriptureText: (sc['text'] ?? '') as String,
      acts: acts.map((k, v) => MapEntry(k, '$v')),
      prompt: (j['prompt'] ?? '') as String,
    );
  }
}

final prayerTodayProvider = FutureProvider<PrayerToday>((ref) async {
  final Dio dio = ref.watch(dioProvider);
  final res = await dio.get('/content/prayer-today');
  return PrayerToday.fromJson(res.data as Map<String, dynamic>);
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final boot = ref.watch(homeBootstrapProvider);
    final review = ref.watch(reviewDataProvider);
    final progress = ref.watch(planProgressMapProvider).value ?? const {};
    final plansAsync = ref.watch(plansListProvider);
    final generated = ref.watch(generatedPlansProvider).value ?? const [];
    final prayerToday = ref.watch(prayerTodayProvider);
    void goTab(int i) => ref.read(navIndexProvider.notifier).set(i);

    // —— 今日推荐输入 ——
    String? planTitle;
    String? planSub;
    int? planPct;
    int? planDay;
    String? planId;
    final activeEntry = progress.entries
        .where((e) => e.value.status == 'active' && e.value.day > 0)
        .toList()
      ..sort((a, b) => b.value.updatedAtMs.compareTo(a.value.updatedAtMs));
    VoidCallback? planOnTap;
    if (activeEntry.isNotEmpty) {
      final activeId = activeEntry.first.key;
      planDay = activeEntry.first.value.day;
      planId = activeId;
      final featured = plansAsync.maybeWhen(
        data: (list) => list.where((p) => p.planId == activeId).firstOrNull,
        orElse: () => null,
      );
      final gen = generated.where((g) => g.id == activeId).firstOrNull;
      if (featured != null && !featured.isPrayer) {
        planTitle = featured.title;
        planSub = '第 $planDay 天';
        planPct = featured.days > 0
            ? ((planDay! / featured.days) * 100).round().clamp(0, 100)
            : null;
        planOnTap = () => openPlanReading(
              context,
              ref,
              ref.read(prefsProvider),
              planId: featured.planId,
              planTitle: featured.title,
              day: planDay!,
              totalDays: featured.days,
              source: 'featured',
            );
      } else if (gen != null) {
        planTitle = gen.title;
        planSub = '第 $planDay 天';
        planPct = gen.daysCount > 0
            ? ((planDay! / gen.daysCount) * 100).round().clamp(0, 100)
            : null;
        planOnTap = () => openPlanReading(
              context,
              ref,
              ref.read(prefsProvider),
              planId: gen.id,
              planTitle: gen.title,
              day: planDay!,
              totalDays: gen.daysCount,
              source: 'generated',
            );
      }
    }

    final reading = ref.watch(readingProgressStreamProvider).value;
    final books = ref.watch(booksProvider).maybeWhen(
          data: (b) => b,
          orElse: () => const <BibleBook>[],
        );
    String? resumeTitle;
    String? resumeBookId;
    int? resumeChapter;
    if (reading != null && books.isNotEmpty) {
      BibleBook? book;
      for (final b in books) {
        if (b.id == reading.book) {
          book = b;
          break;
        }
      }
      if (book != null) {
        resumeTitle = '${book.name} ${reading.chapter} 章';
        resumeBookId = book.id;
        resumeChapter = reading.chapter;
      }
    }

    final today = DateTime.now();
    final ymd =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    int todayMins = 0;
    int monthDays = 0;
    bool readToday = false;
    bool welcomeBack = false;
    review.whenData((d) {
      todayMins = d.minutesByDay[ymd] ?? 0;
      readToday = todayMins > 0 || (d.chaptersByDay[ymd] ?? 0) > 0;
      final monthStart = DateTime(today.year, today.month, 1);
      final monthEnd = DateTime(today.year, today.month + 1, 1);
      monthDays = d
          .rangeStats(
            monthStart.millisecondsSinceEpoch,
            monthEnd.millisecondsSinceEpoch,
          )
          .days;
      // 近 3 天无读且历史上读过 → 欢迎回来
      var gap = 0;
      var cursor = today;
      for (var i = 0; i < 3; i++) {
        final k =
            '${cursor.year}-${cursor.month.toString().padLeft(2, '0')}-${cursor.day.toString().padLeft(2, '0')}';
        if ((d.minutesByDay[k] ?? 0) > 0 || (d.chaptersByDay[k] ?? 0) > 0) {
          gap = 0;
          break;
        }
        gap++;
        cursor = cursor.subtract(const Duration(days: 1));
      }
      final hadHistory = d.minutesByDay.values.any((m) => m > 0);
      welcomeBack = gap >= 3 && hadHistory;
    });

    final groups = ref.watch(myGroupsProvider).maybeWhen(
          data: (g) => g,
          orElse: () => const <Group>[],
        );
    String? groupTitle;
    String? groupSub;
    if (groups.isEmpty) {
      groupTitle = '创建共读';
      groupSub = '创建或加入';
    } else {
      groupTitle = '${groups.length} 个群';
      groupSub = '进入消息';
    }

    final prayerTitle = prayerToday.maybeWhen(
      data: (p) => p.day > 0 ? '第 ${p.day} 天' : (p.title.isNotEmpty ? p.title : null),
      orElse: () => null,
    );

    final rails = boot.maybeWhen(
      data: (b) => b.railCampaigns,
      orElse: () => const <HomeTodayCampaign>[],
    );

    final panel = buildHomeTodayPanel(HomeTodayInput(
      resumeTitle: resumeTitle,
      resumeSub: '继续阅读',
      resumeBookId: resumeBookId,
      resumeChapter: resumeChapter,
      planTitle: planTitle,
      planSub: planSub,
      planProgressPct: planPct,
      planBookId: planId,
      planChapter: planDay,
      prayerTitle: prayerTitle,
      groupTitle: groupTitle,
      groupSub: groupSub,
      campaigns: rails,
      readToday: readToday,
      welcomeBack: welcomeBack,
    ));

    void openSlot(HomeTodaySlot s) {
      final href = s.href;
      if (s.id == 'plan' && planOnTap != null) {
        planOnTap!();
        return;
      }
      if (s.id == 'resume' || s.id == 'suggest' || href.startsWith('/reader')) {
        if (resumeBookId != null && resumeChapter != null && s.id != 'suggest') {
          ref.read(readerJumpProvider.notifier).jump(resumeBookId!, resumeChapter!);
        } else if (s.id == 'suggest' || href.contains('book=')) {
          final u = Uri.tryParse(href);
          final book = u?.queryParameters['book'] ?? 'JHN';
          final ch = int.tryParse(u?.queryParameters['chapter'] ?? '1') ?? 1;
          ref.read(readerJumpProvider.notifier).jump(book, ch);
        }
        goTab(1);
        return;
      }
      if (s.id == 'group' || href.startsWith('/discover')) {
        goTab(3);
        return;
      }
      if (s.id.startsWith('campaign-') ||
          href.startsWith('/campaign') ||
          href.startsWith('/campaigns')) {
        final path = Uri.tryParse(href)?.path ?? href.split('?').first;
        if (!openH5IfAllowed(context, path.startsWith('/') ? path : '/$path')) {
          context.push(href.startsWith('/') ? href : '/$href');
        }
        return;
      }
      if (href.startsWith('/plans')) {
        context.push('/plans');
        return;
      }
      if (s.id == 'prayer' || href.startsWith('/pray')) {
        openH5IfAllowed(context, '/pray');
        return;
      }
      if (openH5IfAllowed(context, href.startsWith('/') ? href.split('?').first : '/$href')) {
        return;
      }
      context.push(href.startsWith('/') ? href : '/$href');
    }

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(homeBootstrapProvider);
            ref.invalidate(prayerTodayProvider);
            ref.invalidate(myGroupsProvider);
            try {
              await ref.read(homeBootstrapProvider.future);
            } catch (_) {}
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            children: [
              _GreetingHeader(
                welcomeBack: welcomeBack,
                onSearch: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SearchScreen()),
                ),
              ),
              Builder(builder: (context) {
                final events = currentSeasonalEvents();
                if (events.isEmpty) return const SizedBox.shrink();
                final ev = events.first;
                return Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: PaperCard(
                    onTap: () {
                      final path = ev.href.startsWith('/') ? ev.href : '/${ev.href}';
                      if (!openH5IfAllowed(context, path.split('?').first)) {
                        context.push(path);
                      }
                    },
                    child: Row(
                      children: [
                        _Pill(ev.badge ?? '活动', active: true),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(ev.title,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600)),
                              Text(ev.subtitle,
                                  style: const TextStyle(
                                      fontSize: 12, color: AppColors.inkFaint)),
                            ],
                          ),
                        ),
                        const Text('›',
                            style: TextStyle(color: AppColors.inkFaint)),
                      ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: 14),
              boot.when(
                loading: () => const _VerseCardSkeleton(),
                error: (e, _) => PaperCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        e.toString().replaceFirst('Exception: ', ''),
                        style: const TextStyle(fontSize: 14),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => ref.invalidate(homeBootstrapProvider),
                        child: const Text('重试'),
                      ),
                    ],
                  ),
                ),
                data: (b) {
                  final v = b.dailyVerse;
                  final verseCard = _VerseCard(
                    day: v.day,
                    theme: v.theme.isEmpty ? '每日经文' : v.theme,
                    ref: v.ref,
                    text: v.text,
                    book: v.book,
                    chapter: v.chapter,
                    verseStart: v.verseStart,
                    initialLiked: v.liked,
                    initialLikeCount: v.likesCount,
                    initialMyReact: v.myReact,
                    initialReactsCount: v.reactsCount,
                    initialTopPresets: v.topPresets,
                  );
                  return HomeHeroCarousel(
                    verseSlide: verseCard,
                    campaign: b.heroBCampaign,
                    campaignReady: b.heroBCampaign != null,
                    onCampaignTap: b.heroBCampaign == null
                        ? null
                        : () => _openHeroB(context, ref, b.heroBCampaign!.href),
                  );
                },
              ),
              const SizedBox(height: 14),
              HomeTodayPanel(
                primary: panel.primary,
                sideTop: panel.group,
                sideBottom: panel.prayer,
                onPrimary: () => openSlot(panel.primary),
                onSideTop: () => openSlot(panel.group),
                onSideBottom: () => openSlot(panel.prayer),
              ),
              const SizedBox(height: 14),
              // 成长区：媒体行（摘要 + 功能），对齐 PWA HomeGrowthStack 节奏
              _GrowthStack(
                todayMins: todayMins,
                monthDays: monthDays,
                planTitle: planTitle,
                planSub: planSub,
                planOccupied: panel.primary.id == 'plan' ||
                    panel.group.id == 'plan' ||
                    panel.prayer.id == 'plan',
                prayerOccupied: panel.primary.id == 'prayer' ||
                    panel.group.id == 'prayer' ||
                    panel.prayer.id == 'prayer',
                prayerTitle: prayerTitle,
                onReport: () {
                  if (!openH5IfAllowed(context, '/report')) {
                    context.push('/report');
                  }
                },
                onPlan: planOnTap ?? () => context.push('/plans'),
                onTheme: () => context.push('/search'),
                onPrayer: () => openH5IfAllowed(context, '/pray'),
              ),
              const SizedBox(height: 12),
              _BelowFold(
                onOpenDiscover: () => goTab(3),
                onOpenReview: () => goTab(4),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void _openHeroB(BuildContext context, WidgetRef ref, String href) {
  final tab = heroBTabIndex(href);
  if (tab != null) {
    ref.read(navIndexProvider.notifier).set(tab);
    return;
  }
  final path = heroBRoutePath(href);
  // 活动页 / 发现子路由等：走 H5 白名单容器
  if (openH5IfAllowed(context, path)) return;
  if (path.startsWith('/reader')) {
    ref.read(navIndexProvider.notifier).set(1);
  }
  context.push(path);
}

// 微信式加号菜单：锚定在按钮附近，点项跳转独立页。
void _showAnchoredPlusMenu(BuildContext context, GlobalKey anchorKey) {
  final box = anchorKey.currentContext?.findRenderObject() as RenderBox?;
  if (box == null) return;
  final pos = box.localToGlobal(Offset.zero);
  showMenu<String>(
    context: context,
    color: AppColors.surface,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    position: RelativeRect.fromLTRB(
      pos.dx - 200,
      pos.dy + box.size.height + 6,
      pos.dx + box.size.width,
      pos.dy + box.size.height + 6,
    ),
    items: const [
      PopupMenuItem(
        value: 'friend',
        child: ListTile(
          leading: Icon(Icons.person_add_alt_1_outlined,
              color: AppColors.accentDeep),
          title: Text('加好友'),
          subtitle: Text('搜索 ID / 用户名', style: TextStyle(fontSize: 11)),
          contentPadding: EdgeInsets.zero,
        ),
      ),
      PopupMenuItem(
        value: 'join',
        child: ListTile(
          leading: Icon(Icons.group_outlined, color: AppColors.accentDeep),
          title: Text('加入群'),
          subtitle: Text('扫码 / 邀请', style: TextStyle(fontSize: 11)),
          contentPadding: EdgeInsets.zero,
        ),
      ),
      PopupMenuItem(
        value: 'group',
        child: ListTile(
          leading:
              Icon(Icons.group_add_outlined, color: AppColors.accentDeep),
          title: Text('创建群'),
          subtitle: Text('发起共读群', style: TextStyle(fontSize: 11)),
          contentPadding: EdgeInsets.zero,
        ),
      ),
      PopupMenuItem(
        value: 'plans',
        child: ListTile(
          leading:
              Icon(Icons.auto_awesome_outlined, color: AppColors.accentDeep),
          title: Text('读经计划'),
          subtitle: Text('热门计划 · 个性定制', style: TextStyle(fontSize: 11)),
          contentPadding: EdgeInsets.zero,
        ),
      ),
    ],
  ).then((v) {
    if (v == null || !context.mounted) return;
    switch (v) {
      case 'friend':
        context.push('/friend/add');
      case 'join':
        if (!openH5IfAllowed(context, '/discover/join')) {
          context.push('/discover');
        }
      case 'group':
        context.push('/group/create');
      case 'plans':
        context.push('/plans');
    }
  });
}

class _GreetingHeader extends ConsumerStatefulWidget {
  const _GreetingHeader({
    required this.onSearch,
    this.welcomeBack = false,
  });
  final VoidCallback onSearch;
  final bool welcomeBack;

  @override
  ConsumerState<_GreetingHeader> createState() => _GreetingHeaderState();
}

class _GreetingHeaderState extends ConsumerState<_GreetingHeader> {
  final _plusKey = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final base = homeGreeting(welcomeBack: widget.welcomeBack);
    final name = ref.watch(prefsProvider).getString('onboarding_name');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(base,
                  style:
                      const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
              const SizedBox(height: 2),
              Text(
                (name != null && name.isNotEmpty) ? name : '读经伙伴',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.title,
              ),
            ],
          ),
        ),
        _IconCircle(
          icon: Icons.search,
          tooltip: '搜索',
          onTap: widget.onSearch,
        ),
        const SizedBox(width: 6),
        _IconCircle(
          key: _plusKey,
          icon: Icons.add,
          filled: true,
          tooltip: '更多',
          onTap: () => _showAnchoredPlusMenu(context, _plusKey),
        ),
      ],
    );
  }
}

class _IconCircle extends StatelessWidget {
  const _IconCircle({
    super.key,
    required this.icon,
    required this.onTap,
    this.filled = false,
    this.tooltip,
  });
  final IconData icon;
  final VoidCallback onTap;
  final bool filled;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final child = Material(
      color: filled ? AppColors.accentDeep : AppColors.surface,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(
            icon,
            size: 20,
            color: filled ? Colors.white : AppColors.inkSoft,
          ),
        ),
      ),
    );
    if (tooltip == null) return child;
    return Tooltip(message: tooltip!, child: child);
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.label, {this.active = false});
  final String label;
  final bool active;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: active ? AppColors.accentDeep : AppColors.accentWash,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: active ? Colors.white : AppColors.accentDeep)),
    );
  }
}


class _BelowFold extends ConsumerWidget {
  const _BelowFold({
    required this.onOpenDiscover,
    required this.onOpenReview,
  });
  final VoidCallback onOpenDiscover;
  final VoidCallback onOpenReview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 对齐 PWA：成长区下不再叠「小组」横条（群已在今日推荐副卡）
    final now = DateTime.now();
    final lastDay = DateTime(now.year, now.month + 1, 0).day;
    final monthReviewWindow = now.day >= lastDay - 2;
    final yearReviewWindow = now.month == 12 || now.month == 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (monthReviewWindow)
          PaperCard(
            onTap: onOpenReview,
            child: Row(
              children: [
                const _Pill('回顾', active: true),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('${now.month} 月回顾可生成',
                      style: const TextStyle(fontSize: 13, color: AppColors.ink)),
                ),
                const Text('看看 ›',
                    style: TextStyle(color: AppColors.inkFaint, fontSize: 12)),
              ],
            ),
          )
        else if (yearReviewWindow)
          PaperCard(
            onTap: () => context.push('/wrapped'),
            child: Row(
              children: [
                const _Pill('年度', active: true),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('${now.year} 年度回顾',
                      style: const TextStyle(fontSize: 13, color: AppColors.ink)),
                ),
                const Text('生成 ›',
                    style: TextStyle(color: AppColors.inkFaint, fontSize: 12)),
              ],
            ),
          ),
        const SizedBox(height: 18),
        const Center(
          child: Text(
            '彼爱 · 安静读经',
            style: TextStyle(
              fontSize: 12,
              letterSpacing: 0.8,
              color: AppColors.inkFaint,
            ),
          ),
        ),
        const SizedBox(height: 4),
        const Center(
          child: Text(
            '· 已经到底了 ·',
            style: TextStyle(
              fontSize: 11,
              letterSpacing: 0.6,
              color: AppColors.inkFaint,
            ),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

/// 每日经文 hero：风景底 + 四操作（赞/回应/小爱/分享），对齐 PWA hero-verse。
class _VerseCard extends ConsumerStatefulWidget {
  const _VerseCard({
    required this.day,
    required this.theme,
    required this.ref,
    required this.text,
    required this.book,
    required this.chapter,
    required this.verseStart,
    required this.initialLiked,
    required this.initialLikeCount,
    this.initialMyReact,
    this.initialReactsCount = 0,
    this.initialTopPresets = const [],
  });
  final int day;
  final String theme;
  final String ref;
  final String text;
  final String book;
  final int chapter;
  final int verseStart;
  final bool initialLiked;
  final int initialLikeCount;
  final DailyVerseReactPreset? initialMyReact;
  final int initialReactsCount;
  final List<DailyVerseReactPreset> initialTopPresets;

  @override
  ConsumerState<_VerseCard> createState() => _VerseCardState();
}

class _VerseCardState extends ConsumerState<_VerseCard> {
  late bool _liked;
  late int _likeCount;
  bool _likeBusy = false;
  bool _holdLocalEngagement = false;
  DailyVerseReactPreset? _myReact;
  int _reactsCount = 0;
  List<DailyVerseReactPreset> _topPresets = const [];

  @override
  void initState() {
    super.initState();
    _liked = widget.initialLiked;
    _likeCount = widget.initialLikeCount;
    _myReact = widget.initialMyReact;
    _reactsCount = widget.initialReactsCount;
    _topPresets = widget.initialTopPresets;
  }

  @override
  void didUpdateWidget(covariant _VerseCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.day != widget.day) {
      _liked = widget.initialLiked;
      _likeCount = widget.initialLikeCount;
      _holdLocalEngagement = false;
      _myReact = widget.initialMyReact;
      _reactsCount = widget.initialReactsCount;
      _topPresets = widget.initialTopPresets;
      return;
    }
    if (_likeBusy || _holdLocalEngagement) {
      if (_holdLocalEngagement &&
          !_likeBusy &&
          widget.initialLiked == _liked) {
        _likeCount = widget.initialLikeCount;
        _holdLocalEngagement = false;
      }
      return;
    }
    if (oldWidget.initialLiked != widget.initialLiked ||
        oldWidget.initialLikeCount != widget.initialLikeCount) {
      _liked = widget.initialLiked;
      _likeCount = widget.initialLikeCount;
    }
    if (oldWidget.initialMyReact?.id != widget.initialMyReact?.id ||
        oldWidget.initialReactsCount != widget.initialReactsCount) {
      _myReact = widget.initialMyReact;
      _reactsCount = widget.initialReactsCount;
      _topPresets = widget.initialTopPresets;
    }
  }

  Future<void> _toggleLike() async {
    if (_likeBusy || widget.day < 1) return;
    final prevLiked = _liked;
    final prevCount = _likeCount;
    final nextLiked = !prevLiked;
    final nextCount = (prevCount + (nextLiked ? 1 : -1)).clamp(0, 1 << 30);
    setState(() {
      _likeBusy = true;
      _holdLocalEngagement = true;
      _liked = nextLiked;
      _likeCount = nextCount;
    });
    try {
      final dio = ref.read(dioProvider);
      final session = ref.read(sessionProvider);
      final prefs = ref.read(prefsProvider);
      final day = widget.day;
      final res = await dio.post('/content/daily-verse/like?day=$day');
      final data = res.data is Map
          ? Map<String, dynamic>.from(res.data as Map)
          : <String, dynamic>{};
      final liked = (data['liked'] is bool) ? data['liked'] as bool : nextLiked;
      final count = (data['likes_count'] is num)
          ? (data['likes_count'] as num).toInt()
          : nextCount;
      await writeLocalDailyVerseLike(prefs, session, day, liked);
      if (!mounted) return;
      setState(() {
        _liked = liked;
        _likeCount = count;
        _holdLocalEngagement = true;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _liked = prevLiked;
        _likeCount = prevCount;
        _holdLocalEngagement = false;
      });
    } finally {
      if (mounted) setState(() => _likeBusy = false);
    }
  }

  void _openReader() {
    final book = widget.book.trim().toUpperCase();
    final ch = widget.chapter;
    if (book.isEmpty || ch < 1) return;
    final verse = widget.verseStart > 0 ? widget.verseStart : 1;
    // 写入进度 → 阅读页轻闪定位
    ref.read(readingRepoProvider).record(book, ch, verse: verse);
    ref.read(readerJumpProvider.notifier).jump(book, ch);
    ref.read(navIndexProvider.notifier).set(1);
  }

  void _openWallpaper() {
    if (widget.text.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => DailyVerseWallpaperScreen(
          day: widget.day,
          ref: widget.ref,
          text: widget.text,
          theme: widget.theme,
          liked: _liked,
          likeCount: _likeCount,
          myReact: _myReact?.label,
          onToggleLike: _likeBusy
              ? null
              : () {
                  _toggleLike();
                },
          onOpenReact: () {
            _openReact();
          },
          onAskXiaoAi: () {
            Navigator.of(context).pop();
            _askXiaoAi();
          },
          onShare: () {
            _share();
          },
        ),
      ),
    );
  }

  void _askXiaoAi() {
    final r = widget.ref;
    final q = r.isEmpty
        ? '请带我默想今天的经文，用一句话安静下来，再用三个问题引导应用。'
        : '请简要解读这节经文（$r），先抓住核心信息，再给一点今日应用。';
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AssistantScreen(
          seedRef: r.isEmpty ? null : r,
          seedQuestion: q,
        ),
      ),
    );
  }

  Future<void> _share() async {
    final body = widget.ref.isEmpty
        ? '「${widget.text}」\n—— 彼爱'
        : '「${widget.text}」\n—— ${widget.ref}\n彼爱 · 安静读经';
    await Share.share(body);
  }

  Future<void> _openReact() async {
    if (widget.day < 1) return;
    await showDailyVerseReactSheet(
      context: context,
      ref: ref,
      day: widget.day,
      myReact: _myReact,
      reactsCount: _reactsCount,
      topPresets: _topPresets,
      onChanged: (next) {
        if (!mounted) return;
        setState(() {
          _myReact = next.myReact;
          _reactsCount = next.reactsCount;
          _topPresets = next.topPresets;
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final wall = dailyVerseWallpaperUrl(widget.day < 1 ? 1 : widget.day);
    final h = homeHeroVerseHeight(context);
    final canRead = widget.book.isNotEmpty && widget.chapter > 0;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: widget.text.isEmpty ? null : _openWallpaper,
        borderRadius: BorderRadius.circular(18),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: SizedBox(
            height: h,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.network(
                  wall,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const _DawnScene(),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.25),
                        Colors.black.withValues(alpha: 0.62),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '每日经文',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.78),
                          fontSize: 12,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const Spacer(),
                      // 点经文 → 读经；点空白 → 壁纸（外层 InkWell）
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: canRead
                            ? () {
                                _openReader();
                              }
                            : null,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (widget.ref.isNotEmpty)
                              Text(
                                widget.ref,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.88),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            const SizedBox(height: 6),
                            Text(
                              widget.text.isEmpty
                                  ? '内容加载失败，下拉重试'
                                  : formatDailyVerseQuote(widget.text),
                              maxLines: 4,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: 'Songti SC',
                                fontFamilyFallback: [
                                  'STSong',
                                  'Noto Serif SC',
                                  'serif'
                                ],
                                fontSize: 17,
                                height: 1.55,
                                letterSpacing: 0.3,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      // 阻止穿透到壁纸
                      GestureDetector(
                        onTap: () {},
                        child: Row(
                          children: [
                            _HeroAction(
                              icon: _liked
                                  ? Icons.favorite
                                  : Icons.favorite_border,
                              label: _likeCount > 0 ? '$_likeCount' : null,
                              active: _liked,
                              onTap: _likeBusy ? null : _toggleLike,
                            ),
                            const SizedBox(width: 4),
                            _HeroAction(
                              icon: Icons.chat_bubble_outline,
                              label: _myReact?.emoji.isNotEmpty == true
                                  ? _myReact!.emoji
                                  : (_myReact?.label),
                              active: _myReact != null,
                              onTap: _openReact,
                            ),
                            const SizedBox(width: 4),
                            _HeroAction(
                              icon: Icons.auto_awesome_outlined,
                              onTap: _askXiaoAi,
                            ),
                            const SizedBox(width: 4),
                            _HeroAction(
                              icon: Icons.ios_share_outlined,
                              onTap: () => _share(),
                            ),
                          ],
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
}

class _HeroAction extends StatelessWidget {
  const _HeroAction({
    required this.icon,
    this.label,
    this.active = false,
    this.onTap,
  });
  final IconData icon;
  final String? label;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: active ? 0.22 : 0.12),
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 17, color: Colors.white),
              if (label != null && label!.isNotEmpty) ...[
                const SizedBox(width: 4),
                Text(
                  label!,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _GrowthStack extends StatelessWidget {
  const _GrowthStack({
    required this.todayMins,
    required this.monthDays,
    this.planTitle,
    this.planSub,
    this.prayerTitle,
    required this.planOccupied,
    required this.prayerOccupied,
    required this.onReport,
    required this.onPlan,
    required this.onTheme,
    required this.onPrayer,
  });

  final int todayMins;
  final int monthDays;
  final String? planTitle;
  final String? planSub;
  final String? prayerTitle;
  final bool planOccupied;
  final bool prayerOccupied;
  final VoidCallback onReport;
  final VoidCallback onPlan;
  final VoidCallback onTheme;
  final VoidCallback onPrayer;

  @override
  Widget build(BuildContext context) {
    // 对齐 PWA buildHomeGrowthModel：摘要 → 计划 → 主题 → 祷告
    final now = DateTime.now();
    final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
    final monthPct = daysInMonth <= 0
        ? 0
        : ((monthDays / daysInMonth) * 100).round().clamp(0, 100);

    final rows = <Widget>[
      _MediaGrowthRow(
        tag: '今日',
        title: '今日 $todayMins 分钟',
        detail: '本月已读 $monthDays 天',
        metricValue: '$todayMins',
        metricPrefix: '今日',
        metricSuffix: '分钟',
        imageUrl: null,
        icon: Icons.schedule,
        progressPct: monthPct > 0 ? monthPct : null,
        onTap: onReport,
      ),
    ];
    if (!planOccupied) {
      rows.add(
        _MediaGrowthRow(
          tag: '计划',
          title: planTitle ?? '选一个读经计划',
          detail: planSub ?? '按日程读完一卷书',
          imageUrl: dailyVerseWallpaperUrl(8),
          icon: Icons.menu_book_outlined,
          onTap: onPlan,
        ),
      );
    }
    rows.add(
      _MediaGrowthRow(
        tag: '主题',
        title: '探索经文主题',
        detail: '按主题找经文',
        imageUrl: dailyVerseWallpaperUrl(21),
        icon: Icons.explore_outlined,
        onTap: onTheme,
      ),
    );
    if (!prayerOccupied) {
      rows.add(
        _MediaGrowthRow(
          tag: '祷告',
          title: prayerTitle != null && prayerTitle!.isNotEmpty
              ? prayerTitle!
              : '开始祷告',
          detail: '安静片刻，向神说话',
          imageUrl: dailyVerseWallpaperUrl(14),
          icon: Icons.volunteer_activism_outlined,
          onTap: onPrayer,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          rows[i],
        ],
      ],
    );
  }
}

/// 对齐 PWA HomeMediaRow：左媒右文。
class _MediaGrowthRow extends StatelessWidget {
  const _MediaGrowthRow({
    required this.tag,
    required this.title,
    required this.detail,
    required this.icon,
    required this.onTap,
    this.imageUrl,
    this.metricValue,
    this.metricPrefix,
    this.metricSuffix,
    this.progressPct,
  });

  final String tag;
  final String title;
  final String detail;
  final IconData icon;
  final VoidCallback onTap;
  final String? imageUrl;
  final String? metricValue;
  final String? metricPrefix;
  final String? metricSuffix;
  final int? progressPct;

  @override
  Widget build(BuildContext context) {
    final hasImage = imageUrl != null && imageUrl!.isNotEmpty;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          height: 80,
          child: Row(
            children: [
              SizedBox(
                width: 68,
                height: 68,
                child: Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: ColoredBox(
                        color: AppColors.accentWash,
                        child: hasImage
                            ? Image.network(
                                imageUrl!,
                                width: 68,
                                height: 68,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Center(
                                  child: Icon(icon,
                                      color: AppColors.accentDeep, size: 24),
                                ),
                              )
                            : Center(
                                child: Icon(icon,
                                    color: AppColors.accentDeep, size: 24),
                              ),
                      ),
                    ),
                    if (hasImage)
                      Positioned(
                        left: 6,
                        bottom: 6,
                        child: Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.92),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(icon,
                              size: 13, color: AppColors.accentDeep),
                        ),
                      ),
                    if (progressPct != null && progressPct! > 0)
                      Positioned(
                        right: 2,
                        top: 2,
                        child: _MonthProgressBadge(pct: progressPct!),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      tag,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.inkFaint,
                      ),
                    ),
                    const SizedBox(height: 2),
                    if (metricValue != null)
                      Text.rich(
                        TextSpan(
                          children: [
                            if (metricPrefix != null)
                              TextSpan(
                                text: '$metricPrefix ',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.inkSoft,
                                ),
                              ),
                            TextSpan(
                              text: metricValue,
                              style: const TextStyle(
                                fontSize: 28,
                                fontWeight: FontWeight.w700,
                                height: 1.05,
                                color: AppColors.ink,
                              ),
                            ),
                            if (metricSuffix != null)
                              TextSpan(
                                text: ' $metricSuffix',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.inkSoft,
                                ),
                              ),
                          ],
                        ),
                      )
                    else
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                    Text(
                      detail,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.inkFaint,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right,
                  color: AppColors.inkFaint, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _MonthProgressBadge extends StatelessWidget {
  const _MonthProgressBadge({required this.pct});
  final int pct;

  @override
  Widget build(BuildContext context) {
    final p = (pct.clamp(0, 100)) / 100.0;
    return SizedBox(
      width: 22,
      height: 22,
      child: CircularProgressIndicator(
        value: p,
        strokeWidth: 2.2,
        backgroundColor: AppColors.line.withValues(alpha: 0.6),
        color: AppColors.accentDeep,
      ),
    );
  }
}

/// 柔和「破晓」场景背景（壁纸加载失败时）。
class _DawnScene extends StatelessWidget {
  const _DawnScene();
  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  const Color(0xFF3D5A48),
                  const Color(0xFF2C4034),
                  AppColors.accentDeep.withValues(alpha: 0.85),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _VerseCardSkeleton extends StatelessWidget {
  const _VerseCardSkeleton();
  @override
  Widget build(BuildContext context) {
    return Container(
      height: homeHeroVerseHeight(context),
      decoration: BoxDecoration(
        color: AppColors.surfaceSunken,
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
    );
  }
}
