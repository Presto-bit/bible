/// 定制读经计划：选范围/天数/提词 → 预览 → 保存并开始。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'generated_plan_detail_screen.dart';
import 'plans_repository.dart';

class GeneratePlanScreen extends ConsumerStatefulWidget {
  const GeneratePlanScreen({super.key});

  @override
  ConsumerState<GeneratePlanScreen> createState() => _GeneratePlanScreenState();
}

class _GeneratePlanScreenState extends ConsumerState<GeneratePlanScreen> {
  String? _scope;
  double _days = 30;
  final _prompt = TextEditingController();
  final _customRefs = TextEditingController();
  bool _busy = false;
  Map<String, dynamic>? _preview;
  String? _error;

  @override
  void dispose() {
    _prompt.dispose();
    _customRefs.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    if (_scope == null && _customRefs.text.trim().isEmpty) {
      setState(() => _error = '请选择读经范围，或填写自定义经节');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final plan = await ref.read(plansRepoProvider).generate(
            _scope,
            _days.round(),
            _prompt.text.trim().isEmpty ? null : _prompt.text.trim(),
            customRefs: _customRefs.text.trim().isEmpty
                ? null
                : _customRefs.text.trim(),
          );
      setState(() => _preview = plan);
    } catch (e) {
      setState(() => _error = '生成失败：$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveAndStart() async {
    final plan = _preview;
    if (plan == null) return;
    final id = await ref.read(generatedPlanStoreProvider).save(plan);
    if (!mounted) return;
    final row = await ref.read(generatedPlanStoreProvider).byId(id);
    if (!mounted || row == null) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => GeneratedPlanDetailScreen(plan: row)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scopesAsync = ref.watch(_scopesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('定制计划')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('选择范围（可选）',
              style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink)),
          const SizedBox(height: 10),
          scopesAsync.when(
            loading: () => const LinearProgressIndicator(),
            error: (e, _) => Text('$e'),
            data: (scopes) => Wrap(
              spacing: 8,
              runSpacing: 8,
              children: scopes
                  .map((s) => ChoiceChip(
                        label: Text(s.label),
                        selected: _scope == s.id,
                        selectedColor: AppColors.accentWash,
                        onSelected: (_) => setState(() {
                          _scope = _scope == s.id ? null : s.id;
                          _preview = null;
                        }),
                      ))
                  .toList(),
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              const Text('天数', style: TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              Text('${_days.round()} 天',
                  style: const TextStyle(color: AppColors.accentDeep)),
            ],
          ),
          Slider(
            value: _days,
            min: 7,
            max: 180,
            divisions: 173,
            activeColor: AppColors.accentDeep,
            onChanged: (v) => setState(() {
              _days = v;
              _preview = null;
            }),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _prompt,
            decoration: const InputDecoration(
              labelText: '计划提词',
              hintText: '描述你想读的内容，将作为计划名称',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _customRefs,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: '自定义经节（可选）',
              hintText: '例：GEN.1, PSA.23, JHN.3-5',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() => _preview = null),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Color(0xFFB1554A))),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.accentDeep,
                minimumSize: const Size.fromHeight(48)),
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.calendar_month_outlined),
            label: const Text('生成预览'),
            onPressed: _busy ? null : _generate,
          ),
          if (_preview != null) ...[
            const SizedBox(height: 24),
            _PreviewCard(plan: _preview!),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.gold,
                  minimumSize: const Size.fromHeight(48)),
              onPressed: _saveAndStart,
              child: const Text('保存并开始'),
            ),
          ],
        ],
      ),
    );
  }
}

final _scopesProvider =
    FutureProvider<List<({String id, String label})>>(
        (ref) => ref.watch(plansRepoProvider).scopes());

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({required this.plan});
  final Map<String, dynamic> plan;
  @override
  Widget build(BuildContext context) {
    final days = (plan['days'] ?? []) as List;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(plan['title'] as String,
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink)),
          const SizedBox(height: 4),
          Text('${plan['days_count']} 天 · 共 ${plan['chapters_total']} 章',
              style: const TextStyle(color: AppColors.inkFaint, fontSize: 12)),
          const Divider(height: 20),
          ...days.take(5).map((d) {
            final m = d as Map<String, dynamic>;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 12,
                    backgroundColor: AppColors.accentWash,
                    child: Text('${m['day']}',
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.accentDeep)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(m['title'] as String)),
                ],
              ),
            );
          }),
          if (days.length > 5)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('…… 等 ${days.length} 天',
                  style: const TextStyle(color: AppColors.inkFaint, fontSize: 12)),
            ),
        ],
      ),
    );
  }
}
