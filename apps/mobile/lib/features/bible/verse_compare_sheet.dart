/// 译本对照半屏：对齐 PWA VerseCompareSheet（译本列表 + 小爱流式白话对照）。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart';
import '../../core/theme.dart';
import '../assistant/answer_text.dart';
import '../assistant/assistant_reader_context.dart';
import '../assistant/assistant_repository.dart';
import '../assistant/assistant_scenes.dart';
import '../assistant/assistant_seed.dart';
import '../assistant/models.dart' as am;
import 'bible_repository.dart';

Future<void> showVerseCompareSheet(
  BuildContext context, {
  required String refParam,
  required String refLabel,
  String? selectionText,
  VoidCallback? onOpenChapterParallel,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      maxChildSize: 0.92,
      builder: (_, scroll) => _VerseCompareBody(
        refParam: refParam,
        refLabel: refLabel,
        selectionText: selectionText,
        onOpenChapterParallel: onOpenChapterParallel,
        scrollController: scroll,
      ),
    ),
  );
}

bool _hasVerseRef(String refParam) {
  // 去掉 @span 再判（JHN.3.16@12-45）
  final raw = refParam.split('@').first.trim();
  if (raw.isEmpty) return false;
  // OSIS：BOOK.ch.v 或 BOOK.ch.v-v2
  if (RegExp(r'^[A-Za-z0-9]+\.\d+\.\d+(-\d+)?$').hasMatch(raw)) return true;
  // 中文标签尾：3:16
  if (RegExp(r'\d+:\d+').hasMatch(raw)) return true;
  return false;
}

String _compareApiRef(String refParam) {
  // API 只要 OSIS 基本 ref，去掉 span
  return refParam.split('@').first.trim();
}

class _VerseCompareBody extends ConsumerStatefulWidget {
  const _VerseCompareBody({
    required this.refParam,
    required this.refLabel,
    this.selectionText,
    this.onOpenChapterParallel,
    required this.scrollController,
  });

  final String refParam;
  final String refLabel;
  final String? selectionText;
  final VoidCallback? onOpenChapterParallel;
  final ScrollController scrollController;

  @override
  ConsumerState<_VerseCompareBody> createState() => _VerseCompareBodyState();
}

class _VerseCompareBodyState extends ConsumerState<_VerseCompareBody> {
  late Future<List<VerseRendition>> _future;
  StreamSubscription<am.ChatEvent>? _aiSub;
  String _aiText = '';
  String _aiPending = '';
  bool _aiBusy = false;
  String? _aiErr;
  bool _aiDone = false;
  bool _aiFlushScheduled = false;
  @override
  void initState() {
    super.initState();
    _future = _load();
    _future.then((_) {
      if (!mounted) return;
      _startAi();
    }).catchError((_) {
      if (!mounted) return;
      setState(() {
        _aiBusy = false;
        _aiDone = true;
      });
    });
  }

  @override
  void dispose() {
    _aiSub?.cancel();
    super.dispose();
  }

  Future<List<VerseRendition>> _load() {
    final apiRef = _compareApiRef(widget.refParam);
    if (!_hasVerseRef(apiRef)) {
      return Future.error(StateError('请选中具体经节后再打开对照'));
    }
    return ref.read(bibleRepoProvider).compare(apiRef);
  }

  void _flushAi() {
    _aiFlushScheduled = false;
    if (!mounted) return;
    setState(() => _aiText = _aiPending);
  }

