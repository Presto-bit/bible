import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/router.dart';
import 'core/api_client.dart';
import 'core/config.dart';
import 'core/device_id.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'features/auth/auth_api.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
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

class PrestoBibleApp extends ConsumerWidget {
  const PrestoBibleApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: '彼爱',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
