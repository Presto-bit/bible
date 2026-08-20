/// 读经半屏统一契约：抓手 + 纸色圆角 + 安全区 + 点空白/下滑关闭。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// 半屏右上角「关闭」，对齐 PWA `SheetCloseButton`。
class ReaderSheetCloseButton extends StatelessWidget {
  const ReaderSheetCloseButton({super.key, this.onPressed});

  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed ?? () => Navigator.of(context).maybePop(),
      style: TextButton.styleFrom(
        foregroundColor: AppColors.inkSoft,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      child: const Text('关闭', style: TextStyle(fontSize: 15)),
    );
  }
}

/// 半屏高度契约（对齐 PWA 词条卡 / 关系图不同 max-height）。
class ReaderSheetSize {
  const ReaderSheetSize({required this.heightFactor, this.maxHeight});

  final double heightFactor;
  final double? maxHeight;
}

Future<T?> showReaderSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  double? heightFactor,
  double? maxHeight,
  ValueNotifier<ReaderSheetSize>? sizeListenable,
}) {
  final initial = ReaderSheetSize(
    heightFactor: heightFactor ?? 0.88,
    maxHeight: maxHeight,
  );
  final sizes = sizeListenable ?? ValueNotifier(initial);
  if (sizeListenable == null && (heightFactor != null || maxHeight != null)) {
    sizes.value = initial;
  }

  double resolveHeight(BuildContext ctx, ReaderSheetSize size) {
    final screenH = MediaQuery.sizeOf(ctx).height;
    final factor = size.heightFactor.clamp(0.42, 0.92);
    var maxH = screenH * factor;
    if (size.maxHeight != null) maxH = maxH.clamp(0, size.maxHeight!);
    return maxH;
  }

  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    isDismissible: true,
    enableDrag: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.35),
    builder: (ctx) {
      return ValueListenableBuilder<ReaderSheetSize>(
        valueListenable: sizes,
        builder: (ctx, size, _) {
          final bottom = MediaQuery.viewInsetsOf(ctx).bottom;
          final maxH = resolveHeight(ctx, size);
          return Stack(
            children: [
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => Navigator.of(ctx).pop(),
                ),
              ),
              Padding(
                padding: EdgeInsets.only(bottom: bottom),
                child: Align(
                  alignment: Alignment.bottomCenter,
                  child: GestureDetector(
                    onTap: () {},
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 260),
                      curve: Curves.easeOutCubic,
                      height: maxH,
                      width: double.infinity,
                      child: Material(
                        color: AppColors.paper,
                        elevation: 12,
                        shadowColor: Colors.black.withValues(alpha: 0.12),
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(20),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Column(
                          children: [
                            const SizedBox(height: 10),
                            Container(
                              width: 36,
                              height: 4,
                              decoration: BoxDecoration(
                                color: AppColors.line,
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Expanded(child: builder(ctx)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      );
    },
  );
}
