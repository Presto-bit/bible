/// 首页问候前缀，与 Web `lib/home_greeting.ts` 对齐。
/// 优先级：节期/教会年当天 > 欢迎回来(≥3天) > 主日 > 时段。
library;

/// 与 Web 对齐的时段问候。
String timeOfDayGreeting([DateTime? date]) {
  final hour = (date ?? DateTime.now()).hour;
  if (hour < 5) return '夜深了';
  if (hour < 8) return '清晨好';
  if (hour < 11) return '上午好';
  if (hour < 13) return '中午好';
  if (hour < 17) return '下午好';
  if (hour < 19) return '傍晚好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

/// 主日按时段。
String sundayGreeting([DateTime? date]) {
  final hour = (date ?? DateTime.now()).hour;
  if (hour < 13) return '主日安好';
  if (hour < 19) return '主日平安';
  return '主日晚安';
}

/// 西方教会历：复活节（格里历算法）。
DateTime westernEasterSunday(int year) {
  final a = year % 19;
  final b = year ~/ 100;
  final c = year % 100;
  final d = b ~/ 4;
  final e = b % 4;
  final f = (b + 8) ~/ 25;
  final g = (b - f + 1) ~/ 3;
  final h = (19 * a + b - d - g + 15) % 30;
  final i = c ~/ 4;
  final k = c % 4;
  final l = (32 + 2 * e + 2 * i - h - k) % 7;
  final m = (a + 11 * h + 22 * l) ~/ 451;
  final month = (h + l - 7 * m + 114) ~/ 31;
  final day = ((h + l - 7 * m + 114) % 31) + 1;
  return DateTime(year, month, day);
}

String _ymdKey(DateTime d) {
  final m = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '${d.year}-$m-$day';
}

DateTime _addDays(DateTime d, int n) =>
    DateTime(d.year, d.month, d.day).add(Duration(days: n));

/// 节期 / 教会年当天问候；非节日返回 null。
String? liturgicalGreeting([DateTime? date]) {
  final d = date ?? DateTime.now();
  final y = d.year;
  final m = d.month;
  final day = d.day;
  final key = _ymdKey(d);

  if (m == 1 && day == 1) return '新年蒙福';
  if (m == 12 && (day == 24 || day == 25)) return '圣诞安好';
  if (m == 9 && day <= 7) return '感恩的日子';

  final easter = westernEasterSunday(y);
  final goodFriday = _addDays(easter, -2);
  if (key == _ymdKey(goodFriday)) return '纪念十架';
  if (key == _ymdKey(easter)) return '复活喜乐';

  return null;
}

/// 首页展示用问候（节期 > 欢迎回来 > 主日 > 时段）。
/// [welcomeBack] 由调用方根据读经断签（≥3 天）传入。
String homeGreeting({DateTime? date, bool welcomeBack = false}) {
  final d = date ?? DateTime.now();
  final liturgical = liturgicalGreeting(d);
  if (liturgical != null) return liturgical;
  if (welcomeBack) return '欢迎回来';
  if (d.weekday == DateTime.sunday) return sundayGreeting(d);
  return timeOfDayGreeting(d);
}

/// 每日经文正文装饰引号（避免源文已有直角引号时双套）。
String formatDailyVerseQuote(String text) {
  var inner = text.trim();
  inner = inner.replaceFirst(RegExp(r'^[「『]+'), '');
  inner = inner.replaceFirst(RegExp(r'[」』]+$'), '');
  return '「$inner」';
}
