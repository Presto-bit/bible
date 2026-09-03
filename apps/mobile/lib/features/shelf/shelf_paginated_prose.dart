/// 书架 HTML 流式竖滚 + 选区工具条（对齐 PWA / 圣经 Tab ReaderFocusBar）。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../bible/markings_repository.dart';
import '../bible/reader_focus_bar.dart';
import '../bible/reader_marking_models.dart';
import '../bible/reader_preferences.dart';
import 'shelf_highlight_html.dart';
import 'shelf_mark_ref.dart';
import 'shelf_prose_html.dart';
import 'shelf_reading_prefs.dart';
import 'shelf_scroll_anchor.dart';

const _shelfTextMaxWidth = 672.0;

class ShelfPaginatedProse extends ConsumerStatefulWidget {
  const ShelfPaginatedProse({
    super.key,
    required this.bookId,
    required this.sectionId,
    required this.html,
    required this.fontPx,
    required this.lineHeight,
    this.fontFamily = ShelfFontFamily.serif,
    this.variantDocx = false,
    this.lessonTone = false,
    this.scrollOffset = 0,
    this.scrollAnchor,
    this.scrollToEnd = false,
    this.onTap,
    this.onScrollProgress,
    this.onScrollAnchor,
    this.onSectionEdge,
    this.onSelectionActiveChanged,
  });

  final String bookId;
  final String sectionId;
  final String html;
  final double fontPx;
  final double lineHeight;
  final ShelfFontFamily fontFamily;
  final bool variantDocx;
  final bool lessonTone;
  final double scrollOffset;
  final ShelfScrollAnchor? scrollAnchor;
  final bool scrollToEnd;
  final VoidCallback? onTap;
  final ValueChanged<double>? onScrollProgress;
  final ValueChanged<ShelfScrollAnchor>? onScrollAnchor;
  final ValueChanged<String>? onSectionEdge;
  final ValueChanged<bool>? onSelectionActiveChanged;

  @override
  ConsumerState<ShelfPaginatedProse> createState() => _ShelfPaginatedProseState();
}

