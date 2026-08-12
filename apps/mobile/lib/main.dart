import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app_shell.dart' show navIndexProvider;
import 'app/router.dart';
import 'core/api_client.dart';
import 'core/config.dart';
import 'core/deep_link.dart';
import 'core/device_id.dart';
import 'core/h5_bridge_channel.dart' show discoverH5PathProvider;
import 'core/notifications.dart';
import 'core/session.dart';
import 'core/app_theme.dart';
import 'core/theme.dart';
import 'features/assistant/assistant_seed.dart';
import 'features/auth/auth_api.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  final prefs = await SharedPreferences.getInstance();
  final device = DeviceIdentity(prefs);
  final session = await Session.load(prefs);
  final bootstrapDio = Dio(BaseOptions(baseUrl: AppConfig.baseUrl));
  await AuthApi(bootstrapDio, session, device).ensureAccountReady();

  runApp(
    ProviderScope(
      overrides: [
        prefsProvider.overrideWithValue(prefs),
        sessionProvider.overrideWithValue(session),
        deviceIdentityProvider.overrideWithValue(device),
      ],
      child: const PrestoBibleApp(),
    ),
  );
}

class PrestoBibleApp extends ConsumerStatefulWidget {
  const PrestoBibleApp({super.key});

  @override
  ConsumerState<PrestoBibleApp> createState() => _PrestoBibleAppState();
}

class _PrestoBibleAppState extends ConsumerState<PrestoBibleApp> {
  StreamSubscription<Uri>? _linkSub;
  final _appLinks = AppLinks();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initDeepLinks());
  }

  Future<void> _initDeepLinks() async {
    final router = ref.read(routerProvider);

    void go(String? loc) {
      if (loc == null || loc.isEmpty) return;
      if (loc.startsWith('peiai://tab/')) {
        final i = int.tryParse(loc.split('/').last) ?? 0;
        ref.read(navIndexProvider.notifier).set(i.clamp(0, 4));
        Future.microtask(() => router.go('/'));
        return;
      }
      final uri = Uri.tryParse(loc);
      final pathOnly = uri?.path ?? loc.split('?').first;

      // 发现子路径：进常驻 Tab WebView，避免叠一层 /h5
      if (pathOnly == '/h5') {
        final h5path = uri?.queryParameters['path'] ?? '';
        if (h5path.startsWith('/discover')) {
          ref.read(navIndexProvider.notifier).set(3);
          ref.read(discoverH5PathProvider.notifier).go(h5path);
          Future.microtask(() => router.go('/'));
          return;
        }
      }

      if (pathOnly == '/reader' || pathOnly.startsWith('/reader')) {
        ref.read(navIndexProvider.notifier).set(1);
      } else if (pathOnly == '/assistant' || pathOnly.startsWith('/assistant')) {
        ref.read(navIndexProvider.notifier).set(2);
        final r = uri?.queryParameters['ref'];
        final q = uri?.queryParameters['q'];
        if ((r ?? '').isNotEmpty || (q ?? '').isNotEmpty) {
          ref.read(assistantSeedProvider.notifier).open(
                ref: r,
                question: q,
              );
          Future.microtask(() => router.go('/'));
          return;
        }
      } else if (pathOnly == '/discover' || pathOnly.startsWith('/discover')) {
        ref.read(navIndexProvider.notifier).set(3);
        if (pathOnly != '/discover' || (uri?.hasQuery ?? false)) {
          ref.read(discoverH5PathProvider.notifier).go(loc);
        }
        Future.microtask(() => router.go('/'));
        return;
      } else if (pathOnly == '/' || pathOnly.isEmpty) {
        ref.read(navIndexProvider.notifier).set(0);
      } else if (pathOnly == '/profile' || pathOnly.startsWith('/profile')) {
        ref.read(navIndexProvider.notifier).set(4);
      }
      Future.microtask(() => router.push(loc));
    }

    NotificationService.instance.onPayload = (payload) {
      go(DeepLink.fromPayload(payload));
    };

    final fromNotif = await NotificationService.instance.consumeLaunchPayload();
    go(DeepLink.fromPayload(fromNotif));

    try {
      final initial = await _appLinks.getInitialLink();
      go(DeepLink.toLocation(initial));
    } catch (_) {}

    _linkSub = _appLinks.uriLinkStream.listen((uri) {
      go(DeepLink.toLocation(uri));
    });
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final appTheme = ref.watch(appThemeProvider);
    final theme = AppTheme.forApp(appTheme);
    final isDark = appTheme == AppThemeId.dark;

    SystemChrome.setSystemUIOverlayStyle(
      isDark
          ? SystemUiOverlayStyle.light.copyWith(
              statusBarColor: Colors.transparent,
              systemNavigationBarColor: Colors.transparent,
              systemNavigationBarIconBrightness: Brightness.light,
            )
          : SystemUiOverlayStyle.dark.copyWith(
              statusBarColor: Colors.transparent,
              systemNavigationBarColor: Colors.transparent,
              systemNavigationBarIconBrightness: Brightness.dark,
            ),
    );

    return MaterialApp.router(
      title: '彼爱',
      debugShowCheckedModeBanner: false,
      theme: theme,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
