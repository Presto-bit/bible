/// 知识库列表与详情（平台文件夹：中文研经 / 公版英文注释 / 原文与词典）。
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
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  (_platform?['name'] as String?) ?? '平台知识库',
                                  style: const TextStyle(
                                      fontSize: 17,
                                      fontWeight: FontWeight.w700),
                                ),
                                const SizedBox(width: 8),
                                const Text('默认',
                                    style: TextStyle(
                                        fontSize: 11,
                                        color: AppColors.inkFaint)),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              (_platform?['description'] as String?) ?? '',
                              style: const TextStyle(
                                  fontSize: 13,
                                  height: 1.5,
                                  color: AppColors.inkFaint),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '共 ${_platform?['document_count'] ?? 0} 份 · ${folders.length} 个文件夹',
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.inkFaint),
                            ),
                            const SizedBox(height: 12),
                            FilledButton(
                              onPressed: () {
                                ref
                                    .read(assistantSeedProvider.notifier)
                                    .open(
                                      question: '请结合平台知识库帮我释经',
                                      knowledgeBaseId: 'platform',
                                    );
                                ref.read(navIndexProvider.notifier).set(2);
                                context.go('/');
                              },
                              child: const Text('用此库问小爱'),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text('文件夹',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 10),
                    ...folders.map((f) => Card(
                          margin: const EdgeInsets.only(bottom: 10),
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
                            onTap: () => context
                                .push('/knowledge-bases/${f['id']}'),
                          ),
                        )),
                  ],
                ),
    );
  }
}

class KnowledgeBaseDetailScreen extends ConsumerStatefulWidget {
  const KnowledgeBaseDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<KnowledgeBaseDetailScreen> createState() =>
      _KnowledgeBaseDetailScreenState();
}

class _KnowledgeBaseDetailScreenState
    extends ConsumerState<KnowledgeBaseDetailScreen> {
  Map<String, dynamic>? _data;
  String? _err;
  String _q = '';
  String? _openFolderId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d =
          await ref.read(assistantRepoProvider).getKnowledgeBase(widget.id);
      if (!mounted) return;
      setState(() => _data = d);
    } catch (e) {
      if (!mounted) return;
      setState(() => _err = '$e');
    }
  }

  void _askWithKb() {
    ref.read(assistantSeedProvider.notifier).open(
          question: '请结合所选知识库帮我释经',
          knowledgeBaseId: widget.id,
        );
    ref.read(navIndexProvider.notifier).set(2);
    context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    final folders = ((_data?['folders'] as List?) ?? const [])
        .cast<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((f) {
          final needle = _q.trim().toLowerCase();
          if (needle.isEmpty) return true;
          final name = '${f['name'] ?? ''}'.toLowerCase();
          final desc = '${f['description'] ?? ''}'.toLowerCase();
          return name.contains(needle) || desc.contains(needle);
        })
        .toList();
    final isPlatform = _data?['kind'] == 'platform';

    return Scaffold(
      appBar: AppBar(title: Text((_data?['name'] as String?) ?? '知识库')),
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
                      '${_data?['document_count'] ?? 0} 份资料'
                      '${_data?['updated_at'] != null ? ' · ${_formatUpdated(_data?['updated_at'] as String?)}' : ''}',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.inkFaint),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _askWithKb,
                      child: const Text('用此库问小爱'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      decoration: InputDecoration(
                        hintText: isPlatform ? '搜索文件夹…' : '搜索资料…',
                        isDense: true,
                      ),
                      onChanged: (v) => setState(() => _q = v),
                    ),
                    const SizedBox(height: 12),
                    ...folders.map((f) {
                      final docs = ((f['documents'] as List?) ?? const [])
                          .cast<Map>()
                          .map((e) => Map<String, dynamic>.from(e))
                          .toList();
                      final expanded = _openFolderId == f['id'];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: Column(
                          children: [
                            ListTile(
                              leading: Icon(
                                isPlatform
                                    ? Icons.folder_outlined
                                    : Icons.description_outlined,
                                color: AppColors.accentDeep,
                              ),
                              title: Text((f['name'] as String?) ?? ''),
                              subtitle: Text(
                                '${f['document_count'] ?? docs.length} 份 · ${_formatUpdated(f['updated_at'] as String?)}',
                              ),
                              trailing: isPlatform
                                  ? const Icon(Icons.chevron_right)
                                  : (docs.length > 1
                                      ? Icon(expanded
                                          ? Icons.expand_less
                                          : Icons.expand_more)
                                      : null),
                              onTap: () {
                                if (isPlatform) {
                                  context.push('/knowledge-bases/${f['id']}');
                                  return;
                                }
                                if (docs.length > 1) {
                                  setState(() {
                                    _openFolderId =
                                        expanded ? null : f['id'] as String?;
                                  });
                                }
                              },
                            ),
                            if (!isPlatform && expanded)
                              ...docs.map((d) => ListTile(
                                    dense: true,
                                    title: Text(
                                      (d['title'] as String?) ?? '',
                                      style: const TextStyle(fontSize: 13),
                                    ),
                                  )),
                          ],
                        ),
                      );
                    }),
                    if (folders.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(12),
                        child: Text('暂无已入库资料',
                            style: TextStyle(color: AppColors.inkFaint)),
                      ),
                  ],
                ),
    );
  }
}
