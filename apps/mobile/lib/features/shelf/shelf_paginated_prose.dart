/// 书架 HTML 流式竖滚 + 选区工具条（对齐 PWA / 圣经 Tab ReaderFocusBar）。
library;

import 'dart:async' show unawaited;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_html/flutter_html.dart';
// ignore: implementation_imports
import 'package:flutter_html/src/extension/helpers/image_tap_extension.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
import '../bible/entity_knowledge_sheet.dart' show showInlineVersePreview;
import '../bible/markings_repository.dart';
import '../bible/reader_focus_bar.dart';
import '../bible/reader_marking_models.dart';
import '../bible/reader_preferences.dart';
import 'shelf_highlight_html.dart';
import 'shelf_mark_ref.dart';
import 'shelf_post_sheets.dart';
import 'shelf_posts_repository.dart';
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
    this.publicNotes = const [],
    this.onPublicNotesChanged,
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
  final List<ShelfPost> publicNotes;
  final VoidCallback? onPublicNotesChanged;

  @override
  ConsumerState<ShelfPaginatedProse> createState() => _ShelfPaginatedProseState();
}

class _ScrollInit {
  const _ScrollInit({
    required this.offset,
    required this.anchor,
    required this.toEnd,
  });

  final double offset;
  final ShelfScrollAnchor? anchor;
  final bool toEnd;
}

class _ShelfPaginatedProseState extends ConsumerState<ShelfPaginatedProse> {
  SelectedContent? _selection;
  final _selectionN = ValueNotifier<SelectedContent?>(null);
  final _scroll = ScrollController();
  var _edgeLock = false;
  var _syncingScroll = false;
  var _downMs = 0;
  Offset _downPos = Offset.zero;
  int? _anchorTick;
  String? _layoutHtml;
  String? _layoutSrc;
  String? _lightboxUrl;
  String? _scrollApplyKey;
  late _ScrollInit _pendingScroll;

