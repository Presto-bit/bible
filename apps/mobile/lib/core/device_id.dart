/// 设备级标识：原生硬件 ID（Android ID / iOS identifierForVendor）+ 服务端绑定。
library;

import 'dart:convert';
import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'user_code.dart';

class DeviceIdentity {
  DeviceIdentity(this._prefs);

  static const _deviceKey = 'presto_device_id';
  static const _guestKey = 'presto_guest_id';
  static const _mapKey = 'presto_device_guest_map';
  static final _secure = FlutterSecureStorage();

  final SharedPreferences _prefs;

  Future<String> _nativeHardwareDeviceId() async {
    try {
      final plugin = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final a = await plugin.androidInfo;
        return 'hw-a-${a.id}';
      }
      if (Platform.isIOS) {
        final i = await plugin.iosInfo;
        final v = i.identifierForVendor;
        if (v != null && v.isNotEmpty) return 'hw-i-$v';
      }
    } catch (_) {
      /* 模拟器或权限异常 */
    }
    return 'hw-u-${const Uuid().v4()}';
  }

  Future<String> getDeviceId() async {
    var d = await _secure.read(key: _deviceKey);
    if (d == null || d.isEmpty) {
      d = _prefs.getString(_deviceKey);
    }
    if (d == null || d.isEmpty) {
      d = await _nativeHardwareDeviceId();
      await _secure.write(key: _deviceKey, value: d);
      await _prefs.setString(_deviceKey, d);
    }
    return d;
  }

  Map<String, String> _readMap() {
    try {
      final raw = _prefs.getString(_mapKey);
      if (raw == null || raw.isEmpty) return {};
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return m.map((k, v) => MapEntry(k, '$v'));
    } catch (_) {
      return {};
    }
  }

  Future<void> _writeMap(Map<String, String> map) async {
    await _prefs.setString(_mapKey, jsonEncode(map));
  }

  String? _boundGuestId(String deviceId) {
    final g = _readMap()[deviceId];
    if (g != null && UserCode.isUserCode(g)) return g;
    return null;
  }

  Future<void> bindGuestId(String guestCode) async {
    if (!UserCode.isUserCode(guestCode)) return;
    final deviceId = await getDeviceId();
    final map = _readMap();
    map[deviceId] = guestCode;
    await _writeMap(map);
    await _prefs.setString(_guestKey, guestCode);
  }

  /// 读取或生成设备绑定的 8 位用户 ID（保留历史 10 位）。
  Future<String> resolveGuestId() async {
    final existing = _prefs.getString(_guestKey);
    if (existing != null && UserCode.isUserCode(existing)) {
      await bindGuestId(existing);
      return existing;
    }
    final deviceId = await getDeviceId();
    final bound = _boundGuestId(deviceId);
    if (bound != null) {
      await _prefs.setString(_guestKey, bound);
      return bound;
    }
    final code = UserCode.deviceIdToUserCode(deviceId);
    await bindGuestId(code);
    return code;
  }
}
