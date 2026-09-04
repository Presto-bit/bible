/// 书柜管理员：向合集追加课节（对齐 PWA ShelfAppendLessonSheet）。
library;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'shelf_repository.dart';

Future<bool> showShelfAppendLessonSheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String bookTitle,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.paper,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _AppendLessonBody(
      bookId: bookId,
      bookTitle: bookTitle,
    ),
  );
  return result == true;
}

class _AppendLessonBody extends ConsumerStatefulWidget {
  const _AppendLessonBody({required this.bookId, required this.bookTitle});

  final String bookId;
  final String bookTitle;

  @override
  ConsumerState<_AppendLessonBody> createState() => _AppendLessonBodyState();
}

class _AppendLessonBodyState extends ConsumerState<_AppendLessonBody> {
  final _titleCtrl = TextEditingController();
  final _unitCtrl = TextEditingController();
  var _busy = false;
  List<String> _units = const [];

  @override
  void initState() {
    super.initState();
    _loadUnits();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _unitCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadUnits() async {
    final units = await ref.read(shelfRepoProvider).listCollectionUnits(widget.bookId);
    if (mounted) setState(() => _units = units);
  }

  Future<void> _pickAndUpload() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'docx'],
      withData: true,
      withReadStream: false,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final path = file.path;
    final bytes = file.bytes;
    if ((path == null || path.isEmpty) && (bytes == null || bytes.isEmpty)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('无法读取所选文件，请换一个再试')),
      );
      return;
    }
    if ((file.size) > 50 * 1024 * 1024) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('单课不超过 50MB')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await ref.read(shelfRepoProvider).appendCollectionLesson(
            bookId: widget.bookId,
            filePath: path,
            bytes: bytes,
            filename: file.name,
            title: _titleCtrl.text,
            unit: _unitCtrl.text,
          );
      if (!mounted) return;
      final title = '${(res['section'] as Map?)?['title'] ?? file.name}';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('已加入「$title」')),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('添加失败：$e')),
      );
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
                child: Text('添加课节', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              ),
              IconButton(
                onPressed: _busy ? null : () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          Text(
            '向《${widget.bookTitle}》追加一课。支持 PDF / Word，全员可见。',
            style: AppTypography.meta,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _titleCtrl,
            enabled: !_busy,
            decoration: const InputDecoration(
              labelText: '标题（可选）',
              hintText: '默认用文件名',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _unitCtrl,
            enabled: !_busy,
            decoration: InputDecoration(
              labelText: '单元（可选）',
              hintText: '如：第四单元',
              border: const OutlineInputBorder(),
              suffixIcon: _units.isEmpty
                  ? null
                  : PopupMenuButton<String>(
                      icon: const Icon(Icons.arrow_drop_down),
                      onSelected: (v) => _unitCtrl.text = v,
                      itemBuilder: (_) => [
                        for (final u in _units) PopupMenuItem(value: u, child: Text(u)),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _pickAndUpload,
            child: Text(_busy ? '上传中…' : '选择 PDF / Word'),
          ),
        ],
      ),
    );
  }
}
