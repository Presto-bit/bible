/// OSIS 书卷 id → 中文展示（对齐 Web ref_label.ts）
library;

const _bookIdToCn = <String, String>{
  'GEN': '创世记', 'EXO': '出埃及记', 'LEV': '利未记', 'NUM': '民数记', 'DEU': '申命记',
  'JOS': '约书亚记', 'JDG': '士师记', 'RUT': '路得记', '1SA': '撒母耳记上', '2SA': '撒母耳记下',
  '1KI': '列王纪上', '2KI': '列王纪下', '1CH': '历代志上', '2CH': '历代志下',
  'EZR': '以斯拉记', 'NEH': '尼希米记', 'EST': '以斯帖记', 'JOB': '约伯记', 'PSA': '诗篇',
  'PRO': '箴言', 'ECC': '传道书', 'SNG': '雅歌', 'ISA': '以赛亚书', 'JER': '耶利米书',
  'LAM': '耶利米哀歌', 'EZK': '以西结书', 'DAN': '但以理书', 'HOS': '何西阿书',
  'JOL': '约珥书', 'AMO': '阿摩司书', 'OBA': '俄巴底亚书', 'JON': '约拿书', 'MIC': '弥迦书',
  'NAH': '那鸿书', 'HAB': '哈巴谷书', 'ZEP': '西番雅书', 'HAG': '哈该书', 'ZEC': '撒迦利亚书',
  'MAL': '玛拉基书', 'MAT': '马太福音', 'MRK': '马可福音', 'LUK': '路加福音', 'JHN': '约翰福音',
  'ACT': '使徒行传', 'ROM': '罗马书', '1CO': '哥林多前书', '2CO': '哥林多后书',
  'GAL': '加拉太书', 'EPH': '以弗所书', 'PHP': '腓立比书', 'COL': '歌罗西书',
  '1TH': '帖撒罗尼迦前书', '2TH': '帖撒罗尼迦后书', '1TI': '提摩太前书',
  '2TI': '提摩太后书', 'TIT': '提多书', 'PHM': '腓利门书', 'HEB': '希伯来书',
  'JAS': '雅各书', '1PE': '彼得前书', '2PE': '彼得后书', '1JN': '约翰一书',
  '2JN': '约翰二书', '3JN': '约翰三书', 'JUD': '犹大书', 'REV': '启示录',
};

String bookIdToChineseName(String bookId) {
  return _bookIdToCn[bookId.toUpperCase()] ?? bookId;
}

String? refToChineseLabel(String? ref) {
  if (ref == null || ref.isEmpty) return null;
  final range = RegExp(r'^([A-Za-z0-9]+)\.(\d+)-([A-Za-z0-9]+)\.(\d+)$').firstMatch(ref);
  if (range != null) {
    final b1 = range.group(1)!.toUpperCase();
    final b2 = range.group(3)!.toUpperCase();
    final n1 = _bookIdToCn[b1] ?? b1;
    final n2 = _bookIdToCn[b2] ?? b2;
    if (b1 == b2) return '$n1 ${range.group(2)}–${range.group(4)}章';
    return '$n1 ${range.group(2)}章 – $n2 ${range.group(4)}章';
  }
  final m = RegExp(r'^([A-Za-z0-9]+)\.(\d+)(?:\.(\d+))?$').firstMatch(ref);
  if (m == null) return ref;
  final name = _bookIdToCn[m.group(1)!.toUpperCase()] ?? m.group(1)!;
  if (m.group(3) != null) return '$name ${m.group(2)}:${m.group(3)}';
  return '$name ${m.group(2)}章';
}

String formatGroupRefLabel(String? ref) {
  if (ref == null || ref.isEmpty) return '';
  return refToChineseLabel(ref) ?? ref;
}
