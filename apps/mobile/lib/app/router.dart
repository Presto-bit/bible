/// 应用路由（go_router）：首启动门控 + 主壳 + 深链。
///
/// 底部导航仍由 AppShell + navIndexProvider 维护；深链以 push 形式叠加，
/// 不破坏现有 IndexedStack 结构。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/api_client.dart';
import '../features/assistant/assistant_screen.dart';
import '../features/bible/reader_screen.dart';
import '../features/bible/reading_report_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/challenge/ai_challenge_screen.dart';
import '../features/challenge/challenge_screen.dart';
import '../features/plans/generate_plan_screen.dart';
import '../features/plans/plans_screen.dart';
import '../features/social/add_friend_screen.dart';
import '../features/social/create_group_screen.dart';
import '../features/social/discover_screen.dart';
import '../features/social/group_screen.dart';
import 'app_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final prefs = ref.read(prefsProvider);
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) {
          final done = prefs.getBool(onboardingDoneKey) ?? false;
          return done ? const AppShell() : const OnboardingScreen();
        },
      ),
      GoRoute(
        path: '/reader',
        builder: (context, state) {
          final book = state.uri.queryParameters['book'];
          final ch = int.tryParse(state.uri.queryParameters['chapter'] ?? '');
          return ReaderScreen(initialBook: book, initialChapter: ch);
        },
      ),
      GoRoute(
        path: '/assistant',
        builder: (context, state) => AssistantScreen(
          seedRef: state.uri.queryParameters['ref'],
          seedQuestion: state.uri.queryParameters['q'],
        ),
      ),
      GoRoute(
          path: '/plans', builder: (context, state) => const PlansScreen()),
      GoRoute(
          path: '/plans/generate',
          builder: (context, state) => const GeneratePlanScreen()),
      GoRoute(
          path: '/friend/add',
          builder: (context, state) => const AddFriendScreen()),
      GoRoute(
          path: '/group/create',
          builder: (context, state) => const CreateGroupScreen()),
      GoRoute(
          path: '/challenge',
          builder: (context, state) => const ChallengeScreen()),
      GoRoute(
          path: '/challenge/ai',
          builder: (context, state) => const AiChallengeScreen()),
      GoRoute(
          path: '/discover',
          builder: (context, state) => const DiscoverScreen()),
      GoRoute(
          path: '/report',
          builder: (context, state) => const ReadingReportScreen()),
      GoRoute(
        path: '/group/:id',
        builder: (context, state) =>
            GroupScreen(groupId: state.pathParameters['id']!),
      ),
    ],
  );
});
