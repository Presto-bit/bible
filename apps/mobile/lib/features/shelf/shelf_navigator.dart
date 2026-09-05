/// 书架导航统一入口：只允许绝对路径，避免 go_router 相对 push 静默失败。
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
    final q = <String, String>{
      if (tab != null && tab.isNotEmpty) 'tab': tab,
      if (finished) 'finished': '1',
    };
    final base = '/shelf/${encodeId(bookId)}';
    if (q.isEmpty) return base;
    return Uri(path: base, queryParameters: q).toString();
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('无法打开：书目无效')),
      );
      return Future<T?>.value(null);
    }
    return context.push<T>(detailPath(id, tab: tab, finished: finished));
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('无法打开：书目无效')),
      );
      return Future<T?>.value(null);
    }
    final q = <String, String>{
      if (section != null && section.trim().isNotEmpty) 'section': section.trim(),
      if (page != null && page > 0) 'page': '$page',
      if (group != null && group.isNotEmpty) 'group': group,
    };
    final path = q.isEmpty
        ? '/shelf/${encodeId(id)}/read'
        : Uri(
            path: '/shelf/${encodeId(id)}/read',
            queryParameters: q,
          ).toString();
    return context.push<T>(path);
  }

  static Future<T?> openCard<T extends Object?>(
    BuildContext context,
    ShelfLibraryStore library,
    String bookId,
  ) {
    final id = bookId.trim();
    if (id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('无法打开：书目无效')),
      );
      return Future<T?>.value(null);
    }
    return context.push<T>(library.bookCardPath(id));
  }

  static void goLibrary(BuildContext context) => context.go('/shelf');

  static void goDetail(
    BuildContext context,
    String bookId, {
    bool finished = false,
  }) {
    context.go(detailPath(bookId, finished: finished));
  }
}
