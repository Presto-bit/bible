/// 每日经文壁纸：与 PWA 同源风景图（`/daily-wallpapers/scenery-XX.jpg`）。
library;

import 'config.dart';

/// 与 `apps/web/public/daily-wallpapers/` 及 Web `daily_verse_wallpaper.ts` 一致。
const dailyWallpaperFiles = [
  'scenery-01.jpg',
  'scenery-02.jpg',
  'scenery-03.jpg',
  'scenery-04.jpg',
  'scenery-05.jpg',
  'scenery-06.jpg',
  'scenery-07.jpg',
  'scenery-08.jpg',
  'scenery-09.jpg',
  'scenery-10.jpg',
  'scenery-11.jpg',
  'scenery-12.jpg',
  'scenery-13.jpg',
  'scenery-14.jpg',
  'scenery-15.jpg',
  'scenery-16.jpg',
  'scenery-17.jpg',
  'scenery-18.jpg',
  'scenery-19.jpg',
  'scenery-20.jpg',
  'scenery-21.jpg',
  'scenery-22.jpg',
  'scenery-23.jpg',
  'scenery-24.jpg',
  'scenery-25.jpg',
  'scenery-26.jpg',
  'scenery-27.jpg',
  'scenery-28.jpg',
  'scenery-29.jpg',
  'scenery-30.jpg',
  'scenery-31.jpg',
];

/// 兼容旧引用。
const illustrationFiles = dailyWallpaperFiles;

String _wallpaperFile(int day) {
  final d = day < 1 ? 1 : day;
  return dailyWallpaperFiles[(d - 1) % dailyWallpaperFiles.length];
}

/// 按每日经文 [day] 选取壁纸；走 Web 静态资源（非 API 主机）。
String dailyVerseWallpaperUrl(int day) {
  final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
  return '$base/daily-wallpapers/${_wallpaperFile(day)}';
}

/// 活动主卡 coverUrl → 可展示 URL。
String? resolveCampaignCoverUrl(String? coverUrl) {
  final raw = (coverUrl ?? '').trim();
  if (raw.isEmpty) return null;
  if (raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('data:')) {
    return raw;
  }
  final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
  final path = raw.startsWith('/') ? raw : '/$raw';
  if (path.contains('/daily-wallpapers/') || path.startsWith('/rail-scenes/')) {
    return '$base$path';
  }
  if (RegExp(r'^scenery-\d+\.jpg$', caseSensitive: false).hasMatch(raw)) {
    return '$base/daily-wallpapers/$raw';
  }
  return '$base$path';
}
