/// 书架横滑切节：全屏轴锁，逻辑对齐圣经 Tab / useReaderPageTurn。
library;

import 'package:flutter/material.dart';

class ShelfSnapTurnGesture extends StatefulWidget {
  const ShelfSnapTurnGesture({
    super.key,
    required this.child,
    required this.enabled,
    this.edgeOnly = false,
    this.onTurnNext,
    this.onTurnPrev,
    this.onBoundary,
    this.onApproachEdge,
    this.shouldYieldTurn,
    this.hitIsProseContent,
  });

  final Widget child;
  final bool enabled;
  final bool edgeOnly;
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
  static const _axisMinPx = 8.0;
  static const _axisRatio = 1.15;
  static const _thresholdNext = 0.13;
  static const _thresholdPrev = 0.09;
  static const _prefetchRatio = 0.04;

  int? _pointer;
  Offset _start = Offset.zero;
  double _dx = 0;
  var _axisLocked = false;
  var _horizontal = false;
  var _approachFired = false;

  void _reset() {
    _pointer = null;
    _axisLocked = false;
    _horizontal = false;
    _dx = 0;
    _approachFired = false;
  }

  void _onPointerDown(PointerDownEvent e) {
    if (!widget.enabled) return;
    if (widget.shouldYieldTurn?.call() == true) return;
    if (widget.edgeOnly) {
      final w = MediaQuery.sizeOf(context).width;
      if (e.position.dx >= 88 && e.position.dx <= w - 88) return;
    }
    _pointer = e.pointer;
    _start = e.position;
    _dx = 0;
    _axisLocked = false;
    _horizontal = false;
    _approachFired = false;
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
      if (adx < _axisMinPx && ady < _axisMinPx) return;
      if (adx >= _axisMinPx && adx > ady * _axisRatio) {
        _horizontal = true;
        _axisLocked = true;
      } else if (ady >= _axisMinPx && ady >= adx * _axisRatio) {
        _reset();
        return;
      } else if (adx >= _axisMinPx * 1.2 && adx > ady) {
        _horizontal = true;
        _axisLocked = true;
      } else {
        _reset();
        return;
      }
    }

    if (!_horizontal || _approachFired) return;
    final w = MediaQuery.sizeOf(context).width;
    if (w <= 0) return;
    if (_dx.abs() / w >= _prefetchRatio) {
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
    final threshold = goingNext ? _thresholdNext : _thresholdPrev;
    final commit = ratio >= threshold || ratio >= (goingNext ? 0.09 : 0.07);

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
