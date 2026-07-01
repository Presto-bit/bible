/// 会话与身份：游客设备指纹（持久）+ 登录令牌（安全存储）。
///
/// local-first：未登录即为游客，AI 走 X-Guest-Id 限额；登录后带 Bearer，
/// 并由后端 /auth/merge-guest 归并游客用量。
library;

import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Session {
  Session(this._prefs);

  static const _kGuestId = 'guest_id';
  static const _kToken = 'auth_token'; // secure
  static const _kUserId = 'user_id';

  final SharedPreferences _prefs;
  final _secure = const FlutterSecureStorage();

  /// 随机 10 位数字用户ID（首位非 0）。免注册即用，作为持久身份。
  static String _gen10DigitId() {
    final r = Random();
    final sb = StringBuffer()..write(1 + r.nextInt(9));
    for (var i = 0; i < 9; i++) {
      sb.write(r.nextInt(10));
    }
    return sb.toString();
  }

  static final _id10 = RegExp(r'^\d{10}$');

  static Future<Session> load() async {
    final prefs = await SharedPreferences.getInstance();
    final s = Session(prefs);
    final g = s.guestId;
    if (g.isEmpty || !_id10.hasMatch(g)) {
      await s._prefs.setString(_kGuestId, _gen10DigitId());
    }
    return s;
  }

  String get guestId => _prefs.getString(_kGuestId) ?? '';
  String? get userId => _prefs.getString(_kUserId);
  bool get isSignedIn => (userId ?? '').isNotEmpty;

  Future<String?> token() => _secure.read(key: _kToken);

  Future<void> signIn({required String userId, required String token}) async {
    await _prefs.setString(_kUserId, userId);
    await _secure.write(key: _kToken, value: token);
  }

  /// 开发期登录：仅设置 user_id（无 orchestrator 令牌），
  /// 客户端将以 X-User-Id 直连后端（需后端 AUTH_DEV_ALLOW_USER_HEADER=true）。
  Future<void> devSignIn(String userId) async {
    await _prefs.setString(_kUserId, userId);
    await _secure.delete(key: _kToken);
  }

  Future<void> signOut() async {
    await _prefs.remove(_kUserId);
    await _secure.delete(key: _kToken);
  }
}