class _ShelfPaginatedProseState extends ConsumerState<ShelfPaginatedProse> {
  SelectedContent? _selection;
  final _scroll = ScrollController();
  var _edgeLock = false;
  var _syncingScroll = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _applyInitialScroll());
  }

  @override
  void didUpdateWidget(covariant ShelfPaginatedProse oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.html != widget.html ||
        oldWidget.scrollOffset != widget.scrollOffset ||
        oldWidget.scrollAnchor != widget.scrollAnchor ||
        oldWidget.scrollToEnd != widget.scrollToEnd) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _applyInitialScroll());
    }
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  double _targetScrollRatio() {
    if (widget.scrollToEnd) return 1.0;
    final anchor = widget.scrollAnchor;
    if (anchor != null) {
      return shelfRatioForParagraphIndex(widget.html, anchor.paragraphIndex);
    }
    return widget.scrollOffset.clamp(0.0, 1.0);
  }

  void _applyInitialScroll() {
    if (!_scroll.hasClients) return;
    _syncingScroll = true;
    final max = _scroll.position.maxScrollExtent;
    final ratio = _targetScrollRatio();
    if (widget.scrollToEnd) {
      _scroll.jumpTo(max);
    } else if (ratio > 0 && max > 0) {
      _scroll.jumpTo(ratio * max);
    } else {
      _scroll.jumpTo(0);
    }
    Future<void>.delayed(const Duration(milliseconds: 80), () {
      if (mounted) _syncingScroll = false;
    });
  }

  void _onScroll() {
    if (_syncingScroll || !_scroll.hasClients) return;
    final max = _scroll.position.maxScrollExtent;
    final ratio = max > 0 ? (_scroll.offset / max).clamp(0.0, 1.0) : 0.0;
    widget.onScrollProgress?.call(ratio);
    widget.onScrollAnchor?.call(
      ShelfScrollAnchor(
        paragraphIndex: shelfParagraphIndexForRatio(widget.html, ratio),
      ),
    );

    if (_edgeLock || widget.onSectionEdge == null) return;
    final m = _scroll.position;
    if (m.pixels >= m.maxScrollExtent - 20) {
      _fireEdge('next');
    } else if (m.pixels <= m.minScrollExtent + 4 &&
        m.userScrollDirection == ScrollDirection.reverse) {
      _fireEdge('prev');
    }
  }

  void _fireEdge(String edge) {
    _edgeLock = true;
    widget.onSectionEdge?.call(edge);
    Future<void>.delayed(const Duration(milliseconds: 900), () {
      if (mounted) _edgeLock = false;
    });
  }

  Map<String, Style> get _styles {
    final scale = widget.lessonTone ? 1.04 : 1.0;
    final bodySize = (widget.variantDocx ? widget.fontPx * 0.94 : widget.fontPx) * scale;
    final lh = widget.lineHeight * (widget.lessonTone ? 1.04 : 1.0);
    final family = widget.fontFamily == ShelfFontFamily.sans
        ? 'PingFang SC, sans-serif'
        : 'Georgia, Songti SC, serif';
    Style withFamily(Style s) => s.copyWith(fontFamily: family);

    Style bodyParagraph({bool docx = false}) => withFamily(Style(
          fontSize: FontSize(bodySize),
          lineHeight: LineHeight(lh),
          margin: Margins.only(bottom: widget.lessonTone ? 14 : 12),
          textAlign: docx || widget.lessonTone ? TextAlign.left : TextAlign.justify,
          textIndent: docx && widget.lessonTone ? TextIndent(2, Unit.em) : TextIndent.zero,
          width: docx ? Width(100, Unit.percent) : null,
        ));

    final docxParagraph = bodyParagraph(docx: true);

    return {
      'body': withFamily(Style(
        margin: Margins.zero,
        padding: HtmlPaddings.zero,
        width: Width(100, Unit.percent),
      )),
      'p': widget.variantDocx ? docxParagraph : bodyParagraph(),
      '.shelf-body': widget.variantDocx ? docxParagraph : bodyParagraph(),
      'h1': withFamily(Style(
        fontSize: FontSize(bodySize * 1.08),
        lineHeight: LineHeight(lh * 0.95),
        fontWeight: FontWeight.w700,
        margin: Margins.only(top: 8, bottom: 12),
        textAlign: TextAlign.left,
      )),
      '.shelf-title': withFamily(Style(
        fontSize: FontSize(bodySize * 1.08),
        fontWeight: FontWeight.w700,
        margin: Margins.only(bottom: 12),
        textAlign: TextAlign.left,
      )),
      'h2': withFamily(Style(
        fontSize: FontSize(bodySize * 1.02),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 10, bottom: 8),
        textAlign: TextAlign.left,
      )),
      '.shelf-h1': withFamily(Style(
        fontSize: FontSize(bodySize * 1.02),
        fontWeight: FontWeight.w700,
        margin: Margins.only(top: 12, bottom: 8),
        textAlign: TextAlign.left,
      )),
      'div': withFamily(Style(
        margin: Margins.zero,
        padding: HtmlPaddings.zero,
        width: Width(100, Unit.percent),
      )),
      'h3': withFamily(Style(
        fontSize: FontSize(bodySize * 0.98),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 8, bottom: 6),
        textAlign: TextAlign.left,
      )),
      '.shelf-h2': withFamily(Style(
        fontSize: FontSize(bodySize * 0.98),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 10, bottom: 6),
        textAlign: TextAlign.left,
      )),
      'h4': withFamily(Style(
        fontSize: FontSize(bodySize * 0.94),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 6, bottom: 4),
        textAlign: TextAlign.left,
      )),
      'ul': withFamily(Style(
        margin: Margins.only(left: widget.lessonTone ? 0 : 18, bottom: 12),
        padding: widget.lessonTone ? HtmlPaddings.only(left: 22) : HtmlPaddings.zero,
        width: Width(100, Unit.percent),
      )),
      'ol': withFamily(Style(
        margin: Margins.only(left: widget.lessonTone ? 0 : 18, bottom: 12),
        padding: widget.lessonTone ? HtmlPaddings.only(left: 22) : HtmlPaddings.zero,
        width: Width(100, Unit.percent),
      )),
      '.shelf-docx-list': withFamily(Style(
        margin: Margins.only(left: widget.lessonTone ? 0 : 18, bottom: 12),
        padding: widget.lessonTone ? HtmlPaddings.only(left: 22) : HtmlPaddings.zero,
        width: Width(100, Unit.percent),
      )),
      'li': withFamily(Style(
        fontSize: FontSize(bodySize),
        lineHeight: LineHeight(lh),
        margin: Margins.only(bottom: 6),
      )),
      'blockquote': withFamily(Style(
        fontSize: FontSize(bodySize),
        lineHeight: LineHeight(lh),
        margin: Margins.symmetric(vertical: 12),
        padding: HtmlPaddings.only(left: 12),
        border: const Border(left: BorderSide(color: Color(0x553D5A45), width: 3)),
        color: const Color(0xFF5A534D),
      )),
      'table': withFamily(Style(
        margin: Margins.symmetric(vertical: 12),
        width: Width(100, Unit.percent),
      )),
      '.shelf-docx-table-wrap': withFamily(Style(
        margin: Margins.symmetric(vertical: 12),
        width: Width(100, Unit.percent),
      )),
      'td': withFamily(Style(padding: HtmlPaddings.all(8))),
      'th': withFamily(Style(padding: HtmlPaddings.all(8), fontWeight: FontWeight.w600)),
      'img': Style(
        maxLines: null,
        display: Display.block,
        width: Width(100, Unit.percent),
      ),
      '.shelf-docx-img': Style(
        maxLines: null,
        display: Display.block,
        width: Width(100, Unit.percent),
      ),
      '.shelf-docx-title': withFamily(Style(
        fontSize: FontSize(bodySize * 1.08),
        fontWeight: FontWeight.w700,
        margin: Margins.only(bottom: 12),
        textAlign: TextAlign.left,
        textIndent: TextIndent.zero,
      )),
      '.shelf-docx-h1': withFamily(Style(
        fontSize: FontSize(bodySize * 1.02),
        fontWeight: FontWeight.w700,
        margin: Margins.only(top: 12, bottom: 8),
        textAlign: TextAlign.left,
        textIndent: TextIndent.zero,
      )),
      '.shelf-docx-h2': withFamily(Style(
        fontSize: FontSize(bodySize * 0.98),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 10, bottom: 6),
        textAlign: TextAlign.left,
        textIndent: TextIndent.zero,
      )),
      '.shelf-docx-h3': withFamily(Style(
        fontSize: FontSize(bodySize * 0.94),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 8, bottom: 4),
        textAlign: TextAlign.left,
        textIndent: TextIndent.zero,
      )),
      '.shelf-docx-p': docxParagraph,
      '.shelf-docx-indent': docxParagraph,
      'mark': Style(padding: HtmlPaddings.zero, margin: Margins.zero),
      '.shelf-hl': Style(padding: HtmlPaddings.zero, margin: Margins.zero),
      '.shelf-dialogue': withFamily(Style(
        fontSize: FontSize(bodySize),
        lineHeight: LineHeight(lh * 1.02),
        fontWeight: FontWeight.w400,
        margin: Margins.only(bottom: 10),
        textAlign: TextAlign.justify,
      )),
      '.shelf-dialogue-speaker': withFamily(Style(fontWeight: FontWeight.w600)),
      '.shelf-dialogue-text': withFamily(Style(fontWeight: FontWeight.w400)),
      '.shelf-dialogue-q-head': withFamily(Style(
        fontSize: FontSize(bodySize),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 16, bottom: 6),
        textAlign: TextAlign.left,
      )),
      '.shelf-dialogue-q': withFamily(Style(
        fontSize: FontSize(bodySize),
        lineHeight: LineHeight(lh * 1.02),
        fontStyle: FontStyle.italic,
        fontWeight: FontWeight.w400,
        color: const Color(0xFF3D5A45),
        margin: Margins.only(bottom: 8),
        textAlign: TextAlign.left,
      )),
    };
  }

  String get _renderHtml {
    var base = widget.variantDocx
        ? prepareShelfDocxLayoutHtml(widget.html)
        : widget.html;
    base = prepareShelfProseHtml(_indentBodyParagraphs(base));
    final marks = ref.watch(highlightMapProvider).maybeWhen(
          data: (m) => m,
          orElse: () => const <String, HighlightMark>{},
        );
    return applyShelfHighlightsToHtml(base, marks, widget.bookId, widget.sectionId);
  }

  String _indentBodyParagraphs(String html) {
    if (widget.variantDocx) return html;
    var out = html;
    for (final cls in ['shelf-body', 'shelf-docx-p', 'shelf-docx-indent']) {
      out = out.replaceAllMapped(
        RegExp('<p class="$cls">\\s*'),
        (m) => '${m.group(0)!}\u3000\u3000',
      );
    }
    return out;
  }

  String? get _selectedText {
    final t = _selection?.plainText.trim();
    return (t == null || t.isEmpty) ? null : t;
  }

  String? _selectionRef() {
    final text = _selectedText;
    if (text == null) return null;
    final start = findPlainTextSpan(widget.html, text);
    if (start == null) return null;
    return buildShelfMarkRef(
      widget.bookId,
      widget.sectionId,
      spanStart: start,
      spanEnd: start + text.length,
    );
  }

  void _clearSelection() {
    setState(() => _selection = null);
    widget.onSelectionActiveChanged?.call(false);
  }

  void _setSelection(SelectedContent value) {
    setState(() => _selection = value);
    widget.onSelectionActiveChanged?.call(true);
  }

  Future<void> _copySelection() async {
    final text = _selectedText;
    if (text == null) return;
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('已复制'),
        duration: Duration(milliseconds: 1200),
      ),
    );
    _clearSelection();
  }

  Future<void> _pickHighlight(String color) async {
    final refStr = _selectionRef();
    if (refStr == null) return;
    await ref.read(markingsRepoProvider).toggleHighlight(refStr, color: color);
    _clearSelection();
  }

  Future<void> _clearHighlight() async {
    final refStr = _selectionRef();
    if (refStr == null) return;
    final mark = ref.read(highlightMapProvider).maybeWhen(
          data: (m) => m[refStr],
          orElse: () => null,
        );
    if (mark != null) {
      await ref.read(markingsRepoProvider).toggleHighlight(refStr, color: mark.color);
    }
    _clearSelection();
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selectedText;
    final hasSelection = selected != null;
    final currentRef = hasSelection ? _selectionRef() : null;
    HighlightMark? currentMark;
    if (currentRef != null) {
      currentMark = ref.watch(highlightMapProvider).maybeWhen(
            data: (m) => m[currentRef],
            orElse: () => null,
          );
    }

    return Stack(
      clipBehavior: Clip.hardEdge,
      children: [
        SelectionArea(
          onSelectionChanged: (value) {
            if (value != null && value.plainText.trim().isNotEmpty) {
              _setSelection(value);
            } else if (!hasSelection) {
              _clearSelection();
            }
          },
          child: GestureDetector(
            onTap: hasSelection ? () {} : widget.onTap,
            behavior: HitTestBehavior.translucent,
            child: SingleChildScrollView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 96),
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: _shelfTextMaxWidth),
                  child: SizedBox(
                    width: double.infinity,
                    child: Html(data: _renderHtml, style: _styles),
                  ),
                ),
              ),
            ),
          ),
        ),
        if (hasSelection)
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: Listener(
              behavior: HitTestBehavior.opaque,
              onPointerDown: (_) {},
              child: ReaderFocusBar(
                readingMode: ReadingMode.study,
                verseActionsEnabled: false,
                currentMark: currentMark,
                underlinesEnabled: true,
                thoughtsEnabled: true,
                onLightAi: () {},
                onCopy: () => unawaited(_copySelection()),
                onThought: _clearSelection,
                onVerseCard: () {},
                onCompare: () {},
                onPickColor: (c) => unawaited(_pickHighlight(c)),
                onClearMark: () => unawaited(_clearHighlight()),
                onClose: _clearSelection,
              ),
            ),
          ),
      ],
    );
  }
}
