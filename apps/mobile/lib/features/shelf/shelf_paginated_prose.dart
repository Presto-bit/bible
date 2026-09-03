/// 书架 HTML 流式竖滚 + 选区工具条（对齐 PWA）。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../bible/markings_repository.dart';
import '../bible/reader_marking_models.dart';
import 'shelf_mark_ref.dart';
import 'shelf_prose_html.dart';
import 'shelf_reading_prefs.dart';

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
    this.scrollToEnd = false,
    this.onTap,
    this.onScrollProgress,
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
  final bool scrollToEnd;
  final VoidCallback? onTap;
  final ValueChanged<double>? onScrollProgress;
  final ValueChanged<String>? onSectionEdge;
  final ValueChanged<bool>? onSelectionActiveChanged;

  @override
  ConsumerState<ShelfPaginatedProse> createState() => _ShelfPaginatedProseState();
}

class _ShelfPaginatedProseState extends ConsumerState<ShelfPaginatedProse> {
  SelectedContent? _selection;
  var _markPaletteOpen = false;
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

  void _applyInitialScroll() {
    if (!_scroll.hasClients) return;
    _syncingScroll = true;
    final max = _scroll.position.maxScrollExtent;
    if (widget.scrollToEnd) {
      _scroll.jumpTo(max);
    } else if (widget.scrollOffset > 0 && max > 0) {
      _scroll.jumpTo(widget.scrollOffset.clamp(0, 1) * max);
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

    if (_edgeLock || widget.onSectionEdge == null) return;
    final m = _scroll.position;
    if (m.pixels >= m.maxScrollExtent - 20) {
      _fireEdge('next');
    } else if (m.pixels <= m.minScrollExtent + 4 && m.userScrollDirection == ScrollDirection.reverse) {
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
    return {
      'body': withFamily(Style(margin: Margins.zero, padding: HtmlPaddings.zero)),
      'p': withFamily(Style(
        fontSize: FontSize(bodySize),
        lineHeight: LineHeight(lh),
        margin: Margins.only(bottom: 12),
        textAlign: TextAlign.justify,
      )),
      'h1': withFamily(Style(
        fontSize: FontSize(bodySize * 1.08),
        lineHeight: LineHeight(lh * 0.95),
        fontWeight: FontWeight.w700,
        margin: Margins.only(top: 8, bottom: 12),
      )),
      'h2': withFamily(Style(
        fontSize: FontSize(bodySize * 1.02),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 10, bottom: 8),
      )),
      'h3': withFamily(Style(
        fontSize: FontSize(bodySize * 0.98),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 8, bottom: 6),
      )),
      'h4': withFamily(Style(
        fontSize: FontSize(bodySize * 0.94),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 6, bottom: 4),
      )),
      'ul': withFamily(Style(margin: Margins.only(left: 18, bottom: 12))),
      'ol': withFamily(Style(margin: Margins.only(left: 18, bottom: 12))),
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
      'table': withFamily(Style(margin: Margins.symmetric(vertical: 12))),
      'td': withFamily(Style(padding: HtmlPaddings.all(8))),
      'th': withFamily(Style(padding: HtmlPaddings.all(8), fontWeight: FontWeight.w600)),
      'img': Style(maxLines: null, display: Display.block),
      '.shelf-docx-title': withFamily(Style(
        fontSize: FontSize(bodySize * 1.08),
        fontWeight: FontWeight.w700,
        margin: Margins.only(bottom: 12),
      )),
      '.shelf-docx-h1': withFamily(Style(
        fontSize: FontSize(bodySize * 1.02),
        fontWeight: FontWeight.w700,
        margin: Margins.only(top: 12, bottom: 8),
      )),
      '.shelf-docx-h2': withFamily(Style(
        fontSize: FontSize(bodySize * 0.98),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 10, bottom: 6),
      )),
      '.shelf-docx-h3': withFamily(Style(
        fontSize: FontSize(bodySize * 0.94),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 8, bottom: 4),
      )),
      '.shelf-docx-p': withFamily(Style(
        fontSize: FontSize(bodySize),
        lineHeight: LineHeight(lh),
        margin: Margins.only(bottom: widget.lessonTone ? 14 : 12),
        textAlign: TextAlign.justify,
        padding: widget.lessonTone
            ? HtmlPaddings.only(left: bodySize * 2)
            : HtmlPaddings.zero,
      )),
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
    setState(() {
      _selection = null;
      _markPaletteOpen = false;
    });
    widget.onSelectionActiveChanged?.call(false);
  }

  void _setSelection(SelectedContent value) {
    setState(() {
      _selection = value;
      _markPaletteOpen = false;
    });
    widget.onSelectionActiveChanged?.call(true);
  }

  Future<void> _copySelection() async {
    final text = _selectedText;
    if (text == null) return;
    await Clipboard.setData(ClipboardData(text: text));
    _clearSelection();
  }

  Future<void> _pickHighlight(String color) async {
    final ref = _selectionRef();
    if (ref == null) return;
    await ref.read(markingsRepoProvider).toggleHighlight(ref, color: color);
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
            } else {
              _clearSelection();
            }
          },
          child: GestureDetector(
            onTap: hasSelection ? null : widget.onTap,
            behavior: HitTestBehavior.translucent,
            child: SingleChildScrollView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 96),
              child: Html(data: prepareShelfProseHtml(widget.html), style: _styles),
            ),
          ),
        ),
        if (hasSelection)
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: Material(
              elevation: 2,
              borderRadius: BorderRadius.circular(12),
              color: const Color(0xFFF7F3EC),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_markPaletteOpen && currentMark == null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            for (final c in highlightColorKeys)
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 5),
                                child: GestureDetector(
                                  onTap: () => _pickHighlight(c),
                                  child: Container(
                                    width: 22,
                                    height: 22,
                                    decoration: BoxDecoration(
                                      color: chipColor(c),
                                      shape: BoxShape.circle,
                                      border: Border.all(color: const Color(0x332C2825)),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        TextButton.icon(
                          onPressed: _clearSelection,
                          icon: const Icon(Icons.lightbulb_outline, size: 18),
                          label: const Text('笔记'),
                        ),
                        TextButton.icon(
                          onPressed: () {
                            if (currentMark != null) {
                              final refStr = _selectionRef();
                              if (refStr != null) {
                                ref
                                    .read(markingsRepoProvider)
                                    .toggleHighlight(refStr, color: currentMark.color);
                              }
                              _clearSelection();
                              return;
                            }
                            setState(() => _markPaletteOpen = !_markPaletteOpen);
                          },
                          icon: const Icon(Icons.edit_outlined, size: 18),
                          label: Text(currentMark != null ? '取消划线' : '划线'),
                        ),
                        TextButton.icon(
                          onPressed: _copySelection,
                          icon: const Icon(Icons.copy_outlined, size: 18),
                          label: const Text('复制'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
