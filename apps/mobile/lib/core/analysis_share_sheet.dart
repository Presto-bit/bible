/// 小爱解读分享半屏（对齐 Web `AnalysisShareSheet.tsx`）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../features/assistant/assistant_format.dart';
import '../features/assistant/assistant_repository.dart';
import 'config.dart';
import 'share_card.dart';
import 'theme.dart';

String extractShareInsight(String answerText, String refLabel) {
  final clean = stripFollowups(answerText).trim();
  if (clean.isEmpty) return refLabel.trim().isEmpty ? '小爱的解读' : refLabel.trim();
  final noMd = clean
      .replaceAll(RegExp(r'#{1,6}\s*'), '')
      .replaceAll(RegExp(r'[*_`>~]'), '')
      .replaceAll(RegExp(r'【[^】]+】'), '')
      .replaceAll(RegExp(r'［\d{1,2}］|\[\d{1,2}\]'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  if (noMd.length <= 80) return noMd;
  return '${noMd.substring(0, 79)}…';
}

Future<void> showAnalysisShareSheet(
  BuildContext context,
  WidgetRef ref, {
  required String refLabel,
  String? refParam,
  required String answerText,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.paper,
    builder: (ctx) => _AnalysisShareSheet(
      refLabel: refLabel,
      refParam: refParam,
      answerText: answerText,
    ),
  );
}

class _AnalysisShareSheet extends ConsumerStatefulWidget {
  const _AnalysisShareSheet({
    required this.refLabel,
    required this.refParam,
    required this.answerText,
  });

  final String refLabel;
  final String? refParam;
  final String answerText;

  @override
  ConsumerState<_AnalysisShareSheet> createState() =>
      _AnalysisShareSheetState();
}

class _AnalysisShareSheetState extends ConsumerState<_AnalysisShareSheet> {
  var _busy = false;
  String? _err;

  String get _clean => stripFollowups(widget.answerText).trim();

  String get _preview =>
      extractShareInsight(widget.answerText, widget.refLabel);

  Future<void> _shareExternal() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      var payload = _clean;
      try {
        final id = await ref
            .read(assistantRepoProvider)
            .createAnalysisShareSnapshot(
              answerMarkdown: _clean,
              refLabel: widget.refLabel,
              refParam: widget.refParam ?? widget.refLabel,
            );
        if (id != null && id.isNotEmpty) {
          final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
          payload = '$_preview\n$base/share/analysis/$id';
        }
      } catch (_) {
        // 快照失败则纯文案
      }
      await SharePlus.instance.share(
        ShareParams(
          text: payload,
          subject: '${widget.refLabel.isEmpty ? '小爱的解读' : widget.refLabel}｜彼爱',
        ),
      );
      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      setState(() => _err = '分享失败');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _shareCard() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final ok = await shareBrandCard(
        context,
        ShareCardInput(
          title: widget.refLabel.isEmpty ? '小爱的解读' : widget.refLabel,
          body: _preview,
          badge: '小爱解读',
          day: 7,
          shareText: '$_preview\n彼爱 · 安静读经，在话语中相遇',
          subject: '${widget.refLabel.isEmpty ? '小爱的解读' : widget.refLabel}｜彼爱',
        ),
      );
      if (ok && mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _err = '分享失败');
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
              '分享解读',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
            ),
            const SizedBox(height: 16),
            Text(
              _preview,
              style: const TextStyle(
                fontSize: 14,
                height: 1.55,
                color: AppColors.inkSoft,
              ),
            ),
            if (widget.refLabel.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                widget.refLabel.trim(),
                style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _shareExternal,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.accentDeep,
                minimumSize: const Size.fromHeight(44),
              ),
              child: Text(_busy ? '分享中…' : '系统分享'),
            ),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: _busy ? null : _shareCard,
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
              child: const Text('分享品牌卡图'),
            ),
            if (_err != null) ...[
              const SizedBox(height: 8),
              Text(
                _err!,
                style: const TextStyle(fontSize: 12, color: AppColors.accentDeep),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