  void _scheduleAiFlush() {
    if (_aiFlushScheduled) return;
    _aiFlushScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _flushAi());
  }

  void _startAi() {
    _aiSub?.cancel();
    final apiRef = _compareApiRef(widget.refParam);
    if (!_hasVerseRef(apiRef)) {
      setState(() {
        _aiBusy = false;
        _aiDone = true;
      });
      return;
    }
    setState(() {
      _aiText = '';
      _aiPending = '';
      _aiErr = null;
      _aiDone = false;
      _aiBusy = true;
    });

    final q = chipUserQuestion('译本对照', ref: widget.refLabel);
    final sel = widget.selectionText?.trim() ?? '';
    final question = sel.isNotEmpty && sel.length <= 300
        ? '$q\n\n选中文本：$sel'
        : q;

    final stream = ref.read(assistantRepoProvider).chat(
          ref: apiRef,
          question: question,
          mode: am.AssistantMode.compare,
          scene: AssistantScene.chatCompare,
          readerContext: buildAssistantReaderContext(ref),
        );
    _aiSub = stream.listen(
      (evt) {
        if (!mounted) return;
        switch (evt) {
          case am.DeltaEvent(:final text):
            _aiPending += text;
            _scheduleAiFlush();
          case am.ErrorEvent(:final message):
            setState(() {
              _aiErr = message;
              _aiBusy = false;
              _aiDone = true;
              _aiText = _aiPending;
            });
          case am.DoneEvent():
            setState(() {
              _aiText = _aiPending;
              _aiBusy = false;
              _aiDone = true;
            });
          default:
            break;
        }
      },
      onDone: () {
        if (mounted) {
          setState(() {
            _aiText = _aiPending;
            _aiBusy = false;
            _aiDone = true;
          });
        }
      },
      onError: (e) {
        if (!mounted) return;
        setState(() {
          _aiErr = '$e';
          _aiBusy = false;
          _aiDone = true;
        });
      },
    );
  }

  void _retryAi() => _startAi();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '译本对照',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 16),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        widget.refLabel,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.inkFaint),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            if (widget.selectionText != null &&
                widget.selectionText!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '「${widget.selectionText!.trim()}」',
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.55,
                  color: AppColors.inkSoft,
                  fontFamily: 'Songti SC',
                  fontFamilyFallback: ['STSong', 'Noto Serif SC', 'serif'],
                ),
              ),
            ],
            const SizedBox(height: 12),
            Expanded(
              child: FutureBuilder<List<VerseRendition>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snap.hasError) {
                    return Center(
                      child: Text(
                        '${snap.error}'.replaceFirst('Bad state: ', ''),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.inkSoft),
                      ),
                    );
                  }
                  final rows = snap.data ?? const [];
                  return ListView(
                    controller: widget.scrollController,
                    children: [
                      if (rows.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Center(
                            child: Text('暂无对照译本',
                                style: TextStyle(color: AppColors.inkFaint)),
                          ),
                        )
                      else
                        ...[
                          for (var i = 0; i < rows.length; i++) ...[
                            if (i > 0) const SizedBox(height: 10),
                            _VersionBlock(row: rows[i]),
                          ],
                        ],
                      const SizedBox(height: 16),
                      const Text(
                        '小爱解读',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.accentDeep,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (_aiBusy && _aiText.trim().isEmpty)
                        const Text(
                          '小爱正在整理白话对照…',
                          style:
                              TextStyle(fontSize: 14, color: AppColors.inkFaint),
                        ),
                      if (_aiErr != null && _aiText.trim().isEmpty) ...[
                        Text(
                          _aiErr!,
                          style: const TextStyle(
                              fontSize: 14, color: AppColors.inkSoft),
                        ),
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton(
                            onPressed: _retryAi,
                            child: const Text('重试'),
                          ),
                        ),
                      ],
                      if (_aiText.trim().isNotEmpty)
                        AssistantMarkdownBody(
                          text: _aiText,
                          streaming: _aiBusy,
                          dense: true,
                        ),
                      if (!_aiBusy &&
                          _aiErr == null &&
                          _aiText.trim().isEmpty &&
                          _aiDone)
                        const Text(
                          '暂无解读，请稍后重试。',
                          style:
                              TextStyle(fontSize: 14, color: AppColors.inkFaint),
                        ),
                    ],
                  );
                },
              ),
            ),
            if (widget.onOpenChapterParallel != null) ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  widget.onOpenChapterParallel!();
                },
                child: const Text('整章上下对照 ›'),
              ),
            ],
            const SizedBox(height: 4),
            FilledButton.tonal(
              onPressed: () {
                final q = chipUserQuestion('译本对照', ref: widget.refLabel);
                Navigator.pop(context);
                ref.read(assistantSeedProvider.notifier).open(
                      ref: _compareApiRef(widget.refParam),
                      question: q,
                    );
                ref.read(navIndexProvider.notifier).set(2);
              },
              child: const Text('问小爱 · 译本对照'),
            ),
            const SizedBox(height: 8),
            const Text(
              'AI 释义，请以圣经正文为准',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: AppColors.inkFaint),
            ),
          ],
        ),
      ),
    );
  }
}

class _VersionBlock extends StatelessWidget {
  const _VersionBlock({required this.row});
  final VerseRendition row;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceSunken,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            row.label.isNotEmpty ? row.label : row.version.toUpperCase(),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.accentDeep,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            row.text,
            style: const TextStyle(
              fontSize: 15,
              height: 1.65,
              color: AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
