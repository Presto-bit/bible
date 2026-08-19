/// 经文选区手势（对齐 PWA 触控划选：长按起选、拖扩、两端手柄）。
library;

import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import 'selection_range.dart';
import 'verse_words.dart';

/// 词块命中：普通经文不让翻页；词典下划线让路（对齐 PWA `.proper-noun`）。
class WordHitMeta {
  const WordHitMeta({required this.anchor, this.isDict = false});
  final WordAnchor anchor;
  final bool isDict;
}

/// 翻页让路标记：工具条 / 计划条 / 手柄等。
class PageTurnYieldToken {
  const PageTurnYieldToken();
}

class PageTurnYield extends StatelessWidget {
  const PageTurnYield({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return MetaData(
      metaData: const PageTurnYieldToken(),
      behavior: HitTestBehavior.translucent,
      child: child,
    );
  }
}

class _IndexRun {
  const _IndexRun.placeholder({required this.start, this.anchor})
    : length = 1,
      verse = null,
      verseStart = null,
      words = null;

  const _IndexRun.text({
    required this.start,
    required this.length,
    required this.verse,
    required this.verseStart,
    required this.words,
  }) : anchor = null;

  final int start;
  final int length;
  final WordAnchor? anchor;
  final int? verse;
  final int? verseStart;
  final List<VerseWordSlice>? words;
}

/// 把 RichText 的 UTF-16 偏移映回词锚点，供 idle 合并 TextSpan 后仍能划词。
class VerseTextLocator {
  VerseTextLocator(this._runs);
  final List<_IndexRun> _runs;

  WordAnchor? anchorAt(int offset) {
    if (_runs.isEmpty) return null;
    for (final run in _runs) {
      final end = run.start + run.length;
      if (offset < run.start || offset > end) continue;
      if (offset == end && offset != run.start) continue;
      if (run.anchor != null) return run.anchor;
      final words = run.words;
      final verse = run.verse;
      final verseStart = run.verseStart;
      if (words == null || verse == null || verseStart == null) return null;
      final local = (offset - run.start).clamp(0, run.length);
      final charInVerse = verseStart + local;
      for (final w in words) {
        if (charInVerse < w.end && (charInVerse >= w.start || local == 0)) {
          if (charInVerse >= w.start || w.start == verseStart) {
            return WordAnchor(verse: verse, start: w.start, end: w.end);
          }
        }
      }
      if (words.isNotEmpty && charInVerse >= words.last.start) {
        final w = words.last;
        return WordAnchor(verse: verse, start: w.start, end: w.end);
      }
      if (words.isNotEmpty) {
        final w = words.first;
        return WordAnchor(verse: verse, start: w.start, end: w.end);
      }
      return null;
    }
    // 落在末尾：取最后一段有词的 run
    for (final run in _runs.reversed) {
      if (run.anchor != null) return run.anchor;
      final words = run.words;
      final verse = run.verse;
      if (words != null && words.isNotEmpty && verse != null) {
        final w = words.last;
        return WordAnchor(verse: verse, start: w.start, end: w.end);
      }
    }
    return null;
  }

  WordAnchor? hitParagraph(RenderParagraph para, Offset global) {
    final local = para.globalToLocal(global);
    final pos = para.getPositionForOffset(local);
    return anchorAt(pos.offset);
  }

  /// 词锚点在 RichText 内的 UTF-16 起止（供 getBoxesForSelection）。
  (int start, int end)? offsetsForAnchor(WordAnchor anchor) {
    for (final run in _runs) {
      if (run.verse != anchor.verse ||
          run.words == null ||
          run.verseStart == null) {
        continue;
      }
      final vs = run.verseStart!;
      final lo = anchor.start.clamp(vs, vs + run.length);
      final hi = anchor.end.clamp(vs, vs + run.length);
      if (hi <= lo) continue;
      return (run.start + (lo - vs), run.start + (hi - vs));
    }
    return null;
  }
}

/// 构建 RichText 偏移索引：TextSpan 按字符、WidgetSpan 占 1。
class SpanIndexBuilder {
  int _offset = 0;
  final _runs = <_IndexRun>[];

