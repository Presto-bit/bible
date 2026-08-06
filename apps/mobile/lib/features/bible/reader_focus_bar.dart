/// 选中经文工具条：对齐 PWA（想法 / 划线 / 复制 / 分享 / 小爱）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'reader_marking_models.dart';

class ReaderFocusBar extends StatefulWidget {
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
    this.thoughtsEnabled = true,
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
  final bool thoughtsEnabled;

  @override
  State<ReaderFocusBar> createState() => _ReaderFocusBarState();
}

class _ReaderFocusBarState extends State<ReaderFocusBar> {
  bool _markPaletteOpen = false;

  @override
  Widget build(BuildContext context) {
    final hasMark = widget.currentMark != null;
    return Material(
      elevation: 8,
      borderRadius: BorderRadius.circular(14),
      color: AppColors.surface,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(6, 6, 6, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.underlinesEnabled && _markPaletteOpen && !hasMark)
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (final c in highlightColorKeys)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: GestureDetector(
                          onTap: () {
                            widget.onPickColor(c);
                            setState(() => _markPaletteOpen = false);
                          },
                          child: Tooltip(
                            message: markColorSemantics[c] ?? c,
                            child: Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: chipColor(c),
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: AppColors.line,
                                  width: 1,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (widget.thoughtsEnabled)
                    _iconBtn(
                      icon: Icons.lightbulb_outline,
                      label: '想法',
                      onTap: widget.onThought,
                    ),
                  if (widget.underlinesEnabled)
                    _iconBtn(
                      icon: hasMark
                          ? Icons.format_color_reset_outlined
                          : Icons.edit_outlined,
                      label: hasMark ? '取消划线' : '划线',
                      active: _markPaletteOpen || hasMark,
                      onTap: () {
                        if (hasMark) {
                          widget.onClearMark();
                          setState(() => _markPaletteOpen = false);
                          return;
                        }
                        setState(() => _markPaletteOpen = !_markPaletteOpen);
                      },
                    ),
                  _iconBtn(
                    icon: Icons.copy_outlined,
                    label: '复制',
                    onTap: widget.onCopy,
                  ),
                  _iconBtn(
                    icon: Icons.ios_share_outlined,
                    label: '分享',
                    onTap: widget.onShare,
                  ),
                  _iconBtn(
                    icon: Icons.auto_awesome,
                    label: '小爱',
                    onTap: widget.onLightAi,
                  ),
                  IconButton(
                    onPressed: widget.onClose,
                    icon: const Icon(Icons.close, size: 18),
                    visualDensity: VisualDensity.compact,
                    tooltip: '关闭',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _iconBtn({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    bool active = false,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 18,
              color: active ? AppColors.accentDeep : AppColors.ink,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                color: active ? AppColors.accentDeep : AppColors.inkSoft,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
