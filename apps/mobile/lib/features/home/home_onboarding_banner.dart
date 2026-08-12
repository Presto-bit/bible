/// 首页引导条（对齐 PWA HomeOnboardingBanner · 轻量版）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart' show prefsProvider;
import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';

const _kDismissed = 'home_onboarding_banner_dismissed_v1';

class HomeOnboardingDismissedNotifier extends Notifier<bool> {
  @override
  bool build() => ref.watch(prefsProvider).getBool(_kDismissed) == true;

  Future<void> dismiss() async {
    await ref.read(prefsProvider).setBool(_kDismissed, true);
    state = true;
  }
}

final homeOnboardingDismissedProvider =
    NotifierProvider<HomeOnboardingDismissedNotifier, bool>(
        HomeOnboardingDismissedNotifier.new);

class HomeOnboardingBanner extends ConsumerWidget {
  const HomeOnboardingBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(homeOnboardingDismissedProvider)) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: PaperCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.auto_awesome, size: 18, color: AppColors.accent),
            const SizedBox(width: 10),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '从今日经文开始',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  SizedBox(height: 4),
                  Text(
                    '点赞、回应，或用小爱解读；读经页长按经文可深入。',
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.45,
                      color: AppColors.inkFaint,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: '关闭',
              onPressed: () {
                ref.read(homeOnboardingDismissedProvider.notifier).dismiss();
              },
              icon: const Icon(Icons.close, size: 18),
            ),
          ],
        ),
      ),
    );
  }
}
