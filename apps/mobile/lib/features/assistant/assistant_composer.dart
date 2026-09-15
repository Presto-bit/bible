/// 小爱 Tab 输入区：对齐 PWA `.assistant-composer`（无发送钮、框内知识库图标、麦克风切换）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'assistant_scenes.dart';
import 'models.dart';

typedef AssistantChipTap = void Function(
  String question, {
  AssistantMode? mode,
  AssistantScene? scene,
  String? displayLabel,
});

class AssistantComposer extends StatelessWidget {
  const AssistantComposer({
    super.key,
    required this.controller,
    required this.streaming,
    required this.disabled,
    required this.docked,
    required this.chips,
    required this.onSend,
    this.onChip,
    this.onStop,
    this.onPickKnowledgeBase,
    this.voiceMode = false,
    this.recording = false,
    this.cancelArmed = false,
    this.onToggleVoiceMode,
    this.onVoicePointerDown,
    this.onVoicePointerMove,
    this.onVoicePointerUp,
  });

  final TextEditingController controller;
  final bool streaming;
  final bool disabled;
  final bool docked;
  final List<(String label, AssistantMode mode, String q, AssistantScene? scene)>
      chips;
  final VoidCallback onSend;
  final AssistantChipTap? onChip;
  final VoidCallback? onStop;
  final VoidCallback? onPickKnowledgeBase;
  final bool voiceMode;
  final bool recording;
  final bool cancelArmed;
  final VoidCallback? onToggleVoiceMode;
  final void Function(Offset globalPosition)? onVoicePointerDown;
  final void Function(Offset globalPosition)? onVoicePointerMove;
  final VoidCallback? onVoicePointerUp;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    final pad = docked
        ? EdgeInsets.fromLTRB(16, 8, 16, 8 + (bottom > 0 ? bottom : 8))
        : const EdgeInsets.fromLTRB(16, 0, 16, 0);

    return Padding(
      padding: pad,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (chips.isNotEmpty && onChip != null)
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: chips.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final c = chips[i];
                  return _ChipPill(
                    label: c.$1,
                    enabled: !disabled && !streaming,
                    onTap: () => onChip!(
                      c.$3,
                      mode: c.$2,
                      scene: c.$4,
                      displayLabel: c.$1,
                    ),
                  );
                },
              ),
            ),
          if (chips.isNotEmpty && onChip != null) const SizedBox(height: 8),
          Material(
            color: AppColors.surface,
            elevation: docked ? 6 : 0,
            shadowColor: const Color(0x180F172A),
            borderRadius: BorderRadius.circular(16),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.line),
              ),
              padding: const EdgeInsets.fromLTRB(4, 6, 4, 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (onPickKnowledgeBase != null)
                    IconButton(
                      onPressed: disabled || streaming
                          ? null
                          : onPickKnowledgeBase,
                      tooltip: '当前使用：平台参考库',
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.all(8),
                      constraints: const BoxConstraints(
                        minWidth: 36,
                        minHeight: 36,
                      ),
                      icon: const _KbSourceIcon(),
                    ),
                  Expanded(
                    child: voiceMode && !streaming
                        ? _VoiceHoldButton(
                            enabled: !disabled,
                            recording: recording,
                            cancelArmed: cancelArmed,
                            onPointerDown: onVoicePointerDown,
                            onPointerMove: onVoicePointerMove,
                            onPointerUp: onVoicePointerUp,
                          )
                        : TextField(
                            controller: controller,
                            enabled: !disabled && !streaming,
                            minLines: 1,
                            maxLines: 4,
                            textInputAction: TextInputAction.send,
                            onSubmitted: disabled || streaming
                                ? null
                                : (_) => onSend(),
                            decoration: const InputDecoration(
                              hintText: '问小爱…',
                              border: InputBorder.none,
                              isDense: true,
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 4,
                                vertical: 10,
                              ),
                            ),
                          ),
                  ),
                  if (streaming)
                    IconButton(
                      onPressed: onStop,
                      tooltip: '停止生成',
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.all(8),
                      constraints: const BoxConstraints(
                        minWidth: 36,
                        minHeight: 36,
                      ),
                      icon: Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: AppColors.accent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.stop_rounded,
                          size: 16,
                          color: Colors.white,
                        ),
                      ),
                    )
                  else if (onToggleVoiceMode != null)
                    IconButton(
                      onPressed: disabled ? null : onToggleVoiceMode,
                      tooltip: voiceMode ? '切换键盘' : '切换语音',
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.all(8),
                      constraints: const BoxConstraints(
                        minWidth: 36,
                        minHeight: 36,
                      ),
                      icon: Icon(
                        voiceMode
                            ? Icons.keyboard_alt_outlined
                            : Icons.mic_none_outlined,
                        size: 20,
                        color: disabled
                            ? AppColors.inkFaint
                            : AppColors.inkSoft,
                      ),
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

/// 对齐 PWA KbSourceIcon：三层叠片
class _KbSourceIcon extends StatelessWidget {
  const _KbSourceIcon();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(18, 18),
      painter: _KbSourcePainter(
        color: AppColors.inkSoft,
      ),
    );
  }
}