  int get offset => _offset;

  void placeholder({WordAnchor? anchor}) {
    _runs.add(_IndexRun.placeholder(start: _offset, anchor: anchor));
    _offset += 1;
  }

  void text({
    required String value,
    required int verse,
    required int verseStart,
    required List<VerseWordSlice> words,
  }) {
    if (value.isEmpty) return;
    _runs.add(
      _IndexRun.text(
        start: _offset,
        length: value.length,
        verse: verse,
        verseStart: verseStart,
        words: words,
      ),
    );
    _offset += value.length;
  }

  void absorbSpans(List<InlineSpan> spans) {
    for (final span in spans) {
      if (span is TextSpan) {
        final t = span.text;
        if (t != null && t.isNotEmpty) {
          _runs.add(
            _IndexRun.text(
              start: _offset,
              length: t.length,
              verse: 0,
              verseStart: 0,
              words: const [],
            ),
          );
          _offset += t.length;
        }
        if (span.children != null) absorbSpans(span.children!);
      } else {
        placeholder();
      }
    }
  }

  VerseTextLocator build() => VerseTextLocator(List.unmodifiable(_runs));
}

WordAnchor? _anchorFromMeta(Object? data) {
  if (data is WordAnchor) return data;
  if (data is WordHitMeta) return data.anchor;
  return null;
}

RenderParagraph? _paragraphOf(RenderMetaData md) {
  final child = md.child;
  if (child is RenderParagraph) return child;
  RenderParagraph? found;
  md.visitChildren((c) {
    if (c is RenderParagraph) found = c;
  });
  return found;
}

HitTestResult _hitAt(BuildContext context, Offset global) {
  final result = HitTestResult();
  final view = View.maybeOf(context);
  if (view == null) return result;
  WidgetsBinding.instance.hitTestInView(result, global, view.viewId);
  return result;
}

WordAnchor? _anchorFromHit(HitTestResult result, Offset global) {
  WordAnchor? fromLocator;
  for (final entry in result.path) {
    final target = entry.target;
    if (target is! RenderMetaData) continue;
    final data = target.metaData;
    final chip = _anchorFromMeta(data);
    if (chip != null) return chip;
    if (data is VerseTextLocator) {
      final para = _paragraphOf(target);
      if (para != null) {
        fromLocator ??= data.hitParagraph(para, global);
      }
    }
  }
  return fromLocator;
}

/// 从命中测试取出经文词锚点。
WordAnchor? wordAnchorAt(BuildContext context, Offset global) {
  return _anchorFromHit(_hitAt(context, global), global);
}

bool _yieldFromHit(HitTestResult result) {
  for (final entry in result.path) {
    final target = entry.target;
    if (target is! RenderMetaData) continue;
    final data = target.metaData;
    if (data is PageTurnYieldToken) return true;
    if (data is WordHitMeta && data.isDict) return true;
  }
  return false;
}

/// 对齐 PWA `shouldYieldPageTurn`：词典 / 工具条 / 计划条让路，普通经文不让。
bool shouldYieldPageTurn(BuildContext context, Offset global) {
  if (_yieldFromHit(_hitAt(context, global))) return true;
  const r = 8.0;
  const pts = <Offset>[
    Offset(0, -r),
    Offset(0, r),
    Offset(-r, 0),
    Offset(r, 0),
  ];
  for (final d in pts) {
    if (_yieldFromHit(_hitAt(context, global + d))) return true;
  }
  return false;
}

/// 指针落在词缝时，环向采样找最近词，减少拖扩「丢字」。
WordAnchor? wordAnchorNear(
  BuildContext context,
  Offset global, {
  double maxRadius = 36,
}) {
  final direct = wordAnchorAt(context, global);
  if (direct != null) return direct;
  const dirs = <Offset>[
    Offset(-1, 0),
    Offset(1, 0),
    Offset(0, -1),
    Offset(0, 1),
    Offset(-0.7, -0.7),
    Offset(0.7, -0.7),
    Offset(-0.7, 0.7),
    Offset(0.7, 0.7),
  ];
  for (var r = 4.0; r <= maxRadius; r += 4) {
    for (final d in dirs) {
      final hit = wordAnchorAt(context, global + d * r);
      if (hit != null) return hit;
    }
  }
  return null;
}

class SelectionHandleLayout {
  const SelectionHandleLayout({
    required this.start,
    required this.end,
    required this.lineHeight,
  });
  final Offset start;
  final Offset end;
  final double lineHeight;
}

/// 选区两端手柄锚点（全局坐标，落在首/末词块底边）。
SelectionHandleLayout? locateSelectionHandles(
  BuildContext context,
  WordRange range,
) {
  final fromBoxes = _locateSelectionHandlesViaBoxes(context, range);
  if (fromBoxes != null) return fromBoxes;

  final root = context.findRenderObject();
  if (root == null) return null;
  RenderBox? startBox;
  RenderBox? endBox;

  void visit(RenderObject obj) {
    if (obj is RenderMetaData && obj.hasSize) {
      final a = _anchorFromMeta(obj.metaData);
      if (a != null) {
        final edge = wordSelectionEdge(a.verse, a.start, a.end, range);
        if (edge.left) startBox = obj;
        if (edge.right) endBox = obj;
      }
    }
    obj.visitChildren(visit);
  }

  visit(root);
  final start = startBox;
  final end = endBox;
  if (start == null || end == null) return null;
  final startOrigin = start.localToGlobal(Offset.zero);
  final endOrigin = end.localToGlobal(Offset.zero);
  return SelectionHandleLayout(
    start: Offset(startOrigin.dx, startOrigin.dy + start.size.height),
    end: Offset(endOrigin.dx + end.size.width, endOrigin.dy + end.size.height),
    lineHeight: start.size.height.clamp(16.0, 48.0),
  );
}

SelectionHandleLayout? _locateSelectionHandlesViaBoxes(
  BuildContext context,
  WordRange range,
) {
  final n = normalizeWordRange(range);
  RenderParagraph? startPara;
  RenderParagraph? endPara;
  TextSelection? startSel;
  TextSelection? endSel;

  void visit(RenderObject obj) {
    if (obj is RenderMetaData) {
      final data = obj.metaData;
      if (data is VerseTextLocator) {
        final para = _paragraphOf(obj);
        if (para == null) return;
        final aOff = data.offsetsForAnchor(n.anchor);
        final fOff = data.offsetsForAnchor(n.focus);
        if (aOff != null) {
          startPara = para;
          startSel = TextSelection(baseOffset: aOff.$1, extentOffset: aOff.$2);
        }
        if (fOff != null) {
          endPara = para;
          endSel = TextSelection(baseOffset: fOff.$1, extentOffset: fOff.$2);
        }
      }
    }
    obj.visitChildren(visit);
  }

  final root = context.findRenderObject();
  if (root == null) return null;
  visit(root);
  final sp = startPara;
  final ep = endPara;
  final ss = startSel;
  final es = endSel;
  if (sp == null || ep == null || ss == null || es == null) return null;

  final startBoxes = sp.getBoxesForSelection(ss);
  final endBoxes = ep.getBoxesForSelection(es);
  if (startBoxes.isEmpty || endBoxes.isEmpty) return null;

  final startBox = sp as RenderBox;
  final endBox = ep as RenderBox;
  final sRect = startBoxes.first.toRect();
  final eRect = endBoxes.last.toRect();
  final gStart = startBox.localToGlobal(Offset(sRect.left, sRect.bottom));
  final gEnd = endBox.localToGlobal(Offset(eRect.right, eRect.bottom));
  return SelectionHandleLayout(
    start: gStart,
    end: gEnd,
    lineHeight: sRect.height.clamp(16.0, 48.0),
  );
}

/// 章列表外包：长按 360ms 选词；武装后拖扩选区。
///
/// **刻意不对齐** PWA「未长按横扫选词」：短横滑交给 ListView 滚 / 翻章。
class VerseSelectionSurface extends StatefulWidget {
  const VerseSelectionSurface({
    super.key,
    required this.child,
    required this.enabled,
    required this.onApplyRange,
    required this.onCommitRange,
    this.onClearIfEmptyTap,
    this.onSelectionGestureChanged,
    this.selectionPrimed = false,
    this.primedRange,
  });

