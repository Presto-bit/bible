part of 'reader_experience.dart';

class _ParagraphBlock extends ConsumerStatefulWidget {
  const _ParagraphBlock({
    required this.book,
    required this.chapter,
    required this.paragraph,
    this.sectionByVerse = const {},
    required this.verseNo,
    required this.poetry,
    this.english = false,
    required this.selected,
    this.wordRange,
    required this.highlightMarks,
    required this.underlinesEnabled,
    required this.thoughtsEnabled,
    required this.thoughtsByVerse,
    required this.myThoughtsByVerse,
    required this.notesByVerse,
    required this.fontFamily,
    required this.dictIndex,
    required this.dictKeys,
    required this.dictRev,
    required this.inkColor,
    this.selectionAnchorVerse,
    this.selectionAnchorKey,
    this.resumeFlashVerse,
    this.resumeAnchorKey,
    this.scrollVerseKey,
    this.audioCurrentVerse,
    this.audioHighlightStrong = true,
    this.feedHintForVerse,
    required this.onViewNote,
    required this.onStart,
    required this.onToggle,
    required this.onWordStart,
    required this.onWordExtend,
    required this.onOpenThoughts,
    required this.onOpenDict,
  });

  final BibleBook book;
  final int chapter;
  final VerseParagraph paragraph;
  final Map<int, String> sectionByVerse;
  final ReaderVerseNumberMode verseNo;
  final bool poetry;
  final bool english;
  final Set<int> selected;
  final WordRange? wordRange;
  final Map<String, HighlightMark> highlightMarks;
  final bool underlinesEnabled;
  final bool thoughtsEnabled;
  final Map<int, int> thoughtsByVerse;
  final Map<int, int> myThoughtsByVerse;
  final Map<int, List<Note>> notesByVerse;
  final ReaderFontFamily fontFamily;
  final Map<String, List<DictEntity>> dictIndex;
  final List<String> dictKeys;
  final int dictRev;

  /// 随阅读主题走（夜深为浅墨）；预览同源，避免翻章瞬间墨色跳变。
  final Color inkColor;
  final int? selectionAnchorVerse;
  final GlobalKey? selectionAnchorKey;
  final int? resumeFlashVerse;
  final GlobalKey? resumeAnchorKey;
  final GlobalKey Function(int verse)? scrollVerseKey;
  final int? audioCurrentVerse;
  final bool audioHighlightStrong;
  final Widget? Function(int verse)? feedHintForVerse;
  final void Function(Note note) onViewNote;
  final void Function(int verse, String text) onStart;
  final void Function(int verse, String text) onToggle;
  final void Function(int verse, int start, int end) onWordStart;
  final void Function(int verse, int start, int end) onWordExtend;
  final void Function(int verse, String text) onOpenThoughts;
  final void Function(
    DictEntity entity,
    String name,
    List<DictEntity> candidates,
  )
  onOpenDict;

  @override
  ConsumerState<_ParagraphBlock> createState() => _ParagraphBlockState();
}

class _ParagraphBlockState extends ConsumerState<_ParagraphBlock> {
  /// 稳定复用：build 里 dispose recognizer 会打断进行中的 tap，导致词典点词无弹窗。
  final Map<String, TapGestureRecognizer> _tapByKey = {};
  final Map<String, LongPressGestureRecognizer> _longPressByKey = {};
  final Set<String> _usedKeys = {};

  TapGestureRecognizer _tap(String key, VoidCallback onTap) {
    _usedKeys.add(key);
    final rec = _tapByKey.putIfAbsent(key, TapGestureRecognizer.new);
    rec.onTap = onTap;
    return rec;
  }

  LongPressGestureRecognizer _longPress(String key, VoidCallback onLongPress) {
    _usedKeys.add(key);
    final rec = _longPressByKey.putIfAbsent(
      key,
      LongPressGestureRecognizer.new,
    );
    rec.onLongPress = onLongPress;
    return rec;
  }

