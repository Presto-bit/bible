/// 会话与身份：设备绑定 8 位用户 ID（兼容历史 10 位）+ 可选登录态。
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'device_id.dart';

class Session {
  Session(this._prefs, this._device);

  static const _kGuestId = 'presto_guest_id';
  static const _kToken = 'auth_token';
  static const _kUserId = 'presto_user_id';

  final SharedPreferences _prefs;
  final DeviceIdentity _device;
  final _secure = const FlutterSecureStorage();

  SharedPreferences get prefs => _prefs;

  static final _idUser = RegExp(r'^\d{8,10}$');

  static Future<Session> load(SharedPreferences prefs) async {
    final device = DeviceIdentity(prefs);
    final s = Session(prefs, device);
    await device.resolveGuestId();
    return s;
  }

  String get guestId => _prefs.getString(_kGuestId) ?? '';
  String? get userId => _prefs.getString(_kUserId);
  bool get isSignedIn => (userId ?? '').isNotEmpty;

  String get effectiveUserCode =>
      (userId != null && userId!.isNotEmpty) ? userId! : guestId;

  String get deviceFingerprint => _prefs.getString('presto_device_id') ?? '';

  Future<String?> token() => _secure.read(key: _kToken);

  Future<void> signIn({required String userId, required String token}) async {
    await _prefs.setString(_kUserId, userId);
    await _secure.write(key: _kToken, value: token);
  }

  Future<void> devSignIn(String userId) async {
    await _prefs.setString(_kUserId, userId);
    await _secure.delete(key: _kToken);
  }

  Future<void> signOut() async {
    await _prefs.remove(_kUserId);
    await _prefs.remove(_kGuestId);
    await _secure.delete(key: _kToken);
  }
}
