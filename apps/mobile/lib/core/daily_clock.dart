/// 每日内容时钟：与后端 / Web `daily_clock` 对齐，按北京时间自然日 0:00 切换。
library;

import 'dart:async';

const _cnOffset = Duration(hours: 8);

/// 北京时间 yyyy-mm-dd
String chinaTodayYmd([DateTime? at]) {
  final local = at ?? DateTime.now();
  final cn = local.toUtc().add(_cnOffset);
  final y = cn.year.toString().padLeft(4, '0');
  final m = cn.month.toString().padLeft(2, '0');
  final d = cn.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

/// 距下一次北京时间 0:00 的时长。
Duration msUntilChinaMidnight([DateTime? at]) {
  final local = at ?? DateTime.now();
  final cn = local.toUtc().add(_cnOffset);
  final nextMidnightCn = DateTime.utc(cn.year, cn.month, cn.day + 1);
  final nextMidnightLocal = nextMidnightCn.subtract(_cnOffset);
  final diff = nextMidnightLocal.difference(local.toUtc());
  return diff.isNegative ? Duration.zero : diff;
}

/// 监听北京时间跨日；返回取消函数。
void Function() watchChinaDayChange(void Function() onChange) {
  var tracked = chinaTodayYmd();
  Timer? timer;

  void bumpIfNewDay() {
    final today = chinaTodayYmd();
    if (today == tracked) return;
    tracked = today;
    onChange();
  }

  void schedule() {
    timer?.cancel();
    timer = Timer(msUntilChinaMidnight() + const Duration(milliseconds: 50), () {
      bumpIfNewDay();
      schedule();
    });
  }

  schedule();
  return () => timer?.cancel();
}
