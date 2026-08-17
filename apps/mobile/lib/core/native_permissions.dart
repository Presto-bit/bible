/// Android 运行时权限桥（麦克风等）。
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class NativePermissions {
  NativePermissions._();

  static const _channel = MethodChannel('cn.prestoai.peiai/permissions');

  static bool get _android =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<bool> hasMicrophone() async {
    if (!_android) return true;
    try {
      final ok = await _channel.invokeMethod<bool>('hasMicrophone');
      return ok ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> requestMicrophone() async {
    if (!_android) return true;
    try {
      final ok = await _channel.invokeMethod<bool>('requestMicrophone');
      return ok ?? false;
    } catch (_) {
      return false;
    }
  }
}