  void _pruneRecognizers() {
    final staleTaps = _tapByKey.keys
        .where((k) => !_usedKeys.contains(k))
        .toList(growable: false);
    for (final k in staleTaps) {
      _tapByKey.remove(k)?.dispose();
    }
    final staleLp = _longPressByKey.keys
        .where((k) => !_usedKeys.contains(k))
        .toList(growable: false);
    for (final k in staleLp) {
      _longPressByKey.remove(k)?.dispose();
    }
  }

  Widget? _sectionTitleForVerse(int verse) {
    final title = widget.sectionByVerse[verse]?.trim();
    if (title == null || title.isEmpty) return null;
    final fontPx = ref.watch(readerFontProvider).px;
    final fontFamily = ref.watch(readerFontFamilyProvider);
    final stack = readerFontStack(
      family: fontFamily,
      english: widget.english,
    );
    final style = TextStyle(
      fontSize: (fontPx * 0.88).roundToDouble().clamp(13, 32),
      fontWeight: FontWeight.w700,
      color: AppColors.accentDeep,
      fontFamily: stack.fontFamily,
      fontFamilyFallback: stack.fontFamilyFallback,
    );
    final parts = splitInlineRefs(title);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 16, 0, 4),
      child: Text.rich(
        TextSpan(
          children: [
            for (final p in parts)
              if (p.kind == InlineRefKind.ref && p.osis != null)
                TextSpan(
                  text: p.value,
                  style: style.copyWith(
                    decoration: TextDecoration.underline,
                    decorationColor: AppColors.accentDeep,
                  ),
                  recognizer: TapGestureRecognizer()
                    ..onTap = () {
                      showInlineVersePreview(
                        context,
                        refParam: p.osis!,
                        label: p.value,
                      );
                    },
                )
              else
                TextSpan(text: p.value, style: style),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    for (final r in _tapByKey.values) {
      r.dispose();
    }
    _tapByKey.clear();
    for (final r in _longPressByKey.values) {
      r.dispose();
    }
    _longPressByKey.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _usedKeys.clear();
    final fontPx = ref.watch(readerFontProvider).px;
    final selectionActive = widget.selected.isNotEmpty;
    // 选中节高亮即可；不压暗其他节（对齐 PWA，避免「白蒙层」观感）
    // PWA 晨光/护眼：line-height 2.05 + letter-spacing 0.015em
    final fontStack = readerFontStack(
      family: widget.fontFamily,
      english: widget.english,
    );
    final baseStyle = readerBodyTextStyle(
      color: widget.inkColor,
      fontPx: fontPx,
      poetry: widget.poetry,
      fontFamily: fontStack.fontFamily,
      fontFamilyFallback: fontStack.fontFamilyFallback,
      english: widget.english,
    );
    final bodyAlign = readerBodyTextAlign(english: widget.english);
    const selBg = Color(0x333390FF);
    final marginMode = widget.verseNo == ReaderVerseNumberMode.margin;
    final discourseCatalog =
        ref.watch(discourseCatalogProvider).value ?? const [];
    final poetryLinesIndex =
        ref.watch(poetryLinesProvider).value ?? PoetryLinesIndex(const {});
    final quoteMode = ref.watch(quoteDisplayProvider);

    if (marginMode) {
      return RepaintBoundary(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final (i, v) in widget.paragraph.verses.indexed) ...[
              if (_sectionTitleForVerse(v.verse) case final t?) t,
              if (widget.feedHintForVerse?.call(v.verse) != null)
                widget.feedHintForVerse!(v.verse)!,
              _MarginVerseRow(
                verse: v,
                book: widget.book,
                chapter: widget.chapter,
                baseStyle: baseStyle,
                fontPx: fontPx,
                textAlign: bodyAlign,
                proseIndent:
                    !widget.poetry &&
                    i == 0 &&
                    !isDiscourseVersePerLine(
                      discourseCatalog,
                      widget.book.id,
                      widget.chapter,
                      v.verse,
                    ),
                selectionActive: selectionActive,
                selBg: selBg,
                wordRange: widget.wordRange,
                selected: widget.selected,
                markInfo: widget.underlinesEnabled
                    ? markForVerse(
                        widget.highlightMarks,
                        widget.book.id,
                        widget.chapter,
                        v.verse,
                      )
                    : null,
                resumeFlash: widget.resumeFlashVerse == v.verse,
                audioCurrent: widget.audioCurrentVerse == v.verse &&
                    widget.audioHighlightStrong,
                audioEcho: widget.audioCurrentVerse == v.verse &&
                    !widget.audioHighlightStrong,
                anchorKey: v.verse == widget.selectionAnchorVerse
                    ? widget.selectionAnchorKey
                    : (widget.resumeFlashVerse == v.verse
                          ? widget.resumeAnchorKey
                          : widget.scrollVerseKey?.call(v.verse)),
                dictIndex: widget.dictIndex,
                dictKeys: widget.dictKeys,
                dictRev: widget.dictRev,
                notes: widget.notesByVerse[v.verse],
                thoughtsCount: widget.thoughtsByVerse[v.verse] ?? 0,
                hasMyThought: (widget.myThoughtsByVerse[v.verse] ?? 0) > 0,
                thoughtsEnabled: widget.thoughtsEnabled,
                onStart: widget.onStart,
                onToggle: widget.onToggle,
                onWordStart: widget.onWordStart,
                onWordExtend: widget.onWordExtend,
                onOpenDict: widget.onOpenDict,
                onViewNote: widget.onViewNote,
                onOpenThoughts: widget.onOpenThoughts,
              ),
            ],
          ],
        ),
      );
    }

