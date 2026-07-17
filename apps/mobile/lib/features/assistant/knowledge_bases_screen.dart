/// 知识库：入口仅平台 → 主页文件夹 →（英文注释二级）→ 文件预览。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../assistant/assistant_repository.dart';
import '../assistant/assistant_seed.dart';
import '../../app/app_shell.dart';

String _formatUpdated(String? iso) {
  if (iso == null || iso.isEmpty) return '暂无更新';
  try {
    final d = DateTime.parse(iso).toLocal();
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '更新于 ${d.year}-$m-$day';
  } catch (_) {
    return '暂无更新';
  }
}

class KnowledgeBasesScreen extends ConsumerStatefulWidget {
  const KnowledgeBasesScreen({super.key});

  @override
  ConsumerState<KnowledgeBasesScreen> createState() =>
      _KnowledgeBasesScreenState();
}

class _KnowledgeBasesScreenState extends ConsumerState<KnowledgeBasesScreen> {
  Map<String, dynamic>? _platform;
  String? _err;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await ref.read(assistantRepoProvider).browseKnowledgeBases();
      if (!mounted) return;
      setState(() {
        _platform = data['platform'] as Map<String, dynamic>?;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _err = '$e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final folders = ((_platform?['folders'] as List?) ?? const [])
        .cast<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    return Scaffold(
      appBar: AppBar(title: const Text('知识库')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _err != null
              ? Center(
                  child: Text(_err!,
                      style: const TextStyle(color: AppColors.inkFaint)))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const Text(
                      '浏览平台资料；小爱默认使用平台知识库检索。',
                      style: TextStyle(fontSize: 13, color: AppColors.inkFaint),
                    ),
                    const SizedBox(height: 12),
                    Card(
                      child: ListTile(
                        title: Row(
                          children: [
                            Text(
                              (_platform?['name'] as String?) ?? '平台知识库',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 16),
                            ),
                            const SizedBox(width: 8),
                            const Text('默认',
                                style: TextStyle(
                                    fontSize: 11, color: AppColors.inkFaint)),
                          ],
                        ),
                        subtitle: Text(
                          '${_platform?['description'] ?? ''}\n'
                          '${folders.length} 个文件夹 · 共 ${_platform?['document_count'] ?? 0} 份资料',
                        ),
                        isThreeLine: true,
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.push('/knowledge-bases/platform'),
                      ),
                    ),
                  ],
                ),
    );
  }
}

class KnowledgeBaseDetailScreen extends ConsumerStatefulWidget {
  const KnowledgeBaseDetailScreen({super.key, required this.id, this.group});
  final String id;
  final String? group;

  @override
  ConsumerState<KnowledgeBaseDetailScreen> createState() =>
      _KnowledgeBaseDetailScreenState();
}

