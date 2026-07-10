/// 首页：问候 + 每日经文 hero + 「为你」横滑卡轨 + 今日统计 + 成长与回忆。
/// 布局对齐 canvas demo（HomeScreen / HomeForYouRail / HomeBelowFold）。
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/app_shell.dart';
import '../../core/api_client.dart';
import '../../core/daily_verse_engagement.dart';
import '../../core/gamification.dart';
import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import '../assistant/assistant_screen.dart';
import '../plans/plan_reading.dart';
import '../plans/plans_repository.dart';
import '../bible/bible_repository.dart';
import '../bible/models.dart';
import '../bible/reading_repository.dart';
import 'daily_verse_wallpaper_screen.dart';
import 'hero_b_campaign.dart';
import 'home_hero_carousel.dart';
import '../search/search_screen.dart';
import '../social/social_repository.dart';

class DailyVerse {
  DailyVerse({
    required this.ref,
    required this.theme,
    required this.text,
    required this.osisRef,
    required this.day,
    required this.liked,
    required this.likesCount,
    required this.sharesCount,
  });
  final String ref;
  final String theme;
  final String text;
  final String osisRef;
  final int day;
  final bool liked;
  final int likesCount;
  final int sharesCount;

  factory DailyVerse.fromJson(Map<String, dynamic> j) {
    final book = (j['book'] ?? '') as String;
    final ch = j['chapter'];
    final vs = j['verse_start'];
    return DailyVerse(
      ref: (j['ref'] ?? '') as String,
      theme: (j['theme'] ?? '') as String,
      text: (j['text'] ?? '') as String,
      osisRef: book.isNotEmpty ? '$book.$ch.$vs' : '',
      day: (j['day'] ?? 0) as int,
      liked: (j['liked'] ?? false) as bool,
      likesCount: (j['likes_count'] ?? 0) as int,
      sharesCount: (j['shares_count'] ?? 0) as int,
    );
  }
}

final dailyVerseProvider = FutureProvider<DailyVerse>((ref) async {
  final boot = await ref.watch(homeBootstrapProvider.future);
  return boot.dailyVerse;
});

class HomeBootstrap {
  HomeBootstrap({required this.dailyVerse, this.heroBCampaign});
  final DailyVerse dailyVerse;
  final HeroBCampaign? heroBCampaign;
}

