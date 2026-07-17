/// 知识库列表与详情（平台 / 专题；我的库暂缓）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../assistant/assistant_repository.dart';
import '../assistant/assistant_seed.dart';
import '../../app/app_shell.dart';

class KnowledgeBasesScreen extends ConsumerStatefulWidget {
  const KnowledgeBasesScreen({super.key});

  @override
  ConsumerState<KnowledgeBasesScreen> createState() =>
      _KnowledgeBasesScreenState();
}

class _KnowledgeBasesScreenState extends ConsumerState<KnowledgeBasesScreen> {
  List<KnowledgeBaseSummary> _items = const [];
  String? _err;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await ref.read(assistantRepoProvider).listKnowledgeBases();
      if (!mounted) return;
      setState(() {
        _items = list;
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
    return Scaffold(
      appBar: AppBar(title: const Text('知识库')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _err != null
              ? Center(child: Text(_err!, style: const TextStyle(color: AppColors.inkFaint)))
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final kb = _items[i];
                    return Card(
                      child: ListTile(
                        title: Text(kb.name),
                        subtitle: Text(kb.description),
                        trailing: kb.isDefault
                            ? const Text('默认',
                                style: TextStyle(
                                    fontSize: 11, color: AppColors.inkFaint))
                            : const Icon(Icons.chevron_right),
                        onTap: () => context.push('/knowledge-bases/${kb.id}'),
                      ),
                    );
                  },
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
      final d = await ref.read(assistantRepoProvider).getKnowledgeBase(widget.id);
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
    final docs = ((_data?['documents'] as List?) ?? const [])
        .cast<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((d) {
          final needle = _q.trim().toLowerCase();
          if (needle.isEmpty) return true;
          final title = '${d['title'] ?? ''}'.toLowerCase();
          final st = '${d['source_type'] ?? ''}'.toLowerCase();
          return title.contains(needle) || st.contains(needle);
        })
        .toList();

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
                        style: const TextStyle(color: AppColors.inkFaint)),
                    const SizedBox(height: 8),
                    Text('资料 ${_data?['document_count'] ?? docs.length} 份',
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.inkFaint)),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _askWithKb,
                      child: const Text('用此库问小爱'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      decoration: const InputDecoration(
                        hintText: '搜索资料标题…',
                        isDense: true,
                      ),
                      onChanged: (v) => setState(() => _q = v),
                    ),
                    const SizedBox(height: 12),
                    ...docs.map((d) => Card(
                          child: ListTile(
                            title: Text((d['title'] as String?) ?? '未命名资料'),
                            subtitle: Text('${d['source_type'] ?? ''}'),
                          ),
                        )),
                    if (docs.isEmpty)
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
