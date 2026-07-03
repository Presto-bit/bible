/// 首启动引导（S0–S3）：欢迎 → 昵称 → 目标 → 完成。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';

const onboardingDoneKey = 'onboarding_done';
const onboardingNameKey = 'onboarding_name';
const onboardingGoalKey = 'onboarding_goal';

const _goals = ['每天读一章', '通读新约', '通读全本', '背诵经文', '安静默想'];

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  final _name = TextEditingController();
  String? _goal;
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    final prefs = ref.read(prefsProvider);
    await prefs.setBool(onboardingDoneKey, true);
    if (_name.text.trim().isNotEmpty) {
      await prefs.setString(onboardingNameKey, _name.text.trim());
    }
    if (_goal != null) await prefs.setString(onboardingGoalKey, _goal!);
    if (mounted) context.go('/');
  }

  void _next() {
    if (_page < 2) {
      _controller.nextPage(
          duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    } else {
      _finish();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _finish,
                child: const Text('跳过'),
              ),
            ),
            Expanded(
              child: PageView(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                children: [
                  const _Slide(
                    icon: Icons.menu_book_rounded,
                    title: '欢迎来到彼爱',
                    body: '安静读经，在话语中相遇。\n小爱随时为你解经、陪你默想。',
                  ),
                  _NameSlide(controller: _name),
                  _GoalSlide(
                    selected: _goal,
                    onSelect: (g) => setState(() => _goal = g),
                  ),
                ],
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                3,
                (i) => AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: i == _page ? 20 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: i == _page ? AppColors.accentDeep : AppColors.line,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: FilledButton(
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accentDeep,
                    minimumSize: const Size.fromHeight(50)),
                onPressed: _next,
                child: Text(_page < 2 ? '下一步' : '开始'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Slide extends StatelessWidget {
  const _Slide({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 72, color: AppColors.accentDeep),
          const SizedBox(height: 28),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink)),
          const SizedBox(height: 14),
          Text(body,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: AppColors.inkSoft, height: 1.7, fontSize: 15)),
        ],
      ),
    );
  }
}

class _NameSlide extends StatelessWidget {
  const _NameSlide({required this.controller});
  final TextEditingController controller;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('怎么称呼你？',
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink)),
          const SizedBox(height: 8),
          const Text('用于首页问候，可随时在「我的」修改。',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.inkFaint)),
          const SizedBox(height: 24),
          TextField(
            controller: controller,
            textAlign: TextAlign.center,
            decoration: const InputDecoration(
              hintText: '你的昵称',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      ),
    );
  }
}

class _GoalSlide extends StatelessWidget {
  const _GoalSlide({required this.selected, required this.onSelect});
  final String? selected;
  final ValueChanged<String> onSelect;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('你的读经目标？',
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink)),
          const SizedBox(height: 8),
          const Text('小爱会据此为你推荐计划与默想。',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.inkFaint)),
          const SizedBox(height: 24),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            alignment: WrapAlignment.center,
            children: _goals
                .map((g) => ChoiceChip(
                      label: Text(g),
                      selected: selected == g,
                      selectedColor: AppColors.accentWash,
                      onSelected: (_) => onSelect(g),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}
