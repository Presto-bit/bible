/// 小爱回答正文解析：追问剥离。
library;

final _followupSectionRe = RegExp(
    r'\n[ \t]*(?:###\s*相关追问|【相关追问】|\[相关追问\]|相关追问\s*[:：])');

String stripFollowups(String text) {
  final idx = text.indexOf(_followupSectionRe);
  return idx >= 0 ? text.substring(0, idx).trim() : text.trim();
}

String bodyText(String text) => stripFollowups(text);

List<String> followupsOf(String text) {
  final m = _followupSectionRe.firstMatch(text);
  if (m == null) return const [];
  final tail = text.substring(m.start).split('\n').skip(1);
  final out = <String>[];
  final re = RegExp(r'^\s*(?:[-*•]|\d+[.)、]|①|②|③|④|⑤)\s*(.+?)\s*$');
  for (final line in tail) {
    final match = re.firstMatch(line);
    if (match == null) continue;
    final q = match.group(1)!.replaceAll(RegExp(r'^["“]|["”]$'), '').trim();
    if (q.isNotEmpty) out.add(q);
    if (out.length >= 3) break;
  }
  return out;
}
