/// 书架导航统一入口：只允许绝对路径字符串，避免 Uri 二次编码与相对 push。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'shelf_library_store.dart';

class ShelfNavigator {
  ShelfNavigator._();

  static String encodeId(String id) => Uri.encodeComponent(id.trim());

  static String detailPath(
    String bookId, {
    String? tab,
    bool finished = false,
  }) {
    final parts = <String>[
      if (tab != null && tab.isNotEmpty) 'tab=${Uri.encodeComponent(tab)}',
      if (finished) 'finished=1',
    ];
    final base = '/shelf/${encodeId(bookId)}';
    return parts.isEmpty ? base : '$base?${parts.join('&')}';
  }

  static String readPath(
    String bookId, {
    String? section,
    int? page,
    String? group,
  }) {
    final parts = <String>[
      if (section != null && section.trim().isNotEmpty)
        'section=${Uri.encodeComponent(section.trim())}',
      if (page != null && page > 0) 'page=$page',
      if (group != null && group.isNotEmpty)
        'group=${Uri.encodeComponent(group)}',
    ];
    final base = '/shelf/${encodeId(bookId)}/read';
    return parts.isEmpty ? base : '$base?${parts.join('&')}';
  }

  static Future<T?> openLibrary<T extends Object?>(BuildContext context) {
    return context.push<T>('/shelf');
  }

  static Future<T?> openDetail<T extends Object?>(
    BuildContext context,
    String bookId, {
    String? tab,
    bool finished = false,
  }) {
    final id = bookId.trim();
    if (id.isEmpty) {
      _toast(context, '无法打开：书目无效');
      return Future<T?>.value(null);
    }
    final path = detailPath(id, tab: tab, finished: finished);
    debugPrint('[ShelfNavigator] openDetail $path');
    return context.push<T>(path);
  }

  static Future<T?> openRead<T extends Object?>(
    BuildContext context,
    String bookId, {
    String? section,
    int? page,
    String? group,
  }) {
    final id = bookId.trim();
    if (id.isEmpty) {
      _toast(context, '无法打开：书目无效');
      return Future<T?>.value(null);
    }
    final path = readPath(id, section: section, page: page, group: group);
    debugPrint('[ShelfNavigator] openRead $path');
    return context.push<T>(path);
  }

  static Future<T?> openCard<T extends Object?>(
    BuildContext context,
    ShelfLibraryStore library,
    String bookId,
  ) {
    final id = bookId.trim();
    if (id.isEmpty) {
      _toast(context, '无法打开：书目无效');
      return Future<T?>.value(null);
    }
    final path = library.bookCardPath(id);
    debugPrint('[ShelfNavigator] openCard $path');
    return context.push<T>(path);
  }

  static void goLibrary(BuildContext context) => context.go('/shelf');

  static void goDetail(
    BuildContext context,
    String bookId, {
    bool finished = false,
  }) {
    context.go(detailPath(bookId, finished: finished));
  }

  static void _toast(BuildContext context, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }
}
