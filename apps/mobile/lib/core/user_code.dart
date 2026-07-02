/// 8 位用户 ID 工具（与 Web `user_code.ts` 对齐；兼容历史 10 位）。
library;

class UserCode {
  static const code8 = r'^\d{8}$';
  static const code10 = r'^\d{10}$';

  static bool isUserCode(String value) =>
      RegExp(code8).hasMatch(value) || RegExp(code10).hasMatch(value);

  static int _imul(int a, int b) {
    final r = (a * b) & 0xFFFFFFFF;
    return r > 0x7FFFFFFF ? r - 0x100000000 : r;
  }

  static String deviceIdToUserCode(String deviceId) {
    var hash = 0;
    for (var i = 0; i < deviceId.length; i++) {
      hash = _imul(31, hash) + deviceId.codeUnitAt(i);
      if (hash > 0x7FFFFFFF) hash -= 0x100000000;
    }
    final n = hash.abs() % 90000000 + 10000000;
    return n.toString();
  }
}
