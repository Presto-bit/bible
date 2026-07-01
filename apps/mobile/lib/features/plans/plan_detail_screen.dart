/// 计划详情：读经计划=每日章节卡（跳阅读器 + 标记完成）；祷告计划=ACTS 每日视图。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'plan_reading.dart';
import 'plans_repository.dart';

class PlanDetailScreen extends ConsumerWidget {
  const PlanDetailScreen({super.key, required this.summary});
  final PlanSummary summary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(planDetailProvider(summary));
    final progress = ref.watch(planProgressMapProvider).value ?? const {};
    final curDay = progress[summary.planId]?.day ?? 0;

    return Scaffold(
      appBar: AppBar(title: Text(summary.title)),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('加载失败：$e')),
        data: (d) => summary.isPrayer
            ? _PrayerView(summary: summary, raw: d.raw!, currentDay: curDay)
            : _ReadingView(
                summary: summary, days: d.readingDays, currentDay: curDay),
      ),
    );
  }
}

class _ReadingView extends ConsumerWidget {
  const _ReadingView({
    required this.summary,
    required this.days,
    required this.currentDay,
  });
  final PlanSummary summary;
  final List<ReadingDay> days;
  final int currentDay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: days.length,
      separatorBuilder: (_, i) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final d = days[i];
        final done = d.day <= currentDay;
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
                color: done ? AppColors.accent : AppColors.line,
                width: done ? 1.4 : 1),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor:
                    done ? AppColors.accent : AppColors.surfaceSunken,
                child: done
                    ? const Icon(Icons.check, color: Colors.white, size: 18)
                    : Text('${d.day}',
                        style: const TextStyle(
                            color: AppColors.inkSoft, fontSize: 13)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('第 ${d.day} 天',
                        style: const TextStyle(
                            color: AppColors.inkFaint, fontSize: 12)),
                    const SizedBox(height: 2),
                    Text(d.title,
                        style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: AppColors.ink)),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => _openAndMark(context, ref, d),
                child: const Text('去读'),
              ),
            ],
          ),
        );
      },
    );
  }

  void _openAndMark(BuildContext context, WidgetRef ref, ReadingDay d) {
    openPlanReading(
      context,
      ref,
      ref.read(prefsProvider),
      planId: summary.planId,
      planTitle: summary.title,
      day: d.day,
      totalDays: summary.days,
      source: 'featured',
    );
  }
}

class _PrayerView extends ConsumerStatefulWidget {
  const _PrayerView({
    required this.summary,
    required this.raw,
    required this.currentDay,
  });
  final PlanSummary summary;
  final Map<String, dynamic> raw;
  final int currentDay;

  @override
  ConsumerState<_PrayerView> createState() => _PrayerViewState();
}

class _PrayerViewState extends ConsumerState<_PrayerView> {
  late int _day = widget.currentDay > 0 ? widget.currentDay : 1;

  @override
  Widget build(BuildContext context) {
    final days = (widget.raw['days'] ?? []) as List;
    if (days.isEmpty) return const Center(child: Text('暂无内容'));
    final idx = (_day - 1).clamp(0, days.length - 1);
    final d = days[idx] as Map<String, dynamic>;
    final sc = (d['scripture'] ?? const {}) as Map<String, dynamic>;
    final acts = (d['acts'] ?? const {}) as Map<String, dynamic>;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(
              onPressed: idx > 0 ? () => setState(() => _day = idx) : null,
              icon: const Icon(Icons.chevron_left),
            ),
            Text('第 ${d['day']} 天 · ${days.length} 天',
                style: const TextStyle(color: AppColors.inkSoft)),
            IconButton(
              onPressed: idx < days.length - 1
                  ? () => setState(() => _day = idx + 2)
                  : null,
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text((d['title'] ?? '') as String,
            style: const TextStyle(
                fontSize: 22, fontWeight: FontWeight.w700, color: AppColors.ink)),
        const SizedBox(height: 16),
        if ((sc['text'] ?? '').toString().isNotEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.goldWash,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(sc['text'] as String,
                    style: const TextStyle(fontSize: 16, height: 1.7)),
                const SizedBox(height: 8),
                Text((sc['ref'] ?? '') as String,
                    style: const TextStyle(
                        color: AppColors.gold,
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        const SizedBox(height: 18),
        _actTile('A · 称颂', acts['adoration']),
        _actTile('C · 认罪', acts['confession']),
        _actTile('T · 感恩', acts['thanksgiving']),
        _actTile('S · 祈求', acts['supplication']),
        if ((d['prompt'] ?? '').toString().isNotEmpty) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.accentWash,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text('默想 · ${d['prompt']}',
                style: const TextStyle(height: 1.7, color: AppColors.accentDeep)),
          ),
        ],
        const SizedBox(height: 20),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.accentDeep),
          onPressed: () {
            ref.read(planProgressRepoProvider).mark(
                widget.summary.planId, (d['day'] ?? _day) as int,
                status: 'done');
            ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('已标记完成，已加入同步队列')));
          },
          child: const Text('完成今天'),
        ),
      ],
    );
  }

  Widget _actTile(String label, dynamic body) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, color: AppColors.ink)),
          const SizedBox(height: 4),
          Text((body ?? '') as String,
              style: const TextStyle(color: AppColors.inkSoft, height: 1.6)),
        ],
      ),
    );
  }
}
