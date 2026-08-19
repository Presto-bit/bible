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

Future<T?> showReaderSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  double? heightFactor,
  double? maxHeight,
}) {
  final factor = (heightFactor ?? 0.88).clamp(0.42, 0.92);
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    isDismissible: true,
    enableDrag: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.35),
    builder: (ctx) {
      final bottom = MediaQuery.viewInsetsOf(ctx).bottom;
      final screenH = MediaQuery.sizeOf(ctx).height;
      var maxH = screenH * factor;
      if (maxHeight != null) maxH = maxH.clamp(0, maxHeight);
      return Padding(
        padding: EdgeInsets.only(bottom: bottom),
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Material(
            color: AppColors.paper,
            elevation: 12,
            shadowColor: Colors.black.withValues(alpha: 0.12),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            clipBehavior: Clip.antiAlias,
            child: SizedBox(
              height: maxH,
              width: double.infinity,
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
      );
    },
  );
}
