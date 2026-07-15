/// 私信线程（对齐 Web /discover/dm/[id]）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'social_repository.dart';

class DmThreadScreen extends ConsumerStatefulWidget {
  const DmThreadScreen({super.key, required this.threadId});
  final String threadId;

  @override
  ConsumerState<DmThreadScreen> createState() => _DmThreadScreenState();
}

class _DmThreadScreenState extends ConsumerState<DmThreadScreen> {
  final _c = TextEditingController();
  var _busy = false;
  List<DmMessage> _msgs = const [];
  String? _err;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    try {
      final list =
          await ref.read(socialRepoProvider).dmMessages(widget.threadId);
      await ref
          .read(socialRepoProvider)
          .patchConversationState('dm', widget.threadId);
      if (!mounted) return;
      setState(() {
        _msgs = list;
        _err = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _err = '$e');
    }
  }

  Future<void> _send() async {
    final body = _c.text.trim();
    if (body.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(socialRepoProvider).sendDm(widget.threadId, body);
      _c.clear();
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _err = '发送失败：$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('私信')),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('私信仅保留近 30 天',
                  style: TextStyle(fontSize: 12, color: AppColors.inkSoft)),
            ),
          ),
          if (_err != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(_err!, style: TextStyle(color: Colors.red.shade700)),
            ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: _msgs.length,
              itemBuilder: (_, i) {
                final m = _msgs[i];
                final mine = m.mine;
                return Align(
                  alignment:
                      mine ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    constraints: BoxConstraints(
                        maxWidth: MediaQuery.of(context).size.width * 0.75),
                    decoration: BoxDecoration(
                      color: mine
                          ? AppColors.accent.withValues(alpha: 0.25)
                          : const Color(0xFFF3F1EC),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      m.recalled ? '消息已撤回' : (m.body ?? ''),
                      style: TextStyle(
                        color: m.recalled ? AppColors.inkSoft : AppColors.ink,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _c,
                      decoration: const InputDecoration(
                        hintText: '发消息…',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _busy ? null : _send,
                    child: Text(_busy ? '…' : '发送'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
