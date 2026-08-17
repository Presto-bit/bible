/// 历史会话左滑露出「改名 / 删除」（对齐 PWA HistorySessionSwipeRow）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// 同一抽屉内只允许一行展开；点击其他位置时由列表统一关闭。
class HistorySessionSwipeController extends ChangeNotifier {
  String? _openId;

  bool isOpen(String id) => _openId == id;

  void open(String id) {
    if (_openId == id) return;
    _openId = id;
    notifyListeners();
  }

  void close() {
    if (_openId == null) return;
    _openId = null;
    notifyListeners();
  }
}

class HistorySessionSwipeRow extends StatefulWidget {
  const HistorySessionSwipeRow({
    super.key,
    required this.id,
    required this.controller,
    required this.child,
    required this.onRename,
    required this.onDelete,
  });

  final String id;
  final HistorySessionSwipeController controller;
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
    widget.controller.close();
  }

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_syncOpenState);
  }

  @override
  void didUpdateWidget(covariant HistorySessionSwipeRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller == widget.controller) return;
    oldWidget.controller.removeListener(_syncOpenState);
    widget.controller.addListener(_syncOpenState);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_syncOpenState);
    super.dispose();
  }

  void _syncOpenState() {
    final target = widget.controller.isOpen(widget.id) ? -_revealPx : 0.0;
    if (_offset != target && mounted) setState(() => _offset = target);
  }

  @override
  Widget build(BuildContext context) {
    final revealed = _offset < -1;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Stack(
        children: [
          Positioned.fill(
            child: IgnorePointer(
              ignoring: !revealed,
              child: Opacity(
                opacity: revealed ? 1 : 0,
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
              if (_offset < -_openThreshold) {
                widget.controller.open(widget.id);
              } else {
                _close();
              }
            },
            child: Transform.translate(
              offset: Offset(_offset, 0),
              child: _offset < -1
                  ? GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: _close,
                      child: AbsorbPointer(child: widget.child),
                    )
                  : widget.child,
            ),
          ),
        ],
      ),
    );
  }
}
