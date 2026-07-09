/// 收藏经节复习卡片（对齐 Web favorite_review.ts）。
library;

import 'dart:math';

import '../../core/database/app_database.dart';
import '../../core/ref_label.dart';

List<({String ref, String label})> favoriteReviewCards(
  List<Bookmark> bookmarks, {
  int limit = 3,
}) {
  if (bookmarks.isEmpty) return [];
  final refs = bookmarks.map((b) => b.ref).toList();
  final shuffled = [...refs]..shuffle(Random());
  return shuffled
      .take(limit)
      .map((ref) => (ref: ref, label: formatGroupRefLabel(ref)))
      .toList();
}