  final Widget child;
  final bool enabled;
  final void Function(WordAnchor anchor, WordAnchor focus, {bool commit})
  onApplyRange;
  final void Function() onCommitRange;
  final VoidCallback? onClearIfEmptyTap;
  final ValueChanged<bool>? onSelectionGestureChanged;

  /// 已有选区时，点在词上立刻武装拖扩，无需再等长按。
  final bool selectionPrimed;

  /// 已有选区时的锚点区间；拖扩时保留 anchor，不重置为单字。
  final WordRange? primedRange;

  @override
  State<VerseSelectionSurface> createState() => VerseSelectionSurfaceState();
}

class VerseSelectionSurfaceState extends State<VerseSelectionSurface> {
  /// 横滑翻章轴锁定时清掉进行中的长按/拖选，避免与翻页抢手势。
  void cancelPointerTracking() => _resetPointer();
  WordAnchor? _anchor;
  Offset? _down;
  bool _dragging = false;
  bool _armed = false;
  int? _pointer;
  Timer? _lp;
  WordAnchor? _lastFocus;

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
    _lastFocus = null;
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
        if (_yieldFromHit(_hitAt(context, e.position))) {
          _pointer = e.pointer;
          _down = e.position;
          return;
        }
        final w = wordAnchorNear(context, e.position, maxRadius: 12);
        if (w == null) {
          _pointer = e.pointer;
          _down = e.position;
          _anchor = null;
          return;
        }
        _pointer = e.pointer;
        _down = e.position;
        _dragging = false;
        _armed = false;
        _clearLp();
        if (widget.selectionPrimed && widget.primedRange != null) {
          final n = normalizeWordRange(widget.primedRange!);
          _anchor = n.anchor;
          _lastFocus = n.focus;
          _armed = true;
          _notifyGesture(true);
          return;
        }
        _anchor = w;
        _lastFocus = w;
        _lp = Timer(const Duration(milliseconds: 360), () {
          if (!mounted || _anchor == null || _dragging) return;
          _armed = true;
          _notifyGesture(true);
          widget.onApplyRange(_anchor!, _anchor!, commit: true);
          HapticFeedback.selectionClick();
        });
      },
      onPointerMove: (e) {
        if (_pointer != e.pointer) return;
        final down = _down;
        final anchor = _anchor;
        if (down == null) return;
        final dist = (e.position - down).distance;
        if (!_armed) {
          // 长按等待：小幅抖动不取消；明确竖滚/横翻方向才放弃选词。
          if (dist >= 14) {
            final dx = (e.position.dx - down.dx).abs();
            final dy = (e.position.dy - down.dy).abs();
            if ((dy >= 14 && dy > dx * 1.35) ||
                (dx >= 14 && dx > dy * 1.35)) {
              _clearLp();
              _anchor = null;
              _lastFocus = null;
            }
          }
          return;
        }
        if (anchor == null) return;
        if (!_dragging) {
          _dragging = true;
          _notifyGesture(true);
        }
        final focus = wordAnchorNear(
          context,
          e.position,
          maxRadius: _dragging ? 56 : 40,
        );
        if (focus != null) {
          final same =
              _lastFocus != null &&
              _lastFocus!.verse == focus.verse &&
              _lastFocus!.start == focus.start &&
              _lastFocus!.end == focus.end;
          if (!same) {
            _lastFocus = focus;
            widget.onApplyRange(anchor, focus, commit: false);
          }
        }
      },
      onPointerUp: (e) {
        if (_pointer != e.pointer) return;
        final hadDrag = _dragging;
        final blank = _anchor == null && !_armed;
        if (hadDrag) {
          widget.onCommitRange();
        }
        if (blank && _down != null && (e.position - _down!).distance < 8) {
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

/// 词块芯片：MetaData 供命中测试；选中底色用文字背景 + 横向阴影缝合。
class SelectableWordChip extends StatelessWidget {
  const SelectableWordChip({
    super.key,
    required this.anchor,
    required this.text,
    required this.style,
    this.selected = false,
    this.edgeLeft = false,
    this.edgeRight = false,
    this.isDict = false,
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
  final bool isDict;
  final VoidCallback? onTap;
  final VoidCallback? onDictTap;
  final VoidCallback? onDoubleTap;

  static const _sel = Color(0x473390FF);

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.horizontal(
      left: edgeLeft ? const Radius.circular(3) : Radius.zero,
      right: edgeRight ? const Radius.circular(3) : Radius.zero,
    );
    final textStyle = selected
        ? style.copyWith(backgroundColor: _sel)
        : style;
    Widget child = Text(
      text,
      style: textStyle,
      textHeightBehavior: const TextHeightBehavior(
        applyHeightToFirstAscent: false,
        applyHeightToLastDescent: false,
      ),
    );
    if (selected && (edgeLeft || edgeRight)) {
      child = ClipRRect(borderRadius: radius, child: child);
    }
    return MetaData(
      metaData: WordHitMeta(anchor: anchor, isDict: isDict),
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

/// 选区两端拖动手柄（对齐系统划选）。
class VerseSelectionHandles extends StatelessWidget {
  const VerseSelectionHandles({
    super.key,
    required this.start,
    required this.end,
    required this.onDrag,
    required this.onCommit,
    required this.onGestureChanged,
  });

  final Offset start;
  final Offset end;
  final void Function(Offset global, {required bool isStart}) onDrag;
  final VoidCallback onCommit;
  final ValueChanged<bool> onGestureChanged;

  static const _blue = Color(0xFF3390FF);

  @override
  Widget build(BuildContext context) {
    return PageTurnYield(
      child: Stack(
        children: [
          _handle(context, start, isStart: true),
          _handle(context, end, isStart: false),
        ],
      ),
    );
  }

  Widget _handle(BuildContext context, Offset pos, {required bool isStart}) {
    const size = 22.0;
    return Positioned(
      left: pos.dx - size / 2,
      top: pos.dy - 2,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onPanStart: (_) => onGestureChanged(true),
        onPanUpdate: (d) => onDrag(d.globalPosition, isStart: isStart),
        onPanEnd: (_) {
          onCommit();
          onGestureChanged(false);
        },
        onPanCancel: () => onGestureChanged(false),
        child: CustomPaint(
          size: const Size(size, 28),
          painter: _HandlePainter(color: _blue, isStart: isStart),
        ),
      ),
    );
  }
}

class _HandlePainter extends CustomPainter {
  const _HandlePainter({required this.color, required this.isStart});
  final Color color;
  final bool isStart;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final cx = size.width / 2;
    canvas.drawRect(Rect.fromLTWH(cx - 1.1, 0, 2.2, 8), paint);
    canvas.drawCircle(Offset(cx, 16), 8, paint);
  }

  @override
  bool shouldRepaint(covariant _HandlePainter old) =>
      old.color != color || old.isStart != isStart;
}

Widget readerLocatedRichText({
  required VerseTextLocator locator,
  required InlineSpan text,
  TextAlign textAlign = TextAlign.justify,
}) {
  return MetaData(
    metaData: locator,
    behavior: HitTestBehavior.translucent,
    child: RichText(textAlign: textAlign, text: text),
  );
}
