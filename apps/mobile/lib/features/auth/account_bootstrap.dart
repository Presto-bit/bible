/// 账号就绪：启动后异步补 token，不阻塞 runApp。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'auth_api.dart';

final accountBootstrapProvider = FutureProvider<void>((ref) async {
  final dio = ref.watch(dioProvider);
  final session = ref.watch(sessionProvider);
  final device = ref.watch(deviceIdentityProvider);
  await AuthApi(dio, session, device).ensureAccountReady();
});