final homeBootstrapProvider = FutureProvider<HomeBootstrap>((ref) async {
  final Dio dio = ref.watch(dioProvider);
  final session = ref.watch(sessionProvider);
  final prefs = ref.watch(prefsProvider);
  final today = DateTime.now();
  final ymd =
      '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
  final res = await dio.get('/content/home/bootstrap', queryParameters: {'_d': ymd});
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
  return HomeBootstrap(dailyVerse: v, heroBCampaign: campaign);
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
    final dv = ref.watch(dailyVerseProvider);
    final review = ref.watch(reviewDataProvider);
    final progress = ref.watch(planProgressMapProvider).value ?? const {};
    final plansAsync = ref.watch(plansListProvider);
    final generated = ref.watch(generatedPlansProvider).value ?? const [];
    void goTab(int i) => ref.read(navIndexProvider.notifier).set(i);

    _PlanRailData? planRail;
    final activeEntry = progress.entries
        .where((e) => e.value.status == 'active' && e.value.day > 0)
        .toList()
      ..sort((a, b) => b.value.updatedAtMs.compareTo(a.value.updatedAtMs));
    if (activeEntry.isNotEmpty) {
      final activeId = activeEntry.first.key;
      final day = activeEntry.first.value.day;
      final featured = plansAsync.maybeWhen(
        data: (list) => list.where((p) => p.planId == activeId).firstOrNull,
        orElse: () => null,
      );
      final gen = generated.where((g) => g.id == activeId).firstOrNull;
      if (featured != null && !featured.isPrayer) {
        planRail = _PlanRailData(
          title: featured.title,
          sub: '第 $day 天',
          onTap: () => openPlanReading(
            context,
            ref,
            ref.read(prefsProvider),
            planId: featured.planId,
            planTitle: featured.title,
            day: day,
            totalDays: featured.days,
            source: 'featured',
          ),
        );
      } else if (gen != null) {
        planRail = _PlanRailData(
          title: gen.title,
          sub: '第 $day 天',
          onTap: () => openPlanReading(
            context,
            ref,
            ref.read(prefsProvider),
            planId: gen.id,
            planTitle: gen.title,
            day: day,
            totalDays: gen.daysCount,
            source: 'generated',
          ),
        );
      }
    }

    final reading = ref.watch(readingProgressStreamProvider).value;
    final books = ref.watch(booksProvider).maybeWhen(
          data: (b) => b,
          orElse: () => const <BibleBook>[],
        );
    String continueTitle = '继续阅读';
    String continueSub = '打开圣经';
    if (reading != null && books.isNotEmpty) {
      BibleBook? book;
      for (final b in books) {
        if (b.id == reading.book) {
          book = b;
          break;
        }
      }
      if (book != null) {
        continueTitle = '${book.name} ${reading.chapter} 章';
        continueSub = '继续阅读';
      }
    }

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(homeBootstrapProvider);
            await ref.read(homeBootstrapProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            children: [
              _GreetingHeader(
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
                    onTap: () => context.push(ev.href),
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
                error: (e, _) => const _VerseCard(
                  day: 0,
                  theme: '每日经文',
                  ref: '',
                  text: '内容加载失败，下拉重试。',
                  initialLiked: false,
                  initialLikeCount: 0,
                ),
                data: (b) {
                  final v = b.dailyVerse;
                  final verseCard = _VerseCard(
                    day: v.day,
                    theme: v.theme.isEmpty ? '每日经文' : v.theme,
                    ref: v.ref,
                    text: v.text,
                    initialLiked: v.liked,
                    initialLikeCount: v.likesCount,
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
              _ForYouRail(
                planRail: planRail,
                continueTitle: continueTitle,
                continueSub: continueSub,
                onContinueReading: () => goTab(1),
                onAskXiaoAi: () => goTab(2),
                meditationPrompt: dv.maybeWhen(
                  data: _meditationPrompt,
                  orElse: () => null,
                ),
                onMeditate: (q) => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => AssistantScreen(seedQuestion: q),
                )),
              ),
              const SizedBox(height: 14),
              PaperCard(
                onTap: () => goTab(4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        review.maybeWhen(
                          data: (d) {
                            final today = DateTime.now();
                            final ymd =
                                '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
                            final mins = d.minutesByDay[ymd] ?? 0;
                            final monthStart = DateTime(today.year, today.month, 1);
                            final monthEnd =
                                DateTime(today.year, today.month + 1, 1);
                            final stats = d.rangeStats(
                              monthStart.millisecondsSinceEpoch,
                              monthEnd.millisecondsSinceEpoch,
                            );
                            return '今日 $mins 分钟 · 本月已读 ${stats.days} 天';
                          },
                          orElse: () => '今日读经 · 查看回顾',
                        ),
                        style: AppTypography.stat,
                      ),
                    ),
                    const Text('›', style: TextStyle(color: AppColors.inkFaint)),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              _BelowFold(
                onOpenDiscover: () => goTab(3),
                onContinueReading: () => goTab(1),
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
        value: 'group',
        child: ListTile(
          leading:
              Icon(Icons.group_add_outlined, color: AppColors.accentDeep),
          title: Text('建群'),
          subtitle: Text('创建共读群', style: TextStyle(fontSize: 11)),
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
      case 'group':
        context.push('/group/create');
      case 'plans':
        context.push('/plans');
    }
  });
}

String _meditationPrompt(DailyVerse v) {
  final where = v.ref.isNotEmpty ? '《${v.ref}》' : '今天的经文';
  return '请带我默想$where。先用一句话帮我安静下来，'
      '再用三个循序渐进的问题，引导我思想这段经文对我此刻生活的意义。';
}

class _GreetingHeader extends ConsumerStatefulWidget {
  const _GreetingHeader({required this.onSearch});
  final VoidCallback onSearch;

  @override
  ConsumerState<_GreetingHeader> createState() => _GreetingHeaderState();
}

class _GreetingHeaderState extends ConsumerState<_GreetingHeader> {
  final _plusKey = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour;
    final base = hour < 6
        ? '夜深了'
        : hour < 12
            ? '早安'
            : hour < 18
                ? '午安'
                : '晚安';
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
              Row(
                children: [
                  Container(
                    width: 4,
                    height: 18,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: AppColors.accent,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  Flexible(
                    child: Text(
                      (name != null && name.isNotEmpty) ? name : '读经伙伴',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.title,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        IconButton(
          onPressed: widget.onSearch,
          icon: const Icon(Icons.search, color: AppColors.inkSoft),
          tooltip: '搜索',
        ),
        InkWell(
          key: _plusKey,
          onTap: () => _showAnchoredPlusMenu(context, _plusKey),
          borderRadius: BorderRadius.circular(16),
          child: Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: AppColors.surfaceSunken,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.add, size: 20, color: AppColors.ink),
          ),
        ),
      ],
    );
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

class _PlanRailData {
  const _PlanRailData({
    required this.title,
    required this.sub,
    required this.onTap,
  });
  final String title;
  final String sub;
  final VoidCallback onTap;
}

class _RailCardData {
  const _RailCardData({
    required this.tag,
    required this.title,
    required this.sub,
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    this.onTap,
    this.accentPill = false,
    this.progressPct,
  });
  final String tag;
  final String title;
  final String sub;
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final VoidCallback? onTap;
  final bool accentPill;
  final int? progressPct;
}

String _trimRailTitle(String text, [int max = 24]) {
  final t = text.trim();
  if (t.length <= max) return t;
  return '${t.substring(0, max - 1)}…';
}

String _trimRailSub(String text, [int max = 14]) {
  final t = text.trim();
  if (t.isEmpty) return '';
  if (t.length <= max) return t;
  return '${t.substring(0, max - 1)}…';
}

class _ForYouRail extends StatefulWidget {
  const _ForYouRail({
    this.planRail,
    required this.continueTitle,
    required this.continueSub,
    required this.onContinueReading,
    required this.onAskXiaoAi,
    required this.meditationPrompt,
    required this.onMeditate,
  });
  final _PlanRailData? planRail;
  final String continueTitle;
  final String continueSub;
  final VoidCallback onContinueReading;
  final VoidCallback onAskXiaoAi;
  final String? meditationPrompt;
  final void Function(String) onMeditate;

  @override
  State<_ForYouRail> createState() => _ForYouRailState();
}

class _ForYouRailState extends State<_ForYouRail> {
  static const _viewportFraction = 0.47;
  final _controller = PageController(viewportFraction: _viewportFraction);
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final plan = widget.planRail;
    final cards = <_RailCardData>[
      _RailCardData(
        tag: '计划',
        title: _trimRailTitle(plan?.title ?? '读经计划'),
        sub: _trimRailSub(plan?.sub ?? '个性定制'),
        icon: Icons.calendar_today_outlined,
        iconBg: AppColors.goldWash,
        iconColor: AppColors.gold,
        accentPill: plan != null,
        onTap: plan?.onTap ?? () => context.push('/plans'),
      ),
      _RailCardData(
        tag: '继续',
        title: _trimRailTitle(widget.continueTitle),
        sub: _trimRailSub(widget.continueSub),
        icon: Icons.menu_book_outlined,
        iconBg: AppColors.goldWash,
        iconColor: AppColors.gold,
        accentPill: true,
        onTap: widget.onContinueReading,
      ),
      _RailCardData(
        tag: '小爱',
        title: _trimRailTitle('今日经文'),
        sub: _trimRailSub('聊聊今日经文'),
        icon: Icons.auto_awesome_outlined,
        iconBg: const Color(0xFFFCE8EC),
        iconColor: const Color(0xFFC45C6A),
        onTap: widget.meditationPrompt != null
            ? () => widget.onMeditate(widget.meditationPrompt!)
            : widget.onAskXiaoAi,
      ),
      _RailCardData(
        tag: '问答',
        title: _trimRailTitle('知识闯关'),
        sub: _trimRailSub('巩固所学'),
        icon: Icons.emoji_events_outlined,
        iconBg: AppColors.surfaceSunken,
        iconColor: AppColors.inkSoft,
        onTap: () => context.push('/challenge'),
      ),
    ];

    return Column(
      children: [
        SizedBox(
          height: 140,
          child: PageView.builder(
            controller: _controller,
            padEnds: false,
            onPageChanged: (i) => setState(() => _page = i),
            itemCount: cards.length,
            itemBuilder: (_, i) {
              final c = cards[i];
              return Padding(
                padding: EdgeInsets.only(right: i == cards.length - 1 ? 0 : 14),
                child: PaperCard(
                  tier: 2,
                  onTap: c.onTap,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: c.iconBg,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: c.iconColor.withValues(alpha: 0.12),
                          ),
                        ),
                        child: Icon(c.icon, size: 22, color: c.iconColor),
                      ),
                      const SizedBox(height: 10),
                      _Pill(c.tag, active: c.accentPill),
                      const SizedBox(height: 6),
                      Text(
                        c.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          height: 1.35,
                          color: AppColors.ink,
                        ),
                      ),
                      if (c.progressPct != null && c.progressPct! > 0) ...[
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: LinearProgressIndicator(
                            value: c.progressPct! / 100,
                            minHeight: 3,
                            backgroundColor: AppColors.line,
                            color: AppColors.accentDeep,
                          ),
                        ),
                      ],
                      if (c.sub.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          c.sub,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.inkSoft,
                            fontSize: 12,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
            cards.length,
            (i) => AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == _page ? 14 : 5,
              height: 5,
              decoration: BoxDecoration(
                color: i == _page ? AppColors.accent : AppColors.line,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _BelowFold extends ConsumerWidget {
  const _BelowFold({
    required this.onOpenDiscover,
    required this.onContinueReading,
    required this.onOpenReview,
  });
  final VoidCallback onOpenDiscover;
  final VoidCallback onContinueReading;
  final VoidCallback onOpenReview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(discoverSummaryProvider);
    final groups = ref.watch(myGroupsProvider);
    final groupLine = summary.maybeWhen(
      data: (s) {
        final pending = (s['groups_pending_checkin'] as num?)?.toInt() ?? 0;
        if (pending > 0) return '$pending 个群待打卡';
        return null;
      },
      orElse: () => null,
    );
    final groupName = groups.maybeWhen(
      data: (list) => list.isNotEmpty ? list.first.name : null,
      orElse: () => null,
    );
    final socialText = groupLine != null
        ? groupLine
        : groupName != null
            ? '$groupName · 一起去发现'
            : '创建或加入共读群';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PaperCard(
          onTap: onOpenDiscover,
          child: Row(
            children: [
              const _Pill('小组'),
              const SizedBox(width: 8),
              Expanded(
                child: Text(socialText,
                    style: const TextStyle(fontSize: 13, color: AppColors.ink)),
              ),
              const Text('去发现 ›',
                  style: TextStyle(color: AppColors.inkFaint, fontSize: 12)),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const Text('成长与回忆',
            style: TextStyle(
                color: AppColors.inkFaint,
                fontSize: 12,
                letterSpacing: 0.4)),
        const SizedBox(height: 8),
        PaperCard(
          tier: 2,
          tint: AppColors.accent,
          accent: true,
          onTap: onContinueReading,
          margin: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              const _Pill('就快读完', active: true),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('马可福音还剩 2 章就读完啦',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink)),
              ),
              const Text('读完它 ›',
                  style: TextStyle(
                      color: AppColors.accentDeep,
                      fontWeight: FontWeight.w600,
                      fontSize: 12)),
            ],
          ),
        ),
        PaperCard(
          onTap: onContinueReading,
          margin: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              const _Pill('去年今日'),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('去年今日你读了诗篇 23，还划了线',
                    style: TextStyle(fontSize: 13, color: AppColors.ink)),
              ),
              const Text('看看 ›',
                  style: TextStyle(color: AppColors.inkFaint, fontSize: 12)),
            ],
          ),
        ),
        PaperCard(
          onTap: () => context.push('/wrapped'),
          child: Row(
            children: [
              const _Pill('回顾'),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('月/年度读经回顾',
                    style: TextStyle(fontSize: 13, color: AppColors.ink)),
              ),
              const Text('生成回顾 ›',
                  style: TextStyle(color: AppColors.inkFaint, fontSize: 12)),
            ],
          ),
        ),
      ],
    );
  }
}

/// 每日经文 hero（tier3 + 破晓场景 + 衬线经文 + 点赞/分享行），对齐 canvas DailyVerseCard。
class _VerseCard extends ConsumerStatefulWidget {
  const _VerseCard({
    required this.day,
    required this.theme,
    required this.ref,
    required this.text,
    required this.initialLiked,
    required this.initialLikeCount,
  });
  final int day;
  final String theme;
  final String ref;
  final String text;
  final bool initialLiked;
  final int initialLikeCount;

  @override
  ConsumerState<_VerseCard> createState() => _VerseCardState();
}

class _VerseCardState extends ConsumerState<_VerseCard> {
  late bool _liked;
  late int _likeCount;
  bool _likeBusy = false;

  @override
  void initState() {
    super.initState();
    _liked = widget.initialLiked;
    _likeCount = widget.initialLikeCount;
  }

  @override
  void didUpdateWidget(covariant _VerseCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialLiked != widget.initialLiked ||
        oldWidget.initialLikeCount != widget.initialLikeCount) {
      _liked = widget.initialLiked;
      _likeCount = widget.initialLikeCount;
    }
  }

  Future<void> _toggleLike() async {
    if (_likeBusy || widget.day < 1) return;
    final prevLiked = _liked;
    final prevCount = _likeCount;
    setState(() => _likeBusy = true);
    try {
      final dio = ref.read(dioProvider);
      final session = ref.read(sessionProvider);
      final prefs = ref.read(prefsProvider);
      final day = widget.day;
      final path = '/content/daily-verse/like?day=$day';
      await dio.post(path);
      final fresh = await dio.get('/content/daily-verse?day=$day');
      final data = fresh.data as Map<String, dynamic>;
      final liked = (data['liked'] ?? false) as bool;
      final count = (data['likes_count'] ?? 0) as int;
      await writeLocalDailyVerseLike(prefs, session, day, liked);
      if (!mounted) return;
      setState(() {
        _liked = liked;
        _likeCount = count;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _liked = prevLiked;
        _likeCount = prevCount;
      });
    } finally {
      if (mounted) setState(() => _likeBusy = false);
    }
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
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      tier: 3,
      tint: AppColors.accent,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      backgroundLayer: const _DawnScene(),
      onTap: widget.text.isEmpty ? null : _openWallpaper,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('每日经文',
                  style: TextStyle(
                      color: AppColors.inkFaint,
                      fontSize: 12,
                      letterSpacing: 0.7)),
              const Spacer(),
              if (widget.theme.isNotEmpty)
                Text('${widget.theme}系列',
                    style: const TextStyle(
                        color: AppColors.inkFaint, fontSize: 12)),
            ],
          ),
          if (widget.ref.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(widget.ref,
                style: const TextStyle(
                    color: AppColors.accentDeep,
                    fontSize: 12,
                    fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 10),
          Text(
            '「${widget.text}」',
            style: const TextStyle(
              fontFamily: 'Songti SC',
              fontFamilyFallback: ['STSong', 'Noto Serif SC', 'serif'],
              fontSize: 16.5,
              height: 1.62,
              letterSpacing: 0.3,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              InkWell(
                onTap: _likeBusy ? null : _toggleLike,
                child: Row(
                  children: [
                    Icon(_liked ? Icons.favorite : Icons.favorite_border,
                        size: 18,
                        color:
                            _liked ? AppColors.accentDeep : AppColors.inkFaint),
                    const SizedBox(width: 6),
                    Text('$_likeCount 人点赞',
                        style: const TextStyle(
                            color: AppColors.inkFaint, fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// 柔和「破晓」场景背景：右上低饱和暖光晕 + 顶部色调淡出（盼望主题）。
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
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  const Color(0xFFE8E0D2).withValues(alpha: 0.55),
                  const Color(0xFFE8E0D2).withValues(alpha: 0),
                ],
                stops: const [0, 0.62],
              ),
            ),
          ),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0.64, -0.56),
                radius: 0.6,
                colors: [
                  const Color(0xFFD6BC8C).withValues(alpha: 0.45),
                  const Color(0xFFD6BC8C).withValues(alpha: 0),
                ],
                stops: const [0, 0.7],
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
    return const PaperCard(
      tier: 3,
      child: SizedBox(
        height: 150,
        child: Center(child: CircularProgressIndicator()),
      ),
    );
  }
}