class _KbSourcePainter extends CustomPainter {
  _KbSourcePainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.7
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final sx = size.width / 24;
    final sy = size.height / 24;
    canvas.drawLine(Offset(4 * sx, 8.5 * sy), Offset(20 * sx, 8.5 * sy), stroke);
    canvas.drawLine(Offset(6 * sx, 12.5 * sy), Offset(18 * sx, 12.5 * sy), stroke);
    canvas.drawLine(Offset(8 * sx, 16.5 * sy), Offset(16 * sx, 16.5 * sy), stroke);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(3.5 * sx, 5.5 * sy, 17 * sx, 14 * sy),
        Radius.circular(2.5 * sx),
      ),
      Paint()
        ..color = color.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.7,
    );
  }

  @override
  bool shouldRepaint(covariant _KbSourcePainter oldDelegate) =>
      oldDelegate.color != color;
}

class _VoiceHoldButton extends StatelessWidget {
  const _VoiceHoldButton({
    required this.enabled,
    required this.recording,
    required this.cancelArmed,
    this.onPointerDown,
    this.onPointerMove,
    this.onPointerUp,
  });

  final bool enabled;
  final bool recording;
  final bool cancelArmed;
  final void Function(Offset globalPosition)? onPointerDown;
  final void Function(Offset globalPosition)? onPointerMove;
  final VoidCallback? onPointerUp;

  @override
  Widget build(BuildContext context) {
    final label = !recording
        ? '按住 说话'
        : (cancelArmed ? '松开取消' : '松开发送 · 上滑取消');
    final bg = !recording
        ? Colors.transparent
        : (cancelArmed
            ? const Color(0x22C45C4A)
            : AppColors.accent.withValues(alpha: 0.12));
    final fg = !enabled
        ? AppColors.inkFaint
        : (cancelArmed ? const Color(0xFFC45C4A) : AppColors.inkSoft);

    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: enabled
          ? (e) => onPointerDown?.call(e.position)
          : null,
      onPointerMove: enabled && recording
          ? (e) => onPointerMove?.call(e.position)
          : null,
      onPointerUp: enabled ? (_) => onPointerUp?.call() : null,
      onPointerCancel: enabled ? (_) => onPointerUp?.call() : null,
      child: Container(
        alignment: Alignment.center,
        constraints: const BoxConstraints(minHeight: 40),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: fg,
          ),
        ),
      ),
    );
  }
}

class _ChipPill extends StatelessWidget {
  const _ChipPill({
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.accentWash,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: AppColors.line),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              color: enabled ? AppColors.ink : AppColors.inkFaint,
            ),
          ),
        ),
      ),
    );
  }
}
