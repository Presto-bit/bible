/// 首页 Hero B 运营位（与 Web hero_b_campaign 对齐）。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../core/config.dart';

class HeroBCampaign {
  HeroBCampaign({
    required this.id,
    required this.imageUrl,
    required this.alt,
    required this.href,
    this.imageUrlDark,
    this.badge,
  });

  final String id;
  final String imageUrl;
  final String? imageUrlDark;
  final String alt;
  final String href;
  final String? badge;

  factory HeroBCampaign.fromJson(Map<String, dynamic> j) => HeroBCampaign(
        id: (j['id'] ?? '') as String,
        imageUrl: (j['imageUrl'] ?? '') as String,
        imageUrlDark: j['imageUrlDark'] as String?,
        alt: (j['alt'] ?? '') as String,
        href: (j['href'] ?? '/') as String,
        badge: j['badge'] as String?,
      );

  String get imageSrc {
    if (imageUrl.startsWith('http')) return imageUrl;
    final base = AppConfig.baseUrl.replaceAll(RegExp(r'/+$'), '');
    final path = imageUrl.startsWith('/') ? imageUrl : '/$imageUrl';
    return '$base$path';
  }
}

const _cacheKey = 'presto_hero_b_campaign_v1';

HeroBCampaign? readCachedHeroBCampaign(SharedPreferences prefs) {
  final raw = prefs.getString(_cacheKey);
  if (raw == null || raw.isEmpty) return null;
  try {
    return HeroBCampaign.fromJson(
      jsonDecode(raw) as Map<String, dynamic>,
    );
  } catch (_) {
    return null;
  }
}

Future<void> writeCachedHeroBCampaign(
  SharedPreferences prefs,
  HeroBCampaign? campaign,
) async {
  if (campaign == null) {
    await prefs.remove(_cacheKey);
    return;
  }
  await prefs.setString(_cacheKey, jsonEncode({
    'id': campaign.id,
    'imageUrl': campaign.imageUrl,
    'imageUrlDark': campaign.imageUrlDark,
    'alt': campaign.alt,
    'href': campaign.href,
    'badge': campaign.badge,
  }));
}

/// 解析 Hero B href 为 go_router 路径或 Tab 索引。
int? heroBTabIndex(String href) {
  final path = Uri.tryParse(href)?.path ?? href.split('?').first;
  switch (path) {
    case '/':
      return 0;
    case '/reader':
      return 1;
    case '/assistant':
      return 2;
    case '/discover':
      return 3;
    case '/profile':
      return 4;
    default:
      return null;
  }
}

String heroBRoutePath(String href) {
  if (href.startsWith('/')) return href;
  return '/';
}
