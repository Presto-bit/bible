/// 应用路由（go_router）：首启动门控 + 主壳 + 深链。
///
/// 底部导航仍由 AppShell + navIndexProvider 维护；深链以 push 形式叠加，
/// 不破坏现有 IndexedStack 结构。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/api_client.dart';
import '../core/discover_h5_redirect.dart';
import '../core/h5_host_page.dart';
import '../features/assistant/assistant_screen.dart';
import '../features/bible/reader_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/challenge/ai_challenge_screen.dart';
import '../features/challenge/challenge_screen.dart';
import '../features/plans/generate_plan_screen.dart';
import '../features/plans/plans_screen.dart';
import '../features/social/discover_screen.dart';
import '../features/bible/dictionary_screen.dart';
import '../features/search/search_screen.dart';
import '../features/notes/notes_screen.dart';
import '../features/settings/appearance_screen.dart';
import '../features/knowledge/knowledge_explore.dart';
import '../features/assistant/knowledge_bases_screen.dart';
import '../features/bible/reading_report_screen.dart';
import '../features/bible/wrapped_screen.dart';
import '../features/shelf/shelf_book_detail_screen.dart';
import '../features/shelf/shelf_reader_screen.dart';
import '../features/shelf/shelf_screen.dart';
import 'app_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final prefs = ref.read(prefsProvider);
  return GoRouter(
    initialLocation: '/',
    // 引导与主壳必须分路由：同路径 builder 在 go('/') 时不会重建，
    // 导致「跳过 / 开始」写完 onboarding_done 仍停在引导页。
    redirect: (context, state) {
      final done = prefs.getBool(onboardingDoneKey) ?? false;
      final onOnboarding = state.matchedLocation == '/onboarding';
      if (!done && !onOnboarding) return '/onboarding';
      if (done && onOnboarding) return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(path: '/', builder: (context, state) => const AppShell()),
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

      /// 通用 H5：与 PWA 同页自带顶栏，无原生 AppBar 叠层
      GoRoute(
        path: '/h5',
        builder: (context, state) {
          final path = state.uri.queryParameters['path'] ?? '/discover';
          final title = state.uri.queryParameters['title'];
          final forceBar = state.uri.queryParameters['bar'] == '1';
          return H5HostPage(path: path, showAppBar: forceBar, title: title);
        },
      ),
      GoRoute(path: '/plans', builder: (context, state) => const PlansScreen()),
      GoRoute(
        path: '/plans/generate',
        builder: (context, state) => const GeneratePlanScreen(),
      ),
      GoRoute(
        path: '/friend/add',
        builder: (context, state) => const H5HostPage(path: '/friend/add'),
      ),
      GoRoute(
        path: '/group/create',
        builder: (context, state) => const H5HostPage(path: '/group/create'),
      ),
      GoRoute(
        path: '/challenge',
        builder: (context, state) =>
            ChallengeScreen(initialStart: state.uri.queryParameters['start']),
      ),
      GoRoute(
        path: '/challenge/ai',
        builder: (context, state) => const AiChallengeScreen(),
      ),
      GoRoute(
        path: '/discover',
        builder: (context, state) => const DiscoverScreen(),
      ),
      GoRoute(
        path: '/discover/dm/:id',
        builder: (context, state) => DiscoverH5RedirectPage(
          path: '/discover/dm/${state.pathParameters['id']}',
        ),
      ),
      GoRoute(
        path: '/report',
        builder: (context, state) => const ReadingReportScreen(),
      ),
      GoRoute(
        path: '/help',
        builder: (context, state) => const H5HostPage(path: '/help'),
      ),
      GoRoute(
        path: '/legal',
        builder: (context, state) =>
            const H5HostPage(path: '/profile/licenses'),
      ),
      GoRoute(
        path: '/feedback',
        builder: (context, state) => const H5HostPage(path: '/feedback'),
      ),
      GoRoute(
        path: '/profile/licenses',
        builder: (context, state) =>
            const H5HostPage(path: '/profile/licenses'),
      ),
      GoRoute(
        path: '/profile/settings',
        builder: (context, state) =>
            const H5HostPage(path: '/profile/settings'),
      ),
      GoRoute(
        path: '/profile/reminders',
        builder: (context, state) =>
            const H5HostPage(path: '/profile/reminders'),
      ),
      GoRoute(
        path: '/dictionary',
        builder: (context, state) => const DictionaryScreen(),
      ),
      GoRoute(
        path: '/notes',
        builder: (context, state) => NotesScreen(
          initialTab: state.uri.queryParameters['tab'] == 'highlights' ? 1 : 0,
        ),
      ),
      GoRoute(
        path: '/search',
        builder: (context, state) => const SearchScreen(),
      ),
      GoRoute(
        path: '/search/map',
        builder: (context, state) => const MapToursScreen(),
      ),
      GoRoute(
        path: '/search/map/:id',
        builder: (context, state) =>
            MapTourDetailScreen(tourId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/search/timeline',
        builder: (context, state) => const TimelineToursScreen(),
      ),
      GoRoute(
        path: '/search/timeline/:id',
        builder: (context, state) =>
            TimelineTourDetailScreen(tourId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/search/diagrams',
        builder: (context, state) => const DiagramsScreen(),
      ),
      GoRoute(
        path: '/search/graph',
        builder: (context, state) => const GraphTopicsScreen(),
      ),
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
        builder: (context, state) {
          final period = state.uri.queryParameters['period'];
          return WrappedScreen(
            initialPeriod: period == 'year' ? 'year' : 'month',
          );
        },
      ),
      GoRoute(
        path: '/shelf',
        builder: (context, state) => const ShelfScreen(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (context, state) => ShelfBookDetailScreen(
              bookId: Uri.decodeComponent(state.pathParameters['id']!),
              initialTab: state.uri.queryParameters['tab'],
              celebrateFinished: state.uri.queryParameters['finished'] == '1',
            ),
            routes: [
              GoRoute(
                path: 'read',
                builder: (context, state) {
                  final section = state.uri.queryParameters['section']?.trim();
                  return ShelfReaderScreen(
                    bookId: Uri.decodeComponent(state.pathParameters['id']!),
                    sectionId: (section == null || section.isEmpty) ? null : section,
                    pageIndex: int.tryParse(state.uri.queryParameters['page'] ?? ''),
                    groupId: state.uri.queryParameters['group'],
                  );
                },
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/profile/appearance',
        builder: (context, state) => const AppearanceScreen(),
      ),
      GoRoute(
        path: '/knowledge-bases',
        builder: (context, state) => const KnowledgeBasesScreen(),
      ),
      GoRoute(
        path: '/knowledge-bases/:id',
        builder: (context, state) => KnowledgeBaseDetailScreen(
          id: state.pathParameters['id']!,
          group: state.uri.queryParameters['group'],
        ),
      ),
      GoRoute(
        path: '/group/:id',
        builder: (context, state) => DiscoverH5RedirectPage(
          path: '/discover/group/${state.pathParameters['id']}',
        ),
      ),
    ],
  );
});