    final spans = <InlineSpan>[];
    final index = SpanIndexBuilder();
    var firstVerse = true;
    for (final v in widget.paragraph.verses) {
      if (_sectionTitleForVerse(v.verse) case final t?) {
        spans.add(
          WidgetSpan(alignment: PlaceholderAlignment.top, child: t),
        );
        index.placeholder();
        spans.add(const TextSpan(text: '\n'));
        index.text(value: '\n', verse: v.verse, verseStart: 0, words: const []);
      }
      final feedHint = widget.feedHintForVerse?.call(v.verse);
      if (feedHint != null) {
        spans.add(
          WidgetSpan(alignment: PlaceholderAlignment.top, child: feedHint),
        );
        index.placeholder();
      }
      final indentHere =
          !widget.poetry &&
          firstVerse &&
          !isDiscourseVersePerLine(
            discourseCatalog,
            widget.book.id,
            widget.chapter,
            v.verse,
          );
      firstVerse = false;
      final markInfo = widget.underlinesEnabled
          ? markForVerse(
              widget.highlightMarks,
              widget.book.id,
              widget.chapter,
              v.verse,
            )
          : null;
      final hasThought =
          widget.thoughtsEnabled && (widget.thoughtsByVerse[v.verse] ?? 0) > 0;
      final hasMyThought = (widget.myThoughtsByVerse[v.verse] ?? 0) > 0;

      final verseInSel = widget.selected.contains(v.verse);
      final resumeFlash = widget.resumeFlashVerse == v.verse;
      final isListenVerse = widget.audioCurrentVerse == v.verse;
      final audioCurrent = isListenVerse && widget.audioHighlightStrong;
      final audioEcho = isListenVerse && !widget.audioHighlightStrong;
      final GlobalKey? verseKey = v.verse == widget.selectionAnchorVerse
          ? widget.selectionAnchorKey
          : resumeFlash
          ? widget.resumeAnchorKey
          : widget.scrollVerseKey?.call(v.verse);

      if (indentHere) {
        spans.add(readerProseIndentSpan(fontPx: fontPx, index: index));
      }

      // 节号：inline 真上标（对齐 PWA .verse-sup：0.65em + super + 0.25em）
      if (widget.verseNo == ReaderVerseNumberMode.inline) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: Transform.translate(
              offset: Offset(0, -fontPx * 0.32),
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTap: selectionActive
                    ? () => widget.onToggle(v.verse, v.text)
                    : null,
                onLongPress: selectionActive
                    ? null
                    : () => widget.onStart(v.verse, v.text),
                child: Text(
                  '${v.verse}',
                  style: TextStyle(
                    color: verseInSel ? AppColors.ink : AppColors.accentDeep,
                    fontWeight: FontWeight.w700,
                    fontSize: fontPx * 0.65,
                    height: 1.0,
                    letterSpacing: 0,
                    // 词级选中时节号不再单独铺底，避免与词块叠成双层
                    backgroundColor: verseInSel && widget.wordRange == null
                        ? selBg
                        : null,
                    fontFamily: baseStyle.fontFamily,
                    fontFamilyFallback: baseStyle.fontFamilyFallback,
                  ),
                ),
              ),
            ),
          ),
        );
        index.placeholder();
        // 紧间距，避免完整半角空格 + WidgetSpan 缝过大
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: SizedBox(width: fontPx * 0.22),
          ),
        );
        index.placeholder();
      }

      final displayText = formatQuotesForDisplay(v.text, quoteMode);
      final semicolonLines =
          isSemicolonBreakVerse(
            discourseCatalog,
            widget.book.id,
            widget.chapter,
            v.verse,
          )
          ? splitSemicolonListLines(displayText)
          : null;
      final poetrySubLines = widget.poetry
          ? poetryLinesIndex.linesFor(widget.book.id, widget.chapter, v.verse)
          : null;

      if (verseKey != null) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: SizedBox(key: verseKey, width: 0, height: 0),
          ),
        );
        index.placeholder();
      }

      List<String>? stackedLines;
      if (poetrySubLines != null && poetrySubLines.length > 1) {
        stackedLines = poetrySubLines
            .map((line) => formatQuotesForDisplay(line, quoteMode))
            .toList(growable: false);
      } else if (semicolonLines != null && semicolonLines.length > 1) {
        stackedLines = semicolonLines;
      }
      if (stackedLines != null) {
        for (var li = 0; li < stackedLines.length; li++) {
          if (li > 0) {
            spans.add(TextSpan(text: '\n', style: baseStyle));
            index.text(
              value: '\n',
              verse: v.verse,
              verseStart: 0,
              words: const [],
            );
            spans.add(readerProseIndentSpan(fontPx: fontPx, index: index));
          }
          final line = stackedLines[li];
          final rec = selectionActive
              ? _tap(
                  'sc-tap-${v.verse}-$li',
                  () => widget.onToggle(v.verse, v.text),
                )
              : _longPress(
                  'sc-lp-${v.verse}-$li',
                  () => widget.onStart(v.verse, v.text),
                );
          spans.add(TextSpan(text: line, style: baseStyle, recognizer: rec));
          index.text(
            value: line,
            verse: v.verse,
            verseStart: 0,
            words: const [],
          );
        }
      } else {
        final dictSpans = !selectionActive && widget.dictKeys.isNotEmpty
            ? cachedDictSpansForText(
                displayText,
                widget.dictIndex,
                widget.dictKeys,
                bookId: widget.book.id,
                chapter: widget.chapter,
                verse: v.verse,
                dictRev: widget.dictRev,
              )
            : const <DictSpanHit>[];
        final words = sliceVerseWords(
          displayText,
          splitOffsets: dictSpans.expand((span) => [span.start, span.end]),
        );
        if (words.isEmpty) {
          final emptyRec = selectionActive
              ? _tap(
                  'empty-tap-${v.verse}',
                  () => widget.onToggle(v.verse, v.text),
                )
              : _longPress(
                  'empty-lp-${v.verse}',
                  () => widget.onStart(v.verse, v.text),
                );
          spans.add(TextSpan(text: ' ', style: baseStyle, recognizer: emptyRec));
          index.text(value: ' ', verse: v.verse, verseStart: 0, words: const []);
        } else {
          appendReaderWordSpans(
            spans: spans,
            index: index,
            verseText: displayText,
            verse: v.verse,
            baseStyle: baseStyle,
            fontPx: fontPx,
            words: words,
            dictSpans: dictSpans,
            wordRange: widget.wordRange,
            interactive: true,
            selectionActive: selectionActive,
            markInfo: markInfo,
            resumeFlash: resumeFlash,
            audioCurrent: audioCurrent,
            audioEcho: audioEcho,
            hasThought: hasThought,
            hasMyThought: hasMyThought,
            dictIndex: widget.dictIndex,
            onWordExtend: widget.onWordExtend,
            onStart: widget.onStart,
            onOpenDict: widget.onOpenDict,
          );
          final gap = readerGapSpans(
            ' ',
            baseStyle: baseStyle,
            fontPx: fontPx,
            highlight: null,
          );
          spans.addAll(gap);
          index.absorbSpans(gap);
        }
      }

      final note = widget.notesByVerse[v.verse]?.firstOrNull;
      if (note != null) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: GestureDetector(
              onTap: () => widget.onViewNote(note),
              child: Padding(
                padding: const EdgeInsets.only(left: 1, right: 4),
                child: Icon(
                  Icons.sticky_note_2_outlined,
                  size: 11,
                  color: selectionActive
                      ? AppColors.inkFaint
                      : AppColors.accentDeep.withValues(alpha: 0.55),
                ),
              ),
            ),
          ),
        );
        index.placeholder();
      }
    }

    _pruneRecognizers();
    return RepaintBoundary(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            // 对齐 PWA 清晨散文段距 1.15em / 诗体 10px
            margin: EdgeInsets.only(
              bottom: readerParagraphGapBottom(
                poetry: widget.poetry,
                fontPx: fontPx,
              ),
            ),
            child: SelectionContainer.disabled(
              child: readerLocatedRichText(
                locator: index.build(),
                textAlign: bodyAlign,
                text: TextSpan(style: baseStyle, children: spans),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 行首节号（margin 模式）：[段首1em] + 1.8em 节号 + 0.35em 间距 + 正文（对齐 PWA）。
class _MarginVerseRow extends ConsumerStatefulWidget {
  const _MarginVerseRow({
    required this.verse,
    required this.book,
    required this.chapter,
    required this.baseStyle,
    required this.fontPx,
    this.proseIndent = false,
    this.textAlign = TextAlign.justify,
    required this.selectionActive,
    required this.selBg,
    required this.wordRange,
    required this.selected,
    required this.markInfo,
    required this.resumeFlash,
    this.audioCurrent = false,
    this.audioEcho = false,
    required this.anchorKey,
    required this.dictIndex,
    required this.dictKeys,
    required this.dictRev,
    required this.notes,
    required this.thoughtsCount,
    required this.hasMyThought,
    required this.thoughtsEnabled,
    required this.onStart,
    required this.onToggle,
    required this.onWordStart,
    required this.onWordExtend,
    required this.onOpenDict,
    required this.onViewNote,
    required this.onOpenThoughts,
  });

  final Verse verse;
  final BibleBook book;
  final int chapter;
  final TextStyle baseStyle;
  final double fontPx;
  final bool proseIndent;
  final TextAlign textAlign;
  final bool selectionActive;
  final Color selBg;
  final WordRange? wordRange;
  final Set<int> selected;
  final VerseMarkInfo? markInfo;
  final bool resumeFlash;
  final bool audioCurrent;
  final bool audioEcho;
  final GlobalKey? anchorKey;
  final Map<String, List<DictEntity>> dictIndex;
  final List<String> dictKeys;
  final int dictRev;
  final List<Note>? notes;
  final int thoughtsCount;
  final bool hasMyThought;
  final bool thoughtsEnabled;
  final void Function(int verse, String text) onStart;
  final void Function(int verse, String text) onToggle;
  final void Function(int verse, int start, int end) onWordStart;
  final void Function(int verse, int start, int end) onWordExtend;
  final void Function(
    DictEntity entity,
    String name,
    List<DictEntity> candidates,
  )
  onOpenDict;
  final void Function(Note note) onViewNote;
  final void Function(int verse, String text) onOpenThoughts;

  @override
  ConsumerState<_MarginVerseRow> createState() => _MarginVerseRowState();
}

class _MarginVerseRowState extends ConsumerState<_MarginVerseRow> {
  @override
  Widget build(BuildContext context) {
    final v = widget.verse;
    final selectionActive = widget.selectionActive;
    final dictKeys = widget.dictKeys;
    final dictIndex = widget.dictIndex;
    final book = widget.book;
    final chapter = widget.chapter;
    final wordRange = widget.wordRange;
    final baseStyle = widget.baseStyle;
    final fontPx = widget.fontPx;
    final thoughtsEnabled = widget.thoughtsEnabled;
    final thoughtsCount = widget.thoughtsCount;
    final hasMyThought = widget.hasMyThought;
    final resumeFlash = widget.resumeFlash;
    final audioCurrent = widget.audioCurrent;
    final audioEcho = widget.audioEcho;
    final onStart = widget.onStart;
    final onToggle = widget.onToggle;
    final onWordExtend = widget.onWordExtend;
    final onOpenDict = widget.onOpenDict;
    final onViewNote = widget.onViewNote;
    final onOpenThoughts = widget.onOpenThoughts;
    final notes = widget.notes;
    final markInfo = widget.markInfo;
    final anchorKey = widget.anchorKey;
    final discourseCatalog =
        ref.watch(discourseCatalogProvider).value ?? const [];
    final poetryLinesIndex =
        ref.watch(poetryLinesProvider).value ?? PoetryLinesIndex(const {});
    final quoteMode = ref.watch(quoteDisplayProvider);
    final displayText = formatQuotesForDisplay(v.text, quoteMode);
    final semicolonLines = isSemicolonBreakVerse(
      discourseCatalog,
      book.id,
      chapter,
      v.verse,
    )
        ? splitSemicolonListLines(displayText)
        : null;
    final poetrySubLines =
        poetryLinesIndex.linesFor(book.id, chapter, v.verse);
    List<String>? stackedLines;
    if (poetrySubLines != null && poetrySubLines.length > 1) {
      stackedLines = poetrySubLines
          .map((line) => formatQuotesForDisplay(line, quoteMode))
          .toList(growable: false);
    } else if (semicolonLines != null && semicolonLines.length > 1) {
      stackedLines = semicolonLines;
    }

    final bodyChildren = <InlineSpan>[];
    final index = SpanIndexBuilder();
    if (stackedLines != null) {
      for (var li = 0; li < stackedLines.length; li++) {
        if (li > 0) {
          bodyChildren.add(TextSpan(text: '\n', style: baseStyle));
          bodyChildren.add(readerProseIndentSpan(fontPx: fontPx));
        }
        bodyChildren.add(TextSpan(text: stackedLines[li], style: baseStyle));
      }
    } else {
    final dictSpans = !selectionActive && dictKeys.isNotEmpty
        ? cachedDictSpansForText(
            displayText,
            dictIndex,
            dictKeys,
            bookId: book.id,
            chapter: chapter,
            verse: v.verse,
            dictRev: widget.dictRev,
          )
        : const <DictSpanHit>[];
    final words = sliceVerseWords(
      displayText,
      splitOffsets: dictSpans.expand((span) => [span.start, span.end]),
    );
    appendReaderWordSpans(
      spans: bodyChildren,
      index: index,
      verseText: displayText,
      verse: v.verse,
      baseStyle: baseStyle,
      fontPx: fontPx,
      words: words,
      dictSpans: dictSpans,
      wordRange: wordRange,
      interactive: true,
      selectionActive: selectionActive,
      markInfo: markInfo,
      resumeFlash: resumeFlash,
      audioCurrent: audioCurrent,
      audioEcho: audioEcho,
      hasThought: thoughtsEnabled && thoughtsCount > 0,
      hasMyThought: hasMyThought,
      dictIndex: dictIndex,
      onWordExtend: onWordExtend,
      onStart: onStart,
      onOpenDict: onOpenDict,
    );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 3, 0, 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.proseIndent) SizedBox(width: fontPx),
          GestureDetector(
            onLongPress: selectionActive
                ? null
                : () => onStart(v.verse, v.text),
            onTap: selectionActive ? () => onToggle(v.verse, v.text) : null,
            child: SizedBox(
              width: fontPx * kReaderMarginVerseSlotEm,
              child: Text(
                '${v.verse}',
                textAlign: TextAlign.right,
                style: baseStyle.copyWith(
                  fontSize: fontPx * kReaderInlineVerseEm,
                  fontWeight: FontWeight.w700,
                  color: AppColors.accentDeep.withValues(alpha: 0.85),
                  height: 1.0,
                  letterSpacing: 0,
                  backgroundColor:
                      widget.selected.contains(v.verse) && wordRange == null
                      ? widget.selBg
                      : null,
                ),
              ),
            ),
          ),
          SizedBox(width: fontPx * kReaderMarginVerseGapEm),
          Expanded(
            child: GestureDetector(
              onTap: selectionActive ? () => onToggle(v.verse, v.text) : null,
              child: Container(
                key: anchorKey,
                padding: const EdgeInsets.only(right: 4),
                child: SelectionContainer.disabled(
                  child: readerLocatedRichText(
                    locator: index.build(),
                    textAlign: widget.textAlign,
                    text: TextSpan(style: baseStyle, children: bodyChildren),
                  ),
                ),
              ),
            ),
          ),
          if (notes?.firstOrNull != null)
            GestureDetector(
              onTap: () => onViewNote(notes!.first),
              child: Padding(
                padding: const EdgeInsets.only(left: 2, top: 2),
                child: Icon(
                  Icons.sticky_note_2_outlined,
                  size: 12,
                  color: AppColors.accentDeep.withValues(alpha: 0.5),
                ),
              ),
            ),
          if (thoughtsEnabled && thoughtsCount > 0)
            GestureDetector(
              onTap: () => onOpenThoughts(v.verse, v.text),
              child: const Padding(
                padding: EdgeInsets.only(left: 2, top: 2),
                child: Icon(Icons.notes, size: 12, color: AppColors.inkFaint),
              ),
            ),
        ],
      ),
    );
  }
}

