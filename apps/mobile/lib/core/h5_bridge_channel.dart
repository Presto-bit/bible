/// H5 → Flutter 原生通道（读经锚点去小爱等）。
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../app/app_shell.dart';

const kPeiaiJsChannel = 'PeiaiFlutter';

/// 注册 JS Channel；消息 JSON：`{ "type": "open_assistant", "ref": "…", "q": "…" }`
void attachPeiaiJsChannel(
  WebViewController controller, {
  required WidgetRef ref,
  required BuildContext context,
}) {
  controller.addJavaScriptChannel(
    kPeiaiJsChannel,
    onMessageReceived: (msg) {
      try {
        final data = jsonDecode(msg.message);
        if (data is! Map) return;
        final type = '${data['type'] ?? ''}';
        if (type == 'open_assistant') {
          final r = '${data['ref'] ?? ''}'.trim();
          final q = '${data['q'] ?? data['question'] ?? ''}'.trim();
          final loc = Uri(
            path: '/assistant',
            queryParameters: {
              if (r.isNotEmpty) 'ref': r,
              if (q.isNotEmpty) 'q': q,
            },
          ).toString();
          if (!context.mounted) return;
          ref.read(navIndexProvider.notifier).set(2);
          Future.microtask(() {
            if (context.mounted) context.push(loc);
          });
        } else if (type == 'open_reader') {
          final book = '${data['book'] ?? ''}'.trim();
          final ch = '${data['chapter'] ?? ''}'.trim();
          final loc = Uri(
            path: '/reader',
            queryParameters: {
              if (book.isNotEmpty) 'book': book,
              if (ch.isNotEmpty) 'chapter': ch,
            },
          ).toString();
          if (!context.mounted) return;
          ref.read(navIndexProvider.notifier).set(1);
          Future.microtask(() {
            if (context.mounted) context.push(loc);
          });
        } else if (type == 'close_h5') {
          if (context.mounted && context.canPop()) context.pop();
        }
      } catch (e) {
        if (kDebugMode) debugPrint('PeiaiFlutter channel: $e');
      }
    },
  );
}
