/// 与 Web `lib/client_defaults.ts` / API `/content/client-defaults` 对齐。
library;

import 'package:dio/dio.dart';

import 'config.dart';

class ClientDefaults {
  const ClientDefaults({
    required this.dailyReadingEnabledDefault,
    required this.readingDndDefault,
    required this.railSlotMax,
    required this.tabBarUnreadBadge,
  });

  final bool dailyReadingEnabledDefault;
  final bool readingDndDefault;
  final int railSlotMax;
  final bool tabBarUnreadBadge;

  static const fallback = ClientDefaults(
    dailyReadingEnabledDefault: false,
    readingDndDefault: true,
    railSlotMax: 4,
    tabBarUnreadBadge: false,
  );
}

ClientDefaults? _cached;

Future<ClientDefaults> fetchClientDefaults({Dio? dio}) async {
  if (_cached != null) return _cached!;
  final client = dio ??
      Dio(
        BaseOptions(
          baseUrl: AppConfig.baseUrl,
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 8),
        ),
      );
  try {
    final res = await client.get<Map<String, dynamic>>('/content/client-defaults');
    final data = res.data;
    if (data == null) return ClientDefaults.fallback;
    final reminders = data['reminders'] as Map<String, dynamic>? ?? {};
    final home = data['home'] as Map<String, dynamic>? ?? {};
    final discover = data['discover'] as Map<String, dynamic>? ?? {};
    _cached = ClientDefaults(
      dailyReadingEnabledDefault:
          reminders['daily_reading_enabled_default'] as bool? ?? false,
      readingDndDefault: reminders['reading_dnd_default'] as bool? ?? true,
      railSlotMax: home['rail_slot_max'] as int? ?? 4,
      tabBarUnreadBadge: discover['tab_bar_unread_badge'] as bool? ?? false,
    );
    return _cached!;
  } catch (_) {
    return ClientDefaults.fallback;
  }
}
