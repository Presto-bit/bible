/// 选中经文工具条：微信读书式色点划线。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'reader_marking_models.dart';

class ReaderFocusBar extends StatelessWidget {
  const ReaderFocusBar({
    super.key,
    required this.currentMark,
    required this.onLightAi,
    required this.onTools,
    required this.onCopy,
    required this.onThought,
    required this.onWriteNote,
    required this.onShare,
    required this.onPickColor,
    required this.onClearMark,
    required this.onClose,
    this.underlinesEnabled = true,
  });

  final HighlightMark? currentMark;
  final VoidCallback onLightAi;
  final VoidCallback onTools;
  final VoidCallback onCopy;
  final VoidCallback onThought;
  final VoidCallback onWriteNote;
  final VoidCallback onShare;
  final void Function(String color) onPickColor;
  final VoidCallback onClearMark;
  final VoidCallback onClose;
  final bool underlinesEnabled;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 8,
      borderRadius: BorderRadius.circular(14),
      color: AppColors.surface,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 6, 4, 8),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _btn('✦ 问小爱', onLightAi),
              _btn('串珠', onTools),
              _btn('分享', onShare),
              if (underlinesEnabled) ...[
                const SizedBox(width: 4),
                Container(width: 1, height: 22, color: AppColors.line),
                const SizedBox(width: 6),
                ...highlightColorKeys.map((c) {
                  final active = currentMark?.color == c;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: GestureDetector(
                      onTap: () => onPickColor(c),
                      child: Tooltip(
                        message: markColorSemantics[c] ?? c,
                        child: Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            color: chipColor(c),
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: active ? AppColors.accentDeep : AppColors.line,
                              width: active ? 2.5 : 1,
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                }),
                if (currentMark != null)
                  IconButton(
                    onPressed: onClearMark,
                    icon: const Icon(Icons.backspace_outlined, size: 18),
                    visualDensity: VisualDensity.compact,
                    tooltip: '清除划线',
                  ),
                Container(width: 1, height: 22, color: AppColors.line),
                const SizedBox(width: 4),
              ],
              _btn('写笔记', onWriteNote),
              _btn('写想法', onThought),
              _btn('复制', onCopy),
              IconButton(
                onPressed: onClose,
                icon: const Icon(Icons.close, size: 18),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _btn(String label, VoidCallback onTap) {
    return TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(
        foregroundColor: AppColors.ink,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      child: Text(label, style: const TextStyle(fontSize: 13)),
    );
  }
}
