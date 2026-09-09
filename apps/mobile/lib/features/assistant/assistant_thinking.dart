/// 小爱等待首包：单行灰色过程提示（对齐 PWA `ThinkingLine.tsx`）。
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'thinking_ticker.dart';

enum ThinkingPhase {
  understanding,
  refs,
  writing,
}

enum ThinkingVariant { defaultTab, halfSheet }

class AssistantThinkingState extends StatefulWidget {
  const AssistantThinkingState({
    super.key,
    required this.phase,
    this.citeCount = 0,
    this.slow = false,
    this.variant = ThinkingVariant.defaultTab,
    this.currentSectionTitle,
  });

  final ThinkingPhase phase;
  final int citeCount;
  final bool slow;
  final ThinkingVariant variant;
  final String? currentSectionTitle;

  @override
  State<AssistantThinkingState> createState() => _AssistantThinkingStateState();
}

class _AssistantThinkingStateState extends State<AssistantThinkingState> {
  Timer? _timer;
  var _index = 0;

  @override
  void initState() {
    super.initState();
    _startTicker();
  }

  @override
  void didUpdateWidget(covariant AssistantThinkingState oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.phase != widget.phase ||
        oldWidget.citeCount != widget.citeCount ||
        oldWidget.currentSectionTitle != widget.currentSectionTitle ||
        oldWidget.variant != widget.variant) {
      _index = 0;
      _restartTicker();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startTicker() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(milliseconds: 2500), (_) {
      if (!mounted) return;
      final messages = _messages;
      if (messages.length <= 1) return;
      setState(() => _index = (_index + 1) % messages.length);
    });
  }

  void _restartTicker() {
    _timer?.cancel();
    _startTicker();
  }

  List<String> get _messages => buildThinkingMessages(
        phase: widget.phase,
        citeCount: widget.citeCount,
        currentSectionTitle: widget.currentSectionTitle,
        variant: widget.variant,
      );

  String get _label {
    final messages = _messages;
    if (messages.isEmpty) return '正在组织回答…';
    return messages[_index % messages.length];
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 280),
          switchInCurve: Curves.easeOut,
          switchOutCurve: Curves.easeIn,
          child: Text(
            _label,
            key: ValueKey<String>(_label),
            style: const TextStyle(
              color: AppColors.inkFaint,
              fontSize: 12,
              height: 1.45,
            ),
          ),
        ),
        if (widget.slow)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text(
              '网络较慢，可稍候或点「停止」后重试',
              style: TextStyle(color: AppColors.inkFaint, fontSize: 12),
            ),
          ),
      ],
    );
  }
}
