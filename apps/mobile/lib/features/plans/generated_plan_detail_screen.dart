/// 生成计划详情：按天列出（每天一组 refs），点天进阅读并记录进度。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/database/app_database.dart';
import '../../core/theme.dart';
import 'plan_reading.dart';
import 'plans_repository.dart';

class GeneratedPlanDetailScreen extends ConsumerWidget {
  const GeneratedPlanDetailScreen({super.key, required this.plan});
  final GeneratedPlan plan;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final days = GeneratedPlanStore.daysOf(plan);
    final progress = ref.watch(planProgressMapProvider).value ?? const {};
    final current = progress[plan.id]?.day ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(plan.title),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: '删除计划',
            onPressed: () async {
              await ref.read(generatedPlanStoreProvider).delete(plan.id);
              if (context.mounted) Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: days.length,
        itemBuilder: (_, i) {
          final d = days[i];
          final done = current >= d.day && current > 0;
          return Card(
            elevation: 0,
            color: AppColors.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: const BorderSide(color: AppColors.line),
            ),
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor:
                    done ? AppColors.accentDeep : AppColors.accentWash,
                child: done
                    ? const Icon(Icons.check, color: Colors.white, size: 18)
                    : Text('${d.day}',
                        style: const TextStyle(color: AppColors.accentDeep)),
              ),
              title: Text(d.title),
              subtitle: Text('${d.refs.length} 章',
                  style: const TextStyle(fontSize: 12)),
              trailing: const Icon(Icons.chevron_right, color: AppColors.inkFaint),
              onTap: () => _openDay(context, ref, d),
            ),
          );
        },
      ),
    );
  }

  Future<void> _openDay(
      BuildContext context, WidgetRef ref, GeneratedDay d) async {
    await openPlanReading(
      context,
      ref,
      ref.read(prefsProvider),
      planId: plan.id,
      planTitle: plan.title,
      day: d.day,
      totalDays: plan.daysCount,
      source: 'generated',
    );
  }
}
