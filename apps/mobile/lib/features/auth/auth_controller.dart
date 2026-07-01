/// 认证控制器：免注册 10 位 ID + 用户名/密码本地账号 + 登录态。
///
/// local-first：未登录即用游客 10 位 ID；登录支持「用户ID」或「用户名+密码」。
/// 生产环境可叠加 orchestrator（手机号/验证码 → opaque token）。
library;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class AuthState {
  const AuthState({required this.signedIn, this.displayName});
  final bool signedIn;
  final String? displayName;
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    final s = ref.read(sessionProvider);
    return AuthState(signedIn: s.isSignedIn);
  }

  /// 开发登录：handle → 稳定 user_id，本地保存后合并游客用量。
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
    // 合并游客 AI 用量（带 X-Guest-Id + X-User-Id，由拦截器注入）
    try {
      await dio.post('/auth/merge-guest');
    } on DioException {
      // 合并失败不阻断登录
    }
    state = AuthState(signedIn: true, displayName: display);
  }

  /// 正式登录：用 orchestrator 会话令牌（opaque token）校验并持久化。
  ///
  /// 令牌来源为 orchestrator 的 Web 登录流程（手机号/验证码/三方）。校验经
  /// 后端 `/auth/whoami`（→ orchestrator `/auth/me`）取 user_id，成功后以 Bearer
  /// 持久化登录态，并合并游客用量。需后端配置 ORCHESTRATOR_BASE_URL。
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
      // 合并失败不阻断登录
    }
    state = AuthState(signedIn: true, displayName: userId);
  }

  Future<void> logout() async {
    await ref.read(sessionProvider).signOut();
    state = const AuthState(signedIn: false);
  }

  // ── 本地账号（免注册）：10 位 ID + 用户名/密码 ──
  static final _id10 = RegExp(r'^\d{10}$');
  static const _kRegistry = 'account_registry';
  static const _kName = 'onboarding_name';
  static const _kPwd = 'account_pwd';
  static const _kOnboarded = 'account_onboarded';

  String _effectiveId() {
    final s = ref.read(sessionProvider);
    return (s.userId ?? '').isNotEmpty ? s.userId! : s.guestId;
  }

  Map<String, Map<String, String>> _readRegistry() {
    final raw = ref.read(prefsProvider).getString(_kRegistry);
    if (raw == null || raw.isEmpty) return {};
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return m.map((k, v) => MapEntry(
          k, (v as Map<String, dynamic>).map((a, b) => MapEntry(a, '$b'))));
    } catch (_) {
      return {};
    }
  }

  Future<void> _writeRegistry(Map<String, Map<String, String>> r) async {
    await ref.read(prefsProvider).setString(_kRegistry, jsonEncode(r));
  }

  bool get isOnboarded =>
      ref.read(prefsProvider).getBool(_kOnboarded) ?? false;

  Future<bool> usernameAvailable(String username) async {
    final u = username.trim();
    if (u.isEmpty) return false;
    final reg = _readRegistry();
    final id = _effectiveId();
    if (reg.containsKey(u) && reg[u]!['id'] != id) return false;
    return true;
  }

  /// 设置名称 + 密码（首次引导 / 修改），绑定当前用户 ID。
  Future<void> setCredentials({required String username, required String password}) async {
    final prefs = ref.read(prefsProvider);
    final id = _effectiveId();
    final u = username.trim();
    if (u.isNotEmpty) {
      final reg = _readRegistry();
      reg.removeWhere((key, v) => v['id'] == id);
      reg[u] = {'id': id, 'pwd': password};
      await _writeRegistry(reg);
      await prefs.setString(_kName, u);
    }
    if (password.isNotEmpty) await prefs.setString(_kPwd, password);
    await prefs.setBool(_kOnboarded, true);
    // 以该 ID 作为登录身份（云端数据归属）
    await ref.read(sessionProvider).devSignIn(id);
    state = AuthState(signedIn: true, displayName: u.isNotEmpty ? u : state.displayName);
  }

  Future<void> markOnboarded() async {
    await ref.read(prefsProvider).setBool(_kOnboarded, true);
  }

  /// 登录：标识符为 10 位用户ID（可空密码），或用户名（需密码）。
  Future<void> loginWithIdentifier(String identifier, String password) async {
    final idf = identifier.trim();
    if (idf.isEmpty) throw Exception('请输入用户ID或用户名');
    final prefs = ref.read(prefsProvider);

    if (_id10.hasMatch(idf)) {
      await ref.read(sessionProvider).devSignIn(idf);
      await prefs.setBool(_kOnboarded, true);
      try {
        await ref.read(dioProvider).post('/auth/merge-guest');
      } on DioException {
        /* 忽略 */
      }
      state = AuthState(signedIn: true, displayName: prefs.getString(_kName));
      return;
    }

    if (password.isEmpty) throw Exception('用户名登录需要密码');
    final reg = _readRegistry();
    final entry = reg[idf];
    if (entry == null) throw Exception('用户名或密码错误');
    if (entry['pwd'] != password) throw Exception('用户名或密码错误');
    await ref.read(sessionProvider).devSignIn(entry['id']!);
    await prefs.setString(_kName, idf);
    await prefs.setBool(_kOnboarded, true);
    state = AuthState(signedIn: true, displayName: idf);
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
