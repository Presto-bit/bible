/// 每日经文壁纸风景图（与 Web 同池、同轮换规则）。
library;

const _wallpaperPhotos = [
  '1506905925346-21bda4d32df4',
  '1470071459604-3b35d21a42d3',
  '1501785880828-0b259b4e5623',
  '1439068798047-34542bb1ef0c',
  '1469474968028-56623f02e42e',
  '1441974231531-c3367d5e534c',
  '1493246507130-91f8ee536fab',
  '1472214103451-4d37b0ef8162',
  '1518173947648-bbad3982856e',
  '1464822759023-7de4bd0c5d3e',
  '1483728642382-79161adae440',
  '1475924156734-440e29a41783',
  '1549882539-0bb35bb8c388',
  '1518837699419-fbd7adccc384',
  '1465146636011-8d6e58de962e',
  '1476517467868-ce93e803421e',
  '1519682337058-a6d390860d90',
  '1419242902214-efacce1733b0',
  '1511884649111-a4f0c6dc0f48',
  '1454496527216-0b8e4255e4358',
];

/// 按每日经文 [day]（1–124 循环）选取壁纸背景。
String dailyVerseWallpaperUrl(int day) {
  final d = day < 1 ? 1 : day;
  final photo = _wallpaperPhotos[(d - 1) % _wallpaperPhotos.length];
  return 'https://images.unsplash.com/photo-$photo?auto=format&fit=crop&w=1200&q=80';
}
