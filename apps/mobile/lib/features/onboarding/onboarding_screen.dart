/// 首启动引导：欢迎 → 昵称 → 进入首页。
/// 不收集阅读目标 / 使用目的，避免开箱多步阻力。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';

const onboardingDoneKey = 'onboarding_done';
const onboardingNameKey = 'onboarding_name';

/// 历史键：旧版可能写过目标，读取方仍可兼容；新引导不再写入。
const onboardingGoalKey = 'onboarding_goal';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  final _name = TextEditingController();
  final _password = TextEditingController();
  int _page = 0;
  bool _finishing = false;
  String? _error;

  static const _pageCount = 2;

  @override
  void dispose() {
    _controller.dispose();
    _name.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _finish({bool skip = false}) async {
    if (_finishing) return;
    final username = _name.text.trim();
    final password = _password.text;
    if (!skip) {
      if (username.length < 2) {
        setState(() => _error = '名称至少 2 个字');
        return;
      }
      if (password.length < 6) {
        setState(() => _error = '密码至少 6 位');
        return;
      }
    }
    _finishing = true;
    try {
      final auth = ref.read(authControllerProvider.notifier);
      if (skip) {
        await auth.setCredentials(username: '', password: '');
      } else {
        final available = await auth.usernameAvailable(username);
        if (!available) {
          if (mounted) setState(() => _error = '该用户名已被占用，请换一个');
          return;
        }
        // 此处调用服务端注册并落库 username/password，同时写入本地会话。
        await auth.setCredentials(username: username, password: password);
      }
      final prefs = ref.read(prefsProvider);
      await prefs.setBool(onboardingDoneKey, true);
      await auth.markOnboarded();
      if (!mounted) return;
      // 必须离开 /onboarding，否则同一 location 不会重建 AppShell
      context.go('/');
    } catch (_) {
      if (mounted) setState(() => _error = '保存失败，请检查网络后重试');
    } finally {
      if (mounted) setState(() => _finishing = false);
    }
  }

  void _next() {
    if (_page < _pageCount - 1) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    } else {
      _finish();
    }
  }

  @override
  Widget build(BuildContext context) {
    final onNamePage = _page == 1;
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _finishing ? null : () => _finish(skip: true),
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
                  _NameSlide(
                    nameController: _name,
                    passwordController: _password,
                    error: _error,
                    onSubmit: _finish,
                  ),
                ],
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                _pageCount,
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
                  minimumSize: const Size.fromHeight(50),
                ),
                onPressed: _finishing ? null : _next,
                child: Text(onNamePage ? '进入' : '下一步'),
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
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            body,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.inkSoft,
              height: 1.7,
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }
}

class _NameSlide extends StatelessWidget {
  const _NameSlide({
    required this.nameController,
    required this.passwordController,
    this.error,
    this.onSubmit,
  });
  final TextEditingController nameController;
  final TextEditingController passwordController;
  final String? error;
  final VoidCallback? onSubmit;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text(
            '设置你的名称和密码',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '用于首页问候，也可在其它设备用名称和密码登录。',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.inkFaint),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: nameController,
            textAlign: TextAlign.center,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              hintText: '名称（至少 2 个字）',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: passwordController,
            obscureText: true,
            textAlign: TextAlign.center,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => onSubmit?.call(),
            decoration: const InputDecoration(
              hintText: '密码（至少 6 位）',
              border: OutlineInputBorder(),
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(
              error!,
              style: const TextStyle(color: Color(0xFFB1554A), fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}
