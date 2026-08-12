/// 经文主题索引：对齐 Web `daily_themes.ts` → `GET /content/themes`。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';

class DailyThemesIndex {
  const DailyThemesIndex({required this.count, required this.themes});
  final int count;
  final List<String> themes;
}

final dailyThemesProvider = FutureProvider<DailyThemesIndex>((ref) async {
  final Dio dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/content/themes');
    final data = res.data is Map
        ? Map<String, dynamic>.from(res.data as Map)
        : <String, dynamic>{};
    final themes = <String>[];
    final raw = data['themes'];
    if (raw is List) {
      for (final e in raw) {
        final s = '$e'.trim();
        if (s.isNotEmpty) themes.add(s);
      }
    }
    final count = (data['count'] is num)
        ? (data['count'] as num).toInt()
        : themes.length;
    return DailyThemesIndex(count: count, themes: themes);
  } catch (_) {
    return const DailyThemesIndex(count: 0, themes: []);
  }
});
