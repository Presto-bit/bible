import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/features/shelf/shelf_scroll_anchor.dart';
import 'package:presto_bible/features/shelf/shelf_scroll_nav.dart';

void main() {
  group('resolveShelfFlowScrollApply', () {
    test('左右滑 start 强制开头', () {
      final r = resolveShelfFlowScrollApply(
        intent: ShelfScrollIntent.start,
        sectionMatches: true,
        flowRatio: 0.6,
        savedAnchor: const ShelfScrollAnchor(paragraphIndex: 12),
      );
      expect(r.scrollOffset, 0);
      expect(r.scrollAnchor, isNull);
      expect(r.scrollToEnd, isFalse);
    });

    test('旧 DOM 不对齐不套中部', () {
      final r = resolveShelfFlowScrollApply(
        intent: ShelfScrollIntent.resume,
        sectionMatches: false,
        flowRatio: 0.6,
        savedAnchor: const ShelfScrollAnchor(paragraphIndex: 12),
      );
      expect(r.scrollOffset, 0);
      expect(r.scrollAnchor, isNull);
    });

    test('目录续读保留比例', () {
      const anchor = ShelfScrollAnchor(paragraphIndex: 3);
      final r = resolveShelfFlowScrollApply(
        intent: ShelfScrollIntent.resume,
        sectionMatches: true,
        flowRatio: 0.42,
        savedAnchor: anchor,
      );
      expect(r.scrollOffset, 0.42);
      expect(r.scrollAnchor, same(anchor));
    });
  });

  group('shouldAcceptShelfFlowScrollReport', () {
    test('start 钉住丢弃', () {
      expect(
        shouldAcceptShelfFlowScrollReport(
          intent: ShelfScrollIntent.start,
          sectionMatches: true,
          navEpoch: 1,
          reportEpoch: 1,
        ),
        isFalse,
      );
    });

    test('resume 对齐接受', () {
      expect(
        shouldAcceptShelfFlowScrollReport(
          intent: ShelfScrollIntent.resume,
          sectionMatches: true,
          navEpoch: 2,
          reportEpoch: 2,
        ),
        isTrue,
      );
    });
  });
}
