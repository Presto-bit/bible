/// 读经半屏 L1 / 默认 L3 chip（对齐 v3.1 定稿）。
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../assistant/assistant_scenes.dart';

class HalfSheetChipDef {
  const HalfSheetChipDef({
    required this.label,
    required this.scene,
    required this.mode,
    required this.q,
  });

  final String label;
  final AssistantScene scene;
  final String mode;
  final String q;
}

List<HalfSheetChipDef> halfSheetL1Chips(String? refLabel) {
  final anchor = refLabel?.trim().isNotEmpty == true
      ? '「${refLabel!.trim()}」'
      : '这段经文';
  const rows = <(String, AssistantScene, String)>[
    ('经文背景', AssistantScene.chatExplain, ''),
    ('生活应用', AssistantScene.chatApply, ''),
    ('原文词义', AssistantScene.chatOriginal, ''),
    ('和上下文连', AssistantScene.chatUnderstand, ''),
  ];
  return rows.map((row) {
    final q = switch (row.$1) {
      '经文背景' => '请补充$anchor的历史与上下文背景，150字内。',
      '生活应用' => '请把$anchor应用到今日生活，给出2–3条具体行动。',
      '原文词义' => '$anchor里最关键的词原文是什么意思？',
      _ => '$anchor和前后文怎么连在一起读？',
    };
    return HalfSheetChipDef(
      label: row.$1,
      scene: row.$2,
      mode: row.$2.mode,
      q: q,
    );
  }).toList();
}

List<String> defaultHalfSheetFollowups(String refLabel) {
  final r = refLabel.trim().isNotEmpty ? refLabel.trim() : '这段经文';
  return [
    '「$r」里最关键的词是什么意思？',
    '这段经文的背景是什么？',
    '这对我今天的生活有什么提醒？',
  ].take(3).toList();
}

String halfSheetSelectionKey(
  String ref,
  String selection,
  bool explicitSelection,
) {
  final sel = explicitSelection ? selection.trim() : '';
  return '${ref.trim().toUpperCase()}\u001e$sel';
}

class _SlopChip extends StatefulWidget {
  const _SlopChip({
    required this.onTap,
    required this.child,
    this.disabled = false,
    this.backgroundColor,
    this.side,
    this.outlined = false,
  });

  final VoidCallback onTap;
  final Widget child;
  final bool disabled;
  final Color? backgroundColor;
  final BorderSide? side;
  final bool outlined;

  @override
  State<_SlopChip> createState() => _SlopChipState();
}

class _SlopChipState extends State<_SlopChip> {
  static const _slopPx = 12.0;
  Offset? _down;
  bool _slopExceeded = false;

  void _onDown(PointerDownEvent e) {
    _down = e.localPosition;
    _slopExceeded = false;
  }

  void _onMove(PointerMoveEvent e) {
    final start = _down;
    if (start == null || _slopExceeded) return;
    if ((e.localPosition - start).distance > _slopPx) _slopExceeded = true;
  }

  void _onUp(PointerUpEvent e) {
    final blocked = widget.disabled || _slopExceeded;
    _down = null;
    _slopExceeded = false;
    if (!blocked) widget.onTap();
  }

  void _onCancel(PointerCancelEvent e) {
    _down = null;
    _slopExceeded = false;
  }

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(20);
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: _onDown,
      onPointerMove: _onMove,
      onPointerUp: _onUp,
      onPointerCancel: _onCancel,
      child: Opacity(
        opacity: widget.disabled ? 0.5 : 1,
        child: Material(
          color: widget.outlined
              ? Colors.transparent
              : (widget.backgroundColor ?? AppColors.accentWash),
          shape: RoundedRectangleBorder(
            borderRadius: radius,
            side: widget.side ?? BorderSide(color: AppColors.line),
          ),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: widget.outlined ? 14 : 12,
              vertical: widget.outlined ? 10 : 8,
            ),
            child: DefaultTextStyle(
              style: TextStyle(
                fontSize: 12,
                height: 1.35,
                color: widget.disabled ? AppColors.inkFaint : AppColors.inkSoft,
              ),
              child: widget.child,
            ),
          ),
        ),
      ),
    );
  }
}

class HalfSheetChipRows extends StatefulWidget {
  const HalfSheetChipRows({
    super.key,
    required this.followups,
    required this.followupsLoading,
    required this.l1Chips,
    required this.disabled,
    required this.onFollowup,
    required this.onL1,
  });

  final List<String> followups;
  final bool followupsLoading;
  final List<HalfSheetChipDef> l1Chips;
  final bool disabled;
  final void Function(String q) onFollowup;
  final void Function(HalfSheetChipDef chip) onL1;

  @override
  State<HalfSheetChipRows> createState() => _HalfSheetChipRowsState();
}

class _HalfSheetChipRowsState extends State<HalfSheetChipRows> {
  bool _scrollLocked = false;
  Timer? _scrollUnlockTimer;

  @override
  void dispose() {
    _scrollUnlockTimer?.cancel();
    super.dispose();
  }

  void _markScrolled() {
    _scrollLocked = true;
    _scrollUnlockTimer?.cancel();
    _scrollUnlockTimer = Timer(const Duration(milliseconds: 280), () {
      if (mounted) setState(() => _scrollLocked = false);
    });
  }

  void _handleFollowup(String q) {
    if (widget.disabled || _scrollLocked) return;
    widget.onFollowup(q);
  }

  void _handleL1(HalfSheetChipDef chip) {
    if (widget.disabled || _scrollLocked) return;
    widget.onL1(chip);
  }

  Widget _scrollTrack({required double height, required Widget child}) {
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n is ScrollUpdateNotification) {
          final delta = n.scrollDelta;
          if (delta != null && delta.abs() > 1) {
            _markScrolled();
          }
        }
        return false;
      },
      child: SizedBox(height: height, child: child),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 14),
        const Divider(height: 1, color: AppColors.line),
        const SizedBox(height: 12),
        const Text(
          '继续追问',
          style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
        ),
        const SizedBox(height: 8),
        _scrollTrack(
          height: 44,
          child: widget.followupsLoading
              ? ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: 3,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, __) => Container(
                    width: 120,
                    decoration: BoxDecoration(
                      color: AppColors.accentWash,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.line),
                    ),
                  ),
                )
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: widget.followups.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final q = widget.followups[i];
                    return _SlopChip(
                      disabled: widget.disabled,
                      backgroundColor: AppColors.accentWash,
                      side: const BorderSide(color: AppColors.line),
                      onTap: () => _handleFollowup(q),
                      child: Text(q),
                    );
                  },
                ),
        ),
        const SizedBox(height: 14),
        const Text(
          '还想了解',
          style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
        ),
        const SizedBox(height: 8),
        _scrollTrack(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: widget.l1Chips.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              final chip = widget.l1Chips[i];
              return _SlopChip(
                outlined: true,
                disabled: widget.disabled,
                onTap: () => _handleL1(chip),
                child: Text(chip.label),
              );
            },
          ),
        ),
      ],
    );
  }
}
