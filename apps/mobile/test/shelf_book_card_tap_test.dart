import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/features/shelf/shelf_book_card.dart';
import 'package:presto_bible/features/shelf/shelf_repository.dart';

void main() {
  testWidgets('ShelfBookCard fires onTap inside scrollable grid', (tester) async {
    var taps = 0;
    var details = 0;
    var longs = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.all(12),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.52,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, i) {
                      return ShelfBookCard(
                        book: ShelfBookSummary(
                          id: 'book-$i',
                          title: '测试书 $i',
                        ),
                        onTap: () => taps++,
                        onDetailTap: () => details++,
                        onLongPress: () => longs++,
                      );
                    },
                    childCount: 6,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Tap first card cover area (center of first grid cell content)
    await tester.tap(find.text('测试书 0'));
    await tester.pump();
    expect(taps, 1, reason: 'tapping title should open book');

    // Tap cover via card finder
    final card = find.byType(ShelfBookCard).first;
    await tester.tap(card);
    await tester.pump();
    expect(taps, greaterThanOrEqualTo(2), reason: 'tapping card should open book');
  });
}
