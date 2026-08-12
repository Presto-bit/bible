/// 历史会话左滑露出「改名 / 删除」（对齐 PWA HistorySessionSwipeRow）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

class HistorySessionSwipeRow extends StatefulWidget {
  const HistorySessionSwipeRow({
    super.key,
    required this.child,
    required this.onRename,
    required this.onDelete,
  });

  final Widget child;
  final VoidCallback onRename;
  final VoidCallback onDelete;

  @override
  State<HistorySessionSwipeRow> createState() => _HistorySessionSwipeRowState();
}

class _HistorySessionSwipeRowState extends State<HistorySessionSwipeRow> {
  static const _revealPx = 136.0;
  static const _openThreshold = 40.0;
  double _offset = 0;
  double _startX = 0;
  bool _dragging = false;

  void _close() {
    if (_offset == 0) return;
    setState(() => _offset = 0);
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Stack(
        children: [
          Positioned.fill(
            child: Row(
              children: [
                const Spacer(),
                SizedBox(
                  width: _revealPx,
                  child: Row(
                    children: [
                      Expanded(
                        child: Material(
                          color: AppColors.accent.withValues(alpha: 0.85),
                          child: InkWell(
                            onTap: () {
                              _close();
                              widget.onRename();
                            },
                            child: const Center(
                              child: Text(
                                '改名',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: Material(
                          color: const Color(0xFFC45C5C),
                          child: InkWell(
                            onTap: () {
                              _close();
                              widget.onDelete();
                            },
                            child: const Center(
                              child: Text(
                                '删除',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          GestureDetector(
            onHorizontalDragStart: (d) {
              _dragging = true;
              _startX = d.globalPosition.dx;
            },
            onHorizontalDragUpdate: (d) {
              if (!_dragging) return;
              final dx = d.globalPosition.dx - _startX;
              final next = dx < 0 ? dx.clamp(-_revealPx, 0.0) : 0.0;
              if (next != _offset) setState(() => _offset = next);
            },
            onHorizontalDragEnd: (_) {
              _dragging = false;
              setState(() {
                _offset = _offset < -_openThreshold ? -_revealPx : 0;
              });
            },
            child: Transform.translate(
              offset: Offset(_offset, 0),
              child: widget.child,
            ),
          ),
        ],
      ),
    );
  }
}
