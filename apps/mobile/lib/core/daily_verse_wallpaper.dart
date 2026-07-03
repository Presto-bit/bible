/// 每日经文壁纸：同源静态插画（按 day 轮换，离线可用）。
library;

import 'config.dart';

const illustrationFiles = [
  'theme_盼望.svg',
  'theme_平安.svg',
  'theme_信靠.svg',
  'theme_力量.svg',
  'theme_爱.svg',
  'theme_喜乐.svg',
  'theme_智慧.svg',
  'theme_引导.svg',
  'theme_安慰.svg',
  'theme_赦免.svg',
  'theme_感恩.svg',
  'theme_敬拜.svg',
  'theme_恩典.svg',
  'theme_应许.svg',
  'theme_勇气.svg',
  'theme_谦卑.svg',
  'theme_祷告.svg',
  'theme_忍耐.svg',
  'theme_永生.svg',
  'theme_顺服.svg',
];

/// 按每日经文 [day]（1–124 循环）选取壁纸背景。
String dailyVerseWallpaperUrl(int day) {
  final d = day < 1 ? 1 : day;
  final file = illustrationFiles[(d - 1) % illustrationFiles.length];
  return '${AppConfig.baseUrl}/content/illustrations/$file';
}
