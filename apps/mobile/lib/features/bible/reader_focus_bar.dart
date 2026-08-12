/// 选中经文工具条：笔记 / 划线 / 复制 / 金句卡 / 对照 / 小爱（安卓与 PWA 一致）。
/// 纸感：低 elevation + 细边线，贴选区不抢正文。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'reader_marking_models.dart';
import 'reader_preferences.dart';

class ReaderFocusBar extends StatefulWidget {
  const ReaderFocusBar({
    super.key,
    required this.currentMark,
    required this.onLightAi,
    required this.onCopy,
    required this.onThought,
    required this.onVerseCard,
    required this.onCompare,
    required this.onPickColor,
    required this.onClearMark,
    required this.onClose,
    this.underlinesEnabled = true,
    this.thoughtsEnabled = true,
    this.readingMode = ReadingMode.study,
  });

  final HighlightMark? currentMark;
  final VoidCallback onLightAi;
  final VoidCallback onCopy;
  final VoidCallback onThought;
  final VoidCallback onVerseCard;
  final VoidCallback onCompare;
  final void Function(String color) onPickColor;
  final VoidCallback onClearMark;
  final VoidCallback onClose;
  final bool underlinesEnabled;
  final bool thoughtsEnabled;
  final ReadingMode readingMode;

  @override
  State<ReaderFocusBar> createState() => _ReaderFocusBarState();
}

class _ReaderFocusBarState extends State<ReaderFocusBar> {
  bool _markPaletteOpen = false;

  @override
  Widget build(BuildContext context) {
    final hasMark = widget.currentMark != null;
    return Material(
      elevation: 1.5,
      shadowColor: AppColors.ink.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(12),
      color: AppColors.paper,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.line.withValues(alpha: 0.9)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(2, 4, 2, 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.underlinesEnabled &&
                  widget.readingMode != ReadingMode.focus &&
                  _markPaletteOpen)
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 6),
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
                                width: 22,
                                height: 22,
                                decoration: BoxDecoration(
                                  color: chipColor(c),
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: hasMark &&
                                            widget.currentMark?.color == c
                                        ? AppColors.accentDeep
                                        : AppColors.line,
                                    width: hasMark &&
                                            widget.currentMark?.color == c
                                        ? 2
                                        : 1,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      if (hasMark)
                        Padding(
                          padding: const EdgeInsets.only(left: 4),
                          child: ActionChip(
                            label: const Text('取消',
                                style: TextStyle(fontSize: 12)),
                            visualDensity: VisualDensity.compact,
                            materialTapTargetSize:
                                MaterialTapTargetSize.shrinkWrap,
                            onPressed: () {
                              widget.onClearMark();
                              setState(() => _markPaletteOpen = false);
                            },
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
                    if (widget.thoughtsEnabled &&
                        widget.readingMode != ReadingMode.focus)
                      _iconBtn(
                        icon: Icons.lightbulb_outline,
                        label: '笔记',
                        onTap: widget.onThought,
                      ),
                    if (widget.underlinesEnabled &&
                        widget.readingMode != ReadingMode.focus)
                      _iconBtn(
                        icon: Icons.edit_outlined,
                        label: hasMark ? '取消划线' : '划线',
                        active: _markPaletteOpen || hasMark,
                        onTap: () {
                          if (hasMark) {
                            widget.onClearMark();
                            setState(() => _markPaletteOpen = false);
                            return;
                          }
                          setState(
                              () => _markPaletteOpen = !_markPaletteOpen);
                        },
                      ),
                    _iconBtn(
                      icon: Icons.copy_outlined,
                      label: '复制',
                      onTap: widget.onCopy,
                    ),
                    if (widget.readingMode != ReadingMode.focus)
                      _iconBtn(
                        icon: Icons.crop_landscape_outlined,
                        label: '金句卡',
                        onTap: widget.onVerseCard,
                      ),
                    if (widget.readingMode == ReadingMode.study)
                      _iconBtn(
                        icon: Icons.compare_arrows,
                        label: '对照',
                        onTap: widget.onCompare,
                      ),
                    if (widget.readingMode != ReadingMode.focus)
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
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 17,
              color: active ? AppColors.accentDeep : AppColors.inkSoft,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                color: active ? AppColors.accentDeep : AppColors.inkFaint,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