class _KnowledgeBaseDetailScreenState
    extends ConsumerState<KnowledgeBaseDetailScreen> {
  Map<String, dynamic>? _data;
  String? _err;
  String _q = '';
  bool _searchOpen = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant KnowledgeBaseDetailScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id || oldWidget.group != widget.group) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _err = null;
      _data = null;
    });
    try {
      final d = await ref.read(assistantRepoProvider).getKnowledgeBase(
            widget.id,
            group: widget.group,
          );
      if (!mounted) return;
      setState(() => _data = d);
    } catch (e) {
      if (!mounted) return;
      setState(() => _err = '$e');
    }
  }

  Future<void> _preview(String docId) async {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _DocPreviewSheet(documentId: docId),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isPlatform = _data?['kind'] == 'platform';
    final hasSub = _data?['has_subfolders'] == true;
    final foldersRaw = ((_data?['folders'] as List?) ?? const [])
        .cast<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final docsRaw = ((_data?['documents'] as List?) ?? const [])
        .cast<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final showFolders =
        isPlatform || hasSub || (foldersRaw.isNotEmpty && docsRaw.isEmpty);

    final folders = foldersRaw.where((f) {
      final needle = _q.trim().toLowerCase();
      if (needle.isEmpty) return true;
      return '${f['name']}'.toLowerCase().contains(needle) ||
          '${f['description']}'.toLowerCase().contains(needle);
    }).toList();
    final files = docsRaw.where((d) {
      final needle = _q.trim().toLowerCase();
      if (needle.isEmpty) return true;
      return '${d['title']}'.toLowerCase().contains(needle);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text((_data?['name'] as String?) ?? '知识库'),
        actions: [
          IconButton(
            tooltip: '搜索',
            icon: Icon(
              _searchOpen ? Icons.search_off : Icons.search,
              color: _searchOpen ? AppColors.accentDeep : null,
            ),
            onPressed: () => setState(() {
              _searchOpen = !_searchOpen;
              if (!_searchOpen) _q = '';
            }),
          ),
        ],
        leading: BackButton(
          onPressed: () {
            if (isPlatform) {
              context.go('/knowledge-bases');
            } else if ((widget.group ?? '').isNotEmpty) {
              context.go('/knowledge-bases/${widget.id}');
            } else {
              context.go('/knowledge-bases/platform');
            }
          },
        ),
      ),
      body: _err != null
          ? Center(child: Text(_err!))
          : _data == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text((_data?['description'] as String?) ?? '',
                        style: const TextStyle(
                            color: AppColors.inkFaint, height: 1.5)),
                    const SizedBox(height: 8),
                    Text(
                      showFolders
                          ? '${foldersRaw.length} 个文件夹 · ${_data?['document_count'] ?? 0} 份资料'
                          : '${_data?['document_count'] ?? 0} 份资料'
                              '${_data?['updated_at'] != null ? ' · ${_formatUpdated(_data?['updated_at'] as String?)}' : ''}',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.inkFaint),
                    ),
                    if (isPlatform) ...[
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: () {
                          ref.read(assistantSeedProvider.notifier).open(
                                question: '请结合平台知识库帮我释经',
                                knowledgeBaseId: 'platform',
                              );
                          ref.read(navIndexProvider.notifier).set(2);
                          context.go('/');
                        },
                        child: const Text('用此库问小爱'),
                      ),
                    ],
                    if (_searchOpen) ...[
                      const SizedBox(height: 12),
                      TextField(
                        autofocus: true,
                        decoration: InputDecoration(
                          hintText: showFolders ? '搜索文件夹…' : '搜索文件…',
                          isDense: true,
                        ),
                        onChanged: (v) => setState(() => _q = v),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Text(showFolders ? '文件夹' : '文件',
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    if (showFolders)
                      ...folders.map((f) => Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: const Icon(Icons.folder_outlined,
                                  color: AppColors.accentDeep),
                              title: Text((f['name'] as String?) ?? ''),
                              subtitle: Text(
                                '${f['description'] ?? ''}\n'
                                '${f['document_count'] ?? 0} 份 · ${_formatUpdated(f['updated_at'] as String?)}',
                              ),
                              isThreeLine: true,
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () {
                                if (isPlatform) {
                                  context.push('/knowledge-bases/${f['id']}');
                                } else {
                                  context.push(
                                    '/knowledge-bases/${widget.id}?group=${f['id']}',
                                  );
                                }
                              },
                            ),
                          ))
                    else
                      ...files.map((d) => Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: const Icon(Icons.description_outlined,
                                  color: AppColors.accentDeep),
                              title: Text((d['title'] as String?) ?? '未命名资料'),
                              subtitle: Text(
                                '${d['source_type'] ?? ''}'
                                '${d['created_at'] != null ? ' · ${_formatUpdated(d['created_at'] as String?)}' : ''}'
                                ' · 预览',
                              ),
                              onTap: () => _preview('${d['id']}'),
                            ),
                          )),
                    if ((showFolders && folders.isEmpty) ||
                        (!showFolders && files.isEmpty))
                      const Padding(
                        padding: EdgeInsets.all(12),
                        child: Text('暂无内容',
                            style: TextStyle(color: AppColors.inkFaint)),
                      ),
                  ],
                ),
    );
  }
}

class _DocPreviewSheet extends ConsumerStatefulWidget {
  const _DocPreviewSheet({required this.documentId});
  final String documentId;

  @override
  ConsumerState<_DocPreviewSheet> createState() => _DocPreviewSheetState();
}

class _DocPreviewSheetState extends ConsumerState<_DocPreviewSheet> {
  Map<String, dynamic>? _data;
  String? _err;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await ref
          .read(assistantRepoProvider)
          .previewKnowledgeDocument(widget.documentId);
      if (!mounted) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _err = '$e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final content = (_data?['content'] as String?) ?? '';
    final sizeBytes = _data?['size_bytes'];
    final truncated = _data?['truncated'] == true;
    String? meta;
    if (_data != null) {
      final parts = <String>[];
      final st = (_data?['source_type'] as String?) ?? '';
      if (st.isNotEmpty) parts.add(st);
      if (sizeBytes is num) {
        final kb = (sizeBytes / 1024).round().clamp(1, 1 << 30);
        parts.add('$kb KB');
      }
      if (truncated) parts.add('已截断');
      meta = parts.isEmpty ? null : parts.join(' · ');
    }
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.8,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                (_data?['title'] as String?) ??
                    (_loading ? '加载中…' : '资料预览'),
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 16),
              ),
              if (meta != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4, bottom: 8),
                  child: Text(
                    meta,
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.inkFaint),
                  ),
                ),
              if (_loading)
                const Expanded(
                    child: Center(child: CircularProgressIndicator()))
              else if (_err != null)
                Expanded(child: Text(_err!))
              else if (content.trim().isEmpty)
                const Expanded(
                  child: Text('文件为空或源文件不可读。',
                      style: TextStyle(color: AppColors.inkFaint)),
                )
              else
                Expanded(
                  child: SingleChildScrollView(
                    child: SelectableText(
                      content,
                      style: const TextStyle(fontSize: 14, height: 1.6),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
