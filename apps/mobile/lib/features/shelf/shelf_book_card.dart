/// 书架书卡：单卡片上图下书名 + 封面底进度细线。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'shelf_brand_cover.dart';
import 'shelf_repository.dart';

class ShelfBookCard extends StatefulWidget {
  const ShelfBookCard({
    super.key,
    required this.book,
    this.coverUrl,
    this.progressRatio,
    this.onTap,
    this.onDetailTap,
    this.onLongPress,
  });

  final ShelfBookSummary book;
  final String? coverUrl;
  final double? progressRatio;
  final VoidCallback? onTap;
  final VoidCallback? onDetailTap;
  final VoidCallback? onLongPress;

  @override
  State<ShelfBookCard> createState() => _ShelfBookCardState();
}

class _ShelfBookCardState extends State<ShelfBookCard> {
  Offset? _down;
  var _moved = false;
  var _detailPress = false;

  static const _tapSlop = 18.0;

  void _resetPointer() {
    _down = null;
    _moved = false;
  }

  void _onPointerDown(PointerDownEvent e) {
    _down = e.position;
    _moved = false;
  }

  void _onPointerMove(PointerMoveEvent e) {
    final start = _down;
    if (start == null || _moved) return;
    if ((e.position - start).distance > _tapSlop) _moved = true;
  }

  void _onPointerUp(PointerUpEvent e) {
    if (_detailPress) {
      _detailPress = false;
      return;
    }
    final start = _down;
    _resetPointer();
    if (start == null || _moved) return;
    if ((e.position - start).distance > _tapSlop) return;
    widget.onTap?.call();
  }

  void _onPointerCancel(PointerCancelEvent e) {
    _detailPress = false;
    _resetPointer();
  }

  @override
  Widget build(BuildContext context) {
    final ratio = widget.progressRatio?.clamp(0.0, 1.0);
    return Material(
      color: Colors.transparent,
      child: SizedBox.expand(
        child: Listener(
          behavior: HitTestBehavior.opaque,
          onPointerDown: widget.onTap == null ? null : _onPointerDown,
          onPointerMove: widget.onTap == null ? null : _onPointerMove,
          onPointerUp: widget.onTap == null ? null : _onPointerUp,
          onPointerCancel: widget.onTap == null ? null : _onPointerCancel,
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onLongPress: widget.onLongPress,
            child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: DecoratedBox(
                    decoration: const BoxDecoration(
                      boxShadow: [
                        BoxShadow(
                          color: Color(0x14000000),
                          blurRadius: 8,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (widget.coverUrl != null && widget.coverUrl!.isNotEmpty)
                          Image.network(widget.coverUrl!, fit: BoxFit.cover)
                        else
                          const ShelfBrandCover(),
                        if (ratio != null && ratio > 0)
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: SizedBox(
                              height: 2,
                              child: ColoredBox(
                                color: AppColors.ink.withValues(alpha: 0.08),
                                child: Align(
                                  alignment: Alignment.centerLeft,
                                  child: FractionallySizedBox(
                                    widthFactor: ratio,
                                    child: const ColoredBox(
                                      color: AppColors.accentDeep,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        if (widget.onDetailTap != null)
                          Positioned(
                            top: 5,
                            right: 5,
                            child: Listener(
                              behavior: HitTestBehavior.opaque,
                              onPointerDown: (_) => _detailPress = true,
                              onPointerUp: (_) {
                                if (_detailPress) widget.onDetailTap?.call();
                                _detailPress = false;
                              },
                              onPointerCancel: (_) => _detailPress = false,
                              child: const SizedBox(
                                width: 28,
                                height: 28,
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    color: Colors.black38,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Center(
                                    child: Text(
                                      'i',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        fontStyle: FontStyle.italic,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              SizedBox(
                height: 32,
                child: Text(
                  widget.book.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.35,
                    fontWeight: FontWeight.w500,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
        ),
        ),
      ),
    );
  }
}
