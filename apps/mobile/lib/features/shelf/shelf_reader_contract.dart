/// 书架阅读契约（对齐 Web shelf_reader_contract.ts）。
library;

import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'shelf_repository.dart';

const childrenLessonBookId = '00000000-0000-4000-8000-000000000002';

const shelfChildrenPdfBaseScale = 1.55;
const shelfChildrenPdfDefaultZoom = 1.15;

const shelfPdfZoomKey = 'shelf_pdf_zoom_v1';
const shelfPdfZoomByBookKey = 'shelf_pdf_zoom_by_book_v1';
const shelfPdfZoomHintKey = 'shelf_pdf_zoom_hint_v1';
const shelfPdfZoomDefault = 1.25;
const shelfPdfZoomMin = 1.0;
const shelfPdfZoomMax = 2.0;

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

double clampShelfPdfZoom(double z) {
  if (z.isNaN || z.isInfinite) return shelfPdfZoomDefault;
  return z.clamp(shelfPdfZoomMin, shelfPdfZoomMax);
}

Map<String, double> _readShelfPdfZoomMap(SharedPreferences prefs) {
  final raw = prefs.getString(shelfPdfZoomByBookKey);
  if (raw == null || raw.isEmpty) return {};
  try {
    final parsed = jsonDecode(raw);
    if (parsed is! Map) return {};
    final out = <String, double>{};
    for (final e in parsed.entries) {
      final n = e.value is num ? (e.value as num).toDouble() : double.tryParse('${e.value}');
      if (n != null && n.isFinite) out['${e.key}'] = clampShelfPdfZoom(n);
    }
    return out;
  } catch (_) {
    return {};
  }
}

/// 读取 PDF 缩放：优先按书 → 全局 → fallback。
double readShelfPdfZoom(
  SharedPreferences prefs, {
  String? bookId,
  double fallback = shelfPdfZoomDefault,
}) {
  final id = (bookId ?? '').trim();
  if (id.isNotEmpty) {
    final byBook = _readShelfPdfZoomMap(prefs)[id];
    if (byBook != null) return byBook;
  }
  final raw = prefs.getString(shelfPdfZoomKey);
  if (raw != null) {
    final n = double.tryParse(raw);
    if (n != null && n.isFinite) return clampShelfPdfZoom(n);
  }
  return clampShelfPdfZoom(fallback);
}

/// 写入 PDF 缩放；有 bookId 时按书记住，并同步全局默认。
Future<void> writeShelfPdfZoom(
  SharedPreferences prefs,
  double zoom, {
  String? bookId,
}) async {
  final z = clampShelfPdfZoom(zoom);
  await prefs.setString(shelfPdfZoomKey, '$z');
  final id = (bookId ?? '').trim();
  if (id.isEmpty) return;
  final map = _readShelfPdfZoomMap(prefs);
  map[id] = z;
  await prefs.setString(shelfPdfZoomByBookKey, jsonEncode(map));
}

/// PDF 首次阅读轻提示（只弹一次）。
bool maybeShowShelfPdfZoomHint(
  SharedPreferences prefs,
  void Function(String msg) flash,
) {
  if (prefs.getString(shelfPdfZoomHintKey) != null) return false;
  unawaited(prefs.setString(shelfPdfZoomHintKey, '1'));
  flash('双指捏合可放大，缩放会按书记住');
  return true;
}
