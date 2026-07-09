/// 计划 Tab：读经计划 + ACTS 祷告计划列表。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/database/app_database.dart';
import '../../core/theme.dart';
import 'generate_plan_screen.dart';
import 'generated_plan_detail_screen.dart';
import 'plan_detail_screen.dart';
import '../social/plan_share_sheet.dart';
import 'plan_reading.dart';
import 'plans_repository.dart';

class PlansScreen extends ConsumerStatefulWidget {
  const PlansScreen({super.key});

  @override
  ConsumerState<PlansScreen> createState() => _PlansScreenState();
}

class _PlansScreenState extends ConsumerState<PlansScreen> {
  String _tab = 'reading';

  static List<({String label, List<PlanSummary> items})> _groupPlans(
      List<PlanSummary> plans) {
    final groups = [
      (
        label: '7 天入门',
        items: plans.where((p) => p.days <= 7).toList(),
      ),
      (
        label: '15–30 天',
        items: plans.where((p) => p.days > 7 && p.days <= 30).toList(),
      ),
      (
        label: '长期通读',
        items: plans.where((p) => p.days > 30).toList(),
      ),
    ];
    return groups.where((g) => g.items.isNotEmpty).toList();
  }

  @override
  Widget build(BuildContext context) {
    final plans = ref.watch(plansListProvider);
    final progress = ref.watch(planProgressMapProvider).value ?? const {};
    final generated = ref.watch(generatedPlansProvider).value ?? const [];
    final activeEntry = progress.entries
        .where((e) => e.value.status == 'active' && e.value.day > 0)
        .toList()
      ..sort((a, b) => b.value.updatedAtMs.compareTo(a.value.updatedAtMs));
    final activeId = activeEntry.isNotEmpty ? activeEntry.first.key : null;

    return Scaffold(
      appBar: AppBar(title: const Text('计划')),
      body: plans.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('计划加载失败：$e',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.inkFaint)),
          ),
        ),
        data: (list) {
          final featured = list
              .where((p) => _tab == 'prayer' ? p.isPrayer : !p.isPrayer)
              .toList();
          final grouped = _groupPlans(featured);
          GeneratedPlan? activeGenerated;
          PlanSummary? activeFeatured;
          if (activeId != null) {
            activeFeatured = list.where((p) => p.planId == activeId).firstOrNull;
            activeGenerated =
                generated.where((g) => g.id == activeId).firstOrNull;
          }
          return RefreshIndicator(
          onRefresh: () async => ref.refresh(plansListProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (activeId != null &&
                  (activeFeatured != null || activeGenerated != null)) ...[
                _ActivePlanCard(
                  title: activeFeatured?.title ?? activeGenerated!.title,
                  day: progress[activeId]?.day ?? 1,
                  totalDays: activeFeatured?.days ?? activeGenerated!.daysCount,
                  kind: activeFeatured?.isPrayer == true ? 'prayer' : 'reading',
                  planId: activeId,
                  source: activeFeatured != null ? 'featured' : 'generated',
                  onContinue: () {
                    final day = progress[activeId]?.day ?? 1;
                    if (activeFeatured != null) {
                      openPlanReading(
                        context,
                        ref,
                        ref.read(prefsProvider),
                        planId: activeFeatured!.planId,
                        planTitle: activeFeatured!.title,
                        day: day,
                        totalDays: activeFeatured!.days,
                        source: 'featured',
                      );
                    } else if (activeGenerated != null) {
                      openPlanReading(
                        context,
                        ref,
                        ref.read(prefsProvider),
                        planId: activeGenerated!.id,
                        planTitle: activeGenerated!.title,
                        day: day,
                        totalDays: activeGenerated!.daysCount,
                        source: 'generated',
                      );
                    }
                  },
                  onCancel: () async {
                    await ref
                        .read(planProgressRepoProvider)
                        .cancel(activeId);
                    if (context.mounted) setState(() {});
                  },
                ),
                const SizedBox(height: 14),
              ],
              Row(
                children: [
                  _TabChip(
                      label: '读经计划',
                      active: _tab == 'reading',
                      onTap: () => setState(() => _tab = 'reading')),
                  const SizedBox(width: 8),
                  _TabChip(
                      label: '祷告计划',
                      active: _tab == 'prayer',
                      onTap: () => setState(() => _tab = 'prayer')),
                ],
              ),
              const SizedBox(height: 14),
              _GenerateBanner(
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => const GeneratePlanScreen(),
                )),
              ),
              if (generated.isNotEmpty) ...[
                const SizedBox(height: 14),
                _SectionHeader(title: '我的定制', count: generated.length),
                const SizedBox(height: 6),
                ...generated.map((g) {
                  final prog = progress[g.id];
                  return _PlanRow(
                    title: g.title,
                    meta: '${g.daysCount} 天 · 定制',
                    progress: prog?.day,
                    totalDays: g.daysCount,
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => GeneratedPlanDetailScreen(plan: g),
                    )),
                  );
                }),
              ],
              const SizedBox(height: 14),
              _SectionHeader(title: '热门计划', count: featured.length),
              const SizedBox(height: 6),
              ...grouped.expand((g) => [
                    _GroupLabel(g.label),
                    ...g.items.map((p) {
                      final prog = progress[p.planId];
                      return _PlanRow(
                        title: p.title,
                        meta: '${p.days} 天 · ${p.isPrayer ? '祷告' : '读经'}',
                        progress: prog?.day,
                        totalDays: p.days,
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => PlanDetailScreen(summary: p),
                        )),
                      );
                    }),
                  ]),
            ],
          ),
        );
        },
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip(
      {required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: active,
      onSelected: (_) => onTap(),
      selectedColor: AppColors.accentWash,
      checkmarkColor: AppColors.accentDeep,
    );
  }
}