/// 词典命中下划线（对齐 PWA `.verse-word.is-dict`）。
/// 主文与横滑预览共用，避免预览缺下划线、落地才补上造成观感跳动。
TextStyle readerDictSpanStyle(TextStyle base, DictEntity entity) =>
    base.copyWith(
      decoration: TextDecoration.underline,
      decorationStyle: switch (entity.type) {
        'place' => TextDecorationStyle.dashed,
        'person' => TextDecorationStyle.dotted,
        'artifact' => TextDecorationStyle.wavy,
        _ => TextDecorationStyle.dotted,
      },
      decorationColor: (base.color ?? AppColors.ink).withValues(alpha: 0.35),
      decorationThickness: 1.2,
    );

/// 想法虚线（对齐 PWA `.verse-has-thought`）；自己写的想法用更深强调色。
TextStyle readerThoughtSpanStyle(
  TextStyle base, {
  required bool hasMyThought,
}) => base.copyWith(
  decoration: TextDecoration.underline,
  decorationStyle: TextDecorationStyle.dashed,
  decorationColor: AppColors.accentDeep.withValues(
    alpha: hasMyThought ? 1 : 0.5,
  ),
  decorationThickness: 1.5,
);

/// 静态词块：与 `SelectableWordChip` 未选中态布局等价（同样关闭首行/末行 height），
/// 但不挂 MetaData/手势。横滑预览用它，才能与主文逐词 WidgetSpan 断行完全一致。
InlineSpan readerStaticWordSpan(String text, TextStyle style) => WidgetSpan(
  alignment: PlaceholderAlignment.baseline,
  baseline: TextBaseline.alphabetic,
  child: Text(
    text,
    style: style,
    textHeightBehavior: const TextHeightBehavior(
      applyHeightToFirstAscent: false,
      applyHeightToLastDescent: false,
    ),
  ),
);

