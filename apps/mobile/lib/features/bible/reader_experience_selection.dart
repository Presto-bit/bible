part of 'reader_experience.dart';

/// 划词/整节选区（从主文件拆出，便于维护）。
extension _ReaderChapterSelection on ReaderChapterBodyState {
  void _notifySelection() {
    widget.onSelectionChanged?.call(_selected.isNotEmpty);
  }

  // 长按：进入选中（整节）。
  void _startSelect(int verse, String text) {
    widget.onInteract();
    peiaiHapticSelection(context);
    final range = wholeVerseRange(verse, text);
    setState(() {
      _wordRange = range;
      _selected = {verse};
    });
    _notifySelection();
    _markRead(verse);
    _scheduleFocusBarLayout();
  }

  /// PWA applyWordRange：词锚点区间（拖选中可不 commit 进度）。
  void _applyWordRange(
    WordAnchor anchor,
    WordAnchor focus, {
    bool commit = true,
  }) {
    final range = WordRange(anchor: anchor, focus: focus);
    if (wordRangesEqual(_wordRange, range) &&
        _selected.containsAll(wordRangeToSpan(range).verses)) {
      if (commit) _commitWordRangeProgress();
      return;
    }
    widget.onInteract();
    if (commit || _wordRange == null) peiaiHapticSelection(context);
    final picked = wordRangeToSpan(range).verses.toSet();
    setState(() {
      _wordRange = range;
      _selected = picked;
    });
    _notifySelection();
    if (commit) {
      for (final v in picked) {
        _markRead(v);
      }
    }
    _scheduleFocusBarLayout();
  }

  /// 对齐 PWA scheduleWordRangeDuringDrag：拖扩选区每帧最多 apply 一次。
  void _scheduleWordRangeDuringDrag(WordAnchor anchor, WordAnchor focus) {
    _wordDragPendingAnchor = anchor;
    _wordDragPendingFocus = focus;
    if (_wordDragRafScheduled) return;
    _wordDragRafScheduled = true;
    SchedulerBinding.instance.scheduleFrameCallback((_) {
      _wordDragRafScheduled = false;
      if (!mounted) return;
      final a = _wordDragPendingAnchor;
      final f = _wordDragPendingFocus;
      if (a == null || f == null) return;
      _wordDragPendingAnchor = null;
      _wordDragPendingFocus = null;
      _applyWordRange(a, f, commit: false);
    });
  }

  void _setSelectionGestureActive(bool on) {
    if (!on) {
      _wordDragPendingAnchor = null;
      _wordDragPendingFocus = null;
      _wordDragRafScheduled = false;
    }
    if (_selectionGestureN.value != on) {
      _selectionGestureN.value = on;
    }
    if (_selectionGestureActive != on) {
      setState(() => _selectionGestureActive = on);
    }
  }

  void _commitWordRangeProgress() {
    _armSwipeIgnore();
    if (_wordRange == null) return;
    final picked = wordRangeToSpan(_wordRange!).verses;
    for (final v in picked) {
      _markRead(v);
    }
  }

  void _dragSelectionHandle(Offset global, {required bool isStart}) {
    final wr = _wordRange;
    if (wr == null) return;
    final hitCtx = _readerOverlayKey.currentContext ?? context;
    final hit = wordAnchorNear(hitCtx, global, maxRadius: 56);
    if (hit == null) return;
    final n = normalizeWordRange(wr);
    if (isStart) {
      _scheduleWordRangeDuringDrag(hit, n.focus);
    } else {
      _scheduleWordRangeDuringDrag(n.anchor, hit);
    }
  }

  void _onSelectionHandleGesture(bool on) {
    if (on) {
      _armSwipeIgnore();
      _cancelPagePointerTracking();
    }
    _setSelectionGestureActive(on);
  }

  // 词块长按：半节/词选起点（兼容节号旧路径）。
  void _startWordSelect(int verse, int start, int end) {
    final a = WordAnchor(verse: verse, start: start, end: end);
    _applyWordRange(a, a, commit: true);
  }

  // 词块点按：扩展选区焦点。
  void _extendWordSelect(int verse, int start, int end) {
    if (_wordRange == null) {
      _startWordSelect(verse, start, end);
      return;
    }
    final f = WordAnchor(verse: verse, start: start, end: end);
    _applyWordRange(_wordRange!.anchor, f, commit: true);
  }

  // 点按：扩展为连续区间（整节）。
  void _toggleSelect(int verse, String text) {
    if (_selected.isEmpty) return;
    widget.onInteract();
    if (_wordRange != null) {
      _extendWordSelect(verse, 0, text.length);
      return;
    }
    final lo = _selected.reduce((a, b) => a < b ? a : b);
    final hi = _selected.reduce((a, b) => a > b ? a : b);
    final start = verse < lo ? verse : lo;
    final end = verse > hi ? verse : hi;
    setState(() {
      _selected = {for (var i = start; i <= end; i++) i};
      _wordRange = WordRange(
        anchor: WordAnchor(verse: start, start: 0, end: 0),
        focus: WordAnchor(verse: end, start: 0, end: text.length),
      );
    });
    _notifySelection();
    _markRead(verse);
    _scheduleFocusBarLayout();
  }

  void _clearSelection() {
    _setSelectionGestureActive(false);
    setState(() {
      _selected.clear();
      _wordRange = null;
      _focusBarTop = null;
      _focusBarLeft = null;
    });
    _notifySelection();
  }

  int? get _selectionAnchorVerse {
    final sel = _sortedSel;
    if (sel.isEmpty) return null;
    return sel[sel.length ~/ 2];
  }

  List<int> get _sortedSel => _selected.toList()..sort();

  String _selectionText(Chapter? ch) {
    if (ch == null) return '';
    final discourse =
        ref.read(discourseCatalogProvider).value ?? const [];
    String fmt(Verse v) => formatVerseTextForReader(
      discourse,
      widget.book.id,
      widget.chapter,
      v.verse,
      v.text,
    );
    final wr = _wordRange;
    if (wr != null) {
      return textFromWordRange(
        wr,
        (v) {
          final verse = ch.verses.where((x) => x.verse == v).firstOrNull;
          return verse == null ? '' : fmt(verse);
        },
      );
    }
    return ch.verses
        .where((v) => _selected.contains(v.verse))
        .map(fmt)
        .join();
  }

  String get _selectionRefStr {
    final wr = _wordRange;
    if (wr == null) {
      return selectionRef(widget.book.id, widget.chapter, _sortedSel);
    }
    final p = wordRangeToSpan(wr);
    int? spanStart = p.span?.start;
    int? spanEnd = p.span?.end;
    if (p.verses.length == 1 && spanStart != null && spanEnd != null) {
      final ch = _liveChapter ?? _cachedChapter;
      final text =
          ch?.verses
              .where((x) => x.verse == p.verses.first)
              .map((x) => x.text)
              .firstOrNull ??
          '';
      if (spanStart <= 0 && spanEnd >= text.length) {
        spanStart = null;
        spanEnd = null;
      }
    }
    return selectionRef(
      widget.book.id,
      widget.chapter,
      p.verses,
      spanStart: spanStart,
      spanEnd: spanEnd,
    );
  }

  String get _refStr => _selectionRefStr;

  String get _refLabel {
    final sel = _sortedSel;
    final name = widget.book.name;
    if (sel.isEmpty) return '$name ${widget.chapter}';
    if (sel.first == sel.last) return '$name ${widget.chapter}:${sel.first}';
    return '$name ${widget.chapter}:${sel.first}-${sel.last}';
  }

}
