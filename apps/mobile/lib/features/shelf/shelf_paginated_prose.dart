/// 书架 HTML 节内分页（clip + translate，禁止节内滚动）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';

import 'shelf_reading_prefs.dart';

class ShelfPaginatedProse extends StatefulWidget {
  const ShelfPaginatedProse({
    super.key,
    required this.html,
    required this.pageIndex,
    required this.fontPx,
    required this.lineHeight,
    this.fontFamily = ShelfFontFamily.serif,
    this.variantDocx = false,
    this.onPageCount,
    this.onTap,
  });

  final String html;
  final int pageIndex;
  final double fontPx;
  final double lineHeight;
  final ShelfFontFamily fontFamily;
  final bool variantDocx;
  final ValueChanged<int>? onPageCount;
  final VoidCallback? onTap;

  @override
  State<ShelfPaginatedProse> createState() => _ShelfPaginatedProseState();
}

class _ShelfPaginatedProseState extends State<ShelfPaginatedProse> {
  final _measureKey = GlobalKey();
  var _pageCount = 1;
  var _pageHeight = 0.0;

  Map<String, Style> get _styles {
    final bodySize = widget.variantDocx ? widget.fontPx * 0.92 : widget.fontPx;
    final lh = widget.lineHeight;
    final family = widget.fontFamily == ShelfFontFamily.sans
        ? 'PingFang SC, sans-serif'
        : 'Georgia, Songti SC, serif';
    Style withFamily(Style s) => s.copyWith(fontFamily: family);
    return {
      'body': withFamily(Style(margin: Margins.zero, padding: HtmlPaddings.zero)),
      '.shelf-body': withFamily(Style(
        fontSize: FontSize(bodySize),
        lineHeight: LineHeight(lh),
        color: const Color(0xFF2C2825),
        margin: Margins.only(bottom: 10),
      )),
      '.shelf-dialogue': withFamily(Style(
        fontSize: FontSize(bodySize),
        lineHeight: LineHeight(lh),
        color: const Color(0xFF2C2825),
        margin: Margins.only(bottom: 10),
        fontStyle: FontStyle.italic,
      )),
      '.shelf-h1': withFamily(Style(
        fontSize: FontSize(bodySize + 4),
        lineHeight: LineHeight(lh * 0.95),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 8, bottom: 12),
      )),
      '.shelf-h2': withFamily(Style(
        fontSize: FontSize(bodySize + 2),
        lineHeight: LineHeight(lh),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 6, bottom: 10),
      )),
      '.shelf-title': withFamily(Style(
        fontSize: FontSize(bodySize + 6),
        fontWeight: FontWeight.w700,
        margin: Margins.only(bottom: 12),
      )),
      '.shelf-subtitle': withFamily(Style(
        fontSize: FontSize(bodySize),
        color: const Color(0xFF666666),
        margin: Margins.only(bottom: 16),
      )),
      'p': withFamily(Style(
        fontSize: FontSize(bodySize),
        lineHeight: LineHeight(lh),
        margin: Margins.only(bottom: 10),
      )),
      'h1': withFamily(Style(
        fontSize: FontSize(bodySize + 4),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 8, bottom: 12),
      )),
      'h2': withFamily(Style(
        fontSize: FontSize(bodySize + 2),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 6, bottom: 10),
      )),
      'h3': withFamily(Style(
        fontSize: FontSize(bodySize + 1),
        fontWeight: FontWeight.w600,
        margin: Margins.only(top: 4, bottom: 8),
      )),
    };
  }

  Widget _html({Key? key}) => Html(
        key: key,
        data: widget.html,
        style: _styles,
      );

  void _measure() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final box = _measureKey.currentContext?.findRenderObject() as RenderBox?;
      if (box == null || _pageHeight <= 0) return;
      final total = box.size.height;
      final count = (total / _pageHeight).ceil().clamp(1, 9999);
      if (count != _pageCount) {
        setState(() => _pageCount = count);
        widget.onPageCount?.call(count);
      }
    });
  }

  @override
  void didUpdateWidget(covariant ShelfPaginatedProse oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.html != widget.html ||
        oldWidget.fontPx != widget.fontPx ||
        oldWidget.lineHeight != widget.lineHeight ||
        oldWidget.fontFamily != widget.fontFamily) {
      _pageCount = 1;
      _measure();
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final h = constraints.maxHeight;
        if (h > 0 && h != _pageHeight) {
          _pageHeight = h;
          _measure();
        }
        return GestureDetector(
          onTap: widget.onTap,
          behavior: HitTestBehavior.opaque,
          child: Stack(
            clipBehavior: Clip.hardEdge,
            children: [
              Positioned(
                left: 16,
                right: 16,
                top: 0,
                child: Offstage(
                  child: SizedBox(
                    width: constraints.maxWidth - 32,
                    child: _html(key: _measureKey),
                  ),
                ),
              ),
              Positioned.fill(
                child: ClipRect(
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: Transform.translate(
                      offset: Offset(0, -widget.pageIndex * h),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: _html(),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
