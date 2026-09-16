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
  PlatformFile? _lessonFile;
  List<PlatformFile> _mediaFiles = const [];

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

  Future<void> _pickLesson() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'docx'],
      withData: true,
      withReadStream: false,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final lower = file.name.toLowerCase();
    if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('暂不支持旧版 .doc，请另存为 .docx 后再上传')),
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
    setState(() => _lessonFile = file);
  }

  Future<void> _pickMedia() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov'],
      allowMultiple: true,
      withData: true,
      withReadStream: false,
    );
    if (result == null || result.files.isEmpty) return;
    final next = [..._mediaFiles];
    for (final file in result.files) {
      if (next.length >= 20) break;
      if (file.size > 80 * 1024 * 1024) continue;
      next.add(file);
    }
    setState(() => _mediaFiles = next);
  }

  Future<void> _upload() async {
    final file = _lessonFile;
    if (file == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请先选择课节正文')),
      );
      return;
    }
    final path = file.path;
    final bytes = file.bytes;
    if ((path == null || path.isEmpty) && (bytes == null || bytes.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('无法读取所选文件，请换一个再试')),
      );
      return;
    }
    var filename = file.name.trim();
    final lower = filename.toLowerCase();
    if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) {
      filename = '$filename.docx';
    }
    setState(() => _busy = true);
    try {
      final res = await ref.read(shelfRepoProvider).appendCollectionLesson(
            bookId: widget.bookId,
            filePath: path,
            bytes: bytes,
            filename: filename,
            title: _titleCtrl.text,
            unit: _unitCtrl.text,
            attachments: _mediaFiles.isEmpty ? null : _mediaFiles,
          );
      if (!mounted) return;
      final title = '${(res['section'] as Map?)?['title'] ?? file.name}';
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context, true);
      final mediaHint = _mediaFiles.isEmpty ? '' : '，含 ${_mediaFiles.length} 项素材';
      messenger.showSnackBar(
        SnackBar(content: Text('上传成功：已加入「$title」$mediaHint')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('上传失败：$e')),
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
            '向《${widget.bookTitle}》追加一课。正文用 PDF 或 Word；视频/图卡加到本课素材。',
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
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _busy ? null : _pickLesson,
            child: Text(_lessonFile == null ? '选择课节正文（PDF / Word）' : '正文：${_lessonFile!.name}'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _busy ? null : _pickMedia,
            child: Text(_mediaFiles.isEmpty ? '添加本课素材（可选）' : '素材 ${_mediaFiles.length} 项'),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy || _lessonFile == null ? null : _upload,
            child: Text(_busy ? '上传中…' : '上传课节'),
          ),
        ],
      ),
    );
  }
}
