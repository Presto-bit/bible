/// 书架横滑翻页：不跟手拖动，阈值/速度提交（对齐 Web snapOnly）。
library;

import 'package:flutter/material.dart';

class ShelfSnapTurnGesture extends StatefulWidget {
  const ShelfSnapTurnGesture({
    super.key,
    required this.child,
    required this.enabled,
    this.onTurnNext,
    this.onTurnPrev,
    this.onBoundary,
    this.onApproachEdge,
  });

  final Widget child;
  final bool enabled;
  final VoidCallback? onTurnNext;
  final VoidCallback? onTurnPrev;
  final ValueChanged<String>? onBoundary;
  /// `next` / `prev` — 横滑接近章界时预取邻章。
  final ValueChanged<String>? onApproachEdge;

  @override
  State<ShelfSnapTurnGesture> createState() => _ShelfSnapTurnGestureState();
}

class _ShelfSnapTurnGestureState extends State<ShelfSnapTurnGesture> {
  double _dx = 0;
  var _approachFired = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragStart: widget.enabled
          ? (_) {
              _dx = 0;
              _approachFired = false;
            }
          : null,
      onHorizontalDragUpdate: widget.enabled
          ? (d) {
              _dx += d.delta.dx;
              if (_approachFired) return;
              final w = MediaQuery.sizeOf(context).width;
              final ratio = _dx.abs() / (w <= 0 ? 1 : w);
              if (ratio >= 0.07) {
                _approachFired = true;
                widget.onApproachEdge?.call(_dx < 0 ? 'next' : 'prev');
              }
            }
          : null,
      onHorizontalDragEnd: widget.enabled
          ? (d) {
              final w = MediaQuery.sizeOf(context).width;
              final ratio = _dx.abs() / (w <= 0 ? 1 : w);
              final v = d.primaryVelocity ?? 0;
              final goingNext = _dx < 0;
              final commit = ratio >= 0.13 ||
                  ratio >= 0.07 && v.abs() >= 120 ||
                  ratio >= 0.24;
              if (!commit) {
                _dx = 0;
                _approachFired = false;
                return;
              }
              if (goingNext) {
                if (widget.onTurnNext != null) {
                  widget.onTurnNext!();
                } else {
                  widget.onBoundary?.call('next');
                }
              } else {
                if (widget.onTurnPrev != null) {
                  widget.onTurnPrev!();
                } else {
                  widget.onBoundary?.call('prev');
                }
              }
              _dx = 0;
              _approachFired = false;
            }
          : null,
      child: widget.child,
    );
  }
}
