/// 书架横滑切节：全屏响应 + 正文区竖滚/划词优先（对齐 Web useShelfTurn）。
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
    this.shouldYieldTurn,
    this.hitIsProseContent,
  });

  final Widget child;
  final bool enabled;
  final VoidCallback? onTurnNext;
  final VoidCallback? onTurnPrev;
  final ValueChanged<String>? onBoundary;
  final ValueChanged<String>? onApproachEdge;
  final bool Function()? shouldYieldTurn;
  final bool Function(Offset globalPosition)? hitIsProseContent;

  @override
  State<ShelfSnapTurnGesture> createState() => _ShelfSnapTurnGestureState();
}

class _ShelfSnapTurnGestureState extends State<ShelfSnapTurnGesture> {
  int? _pointer;
  Offset _start = Offset.zero;
  double _dx = 0;
  var _axisLocked = false;
  var _horizontal = false;
  var _approachFired = false;
  var _inProse = false;

  void _reset() {
    _pointer = null;
    _axisLocked = false;
    _horizontal = false;
    _dx = 0;
    _approachFired = false;
    _inProse = false;
  }

  void _onPointerDown(PointerDownEvent e) {
    if (!widget.enabled) return;
    if (widget.shouldYieldTurn?.call() == true) return;
    _pointer = e.pointer;
    _start = e.position;
    _dx = 0;
    _axisLocked = false;
    _horizontal = false;
    _approachFired = false;
    _inProse = widget.hitIsProseContent?.call(e.position) ?? false;
  }

  void _onPointerMove(PointerMoveEvent e) {
    if (!widget.enabled || _pointer != e.pointer) return;
    if (widget.shouldYieldTurn?.call() == true) {
      _reset();
      return;
    }

    _dx = e.position.dx - _start.dx;
    final dy = e.position.dy - _start.dy;
    final adx = _dx.abs();
    final ady = dy.abs();

    if (!_axisLocked) {
      if (adx < 2 && ady < 2) return;

      if (_inProse) {
        if (ady >= 10 && ady >= adx * 0.88) {
          _reset();
          return;
        }
        if (adx >= 8 && adx > ady * 1.06) {
          _horizontal = true;
          _axisLocked = true;
        } else {
          return;
        }
      } else {
        if (adx >= 3 && adx > ady * 0.9) {
          _horizontal = true;
          _axisLocked = true;
        } else if (ady >= 3 && ady >= adx) {
          _reset();
          return;
        } else {
          return;
        }
      }
    }

    if (!_horizontal || _approachFired) return;
    final w = MediaQuery.sizeOf(context).width;
    if (w <= 0) return;
    if (_dx.abs() / w >= 0.04) {
      _approachFired = true;
      widget.onApproachEdge?.call(_dx < 0 ? 'next' : 'prev');
    }
  }

  void _onPointerUp(PointerUpEvent e) {
    if (_pointer != e.pointer) return;
    if (!_horizontal) {
      _reset();
      return;
    }

    final w = MediaQuery.sizeOf(context).width;
    final ratio = _dx.abs() / (w <= 0 ? 1 : w);
    final goingNext = _dx < 0;
    final commit = ratio >= 0.11 || ratio >= 0.06 && _dx.abs() >= 36 || ratio >= 0.2;

    if (commit) {
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
    }
    _reset();
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: _onPointerDown,
      onPointerMove: _onPointerMove,
      onPointerUp: _onPointerUp,
      onPointerCancel: (_) => _reset(),
      child: widget.child,
    );
  }
}
