import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

void main() {
  testWidgets('push /shelf/:id/read from /shelf/:id', (tester) async {
    final router = GoRouter(
      initialLocation: '/shelf/book-1',
      routes: [
        GoRoute(path: '/', builder: (_, __) => const Text('home')),
        GoRoute(path: '/shelf', builder: (_, __) => const Text('list')),
        GoRoute(
          path: '/shelf/:id/read',
          builder: (c, s) => Text('READ:${s.pathParameters['id']}'),
        ),
        GoRoute(
          path: '/shelf/:id',
          builder: (c, s) => Column(children: [
            Text('DETAIL:${s.pathParameters['id']}'),
            ElevatedButton(
              onPressed: () => c.push('/shelf/${s.pathParameters['id']}/read'),
              child: const Text('start'),
            ),
          ]),
        ),
      ],
    );

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    expect(find.text('DETAIL:book-1'), findsOneWidget);

    await tester.tap(find.text('start'));
    await tester.pumpAndSettle();
    expect(find.text('READ:book-1'), findsOneWidget);
  });

  testWidgets('encoded id push', (tester) async {
    final id = Uri.encodeComponent('abc def');
    final router = GoRouter(
      initialLocation: '/shelf/$id',
      routes: [
        GoRoute(path: '/', builder: (_, __) => const Text('home')),
        GoRoute(
          path: '/shelf/:id/read',
          builder: (c, s) => Text('READ:${s.pathParameters['id']}'),
        ),
        GoRoute(
          path: '/shelf/:id',
          builder: (c, s) => ElevatedButton(
            onPressed: () => c.push('/shelf/${Uri.encodeComponent(s.pathParameters['id']!)}/read'),
            child: const Text('start'),
          ),
        ),
      ],
    );
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    await tester.tap(find.text('start'));
    await tester.pumpAndSettle();
    expect(find.textContaining('READ:'), findsOneWidget);
    print('matched: ${find.textContaining('READ:').evaluate().first.widget}');
  });
}
