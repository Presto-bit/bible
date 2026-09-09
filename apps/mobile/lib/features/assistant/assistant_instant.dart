"""小爱秒回文案与判定（对齐 PRODUCT §v2.9）。"""

bool isInstantAnswer({bool? instant, bool? cacheHit}) {
  return instant == true || cacheHit == true;
}

String instantAnswerLabel({String? cacheSource, bool local = false}) {
  if (local) return '本机缓存 · 秒回';
  if (cacheSource == 'prewarm') return '已预读这节 · 秒回';
  if (cacheSource == 'cache') return '已缓存 · 秒回';
  return '秒回';
}
