/// 书架阅读契约（对齐 Web shelf_reader_contract.ts）。
library;

const childrenLessonBookId = '00000000-0000-4000-8000-000000000002';

const shelfChildrenPdfBaseScale = 1.55;
const shelfChildrenPdfDefaultZoom = 1.15;

bool shelfIsChildrenLessonBook({String? id, String? title}) {
  if (id == childrenLessonBookId) return true;
  final t = title ?? '';
  return t.contains('幼儿') || t.contains('儿童');
}
