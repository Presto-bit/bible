part of 'reader_experience.dart';

({BibleBook book, int chapter})? _peekAdjacentTarget({
  required List<BibleBook> books,
  required BibleBook book,
  required int chapter,
  required int delta,
}) {
  final bi = books.indexWhere((b) => b.id == book.id);
  if (bi < 0) return null;
  if (delta > 0) {
    if (chapter < book.chapterCount) {
      return (book: book, chapter: chapter + 1);
    }
    if (bi + 1 < books.length) {
      return (book: books[bi + 1], chapter: 1);
    }
  } else if (delta < 0) {
    if (chapter > 1) {
      return (book: book, chapter: chapter - 1);
    }
    if (bi > 0) {
      final prev = books[bi - 1];
      return (book: prev, chapter: prev.chapterCount);
    }
  }
  return null;
}

/// 邻章预览：独立 Consumer，横滑时仅位移；渲染与主文同构。
class _AdjacentChapterPeekPanel extends ConsumerStatefulWidget {
  const _AdjacentChapterPeekPanel({
    super.key,
    required this.delta,
    required this.books,
    required this.book,
    required this.chapter,
    required this.mainVersionId,
    required this.compareVersionId,
    required this.theme,
    required this.topPad,
    required this.selectionActive,
    required this.pageDragDx,
    required this.pageTurnAnimating,
    this.dictIndex,
    this.dictKeys,
    this.dictRev,
    this.planHeader,
  });

  final int delta;
  final List<BibleBook> books;
  final BibleBook book;
  final int chapter;
  final String? mainVersionId;
  final String? compareVersionId;
  final ReaderExperienceTheme theme;
  final double topPad;
  final bool selectionActive;
  final ValueNotifier<double> pageDragDx;
  final ValueNotifier<bool> pageTurnAnimating;
  final Map<String, List<DictEntity>>? dictIndex;
  final List<String>? dictKeys;
  final int? dictRev;
  final Widget? planHeader;

  @override
  ConsumerState<_AdjacentChapterPeekPanel> createState() =>
      _AdjacentChapterPeekPanelState();
}

