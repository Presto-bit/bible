/// 知识库：入口仅平台 → 主页文件夹 → 文件夹内文件。
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

  @override
  Widget build(BuildContext context) {
    final isPlatform = _data?['kind'] == 'platform';
    final folders = ((_data?['folders'] as List?) ?? const [])
        .cast<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((f) {
          final needle = _q.trim().toLowerCase();
          if (needle.isEmpty) return true;
          return '${f['name']}'.toLowerCase().contains(needle) ||
              '${f['description']}'.toLowerCase().contains(needle);
        })
        .toList();
    final files = ((_data?['documents'] as List?) ?? const [])
        .cast<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((d) {
          final needle = _q.trim().toLowerCase();
          if (needle.isEmpty) return true;
          return '${d['title']}'.toLowerCase().contains(needle);
        })
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text((_data?['name'] as String?) ?? '知识库'),
        leading: BackButton(
          onPressed: () {
            if (isPlatform) {
              context.go('/knowledge-bases');
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
                      isPlatform
                          ? '${folders.length} 个文件夹 · ${_data?['document_count'] ?? 0} 份资料'
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
                    const SizedBox(height: 12),
                    TextField(
                      decoration: InputDecoration(
                        hintText: isPlatform ? '搜索文件夹…' : '搜索文件…',
                        isDense: true,
                      ),
                      onChanged: (v) => setState(() => _q = v),
                    ),
                    const SizedBox(height: 12),
                    Text(isPlatform ? '文件夹' : '文件',
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    if (isPlatform)
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
                              onTap: () =>
                                  context.push('/knowledge-bases/${f['id']}'),
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
                                '${d['created_at'] != null ? ' · ${_formatUpdated(d['created_at'] as String?)}' : ''}',
                              ),
                            ),
                          )),
                    if ((isPlatform && folders.isEmpty) ||
                        (!isPlatform && files.isEmpty))
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
