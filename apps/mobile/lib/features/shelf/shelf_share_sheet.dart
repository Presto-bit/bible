/// 书架书目分享半屏：系统分享 + 分享到群（对齐 Web ShelfShareSheet）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
import '../../core/share_card.dart';
import '../../core/theme.dart';
import 'shelf_checkin_sheet.dart';

Future<void> showShelfShareSheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String bookTitle,
  String subtitle = '',
  String author = '',
}) async {
  final action = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.paper,
    builder: (ctx) => _ShelfShareSheet(
      bookId: bookId,
      bookTitle: bookTitle,
      subtitle: subtitle,
      author: author,
    ),
  );
  if (action != 'group' || !context.mounted) return;
  await showShelfCheckinSheet(
    context,
    ref,
    bookId: bookId,
    bookTitle: bookTitle,
  );
}

String shelfBookShareUrl(String bookId) {
  final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
  final id = Uri.encodeComponent(bookId.trim());
  return '$base/shelf/$id?l1=share&l2=system_share&l3=shelf:${bookId.trim()}';
}

class _ShelfShareSheet extends StatefulWidget {
  const _ShelfShareSheet({
    required this.bookId,
    required this.bookTitle,
    this.subtitle = '',
    this.author = '',
  });

  final String bookId;
  final String bookTitle;
  final String subtitle;
  final String author;

  @override
  State<_ShelfShareSheet> createState() => _ShelfShareSheetState();
}

class _ShelfShareSheetState extends State<_ShelfShareSheet> {
  var _busy = false;
  String? _err;

  String get _title =>
      widget.bookTitle.trim().isEmpty ? '推荐书目' : widget.bookTitle.trim();

  String get _meta {
    final author = widget.author.trim();
    final subtitle = widget.subtitle.trim();
    return [
      if (author.isNotEmpty) '作者 $author',
      if (subtitle.isNotEmpty) subtitle,
    ].join(' · ');
  }

  Future<void> _shareSystem() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final url = shelfBookShareUrl(widget.bookId);
      final meta = _meta;
      final body = meta.isNotEmpty ? meta : '在彼爱书架，安静读完这一本。';
      final shareText = [
        '推荐一本好书《$_title》',
        if (meta.isNotEmpty) meta,
        '在彼爱打开，一起读。',
        url,
      ].join('\n');
      final ok = await shareBrandCard(
        context,
        ShareCardInput(
          title: '《$_title》',
          subtitle:
              widget.author.trim().isNotEmpty ? widget.author.trim() : '书架推荐',
          body: body,
          badge: '书架',
          day: 6,
          shareText: shareText,
          shareUrl: url,
          subject: '《$_title》｜彼爱',
        ),
      );
      if (ok && mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) setState(() => _err = '分享失败');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              '分享书籍',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
            ),
            const SizedBox(height: 16),
            Text(
              '《$_title》',
              style: const TextStyle(
                fontSize: 14,
                height: 1.55,
                color: AppColors.inkSoft,
              ),
            ),
            if (_meta.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                _meta,
                style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _shareSystem,
              child: Text(_busy ? '准备中…' : '系统分享'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy ? null : () => Navigator.pop(context, 'group'),
              child: const Text('分享到群'),
            ),
            if (_err != null) ...[
              const SizedBox(height: 8),
              Text(
                _err!,
                style: const TextStyle(color: AppColors.inkSoft, fontSize: 13),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
