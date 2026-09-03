/// 书架阅读契约（对齐 Web shelf_reader_contract.ts）。
library;

import 'shelf_repository.dart';

const childrenLessonBookId = '00000000-0000-4000-8000-000000000002';

const shelfChildrenPdfBaseScale = 1.55;
const shelfChildrenPdfDefaultZoom = 1.15;

bool shelfIsChildrenLessonBook({String? id, String? title}) {
  if (id == childrenLessonBookId) return true;
  final t = title ?? '';
  return t.contains('幼儿') || t.contains('儿童');
}

/// 与 Web shelfSectionIsPdf 一致：有可用 HTML 时按流式竖滚。
bool shelfSectionIsPdf(ShelfSection section) {
  if (section.html.trim().isNotEmpty && !section.docxHtmlLooksLegacy) return false;
  return section.hasPdfPrimary;
}

bool shelfSectionUsesFlow(ShelfSection section) => !shelfSectionIsPdf(section);