class _ActivePlanCard extends ConsumerWidget {
  const _ActivePlanCard({
    required this.title,
    required this.day,
    required this.totalDays,
    required this.kind,
    required this.planId,
    required this.source,
    required this.onContinue,
    required this.onCancel,
  });
  final String title;
  final int day;
  final int totalDays;
  final String kind;
  final String planId;
  final String source;
  final VoidCallback onContinue;
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final segmentFuture = kind == 'reading'
        ? segmentProgressLabel(
            ref,
            ref.read(prefsProvider),
            planId: planId,
            day: day,
            source: source,
          )
        : null;
    return InkWell(
      onTap: kind == 'reading' ? onContinue : null,
      borderRadius: BorderRadius.circular(14),
      child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.accentWash,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('进行中',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.accentDeep)),
              if (segmentFuture != null)
                FutureBuilder<String?>(
                  future: segmentFuture,
                  builder: (_, snap) {
                    final label = snap.data;
                    if (label == null) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Text(label,
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.inkSoft)),
                    );
                  },
                ),
              const Spacer(),
              if (kind == 'reading')
                TextButton(
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  onPressed: () => showPlanShareToGroupSheet(
                    context,
                    ref,
                    planId: planId,
                    planTitle: title,
                  ),
                  child: const Text('分享到群', style: TextStyle(fontSize: 12)),
                ),
              TextButton(
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                onPressed: onCancel,
                child: const Text('取消', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
          const SizedBox(height: 6),
          Row(
            children: [
              Text('${kind == 'prayer' ? '祷告' : '读经'} · 第 $day/$totalDays 天',
                  style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
              if (kind == 'reading') ...[
                const SizedBox(width: 8),
                const Text('继续 ›',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.accentDeep)),
              ],
              const SizedBox(width: 10),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: totalDays > 0 ? (day / totalDays).clamp(0.0, 1.0) : 0,
                    minHeight: 4,
                    backgroundColor: AppColors.surfaceSunken,
                    color: AppColors.accentDeep,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.count});
  final String title;
  final int count;
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title,
            style: const TextStyle(
                fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
        const Spacer(),
        Text('$count 个',
            style: const TextStyle(fontSize: 11, color: AppColors.inkFaint)),
      ],
    );
  }
}

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 10, 0, 4),
      child: Text(text,
          style: const TextStyle(fontSize: 11, color: AppColors.inkFaint)),
    );
  }
}

class _GenerateBanner extends StatelessWidget {
  const _GenerateBanner({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.accentDeep, AppColors.accent],
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            const Icon(Icons.calendar_month_outlined, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            const Expanded(
              child: Text('定制计划',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700)),
            ),
            const Icon(Icons.chevron_right, color: Colors.white70, size: 20),
          ],
        ),
      ),
    );
  }
}

class _PlanRow extends StatelessWidget {
  const _PlanRow({
    required this.title,
    required this.meta,
    required this.onTap,
    this.progress,
    this.totalDays,
  });
  final String title;
  final String meta;
  final VoidCallback onTap;
  final int? progress;
  final int? totalDays;

  @override
  Widget build(BuildContext context) {
    final pct = progress != null && totalDays != null && totalDays! > 0
        ? (progress! / totalDays!).clamp(0.0, 1.0)
        : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.line),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: AppColors.ink)),
                      const SizedBox(height: 2),
                      Text(
                        progress != null
                            ? '$meta · 第 $progress 天'
                            : meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.inkFaint),
                      ),
                      if (pct != null) ...[
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: LinearProgressIndicator(
                            value: pct,
                            minHeight: 3,
                            backgroundColor: AppColors.surfaceSunken,
                            color: AppColors.accent,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.chevron_right,
                    size: 18, color: AppColors.inkFaint),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
