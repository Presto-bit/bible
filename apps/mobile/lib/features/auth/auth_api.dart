/// 免注册账号 API（与 Web `api.ts` 对齐）。
library;

import 'package:dio/dio.dart';

import '../../core/device_id.dart';
import '../../core/session.dart';
import '../../core/user_storage.dart';

class AuthApi {
  AuthApi(this._dio, this._session, this._device);

  final Dio _dio;
  final Session _session;
  final DeviceIdentity _device;

  static const _kName = 'onboarding_name';
  static const _kHasPwd = 'account_has_password';
  static const _kOnboarded = 'account_onboarded';

  Map<String, String> _deviceHeaders() {
    final code = _session.effectiveUserCode;
    final device = _session.deviceFingerprint;
    return {
      if (device.isNotEmpty) 'X-Guest-Id': device,
      if (device.isNotEmpty) 'X-Device-Id': device,
      if (device.isNotEmpty) 'X-Device-Fingerprint': device,
      if (code.isNotEmpty) ...{'X-User-Code': code, 'X-User-Id': code},
    };
  }

  Future<void> ensureAccountReady() async {
    final deviceId = await _device.getDeviceId();
    try {
      final res = await _dio.get(
        '/auth/device-user',
        queryParameters: {'device_id': deviceId, 'fingerprint': deviceId},
      );
      final bound = res.data['user_code'] as String?;
      if (bound != null && bound.isNotEmpty) {
        await _device.bindGuestId(bound);
      }
    } on DioException {
      /* 离线 */
    }
    final code = await _device.resolveGuestId();
    if (_session.userId == null || _session.userId!.isEmpty) {
      await _session.devSignIn(code);
    }
    try {
      final res = await _dio.post(
        '/auth/register',
        data: {'user_code': code},
        options: Options(headers: _deviceHeaders()),
      );
      final d = res.data as Map<String, dynamic>;
      final username = d['username'] as String?;
      if (username != null && username.isNotEmpty) {
        await userPrefSetString(_session.prefs, _kName, username);
      }
      await userPrefSetBool(_session.prefs, _kHasPwd, d['has_password'] == true);
    } on DioException {
      /* 离线可用 */
    }
    try {
      await _dio.post('/auth/merge-guest', options: Options(headers: _deviceHeaders()));
    } on DioException {
      /* 忽略 */
    }
  }

  Future<bool> usernameAvailable(String username) async {
    final u = username.trim();
    if (u.isEmpty) return false;
    try {
      final res = await _dio.get('/auth/username-available', queryParameters: {'u': u});
      return res.data['available'] == true;
    } on DioException {
      return true;
    }
  }

  Future<void> setCredentials({
    required String username,
    required String password,
  }) async {
    final code = _session.effectiveUserCode;
    final u = username.trim();
    if (u.isNotEmpty) {
      await userPrefSetString(_session.prefs, _kName, u);
    }
    await userPrefSetBool(_session.prefs, _kOnboarded, true);
    await _session.devSignIn(code);
    final res = await _dio.post(
      '/auth/register',
      data: {
        'user_code': code,
        'username': u.isEmpty ? null : u,
        'password': password.isEmpty ? null : password,
      },
      options: Options(headers: _deviceHeaders()),
    );
    final d = res.data as Map<String, dynamic>;
    await userPrefSetBool(_session.prefs, _kHasPwd, d['has_password'] == true);
    try {
      await _dio.post('/auth/merge-guest', options: Options(headers: _deviceHeaders()));
    } on DioException {
      /* 忽略 */
    }
  }

  Future<String> loginWithIdentifier(String identifier, String password) async {
    final idf = identifier.trim();
    if (idf.isEmpty) throw Exception('请输入用户ID或用户名');
    final res = await _dio.post(
      '/auth/login',
      data: {
        'identifier': idf,
        'password': password.isEmpty ? null : password,
      },
      options: Options(headers: _deviceHeaders()),
    );
    final d = res.data as Map<String, dynamic>;
    final code = d['user_code'] as String;
    await _device.bindGuestId(code);
    await _session.devSignIn(code);
    final username = d['username'] as String?;
    if (username != null && username.isNotEmpty) {
      await userPrefSetString(_session.prefs, _kName, username);
    }
    await userPrefSetBool(_session.prefs, _kHasPwd, d['has_password'] == true);
    await userPrefSetBool(_session.prefs, _kOnboarded, true);
    try {
      await _dio.post('/auth/merge-guest', options: Options(headers: _deviceHeaders()));
    } on DioException {
      /* 忽略 */
    }
    return code;
  }

  Future<void> changePassword({
    required String? oldPassword,
    required String newPassword,
  }) async {
    if (newPassword.length < 6) throw Exception('密码至少 6 位');
    await _dio.post(
      '/auth/change-password',
      data: {
        'user_code': _session.effectiveUserCode,
        'old_password': oldPassword,
        'new_password': newPassword,
      },
      options: Options(headers: _deviceHeaders()),
    );
    await userPrefSetBool(_session.prefs, _kHasPwd, true);
  }

  bool get hasPassword => userPrefGetBool(_session.prefs, _kHasPwd) ?? false;
}