/// 经文间隙：全角敬空 `\u3000`、半角空格改为定宽，避免 justify 拉成「神」前大洞。
List<InlineSpan> readerGapSpans(
  String gap, {
  required TextStyle baseStyle,
  required double fontPx,
  Color? highlight,
}) {
  if (gap.isEmpty) return const [];
  final out = <InlineSpan>[];
  final buf = StringBuffer();
  void flushText() {
    if (buf.isEmpty) return;
    final t = buf.toString();
    buf.clear();
    out.add(
      TextSpan(
        text: t,
        style: highlight != null
            ? baseStyle.copyWith(backgroundColor: highlight)
            : baseStyle,
      ),
    );
  }

  for (final rune in gap.runes) {
    final ch = String.fromCharCode(rune);
    if (ch == '\u3000' || ch == ' ' || ch == '\u00a0') {
      flushText();
      final w = ch == '\u3000' ? fontPx * 0.42 : fontPx * 0.22;
      out.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: SizedBox(
            width: w,
            height: fontPx,
            child: highlight == null ? null : ColoredBox(color: highlight),
          ),
        ),
      );
    } else {
      buf.write(ch);
    }
  }
  flushText();
  return out;
}

/// 简单词典词条命中（保留兼容：优先精确键）。
(DictEntity, String)? matchDictToken(
  String text,
  Map<String, List<DictEntity>> index,
  List<String> keys,
) {
  final t = text.trim();
  if (t.isEmpty || t.length < 2) return null;
  final list = index[t];
  if (list != null && list.isNotEmpty) return (list.first, t);
  return null;
}

