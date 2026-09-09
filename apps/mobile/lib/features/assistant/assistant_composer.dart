/// 小爱 Tab 输入区：chip 行 + 知识库 + 发送/停止（对齐 PWA `.assistant-composer`）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'assistant_scenes.dart';

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
    required this.knowledgeBaseLabel,
    this.onChip,
    this.onStop,
    this.onPickKnowledgeBase,
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
  final String knowledgeBaseLabel;
  final VoidCallback? onPickKnowledgeBase;

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
              padding: const EdgeInsets.fromLTRB(8, 6, 6, 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (onPickKnowledgeBase != null)
                    TextButton(
                      onPressed: disabled || streaming
                          ? null
                          : onPickKnowledgeBase,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 6,
                        ),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        knowledgeBaseLabel,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.inkSoft,
                        ),
                      ),
                    ),
                  Expanded(
                    child: TextField(
                      controller: controller,
                      enabled: !disabled && !streaming,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: disabled || streaming ? null : (_) => onSend(),
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
                  const SizedBox(width: 4),
                  if (streaming)
                    IconButton(
                      onPressed: onStop,
                      tooltip: '停止生成',
                      icon: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: AppColors.accent,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.stop_rounded,
                          size: 18,
                          color: Colors.white,
                        ),
                      ),
                    )
                  else
                    IconButton(
                      onPressed: disabled ? null : onSend,
                      tooltip: '发送',
                      icon: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: disabled
                              ? AppColors.line
                              : AppColors.accent,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          Icons.arrow_upward_rounded,
                          size: 18,
                          color: disabled ? AppColors.inkFaint : Colors.white,
                        ),
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
