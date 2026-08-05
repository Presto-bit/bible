import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/router.dart';
import 'core/api_client.dart';
import 'core/config.dart';
import 'core/deep_link.dart';
import 'core/device_id.dart';
import 'core/notifications.dart';
import 'core/session.dart';
import 'core/app_theme.dart';
import 'core/theme.dart';
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