/// 章首导读轻条（对齐 PWA ChapterGuideTip）。
class _ChapterGuideTipBar extends StatelessWidget {
  const _ChapterGuideTipBar({
    required this.bookName,
    required this.chapter,
    required this.compact,
    required this.onOpen,
    required this.onSkipSession,
    required this.onDisableForever,
  });
  final String bookName;
  final int chapter;
  final bool compact;
  final VoidCallback onOpen;
  final VoidCallback onSkipSession;
  final VoidCallback onDisableForever;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 0.5,
      shadowColor: AppColors.ink.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(10),
      color: AppColors.paper,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.line.withValues(alpha: 0.85)),
          color: AppColors.goldWash.withValues(alpha: 0.35),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 9, 6, 9),
          child: Row(
            children: [
              Text(
                '✦',
                style: TextStyle(
                  color: AppColors.accentDeep.withValues(alpha: 0.8),
                  fontSize: 13,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  compact
                      ? '第 $chapter 章导读'
                      : '30 秒章导读 · $bookName 第 $chapter 章',
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.inkSoft,
                    height: 1.35,
                  ),
                ),
              ),
              TextButton(
                onPressed: onOpen,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.accentDeep,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('打开', style: TextStyle(fontSize: 12.5)),
              ),
              TextButton(
                onPressed: onSkipSession,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.inkFaint,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('本次忽略', style: TextStyle(fontSize: 11.5)),
              ),
              if (!compact)
                TextButton(
                  onPressed: onDisableForever,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.inkFaint,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('不再提示', style: TextStyle(fontSize: 11.5)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 选区两端拖动手柄层（对齐 PWA 左右锚点）。
class _SelectionHandlesOverlay extends StatefulWidget {
  const _SelectionHandlesOverlay({
    required this.overlayKey,
    required this.rangeListenable,
    required this.range,
    required this.onDrag,
    required this.onCommit,
    required this.onGestureChanged,
  });

  final GlobalKey overlayKey;
  final Listenable rangeListenable;
  final WordRange range;
  final void Function(Offset global, {required bool isStart}) onDrag;
  final VoidCallback onCommit;
  final ValueChanged<bool> onGestureChanged;

  @override
  State<_SelectionHandlesOverlay> createState() =>
      _SelectionHandlesOverlayState();
}

class _SelectionHandlesOverlayState extends State<_SelectionHandlesOverlay> {
  int _repaintThrottleMs = 0;

  @override
  void initState() {
    super.initState();
    widget.rangeListenable.addListener(_repaint);
    WidgetsBinding.instance.addPostFrameCallback((_) => _repaint(force: true));
  }

  @override
  void didUpdateWidget(covariant _SelectionHandlesOverlay oldWidget) {
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
    final layout = locateSelectionHandles(locateCtx, widget.range);
    if (layout == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _repaint(force: true));
      return const SizedBox.shrink();
    }
    final box =
        widget.overlayKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _repaint(force: true));
      return const SizedBox.shrink();
    }

    final start = box.globalToLocal(layout.start);
    final end = box.globalToLocal(layout.end);

    return VerseSelectionHandles(
      start: start,
      end: end,
      onDrag: widget.onDrag,
      onCommit: widget.onCommit,
      onGestureChanged: widget.onGestureChanged,
    );
  }
}
