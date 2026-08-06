/// 读经半屏统一契约：抓手 + 纸色圆角 + 安全区。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

Future<T?> showReaderSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  double? heightFactor,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.28),
    builder: (ctx) {
      final bottom = MediaQuery.viewInsetsOf(ctx).bottom;
      final maxH = MediaQuery.sizeOf(ctx).height * (heightFactor ?? 0.88);
      return Padding(
        padding: EdgeInsets.only(bottom: bottom),
        child: Align(
          alignment: Alignment.bottomCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxH),
            child: Material(
              color: AppColors.surface,
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(18)),
              clipBehavior: Clip.antiAlias,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 8),
                  Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.line,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Flexible(child: builder(ctx)),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}