class _AdjacentChapterPeekPanelState
    extends ConsumerState<_AdjacentChapterPeekPanel> {
  Widget? _frozenSnapshot;
  bool _interactionActive = false;

  bool get _dragOrAnimating =>
      widget.pageDragDx.value.abs() > 2 || widget.pageTurnAnimating.value;

  @override
  void initState() {
    super.initState();
    widget.pageDragDx.addListener(_onInteractionChanged);
    widget.pageTurnAnimating.addListener(_onInteractionChanged);
  }

  @override
  void didUpdateWidget(covariant _AdjacentChapterPeekPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.pageDragDx != widget.pageDragDx) {
      oldWidget.pageDragDx.removeListener(_onInteractionChanged);
      widget.pageDragDx.addListener(_onInteractionChanged);
    }
    if (oldWidget.pageTurnAnimating != widget.pageTurnAnimating) {
      oldWidget.pageTurnAnimating.removeListener(_onInteractionChanged);
      widget.pageTurnAnimating.addListener(_onInteractionChanged);
    }
    if (oldWidget.selectionActive != widget.selectionActive ||
        oldWidget.book.id != widget.book.id ||
        oldWidget.chapter != widget.chapter) {
      _frozenSnapshot = null;
      _interactionActive = false;
    }
  }

  @override
  void dispose() {
    widget.pageDragDx.removeListener(_onInteractionChanged);
    widget.pageTurnAnimating.removeListener(_onInteractionChanged);
    super.dispose();
  }

  void _onInteractionChanged() {
    final active = _dragOrAnimating;
    if (active == _interactionActive) return;
    _interactionActive = active;
    if (!active) {
      _frozenSnapshot = null;
      if (mounted) setState(() {});
      return;
    }
    // 同步冻结：避免首帧空白 peek → 下一帧贴图造成跟手/落地跳动
    _frozenSnapshot ??= RepaintBoundary(child: _buildPanel(ref));
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (_interactionActive) {
      return _frozenSnapshot ?? ColoredBox(color: widget.theme.background);
    }
    _frozenSnapshot = null;
    return ColoredBox(color: widget.theme.background);
  }

  Widget _buildPanel(WidgetRef ref) {
    final target = _peekAdjacentTarget(
      books: widget.books,
      book: widget.book,
      chapter: widget.chapter,
      delta: widget.delta,
    );
    if (target == null) {
      return ColoredBox(
        color: widget.theme.background,
        child: Center(
          child: Text(
            widget.delta > 0 ? '已是最后一章' : '已是第一章',
            style: TextStyle(
              fontSize: 14,
              color: widget.theme.ink.withValues(alpha: 0.45),
            ),
          ),
        ),
      );
    }

    final async = widget.mainVersionId != null
        ? ref.watch(
            chapterVersionProvider((
              book: target.book.id,
              chapter: target.chapter,
              version: widget.mainVersionId!,
            )),
          )
        : ref.watch(
            chapterProvider((book: target.book.id, chapter: target.chapter)),
          );
    final fontPx = ref.watch(readerFontProvider).px;
    final fontFamily = ref.watch(readerFontFamilyProvider);
    final verseNo = ref.watch(readerVerseNumberProvider);
    final layoutAsync = widget.mainVersionId != null
        ? ref.watch(
            chapterProvider((book: target.book.id, chapter: target.chapter)),
          )
        : null;
    final sectionByVerse = <int, String>{};
    final outline = outlineForVersion(
      target.book.id,
      target.chapter,
      versionId: widget.mainVersionId,
    );
    sectionByVerse.addAll({for (final s in outline) s.verse: s.title});
    final apiSections = ref
        .watch(
          sectionTitlesProvider((
            book: target.book.id,
            chapter: target.chapter,
            versionId: widget.mainVersionId,
          )),
        )
        .value;
    if (apiSections != null) {
      for (final s in apiSections) {
        final t = s.title.trim();
        if (t.isNotEmpty) sectionByVerse[s.verse] = t;
      }
    }
    final peekParagraphRangesFromProvider = ref
        .watch(
          paragraphRangesProvider((
            book: target.book.id,
            chapter: target.chapter,
          )),
        )
        .value;
    final peekParagraphRanges =
        (peekParagraphRangesFromProvider != null &&
            peekParagraphRangesFromProvider.isNotEmpty)
        ? peekParagraphRangesFromProvider
        : ref
              .read(contentRepoProvider)
              .paragraphRangesCached(target.book.id, target.chapter);

    final toggles = ref.watch(readerFeatureTogglesProvider);
    final highlights = ref.watch(highlightMapProvider).value ?? const {};
    final targetKey = (book: target.book.id, chapter: target.chapter);
    final thoughtsByVerse = ref.watch(thoughtsByChapterProvider(targetKey));
    final myThoughtsByVerse = ref.watch(myThoughtsByChapterProvider(targetKey));
    final notesByVerse = ref
        .watch(notesStreamProvider)
        .maybeWhen(
          data: (list) => notesForChapter(list, target.book.id, target.chapter),
          orElse: () => const <int, List<Note>>{},
        );

    late final Map<String, List<DictEntity>> peekDictIndex;
    late final List<String> peekDictKeys;
    late final int peekDictRev;
    if (widget.dictIndex != null &&
        widget.dictKeys != null &&
        widget.dictRev != null) {
      peekDictIndex = widget.dictIndex!;
      peekDictKeys = widget.dictKeys!;
      peekDictRev = widget.dictRev!;
    } else {
      final dictList = ref.watch(dictionaryProvider('')).value ?? const [];
      peekDictRev = dictListRevision(dictList);
      peekDictIndex = buildDictIndex(dictList);
      peekDictKeys = dictList.map((e) => e.name).toList();
    }

    final compareId = widget.compareVersionId;
    final parallelAsync = compareId != null
        ? ref.watch(
            chapterVersionProvider((
              book: target.book.id,
              chapter: target.chapter,
              version: compareId,
            )),
          )
        : null;

    final prefs = ref.read(prefsProvider);
    final cachedChapter = readChapterCache(
      prefs,
      target.book.id,
      target.chapter,
      versionId: widget.mainVersionId,
    );

    Widget buildPeekContent(
      Chapter ch,
      Chapter structure, {
      Chapter? parallelCh,
    }) {
      return _ChapterPeekContent(
        book: target.book,
        chapter: target.chapter,
        primary: ch,
        structure: structure,
        parallel: parallelCh,
        sectionByVerse: sectionByVerse,
        verseNo: verseNo,
        fontPx: fontPx,
        fontFamily: fontFamily,
        english: isEnglishBibleVersion(widget.mainVersionId),
        highlights: highlights,
        underlinesEnabled: toggles.underlines,
        dictIndex: peekDictIndex,
        dictKeys: peekDictKeys,
        dictRev: peekDictRev,
        thoughtsEnabled: toggles.thoughts,
        thoughtsByVerse: thoughtsByVerse,
        myThoughtsByVerse: myThoughtsByVerse,
        notesByVerse: notesByVerse,
        headerBar: widget.planHeader,
        selectionActive: widget.selectionActive,
        theme: widget.theme,
        topPad: widget.topPad,
        quoteDisplay: ref.watch(quoteDisplayProvider),
        paragraphRanges: peekParagraphRanges,
      );
    }

    return ColoredBox(
      color: widget.theme.background,
      child: async.when(
        loading: () {
          if (cachedChapter != null) {
            return buildPeekContent(
              cachedChapter,
              layoutAsync?.value ?? cachedChapter,
            );
          }
          return _PeekChapterPlaceholder(
            theme: widget.theme,
            topPad: widget.topPad,
          );
        },
        error: (_, _) {
          if (cachedChapter != null) {
            return buildPeekContent(
              cachedChapter,
              layoutAsync?.value ?? cachedChapter,
            );
          }
          return Center(
            child: Text(
              '加载失败',
              style: TextStyle(color: widget.theme.ink.withValues(alpha: 0.45)),
            ),
          );
        },
        data: (ch) {
          if (widget.mainVersionId != null &&
              (layoutAsync == null || !layoutAsync.hasValue)) {
            if (cachedChapter != null) {
              return buildPeekContent(cachedChapter, cachedChapter);
            }
            return _PeekChapterPlaceholder(
              theme: widget.theme,
              topPad: widget.topPad,
            );
          }
          Chapter? parallelCh;
          if (parallelAsync != null && parallelAsync.hasValue) {
            parallelCh = parallelAsync.value;
          }
          return buildPeekContent(
            ch,
            layoutAsync?.value ?? ch,
            parallelCh: parallelCh,
          );
        },
      ),
    );
  }
}

