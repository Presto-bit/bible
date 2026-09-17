/// 产品功能事件：对齐 Web `product_events.ts` 与 API `product_events` 表。
library;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';

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
  Ref ref,
  String event, {
  Map<String, Object?> props = const {},
  bool oncePerDay = false,
  String onceSalt = '',
}) {
  if (!productEvents.contains(event)) return Future.value();
  if (oncePerDay) {
    final key = '${_chinaDayKey()}:$event:$onceSalt';
    if (_onceKeys.contains(key)) return Future.value();
    _onceKeys.add(key);
  }
  final dio = ref.read(dioProvider);
  final body = jsonEncode({'event': event, 'props': props, 'path': 'flutter'});
  return Future.wait([
    dio.post('/content/product-event', data: body).onError((_, __) => null),
    dio.post('/analytics/events', data: body).onError((_, __) => null),
  ]);
}