  @override
  void initState() {
    super.initState();
    _pendingScroll = _ScrollInit(
      offset: widget.scrollOffset,
      anchor: widget.scrollAnchor,
      toEnd: widget.scrollToEnd,
    );
    _scrollApplyKey = _contentScrollKey();
    _scroll.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _applyInitialScroll());
  }

  String _contentScrollKey() =>
      '${widget.sectionId}:${widget.html.length}:${widget.fontPx}:${widget.lineHeight}:${widget.scrollToEnd}';

  @override
  void didUpdateWidget(covariant ShelfPaginatedProse oldWidget) {
    super.didUpdateWidget(oldWidget);
    final key = _contentScrollKey();
    if (key != _scrollApplyKey) {
      _scrollApplyKey = key;
      _pendingScroll = _ScrollInit(
        offset: widget.scrollOffset,
        anchor: widget.scrollAnchor,
        toEnd: widget.scrollToEnd,
      );
      WidgetsBinding.instance.addPostFrameCallback((_) => _applyInitialScroll());
    }
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    _selectionN.dispose();
    super.dispose();
  }

  double _targetScrollRatio() {
    if (_pendingScroll.toEnd) return 1.0;
    final anchor = _pendingScroll.anchor;
    if (anchor != null) {
      return shelfRatioForParagraphIndex(widget.html, anchor.paragraphIndex);
    }
    return _pendingScroll.offset.clamp(0.0, 1.0);
  }

  void _applyInitialScroll() {
    if (!_scroll.hasClients) return;
    _syncingScroll = true;
    final max = _scroll.position.maxScrollExtent;
    final ratio = _targetScrollRatio();
    if (_pendingScroll.toEnd) {
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
    final now = DateTime.now().millisecondsSinceEpoch;
    if (_anchorTick == null || now - _anchorTick! >= 160) {
      _anchorTick = now;
      widget.onScrollAnchor?.call(
        ShelfScrollAnchor(
          paragraphIndex: shelfParagraphIndexForRatio(widget.html, ratio),
        ),
      );
    }

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

    Style bodyParagraph() => withFamily(Style(
          fontSize: FontSize(bodySize),
          lineHeight: LineHeight(lh),
          margin: Margins.only(bottom: widget.lessonTone ? 14 : 12),
          textAlign: TextAlign.justify,
          width: Width(100, Unit.percent),
        ));

    return {
      'body': withFamily(Style(
        margin: Margins.zero,
        padding: HtmlPaddings.zero,
        width: Width(100, Unit.percent),
      )),
      'p': bodyParagraph(),
      '.shelf-body': bodyParagraph(),
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
      '.shelf-docx-gallery': withFamily(Style(
        margin: Margins.symmetric(vertical: 12),
        width: Width(100, Unit.percent),
      )),
      '.shelf-docx-title': withFamily(Style(
        fontSize: FontSize(bodySize * 1.08),
        fontWeight: FontWeight.w700,
        margin: Margins.only(bottom: 12),
        textAlign: TextAlign.left,
      )),
      '.shelf-docx-h1': withFamily(Style(
        fontSize: FontSize(bodySize * 1.02),
        fontWeight: FontWeight.w700,
        margin: Margins.only(top: 12, bottom: 8),
        textAlign: TextAlign.left,
      )),
      '.shelf-docx-h2': withFamily(Style(
        fontSize: FontSize(bodySize * 0.98),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 10, bottom: 6),
        textAlign: TextAlign.left,
      )),
      '.shelf-docx-h3': withFamily(Style(
        fontSize: FontSize(bodySize * 0.94),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 8, bottom: 4),
        textAlign: TextAlign.left,
      )),
      '.shelf-docx-p': withFamily(bodyParagraph()),
      '.shelf-docx-indent': withFamily(bodyParagraph()),
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
      'a.shelf-inline-ref': withFamily(Style(
        color: const Color(0xFF3D5A45),
        textDecoration: TextDecoration.underline,
        textDecorationColor: const Color(0xFF3D5A45),
        fontWeight: FontWeight.w500,
      )),
      'a.shelf-public-note-hint': withFamily(Style(
        color: const Color(0xFF3D5A45),
        textDecoration: TextDecoration.underline,
        textDecorationStyle: TextDecorationStyle.dashed,
        textDecorationColor: const Color(0xB84A6B52),
      )),
    };
  }

  List<({int start, int end, String postId})> get _publicNoteSpans {
    return widget.publicNotes
        .where((n) => n.spanStart != null && n.spanEnd != null)
        .map(
          (n) => (
            start: n.spanStart!,
            end: n.spanEnd!,
            postId: n.id,
          ),
        )
        .toList();
  }

  Future<void> _onHtmlLinkTap(String? url, Map<String, String> attributes) async {
    final href = (url ?? '').trim();
    if (href.startsWith('shelf-ref:')) {
      final osis = href.substring('shelf-ref:'.length);
      final label = attributes['data-label'] ?? attributes['href'] ?? osis;
      await showInlineVersePreview(context, refParam: osis, label: label);
      return;
    }
    if (href.startsWith('shelf-note:')) {
      final postId = href.substring('shelf-note:'.length);
      if (postId.isEmpty) return;
      await showShelfNoteHubSheet(
        context,
        ref,
        bookId: widget.bookId,
        postId: postId,
      );
      widget.onPublicNotesChanged?.call();
    }
  }

  String get _renderHtml {
    var base = rewriteShelfHtmlAssetUrls(
      widget.html,
      AppConfig.baseUrl,
      bookId: widget.bookId,
    );
    if (widget.variantDocx) {
      if (_layoutSrc != base) {
        _layoutSrc = base;
        _layoutHtml = prepareShelfDocxLayoutHtml(base);
      }
      base = _layoutHtml ?? base;
    }
    base = linkifyShelfProseHtml(_indentBodyParagraphs(base));
    final marks = ref.watch(highlightMapProvider).maybeWhen(
          data: (m) => m,
          orElse: () => const <String, HighlightMark>{},
        );
    base = applyShelfHighlightsToHtml(base, marks, widget.bookId, widget.sectionId);
    base = applyShelfPublicNotesToHtml(base, _publicNoteSpans);
    return base;
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
    _selection = null;
    _selectionN.value = null;
    widget.onSelectionActiveChanged?.call(false);
  }

  void _setSelection(SelectedContent value) {
    _selection = value;
    _selectionN.value = value;
    widget.onSelectionActiveChanged?.call(true);
  }

  String _absAssetUrl(String src) {
    final trimmed = src.trim();
    if (trimmed.isEmpty) return trimmed;
    final base = AppConfig.baseUrl.replaceAll(RegExp(r'/$'), '');
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('/')) return '$base$trimmed';
    final key = trimmed.split('/').last;
    final bid = Uri.encodeComponent(widget.bookId);
    final file = Uri.encodeComponent(key);
    return '$base/shelf/platform/$bid/files/$file';
  }

  Future<void> _openNoteSheet() async {
    final text = _selectedText;
    if (text == null) return;
    final refStr = _selectionRef();
    if (refStr == null) return;
    final spanStart = findPlainTextSpan(widget.html, text);
    final spanEnd = spanStart == null ? null : spanStart + text.length;
    _clearSelection();
    await showShelfPostWriteSheet(
      context,
      ref,
      title: '写笔记',
      contextLabel: '书架笔记',
      contextBody: text,
      placeholder: '写下这段文字给你的启发…',
      kind: ShelfPostKind.note,
      onSave: (body, visibility, readStatus) async {
        await ref.read(shelfPostsRepoProvider).createPost(
              widget.bookId,
              kind: ShelfPostKind.note,
              ref: refStr,
              body: body,
              visibility: visibility,
              sectionId: widget.sectionId,
              pageIndex: 0,
              spanStart: spanStart,
              spanEnd: spanEnd,
            );
        widget.onPublicNotesChanged?.call();
      },
    );
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

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.hardEdge,
      children: [
        SelectionArea(
          onSelectionChanged: (value) {
            final text = value?.plainText.trim() ?? '';
            if (text.isNotEmpty) {
              _setSelection(value!);
            }
          },
          child: Listener(
            behavior: HitTestBehavior.translucent,
            onPointerDown: (e) {
              _downMs = DateTime.now().millisecondsSinceEpoch;
              _downPos = e.position;
            },
            onPointerUp: (e) {
              final held = DateTime.now().millisecondsSinceEpoch - _downMs;
              final dist = (e.position - _downPos).distance;
              if (held >= 400 || dist >= 10) return;
              if (_selection != null) {
                _clearSelection();
                return;
              }
              widget.onTap?.call();
            },
            child: SingleChildScrollView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 96),
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: _shelfTextMaxWidth),
                  child: SizedBox(
                    width: double.infinity,
                    child: RepaintBoundary(
                      child: Html(
                        data: _renderHtml,
                        style: _styles,
                        onLinkTap: (url, attributes, _) {
                          unawaited(_onHtmlLinkTap(url, attributes));
                        },
                        extensions: [
                          OnImageTapExtension(
                            onImageTap: (url, attributes, element) {
                              final src = (url ?? '').trim();
                              if (src.isEmpty) return;
                              setState(() => _lightboxUrl = _absAssetUrl(src));
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        ValueListenableBuilder<SelectedContent?>(
          valueListenable: _selectionN,
          builder: (context, sel, _) {
            final text = sel?.plainText.trim() ?? '';
            if (text.isEmpty) return const SizedBox.shrink();
            return Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: Listener(
                behavior: HitTestBehavior.opaque,
                onPointerDown: (_) {},
                child: ReaderFocusBar(
                  readingMode: ReadingMode.study,
                  verseActionsEnabled: false,
                  currentMark: null,
                  underlinesEnabled: false,
                  thoughtsEnabled: true,
                  onLightAi: () {},
                  onCopy: () => unawaited(_copySelection()),
                  onThought: () => unawaited(_openNoteSheet()),
                  onVerseCard: () {},
                  onCompare: () {},
                  onPickColor: (_) {},
                  onClearMark: () {},
                  onClose: _clearSelection,
                ),
              ),
            );
          },
        ),
        if (_lightboxUrl != null)
          Positioned.fill(
            child: GestureDetector(
              onTap: () => setState(() => _lightboxUrl = null),
              child: ColoredBox(
                color: const Color(0xD2141210),
                child: Center(
                  child: InteractiveViewer(
                    child: Image.network(
                      _lightboxUrl!,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(
                        Icons.broken_image_outlined,
                        color: Colors.white70,
                        size: 48,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