class _PeekChapterPlaceholder extends StatelessWidget {
  const _PeekChapterPlaceholder({required this.theme, required this.topPad});

  final ReaderExperienceTheme theme;
  final double topPad;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        kReaderContentPadH,
        topPad,
        kReaderContentPadH,
        72,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < 8; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Container(
                height: 14,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: theme.ink.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 邻章预览和 PWA `ReaderChapterPeek` 使用同一层级：分段、划线、节号、
/// 对照译文均保留，但不承接选择、词典或阅读记录等交互。
class _ChapterPeekContent extends StatelessWidget {
  const _ChapterPeekContent({
    required this.book,
    required this.chapter,
    required this.primary,
    required this.structure,
    required this.parallel,
    required this.sectionByVerse,
    required this.verseNo,
    required this.fontPx,
    required this.fontFamily,
    this.english = false,
    required this.highlights,
    required this.underlinesEnabled,
    required this.dictIndex,
    required this.dictKeys,
    required this.dictRev,
    required this.thoughtsEnabled,
    required this.thoughtsByVerse,
    required this.myThoughtsByVerse,
    required this.notesByVerse,
    required this.headerBar,
    required this.selectionActive,
    required this.theme,
    required this.topPad,
    required this.quoteDisplay,
    this.paragraphRanges,
  });

  final BibleBook book;
  final int chapter;
  final Chapter primary;
  final Chapter structure;
  final Chapter? parallel;
  final Map<int, String> sectionByVerse;
  final ReaderVerseNumberMode verseNo;
  final double fontPx;
  final ReaderFontFamily fontFamily;
  final bool english;
  final Map<String, HighlightMark> highlights;
  final bool underlinesEnabled;
  final Map<String, List<DictEntity>> dictIndex;
  final List<String> dictKeys;
  final int dictRev;
  final bool thoughtsEnabled;
  final Map<int, int> thoughtsByVerse;
  final Map<int, int> myThoughtsByVerse;
  final Map<int, List<Note>> notesByVerse;

  /// 计划阅读条：主文正文被它下推，预览缺了就会在落地瞬间整体下移。
  final Widget? headerBar;

  /// 主文有选区时会让出词典下划线与分段标题色，预览须同步，否则松手即变样。
  final bool selectionActive;
  final ReaderExperienceTheme theme;
  final double topPad;
  final QuoteDisplayMode quoteDisplay;
  final List<(int, int)>? paragraphRanges;

  bool get _poetry => isPoetryBook(book.id);

  TextStyle get _mainStyle {
    final stack = readerFontStack(family: fontFamily, english: english);
    return readerBodyTextStyle(
      color: theme.ink,
      fontPx: fontPx,
      poetry: _poetry,
      fontFamily: stack.fontFamily,
      fontFamilyFallback: stack.fontFamilyFallback,
      english: english,
    );
  }

  TextAlign get _bodyAlign => readerBodyTextAlign(english: english);

  TextStyle get _parallelStyle => _mainStyle.copyWith(
    color: theme.ink.withValues(alpha: 0.55),
    fontSize: fontPx * 0.92,
    height: kReaderParallelSecondaryLineHeight,
  );

  String _textFor(Chapter source, int verse) =>
      source.verses.where((v) => v.verse == verse).firstOrNull?.text ?? '—';

  ChapterDictUnderlinePlan _buildUnderlinePlan() {
    if (!underlinesEnabled || dictKeys.isEmpty) {
      return ChapterDictUnderlinePlan.empty;
    }
    return buildChapterDictUnderlinePlan(
      verses: [
        for (final v in primary.verses)
          (
            verse: v.verse,
            text: formatQuotesForDisplay(v.text, quoteDisplay),
          ),
      ],
      index: dictIndex,
      sortedKeys: dictKeys,
      bookId: book.id,
      chapter: chapter,
    );
  }

  /// 与主文 `_ParagraphBlock` 同构：同样切词、同样逐词 WidgetSpan、同样下划线与
  /// 定宽间隙。预览若退化成整段 TextSpan，落地时断行会整体重排，观感就是「页面波动」。
  List<InlineSpan> _verseSpans(
    Verse verse, {
    required TextStyle style,
    required bool showNumber,
    bool appendNoteIcon = false,
    bool proseIndent = false,
    ChapterDictUnderlinePlan? underlinePlan,
  }) {
    final spans = <InlineSpan>[];
    if (proseIndent) {
      spans.add(readerProseIndentSpan(fontPx: fontPx));
    }
    if (showNumber && verseNo != ReaderVerseNumberMode.hidden) {
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: Transform.translate(
            offset: Offset(0, -fontPx * 0.32),
            child: Text(
              '${verse.verse}',
              style: TextStyle(
                color: AppColors.accentDeep,
                fontSize: fontPx * kReaderInlineVerseEm,
                fontWeight: FontWeight.w700,
                height: 1,
                fontFamily: _mainStyle.fontFamily,
                fontFamilyFallback: _mainStyle.fontFamilyFallback,
              ),
            ),
          ),
        ),
      );
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: SizedBox(width: fontPx * kReaderInlineVerseGapEm),
        ),
      );
    }

    final markInfo = underlinesEnabled
        ? markForVerse(highlights, book.id, chapter, verse.verse)
        : null;
    final hasThought =
        thoughtsEnabled && (thoughtsByVerse[verse.verse] ?? 0) > 0;
    final hasMyThought = (myThoughtsByVerse[verse.verse] ?? 0) > 0;
    final text = formatQuotesForDisplay(verse.text, quoteDisplay);
    final dictSpans = !selectionActive && dictKeys.isNotEmpty
        ? cachedDictSpansForText(
            text,
            dictIndex,
            dictKeys,
            bookId: book.id,
            chapter: chapter,
            verse: verse.verse,
            dictRev: dictRev,
          )
        : const <DictSpanHit>[];
    final words = sliceVerseWords(
      text,
      splitOffsets: dictSpans.expand((span) => [span.start, span.end]),
    );
    if (words.isEmpty) {
      spans.add(TextSpan(text: ' ', style: style));
      return spans;
    }
    appendReaderWordSpans(
      spans: spans,
      index: SpanIndexBuilder(),
      verseText: text,
      verse: verse.verse,
      baseStyle: style,
      fontPx: fontPx,
      words: words,
      dictSpans: dictSpans,
      underlinePlan: underlinePlan,
      interactive: false,
      selectionActive: selectionActive,
      markInfo: markInfo,
      resumeFlash: false,
      hasThought: hasThought,
      hasMyThought: hasMyThought,
    );
    // 节间薄缝：与主文同为定宽，避免 justify 把半角空格拉宽。
    spans.addAll(readerGapSpans(' ', baseStyle: style, fontPx: fontPx));
    if (appendNoteIcon && notesByVerse[verse.verse]?.firstOrNull != null) {
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: Padding(
            padding: const EdgeInsets.only(left: 1, right: 4),
            child: Icon(
              Icons.sticky_note_2_outlined,
              size: 11,
              color: AppColors.accentDeep.withValues(alpha: 0.55),
            ),
          ),
        ),
      );
    }
    return spans;
  }

  /// 与主文 `_sectionTitle` 同尺同色：避免翻章落地时标题变尺寸或变色。
  Widget _sectionTitle(String title) {
    final style = TextStyle(
      fontSize: (fontPx * 0.88).roundToDouble().clamp(13, 32),
      fontWeight: FontWeight.w700,
      color: AppColors.accentDeep,
      fontFamily: _mainStyle.fontFamily,
      fontFamilyFallback: _mainStyle.fontFamilyFallback,
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 16, 0, 4),
      child: Text.rich(
        TextSpan(
          children: [
            // 行内经文引用同样带下划线，只是预览里不可点。
            for (final p in splitInlineRefs(title))
              TextSpan(
                text: p.value,
                style: p.kind == InlineRefKind.ref && p.osis != null
                    ? style.copyWith(
                        decoration: TextDecoration.underline,
                        decorationColor: style.color,
                      )
                    : style,
              ),
          ],
        ),
      ),
    );
  }

  Widget _proseParagraph(
    VerseParagraph para,
    ChapterDictUnderlinePlan underlinePlan,
  ) {
    final display = para.verses
        .map((v) => Verse(verse: v.verse, text: _textFor(primary, v.verse)))
        .toList();
    final prose = !isPoetryBook(book.id);

    if (verseNo == ReaderVerseNumberMode.margin) {
      return Container(
        margin: EdgeInsets.only(
          bottom: readerParagraphGapBottom(poetry: !prose, fontPx: fontPx),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final (i, verse) in display.indexed) ...[
              if (sectionByVerse[verse.verse] case final t?)
                _sectionTitle(t.trim()),
              Padding(
                padding: const EdgeInsets.fromLTRB(0, 3, 0, 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (prose && i == 0) SizedBox(width: fontPx),
                    SizedBox(
                      width: fontPx * kReaderMarginVerseSlotEm,
                      child: Text(
                        '${verse.verse}',
                        textAlign: TextAlign.right,
                        style: _mainStyle.copyWith(
                          fontSize: fontPx * kReaderInlineVerseEm,
                          fontWeight: FontWeight.w700,
                          color: AppColors.accentDeep.withValues(alpha: 0.85),
                          height: 1.0,
                          letterSpacing: 0,
                        ),
                      ),
                    ),
                    SizedBox(width: fontPx * kReaderMarginVerseGapEm),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(right: 4),
                        child: RichText(
                          textAlign: _bodyAlign,
                          text: TextSpan(
                            style: _mainStyle,
                            children: _verseSpans(
                              verse,
                              style: _mainStyle,
                              showNumber: false,
                              underlinePlan: underlinePlan,
                            ),
                          ),
                        ),
                      ),
                    ),
                    if (notesByVerse[verse.verse]?.firstOrNull != null)
                      Padding(
                        padding: const EdgeInsets.only(left: 2, top: 2),
                        child: Icon(
                          Icons.sticky_note_2_outlined,
                          size: 12,
                          color: AppColors.accentDeep.withValues(alpha: 0.5),
                        ),
                      ),
                    if (thoughtsEnabled &&
                        (thoughtsByVerse[verse.verse] ?? 0) > 0)
                      const Padding(
                        padding: EdgeInsets.only(left: 2, top: 2),
                        child: Icon(
                          Icons.notes,
                          size: 12,
                          color: AppColors.inkFaint,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      );
    }

    final spans = <InlineSpan>[];
    var firstVerse = true;
    for (final verse in display) {
      if (sectionByVerse[verse.verse] case final t?) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.top,
            child: _sectionTitle(t.trim()),
          ),
        );
      }
      final indentHere = prose && firstVerse;
      firstVerse = false;
      spans.addAll(
        _verseSpans(
          verse,
          style: _mainStyle,
          showNumber: true,
          appendNoteIcon: true,
          proseIndent: indentHere,
          underlinePlan: underlinePlan,
        ),
      );
    }
    return Container(
      margin: EdgeInsets.only(
        bottom: readerParagraphGapBottom(poetry: _poetry, fontPx: fontPx),
      ),
      child: RichText(
        textAlign: _bodyAlign,
        text: TextSpan(style: _mainStyle, children: spans),
      ),
    );
  }

  Widget _parallelParagraph(
    VerseParagraph para,
    ChapterDictUnderlinePlan underlinePlan,
  ) {
    final children = <Widget>[];
    var firstVerse = true;
    for (final layoutVerse in para.verses) {
      if (sectionByVerse[layoutVerse.verse] case final t?) {
        children.add(_sectionTitle(t.trim()));
      }
      final indentHere = !_poetry && firstVerse;
      firstVerse = false;
      children.add(
        RichText(
          textAlign: _bodyAlign,
          text: TextSpan(
            style: _mainStyle,
            children: _verseSpans(
              Verse(
                verse: layoutVerse.verse,
                text: _textFor(primary, layoutVerse.verse),
              ),
              style: _mainStyle,
              showNumber: true,
              proseIndent: indentHere,
              underlinePlan: underlinePlan,
            ),
          ),
        ),
      );
      children.add(const SizedBox(height: 6));
      children.add(
        RichText(
          textAlign: _bodyAlign,
          text: TextSpan(
            style: _parallelStyle,
            text:
                '${formatQuotesForDisplay(_textFor(parallel!, layoutVerse.verse), quoteDisplay)} ',
          ),
        ),
      );
      children.add(const SizedBox(height: 8));
    }
    return Padding(
      padding: EdgeInsets.only(
        bottom: readerParagraphGapBottom(poetry: _poetry, fontPx: fontPx) * 0.55,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rows = <Object>[];
    final paragraphs = groupVersesIntoParagraphs(
      book.id,
      structure.verses,
      sectionStarts: sectionByVerse.keys.toList()..sort(),
      paragraphRanges: paragraphRanges,
    );
    for (final paragraph in paragraphs) {
      rows.add(paragraph);
    }
    final underlinePlan = _buildUnderlinePlan();
    final itemCount = rows.length;
    return ExcludeSemantics(
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          kReaderContentPadH,
          topPad,
          kReaderContentPadH,
          72,
        ),
        addAutomaticKeepAlives: false,
        addSemanticIndexes: false,
        itemCount: itemCount + (headerBar != null ? 1 : 0),
        itemBuilder: (context, i) {
          if (headerBar != null && i == 0) return headerBar!;
          final row = rows[i - (headerBar != null ? 1 : 0)];
          return RepaintBoundary(
            child: parallel == null
                ? _proseParagraph(row as VerseParagraph, underlinePlan)
                : _parallelParagraph(row as VerseParagraph, underlinePlan),
          );
        },
      ),
    );
  }
}
