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
import '../features/social/dm_thread_screen.dart';
import '../features/social/group_screen.dart';
import '../features/bible/dictionary_screen.dart';
import '../features/search/search_screen.dart';
import '../features/bible/wrapped_screen.dart';
import '../features/settings/appearance_screen.dart';
import '../features/knowledge/knowledge_explore.dart';
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
        path: '/discover/dm/:id',
        builder: (context, state) =>
            DmThreadScreen(threadId: state.pathParameters['id']!),
      ),
      GoRoute(
          path: '/report',
          builder: (context, state) => const ReadingReportScreen()),
      GoRoute(
          path: '/dictionary',
          builder: (context, state) => const DictionaryScreen()),
      GoRoute(
          path: '/search',
          builder: (context, state) => const SearchScreen()),
      GoRoute(
          path: '/search/map',
          builder: (context, state) => const MapToursScreen()),
      GoRoute(
        path: '/search/map/:id',
        builder: (context, state) =>
            MapTourDetailScreen(tourId: state.pathParameters['id']!),
      ),
      GoRoute(
          path: '/search/timeline',
          builder: (context, state) => const TimelineToursScreen()),
      GoRoute(
        path: '/search/timeline/:id',
        builder: (context, state) =>
            TimelineTourDetailScreen(tourId: state.pathParameters['id']!),
      ),
      GoRoute(
          path: '/search/diagrams',
          builder: (context, state) => const DiagramsScreen()),
      GoRoute(
          path: '/search/graph',
          builder: (context, state) => const GraphTopicsScreen()),
      GoRoute(
        path: '/search/graph/:id',
        builder: (context, state) =>
            GraphTopicDetailScreen(topicId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/search/diagrams/:id',
        builder: (context, state) =>
            DiagramDetailScreen(diagramId: state.pathParameters['id']!),
      ),
      GoRoute(
          path: '/wrapped',
          builder: (context, state) => WrappedScreen(
                initialPeriod: state.uri.queryParameters['period'] ?? 'month',
              )),
      GoRoute(
          path: '/profile/appearance',
          builder: (context, state) => const AppearanceScreen()),
      GoRoute(
        path: '/group/:id',
        builder: (context, state) =>
            GroupScreen(groupId: state.pathParameters['id']!),
      ),
    ],
  );
});
