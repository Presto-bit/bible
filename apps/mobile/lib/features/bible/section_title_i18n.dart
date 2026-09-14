/// 段落小标题 zh→en（KJV UI；缺译名回退中文原文）。
library;

import 'bible_book_names.dart';
import 'outlines.dart';

Map<String, String>? _enMap;
Future<void>? _enMapFuture;

void cacheSectionTitleTranslations(Map<String, String> titles) {
  _enMap = titles;
}

Future<void> preloadSectionTitleTranslations(
  Future<Map<String, String>> Function() fetch,
) {
  if (_enMap != null) return Future.value();
  return _enMapFuture ??= fetch().then((titles) {
    cacheSectionTitleTranslations(titles);
  }).catchError((_) {
    cacheSectionTitleTranslations(const {});
  });
}

String sectionTitlesLang(String? versionId) =>
    isEnglishBibleVersion(versionId) ? 'en' : 'zh';

String localizeSectionTitle(String title, {required bool english}) {
  final zh = title.trim();
  if (!english || zh.isEmpty) return zh;
  return _enMap?[zh] ?? zh;
}

List<SectionMark> localizeSectionMarks(
  List<SectionMark> marks, {
  required bool english,
}) {
  if (!english) return marks;
  return marks
      .map(
        (m) => SectionMark(
          m.verse,
          localizeSectionTitle(m.title, english: true),
        ),
      )
      .toList();
}

List<SectionMark> outlineForVersion(
  String bookId,
  int chapter, {
  String? versionId,
}) {
  // NIV 用 API 原生英文标题；本地 outlines 是中文，切勿回落。
  if ((versionId ?? '').trim().toLowerCase() == 'niv') {
    return const [];
  }
  final marks = outlineFor(bookId, chapter);
  return localizeSectionMarks(
    marks,
    english: isEnglishBibleVersion(versionId),
  );
}
