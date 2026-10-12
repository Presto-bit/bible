import 'package:flutter/widgets.dart';

/// 读经 ListView 滚动物理：划词/横滑跟手时实时拒滚，且不触发 subtree 重建。
class ReaderScrollPhysics extends ScrollPhysics {
  const ReaderScrollPhysics({
    required this.selectionLock,
    required this.pageTurnLock,
    super.parent,
  });

  final ValueNotifier<bool> selectionLock;
  final ValueNotifier<bool> pageTurnLock;

  @override
  ReaderScrollPhysics applyTo(ScrollPhysics? ancestor) {
    return ReaderScrollPhysics(
      selectionLock: selectionLock,
      pageTurnLock: pageTurnLock,
      parent: buildParent(ancestor),
    );
  }

  @override
  bool shouldAcceptUserOffset(ScrollMetrics position) {
    if (selectionLock.value || pageTurnLock.value) return false;
    return super.shouldAcceptUserOffset(position);
  }
}
