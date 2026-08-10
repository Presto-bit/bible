/// 经文选区手势（对齐 PWA ReaderView 词块 + 长按 / 拖扩）。
library;

import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import 'selection_range.dart';

/// 从命中测试取出经文词锚点。
WordAnchor? wordAnchorAt(BuildContext context, Offset global) {
  final view = View.maybeOf(context);
  if (view == null) return null;
  final result = HitTestResult();
  WidgetsBinding.instance.hitTestInView(result, global, view.viewId);
  for (final entry in result.path) {
    final target = entry.target;
    if (target is RenderMetaData) {
      final data = target.metaData;
      if (data is WordAnchor) return data;
    }
  }
  return null;
}

/// 章列表外包：长按 420ms 选词；武装后拖扩选区。
///
/// **刻意不对齐** PWA「未长按横扫选词」：短横滑交给 ListView 滚 / 翻章，
/// 避免与垂直滚动、页翻 peek 打架。扩区仅在长按武装（或已拖选）后生效。
class VerseSelectionSurface extends StatefulWidget {
  const VerseSelectionSurface({
    super.key,
    required this.child,
    required this.enabled,
    required this.onApplyRange,
    required this.onCommitRange,
    this.onClearIfEmptyTap,
    this.onSelectionGestureChanged,
  });

  final Widget child;
  final bool enabled;
  final void Function(WordAnchor anchor, WordAnchor focus, {bool commit})
      onApplyRange;
  final void Function() onCommitRange;
  final VoidCallback? onClearIfEmptyTap;
  final ValueChanged<bool>? onSelectionGestureChanged;

  @override
  State<VerseSelectionSurface> createState() => _VerseSelectionSurfaceState();
}

class _VerseSelectionSurfaceState extends State<VerseSelectionSurface> {
  WordAnchor? _anchor;
  Offset? _down;
  bool _dragging = false;
  bool _armed = false;
  int? _pointer;
  Timer? _lp;

  void _clearLp() {
    _lp?.cancel();
    _lp = null;
  }

  void _resetPointer() {
    _clearLp();
    final was = _dragging || _armed;
    _anchor = null;
    _down = null;
    _dragging = false;
    _armed = false;
    _pointer = null;
    if (was) widget.onSelectionGestureChanged?.call(false);
  }

  void _notifyGesture(bool on) => widget.onSelectionGestureChanged?.call(on);

  @override
  void dispose() {
    _clearLp();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) return widget.child;
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (e) {
        if (e.kind != PointerDeviceKind.touch &&
            e.kind != PointerDeviceKind.mouse &&
            e.kind != PointerDeviceKind.stylus) {
          return;
        }
        if (_pointer != null) return;
        final w = wordAnchorAt(context, e.position);
        if (w == null) {
          // 空白点：稍后 pointerup 清选
          _pointer = e.pointer;
          _down = e.position;
          _anchor = null;
          return;
        }
        _pointer = e.pointer;
        _down = e.position;
        _anchor = w;
        _dragging = false;
        _armed = false;
        _clearLp();
        // PWA: 420ms 未移动则选中该词
        _lp = Timer(const Duration(milliseconds: 420), () {
          if (!mounted || _anchor == null || _dragging) return;
          _armed = true;
          _notifyGesture(true);
          widget.onApplyRange(_anchor!, _anchor!, commit: true);
        });
      },
      onPointerMove: (e) {
        if (_pointer != e.pointer) return;
        final down = _down;
        final anchor = _anchor;
        if (down == null) return;
        final dist = (e.position - down).distance;
        // 未长按完成：移动即取消 LP（保护滚动手势）
        if (!_armed) {
          if (dist >= 10) {
            _clearLp();
            _anchor = null;
            // 保留 pointer 让 up 不再误清选
          }
          return;
        }
        if (anchor == null) return;
        // 武装后低阈值跟手扩区（比 6px 更顺）
        if (!_dragging && dist < 2) return;
        if (!_dragging) {
          _dragging = true;
        }
        final focus = wordAnchorAt(context, e.position);
        if (focus != null) {
          widget.onApplyRange(anchor, focus, commit: false);
        }
      },
      onPointerUp: (e) {
        if (_pointer != e.pointer) return;
        final hadDrag = _dragging;
        final blank = _anchor == null && !_armed;
        if (hadDrag) {
          widget.onCommitRange();
        }
        if (blank &&
            _down != null &&
            (e.position - _down!).distance < 8) {
          widget.onClearIfEmptyTap?.call();
        }
        _resetPointer();
      },
      onPointerCancel: (e) {
        if (_pointer == e.pointer) _resetPointer();
      },
      child: widget.child,
    );
  }
}

/// 词块芯片：MetaData 供命中测试；选中底色用文字背景 + 横向阴影缝合（对齐 PWA `.verse-word.is-active`）。
class SelectableWordChip extends StatelessWidget {
  const SelectableWordChip({
    super.key,
    required this.anchor,
    required this.text,
    required this.style,
    this.selected = false,
    this.edgeLeft = false,
    this.edgeRight = false,
    this.onTap,
    this.onDictTap,
    this.onDoubleTap,
  });

  final WordAnchor anchor;
  final String text;
  final TextStyle style;
  final bool selected;
  final bool edgeLeft;
  final bool edgeRight;
  final VoidCallback? onTap;
  final VoidCallback? onDictTap;
  final VoidCallback? onDoubleTap;

  static const _sel = Color(0x473390FF);

  @override
  Widget build(BuildContext context) {
    // 连续蓝带：文字背景 + 左右阴影盖缝，端点轻圆角
    final radius = BorderRadius.horizontal(
      left: edgeLeft ? const Radius.circular(3) : Radius.zero,
      right: edgeRight ? const Radius.circular(3) : Radius.zero,
    );
    final wordStyle = selected
        ? style.copyWith(
            backgroundColor: _sel,
            // 略收紧高度，减少 WidgetSpan 缝
            height: (style.height ?? 1.85) * 0.98,
          )
        : style;
    Widget child = Text(text, style: wordStyle);
    if (selected) {
      child = DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: radius,
          boxShadow: const [
            // 对齐 PWA box-shadow: 横向扩展缝合词间
            BoxShadow(color: _sel, offset: Offset(2.2, 0), blurRadius: 0),
            BoxShadow(color: _sel, offset: Offset(-2.2, 0), blurRadius: 0),
          ],
        ),
        child: child,
      );
    }
    return MetaData(
      metaData: anchor,
      behavior: HitTestBehavior.translucent,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: onDictTap ?? onTap,
        onDoubleTap: onDoubleTap,
        child: child,
      ),
    );
  }
}
