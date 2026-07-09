/// 认证控制器：免注册 10 位 ID + 用户名/密码（服务端校验）。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/sync/sync_controller.dart';

class AuthState {
  const AuthState({required this.signedIn, this.displayName, this.hasPassword = false});
  final bool signedIn;
  final String? displayName;
  final bool hasPassword;
}

class AuthController extends Notifier<AuthState> {
  static const _kName = 'onboarding_name';
  static const _kOnboarded = 'account_onboarded';

  @override
  AuthState build() {
    final s = ref.read(sessionProvider);
    final prefs = ref.read(prefsProvider);
    return AuthState(
      signedIn: s.isSignedIn,
      displayName: prefs.getString(_kName),
      hasPassword: ref.read(authApiProvider).hasPassword,
    );
  }

  Future<void> ensureAccountReady() async {
    await ref.read(authApiProvider).ensureAccountReady();
    _refresh();
  }

  Future<void> _afterAuth() async {
    try {
      await ref.read(syncControllerProvider.notifier).runSync(force: true);
    } catch (_) {}
    _refresh();
  }

  Future<void> login(String handle, {String? displayName}) async {
    final dio = ref.read(dioProvider);
    final res = await dio.post('/auth/dev-login', data: {
      'handle': handle.trim(),
      if (displayName != null && displayName.trim().isNotEmpty)
        'display_name': displayName.trim(),
    });
    final userId = res.data['user_id'] as String;
    final display = (res.data['display_name'] ?? handle) as String;
    await ref.read(sessionProvider).devSignIn(userId);
    try {
      await dio.post('/auth/merge-guest');
    } on DioException {
      /* 忽略 */
    }
    await _afterAuth();
    state = AuthState(signedIn: true, displayName: display);
  }

  Future<void> loginWithToken(String token) async {
    final dio = ref.read(dioProvider);
    final res = await dio.get(
      '/auth/whoami',
      options: Options(headers: {'Authorization': 'Bearer ${token.trim()}'}),
    );
    final userId = res.data['user_id'] as String;
    await ref.read(sessionProvider).signIn(userId: userId, token: token.trim());
    try {
      await dio.post('/auth/merge-guest');
    } on DioException {
      /* 忽略 */
    }
    await _afterAuth();
    state = AuthState(signedIn: true, displayName: userId);
  }

  Future<void> logout() async {
    await ref.read(sessionProvider).signOut();
    state = AuthState(
      signedIn: false,
      displayName: ref.read(prefsProvider).getString(_kName),
      hasPassword: ref.read(authApiProvider).hasPassword,
    );
  }

  bool get isOnboarded =>
      ref.read(prefsProvider).getBool(_kOnboarded) ?? false;

  Future<bool> usernameAvailable(String username) =>
      ref.read(authApiProvider).usernameAvailable(username);

  Future<void> setCredentials({
    required String username,
    required String password,
  }) async {
    await ref.read(authApiProvider).setCredentials(
          username: username,
          password: password,
        );
    await _afterAuth();
  }

  Future<void> markOnboarded() async {
    await ref.read(prefsProvider).setBool(_kOnboarded, true);
  }

  Future<void> loginWithIdentifier(String identifier, String password) async {
    await ref.read(authApiProvider).loginWithIdentifier(identifier, password);
    await _afterAuth();
  }

  Future<void> changePassword({
    required String? oldPassword,
    required String newPassword,
  }) async {
    await ref.read(authApiProvider).changePassword(
          oldPassword: oldPassword,
          newPassword: newPassword,
        );
    _refresh();
  }

  void _refresh() {
    final prefs = ref.read(prefsProvider);
    state = AuthState(
      signedIn: ref.read(sessionProvider).isSignedIn,
      displayName: prefs.getString(_kName),
      hasPassword: ref.read(authApiProvider).hasPassword,
    );
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
