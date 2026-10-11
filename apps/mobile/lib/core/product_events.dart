/// 产品功能事件：对齐 Web `product_events.ts` 与 API `product_events` 表。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod/misc.dart' show ProviderListenable, Ref;

import 'api_client.dart';

/// Notifier 的 [Ref] 与 Widget 的 [WidgetRef] 在 3.3 不再同一类型。
T readProv<T>(Object ref, ProviderListenable<T> provider) {
  return switch (ref) {
    Ref r => r.read(provider),
    WidgetRef r => r.read(provider),
    _ => throw ArgumentError.value(ref, 'ref'),
  };
}

const productEvents = [
  'app_open',
  'daily_verse_view',
  'daily_verse_like',
  'reader_open',
  'reader_session_end',
  'plan_start',
  'plan_day_done',
  'ai_ask',
  'reminder_enable',
  'warmup_finish',
  'discover_open',
  'share_out',
  'listen_open',
  'listen_session_end',
  'prayer_finish',
  'shelf_open',
  'shelf_checkin',
  'shelf_post',
  'visual_card_view',
  'knowledge_step',
];

final _onceKeys = <String>{};

String _chinaDayKey() {
  final now = DateTime.now();
  return '${now.year.toString().padLeft(4, '0')}-'
      '${now.month.toString().padLeft(2, '0')}-'
      '${now.day.toString().padLeft(2, '0')}';
}

Future<void> trackProductEvent(
  Object ref,
  String event, {
  Map<String, Object?> props = const {},
  bool oncePerDay = false,
  String onceSalt = '',
}) async {
  if (!productEvents.contains(event)) return;
  if (oncePerDay) {
    final key = '${_chinaDayKey()}:$event:$onceSalt';
    if (_onceKeys.contains(key)) return;
    _onceKeys.add(key);
  }
  final dio = readProv(ref, dioProvider);
  final body = jsonEncode({'event': event, 'props': props, 'path': 'flutter'});
  try {
    await dio.post('/content/product-event', data: body);
  } catch (_) {}
  try {
    await dio.post('/analytics/events', data: body);
  } catch (_) {}
}
