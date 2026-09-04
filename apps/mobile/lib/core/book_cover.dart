/// 经卷封面风景图（对齐 Web `book_cover.ts`）。
library;

import 'daily_verse_wallpaper.dart';
import 'ref_label.dart';

const _canonBookIds = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
  '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
  'OBA', 'JON', 'MIC', 'NAH', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT',
  'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP',
  'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
  '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
];

int _bookSeed(String bookId) {
  final id = bookId.toUpperCase();
  final idx = _canonBookIds.indexOf(id);
  if (idx >= 0) return idx;
  return id.runes.fold(0, (a, c) => a + c);
}

/// 按书卷稳定映射每日风景壁纸。
String bookCoverImageUrl(String bookId) {
  final file = dailyWallpaperFiles[_bookSeed(bookId) % dailyWallpaperFiles.length];
  return dailyVerseWallpaperUrl(
    dailyWallpaperFiles.indexOf(file) + 1,
  );
}

String? bookIdFromReaderHref(String href) {
  try {
    final uri = Uri.parse(href.startsWith('http') ? href : 'https://local.invalid$href');
    final book = uri.queryParameters['book'];
    if (book == null || book.isEmpty) return null;
    return book.toUpperCase();
  } catch (_) {
    return null;
  }
}

String bookCoverLabel(String bookId) => bookIdToChineseName(bookId);
