/// 首页成长区模型：对齐 Web `home_growth_cards.ts`。
library;

import 'home_illustrations.dart';

const homeGrowthMaxCards = 5;

class HomeGrowthOccupied {
  const HomeGrowthOccupied({this.plan = false, this.prayer = false});
  final bool plan;
  final bool prayer;
}

class HomeGrowthFeatureInput {
  const HomeGrowthFeatureInput({
    required this.title,
    this.detail,
    required this.href,
  });
  final String title;
  final String? detail;
  final String href;
}

class HomeGrowthCard {
  const HomeGrowthCard({
    required this.id,
    required this.tag,
    required this.title,
    this.detail,
    this.metricValue,
    this.metricPrefix,
    this.metricSuffix,
    required this.href,
    this.kind = 'feature',
    this.iconName = 'explore',
    this.imageFile,
    this.progressPct,
  });

  final String id;
  final String tag;
  final String title;
  final String? detail;
  final String? metricValue;
  final String? metricPrefix;
  final String? metricSuffix;
  final String href;
  final String kind; // summary | feature
  final String iconName;
  final String? imageFile;
  final int? progressPct;

  String? get imageUrl {
    if (imageFile == null) return null;
    return homeIllustration(imageFile!).url;
  }

  String? get imageAssetPath {
    if (imageFile == null) return null;
    return homeIllustration(imageFile!).assetPath;
  }
}

class HomeGrowthModel {
  const HomeGrowthModel({required this.cards});
  final List<HomeGrowthCard> cards;
}

HomeGrowthOccupied occupiedFromIds(Iterable<String> ids) {
  final set = ids.toSet();
  return HomeGrowthOccupied(
    plan: set.contains('plan'),
    prayer: set.contains('prayer'),
  );
}

String? _growthImageFile(String id) {
  if (id == 'summary') return 'growth_summary.jpg';
  if (id == 'plan') return 'growth_plan.jpg';
  if (id == 'theme') return 'growth_theme.jpg';
  if (id == 'prayer') return 'growth_prayer.jpg';
  return null;
}

/// 顺序：摘要 → 读经计划 → 主题探索 → 祷告（跳过今日推荐已有的）。
HomeGrowthModel buildHomeGrowthModel({
  int todayMin = 0,
  int monthDays = 0,
  HomeGrowthOccupied occupied = const HomeGrowthOccupied(),
  HomeGrowthFeatureInput? plan,
  HomeGrowthFeatureInput? prayer,
  HomeGrowthFeatureInput? theme,
}) {
  final now = DateTime.now();
  final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
  final monthPct = daysInMonth <= 0
      ? 0
      : ((monthDays / daysInMonth) * 100).round().clamp(0, 100);

  final cards = <HomeGrowthCard>[];
  void push(HomeGrowthCard c) {
    if (cards.length >= homeGrowthMaxCards) return;
    cards.add(c);
  }

  push(HomeGrowthCard(
    id: 'summary',
    tag: '今日',
    title: '今日 $todayMin 分钟',
    detail: '本月已读 $monthDays 天',
    metricValue: '$todayMin',
    metricPrefix: '今日',
    metricSuffix: '分钟',
    href: '/report',
    kind: 'summary',
    iconName: 'schedule',
    imageFile: _growthImageFile('summary'),
    progressPct: monthPct > 0 ? monthPct : null,
  ));

  if (!occupied.plan) {
    push(HomeGrowthCard(
      id: 'plan',
      tag: '计划',
      title: (plan?.title ?? '').trim().isEmpty
          ? '选一个读经计划'
          : plan!.title.trim(),
      detail: (plan?.detail ?? '').trim().isEmpty
          ? '按日程读完一卷书'
          : plan!.detail!.trim(),
      href: plan?.href ?? '/plans',
      iconName: 'menu_book',
      imageFile: _growthImageFile('plan'),
    ));
  }

  push(HomeGrowthCard(
    id: 'theme',
    tag: '主题',
    title: (theme?.title ?? '').trim().isEmpty
        ? '探索经文主题'
        : theme!.title.trim(),
    detail: (theme?.detail ?? '').trim().isEmpty
        ? '按主题找经文'
        : theme!.detail!.trim(),
    href: theme?.href ?? '/search',
    iconName: 'explore',
    imageFile: _growthImageFile('theme'),
  ));

  if (!occupied.prayer) {
    push(HomeGrowthCard(
      id: 'prayer',
      tag: '祷告',
      title: (prayer?.title ?? '').trim().isEmpty
          ? '开始祷告'
          : prayer!.title.trim(),
      detail: (prayer?.detail ?? '').trim().isEmpty
          ? '安静片刻，向神说话'
          : prayer!.detail!.trim(),
      href: prayer?.href ?? '/pray',
      iconName: 'prayer',
      imageFile: _growthImageFile('prayer'),
    ));
  }

  return HomeGrowthModel(cards: cards);
}
