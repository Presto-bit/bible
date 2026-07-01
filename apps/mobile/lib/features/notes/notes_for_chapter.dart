/// 将笔记按经节映射到当前章。
library;

import '../../core/database/app_database.dart';

Map<int, List<Note>> notesForChapter(
  List<Note> notes,
  String bookId,
  int chapter,
) {
  final map = <int, List<Note>>{};
  void add(int verse, Note note) {
    if (verse < 1) return;
    map.putIfAbsent(verse, () => []).add(note);
  }

  final bid = bookId.toUpperCase();
  for (final note in notes) {
    final ref = note.ref;
    if (ref == null || ref.isEmpty || note.deleted) continue;
    final parts = ref.split('.');
    if (parts.length < 2) continue;
    if (parts[0].toUpperCase() != bid) continue;
    if (int.tryParse(parts[1]) != chapter) continue;
    if (parts.length < 3 || parts[2].isEmpty) {
      add(1, note);
      continue;
    }
    final vp = parts[2];
    if (vp.contains('-')) {
      final ab = vp.split('-');
      final from = int.tryParse(ab[0]) ?? 0;
      final to = int.tryParse(ab.length > 1 ? ab[1] : ab[0]) ?? from;
      for (var v = from; v <= to; v++) {
        add(v, note);
      }
    } else {
      add(int.tryParse(vp) ?? 0, note);
    }
  }
  return map;
}
