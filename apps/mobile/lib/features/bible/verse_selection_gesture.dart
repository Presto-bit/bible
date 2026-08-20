/// 经文选区手势（对齐 PWA 触控划选：长按起选、拖扩、两端手柄）。
library;

import 'dart:async';
import 'dart:math' as math;

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

  /// 节内字符区间 → RichText UTF-16 偏移（供选区 overlay / 手柄）。
  /// 跨同节多个 TextSpan run 时合并起止。
  (int start, int end)? offsetsForVerseCharRange(
    int verse,
    int charStart,
    int charEnd,
  ) {
    int? utfLo;
    int? utfHi;
    for (final run in _runs) {
      if (run.verse != verse || run.verseStart == null || run.words == null) {
        continue;
      }
      final vs = run.verseStart!;
      final runCharEnd = vs + run.length;
      if (charEnd <= vs || charStart >= runCharEnd) continue;
      final lo = math.max(charStart, vs);
      final hi = math.min(charEnd, runCharEnd);
      if (hi <= lo) continue;
      final uLo = run.start + (lo - vs);
      final uHi = run.start + (hi - vs);
      utfLo = utfLo == null ? uLo : math.min(utfLo, uLo);
      utfHi = utfHi == null ? uHi : math.max(utfHi, uHi);
    }
    if (utfLo == null || utfHi == null || utfHi <= utfLo) return null;
    return (utfLo, utfHi);
  }

  /// 单点字符区间（兼容旧调用）。
  (int start, int end)? offsetsForVerseChars(
    int verse,
    int charStart,
    int charEnd,
  ) =>
      offsetsForVerseCharRange(verse, charStart, charEnd);

  int verseTextLength(int verse) {
    var len = 0;
    for (final run in _runs) {
      if (run.verse == verse && run.words != null) {
        len = math.max(len, run.length);
      }
    }
    return len;
  }

  Iterable<int> versesInParagraph() sync* {
    final seen = <int>{};
    for (final run in _runs) {
      final v = run.verse;
      if (v != null && v > 0 && seen.add(v)) yield v;
    }
  }

  /// 当前 [range] 在本段该节内的字符起止（节内坐标）。
  (int start, int end)? charRangeInSelection(int verse, WordRange range) {
    final n = normalizeWordRange(range);
    if (!n.verses.contains(verse)) return null;
    final textLen = verseTextLength(verse);
    if (textLen <= 0) return null;
    final loV = n.anchor.verse;
    final hiV = n.focus.verse;
    if (loV == hiV) {
      final lo = math.min(n.anchor.start, n.focus.start);
      final hi = math.max(n.anchor.end, n.focus.end);
      return (math.min(lo, textLen), math.min(hi, textLen));
    }
    if (verse == loV) {
      return (math.min(n.anchor.start, textLen), textLen);
    }
    if (verse == hiV) {
      return (0, math.min(n.focus.end, textLen));
    }
    return (0, textLen);
  }

  /// 规范化选区在指定节内的 UTF-16 起止（整段 overlay / 手柄共用）。
  (int start, int end)? utf16RangeInSelection(int verse, WordRange range) {
    final chars = charRangeInSelection(verse, range);
    if (chars == null) return null;
    return offsetsForVerseCharRange(verse, chars.$1, chars.$2);
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

/// 选区两端手柄锚点（全局坐标，落在选区首尾字符底边）。
///
/// 优先 [RenderParagraph.getBoxesForSelection]；高亮矩形兜底；词典词块 MetaData 最后。
SelectionHandleLayout? locateSelectionHandles(
  BuildContext context,
  WordRange range,
) {
  final fromBoxes = _locateSelectionHandlesViaBoxes(context, range);
  if (fromBoxes != null) return fromBoxes;
  final fromRects = _locateSelectionHandlesViaHighlightRects(context, range);
  if (fromRects != null) return fromRects;
  return _locateSelectionHandlesViaMeta(context, range);
}

/// 收集词级选区高亮矩形（全局坐标，供 overlay 绘制）。
List<Rect> collectWordRangeHighlightRects(
  BuildContext context,
  WordRange range,
) {
  final rects = <Rect>[];
  final root = context.findRenderObject();
  if (root == null) return rects;

  void visit(RenderObject obj) {
    if (obj is RenderMetaData && obj.metaData is VerseTextLocator) {
      final locator = obj.metaData as VerseTextLocator;
      final para = _paragraphOf(obj);
      if (para == null) return;
      final box = para as RenderBox;
      for (final verse in locator.versesInParagraph()) {
        final chars = locator.charRangeInSelection(verse, range);
        if (chars == null) continue;
        final utf = locator.offsetsForVerseCharRange(verse, chars.$1, chars.$2);
        if (utf == null) continue;
        final sel = TextSelection(
          baseOffset: utf.$1,
          extentOffset: utf.$2,
        );
        for (final tb in para.getBoxesForSelection(sel)) {
          final r = tb.toRect();
          final g = box.localToGlobal(r.topLeft);
          rects.add(Rect.fromLTWH(g.dx, g.dy, r.width, r.height));
        }
      }
    }
    obj.visitChildren(visit);
  }

  visit(root);
  return rects;
}

SelectionHandleLayout? _locateSelectionHandlesViaMeta(
  BuildContext context,
  WordRange range,
) {
  final root = context.findRenderObject();
  if (root == null) return null;
  RenderBox? startBox;
  RenderBox? endBox;

  void visit(RenderObject obj) {
    if (obj is RenderMetaData && obj.hasSize) {
      final a = _anchorFromMeta(obj.metaData);
      if (a != null) {
        final edge = wordSelectionEdge(a.verse, a.start, a.end, range);
        if (edge.left && startBox == null) startBox = obj;
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
  final startVerse = n.anchor.verse;
  final endVerse = n.focus.verse;
  final startChar = startVerse == endVerse
      ? math.min(n.anchor.start, n.focus.start)
      : n.anchor.start;
  final endChar = startVerse == endVerse
      ? math.max(n.anchor.end, n.focus.end)
      : n.focus.end;

  RenderParagraph? startPara;
  RenderParagraph? endPara;
  int? startOff;
  int? endOff;

  void visit(RenderObject obj) {
    if (obj is RenderMetaData && obj.metaData is VerseTextLocator) {
      final locator = obj.metaData as VerseTextLocator;
      final para = _paragraphOf(obj);
      if (para == null) return;
      if (locator.charRangeInSelection(startVerse, range) != null) {
        final len = locator.verseTextLength(startVerse);
        final cs = math.min(math.max(startChar, 0), math.max(0, len - 1));
        final aUtf = locator.offsetsForVerseCharRange(
          startVerse,
          cs,
          math.min(cs + 1, len),
        );
        if (aUtf != null) {
          startPara ??= para;
          startOff ??= aUtf.$1;
        }
      }
      if (locator.charRangeInSelection(endVerse, range) != null) {
        final len = locator.verseTextLength(endVerse);
        final ce = math.min(math.max(endChar, 0), len);
        final lo = math.max(0, ce - 1);
        final fUtf = locator.offsetsForVerseCharRange(endVerse, lo, ce);
        if (fUtf != null) {
          endPara = para;
          endOff = fUtf.$2;
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
  final so = startOff;
  final eo = endOff;
  if (sp == null || ep == null || so == null || eo == null) return null;

  final startBoxes = sp.getBoxesForSelection(TextSelection.collapsed(offset: so));
  final endBoxes = ep.getBoxesForSelection(TextSelection.collapsed(offset: eo));
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

SelectionHandleLayout? _locateSelectionHandlesViaHighlightRects(
  BuildContext context,
  WordRange range,
) {
  final rects = collectWordRangeHighlightRects(context, range);
  if (rects.isEmpty) return null;

  Rect first = rects.first;
  Rect last = rects.first;
  for (final r in rects) {
    if (r.top < first.top - 0.5 ||
        (r.top - first.top).abs() < 0.5 && r.left < first.left) {
      first = r;
    }
    if (r.bottom > last.bottom + 0.5 ||
        (r.bottom - last.bottom).abs() < 0.5 && r.right > last.right) {
      last = r;
    }
  }

  return SelectionHandleLayout(
    start: Offset(first.left, first.bottom),
    end: Offset(last.right, last.bottom),
    lineHeight: first.height.clamp(16.0, 48.0),
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
          // 长按等待：仅明确竖滚才放弃；横移留给拖扩选 / 翻章轴锁。
          if (dist >= 22) {
            final dx = (e.position.dx - down.dx).abs();
            final dy = (e.position.dy - down.dy).abs();
            if (dy >= 22 && dy > dx * 1.8) {
              _clearLp();
              _anchor = null;
              _lastFocus = null;
            }
          }
          return;
        }
        if (anchor == null) return;
        if (!_dragging && dist >= 4) {
          _dragging = true;
          _notifyGesture(true);
        }
        if (!_dragging) return;
        final focus = wordAnchorNear(
          context,
          e.position,
          maxRadius: 72,
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
        final wasGesture = _dragging || _armed;
        _resetPointer();
        if (wasGesture && !hadDrag) {
          widget.onSelectionGestureChanged?.call(false);
        }
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
        ? style.copyWith(backgroundColor: Colors.transparent)
        : style;
    Widget child = Text(
      text,
      style: textStyle,
      textHeightBehavior: const TextHeightBehavior(
        applyHeightToFirstAscent: false,
        applyHeightToLastDescent: false,
      ),
    );
    if (selected) {
      child = DecoratedBox(
        decoration: BoxDecoration(
          color: _sel,
          borderRadius: radius,
        ),
        child: child,
      );
    } else if (edgeLeft || edgeRight) {
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

/// 词级选区底色 overlay（对齐 PWA CSS Highlight：不改 RichText 排版）。
class WordRangeHighlightOverlay extends StatefulWidget {
  const WordRangeHighlightOverlay({
    super.key,
    required this.overlayKey,
    required this.rangeListenable,
    required this.range,
  });

  final GlobalKey overlayKey;
  final Listenable rangeListenable;
  final WordRange range;

  @override
  State<WordRangeHighlightOverlay> createState() =>
      _WordRangeHighlightOverlayState();
}

class _WordRangeHighlightOverlayState extends State<WordRangeHighlightOverlay> {
  int _repaintThrottleMs = 0;

  @override
  void initState() {
    super.initState();
    widget.rangeListenable.addListener(_repaint);
    WidgetsBinding.instance.addPostFrameCallback((_) => _repaint(force: true));
  }

  @override
  void didUpdateWidget(covariant WordRangeHighlightOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.rangeListenable != widget.rangeListenable) {
      oldWidget.rangeListenable.removeListener(_repaint);
      widget.rangeListenable.addListener(_repaint);
    }
    if (oldWidget.range != widget.range) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _repaint(force: true));
    }
  }

  @override
  void dispose() {
    widget.rangeListenable.removeListener(_repaint);
    super.dispose();
  }

  void _repaint({bool force = false}) {
    if (!mounted) return;
    if (!force) {
      final now = DateTime.now().millisecondsSinceEpoch;
      if (now - _repaintThrottleMs < 80) return;
      _repaintThrottleMs = now;
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final locateCtx = widget.overlayKey.currentContext ?? context;
    final globalRects = collectWordRangeHighlightRects(locateCtx, widget.range);
    if (globalRects.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _repaint(force: true));
      return const SizedBox.shrink();
    }
    final box =
        widget.overlayKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _repaint(force: true));
      return const SizedBox.shrink();
    }

    final localRects = globalRects
        .map((r) {
          final tl = box.globalToLocal(r.topLeft);
          return Rect.fromLTWH(tl.dx, tl.dy, r.width, r.height);
        })
        .toList(growable: false);

    return IgnorePointer(
      child: CustomPaint(
        size: box.size,
        painter: _WordRangeHighlightPainter(localRects),
      ),
    );
  }
}

class _WordRangeHighlightPainter extends CustomPainter {
  _WordRangeHighlightPainter(this.rects);

  final List<Rect> rects;
  static const _color = Color(0x473390FF);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = _color;
    for (final r in rects) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(r, const Radius.circular(3)),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _WordRangeHighlightPainter old) =>
      old.rects != rects;
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
        clipBehavior: Clip.none,
        fit: StackFit.expand,
        children: [
          _handle(start, isStart: true),
          _handle(end, isStart: false),
        ],
      ),
    );
  }

  Widget _handle(Offset pos, {required bool isStart}) {
    const size = 28.0;
    const hit = 44.0;
    return Positioned(
      left: pos.dx - hit / 2,
      top: pos.dy - 6,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onPanStart: (_) => onGestureChanged(true),
        onPanUpdate: (d) => onDrag(d.globalPosition, isStart: isStart),
        onPanEnd: (_) {
          onCommit();
          onGestureChanged(false);
        },
        onPanCancel: () => onGestureChanged(false),
        child: SizedBox(
          width: hit,
          height: hit,
          child: Center(
            child: CustomPaint(
              size: const Size(size, 32),
              painter: _HandlePainter(color: _blue, isStart: isStart),
            ),
          ),
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
