/// 管理课节素材（对齐 Web ShelfSectionAttachmentsSheet）。
library;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'shelf_repository.dart';

Future<bool> showShelfSectionAttachmentsSheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String sectionId,
  required String sectionTitle,
  required List<ShelfAttachment> attachments,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.paper,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _SectionAttachmentsBody(
      bookId: bookId,
      sectionId: sectionId,
      sectionTitle: sectionTitle,
      initialAttachments: attachments,
    ),
  );
  return result == true;
}

class _SectionAttachmentsBody extends ConsumerStatefulWidget {
  const _SectionAttachmentsBody({
    required this.bookId,
    required this.sectionId,
    required this.sectionTitle,
    required this.initialAttachments,
  });

  final String bookId;
  final String sectionId;
  final String sectionTitle;
  final List<ShelfAttachment> initialAttachments;

  @override
  ConsumerState<_SectionAttachmentsBody> createState() => _SectionAttachmentsBodyState();
}

class _SectionAttachmentsBodyState extends ConsumerState<_SectionAttachmentsBody> {
  late List<ShelfAttachment> _items;
  var _busy = false;

  @override
  void initState() {
    super.initState();
    _items = List.of(widget.initialAttachments);
  }

  Future<void> _pickAndUpload() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov'],
      allowMultiple: true,
      withData: true,
      withReadStream: false,
    );
    if (result == null || result.files.isEmpty) return;
    setState(() => _busy = true);
    try {
      final res = await ref.read(shelfRepoProvider).appendSectionAttachments(
            bookId: widget.bookId,
            sectionId: widget.sectionId,
            files: result.files,
          );
      final next = res['attachments'];
      if (next is List) {
        _items = next
            .whereType<Map>()
            .map((e) => ShelfAttachment.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('素材已添加')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('上传失败：$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(ShelfAttachment att) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('删除「${att.title}」？'),
        content: const Text('素材将从本课移除并删除服务器文件。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final res = await ref.read(shelfRepoProvider).deleteSectionAttachment(
            widget.bookId,
            widget.sectionId,
            att.id,
          );
      final next = res['attachments'];
      if (next is List) {
        _items = next
            .whereType<Map>()
            .map((e) => ShelfAttachment.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      } else {
        _items = _items.where((x) => x.id != att.id).toList();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已删除')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('删除失败：$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('本课素材', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              ),
              IconButton(
                onPressed: _busy ? null : () => Navigator.pop(context, true),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          Text('「${widget.sectionTitle}」的图卡与视频', style: AppTypography.meta),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: _busy ? null : _pickAndUpload,
            child: Text(_busy ? '处理中…' : '添加素材'),
          ),
          const SizedBox(height: 12),
          if (_items.isEmpty)
            const Text('还没有素材', style: TextStyle(color: AppColors.inkSoft))
          else
            ..._items.map(
              (att) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text(att.title),
                  subtitle: Text(att.kind == 'video' ? '视频' : '图片'),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    onPressed: _busy ? null : () => _delete(att),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
