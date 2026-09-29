/// 书架 flow 切节滚动语义（对齐 Web `shelf_scroll_nav.ts`）。
library;

import 'shelf_scroll_anchor.dart';

enum ShelfScrollIntent { start, end, resume }

class ShelfFlowScrollApply {
  const ShelfFlowScrollApply({
    required this.scrollOffset,
    required this.scrollToEnd,
    this.scrollAnchor,
  });
  final double scrollOffset;
  final ShelfScrollAnchor? scrollAnchor;
  final bool scrollToEnd;
}

ShelfFlowScrollApply resolveShelfFlowScrollApply({
  required ShelfScrollIntent intent,
  required bool sectionMatches,
  required double flowRatio,
  ShelfScrollAnchor? savedAnchor,
  ShelfScrollAnchor? flowAnchor,
}) {
  if (!sectionMatches) {
    return ShelfFlowScrollApply(
      scrollOffset: intent == ShelfScrollIntent.end ? 1 : 0,
      scrollToEnd: intent == ShelfScrollIntent.end,
    );
  }
  if (intent == ShelfScrollIntent.start) {
    return const ShelfFlowScrollApply(scrollOffset: 0, scrollToEnd: false);
  }
  if (intent == ShelfScrollIntent.end) {
    return const ShelfFlowScrollApply(scrollOffset: 1, scrollToEnd: true);
  }
  return ShelfFlowScrollApply(
    scrollOffset: flowRatio,
    scrollAnchor: savedAnchor ?? flowAnchor,
    scrollToEnd: false,
  );
}

bool shouldAcceptShelfFlowScrollReport({
  required ShelfScrollIntent intent,
  required bool sectionMatches,
  required int navEpoch,
  required int reportEpoch,
}) {
  if (navEpoch != reportEpoch) return false;
  if (!sectionMatches) return false;
  if (intent == ShelfScrollIntent.start || intent == ShelfScrollIntent.end) {
    return false;
  }
  return true;
}
