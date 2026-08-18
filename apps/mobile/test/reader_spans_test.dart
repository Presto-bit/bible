import 'package:flutter_test/flutter_test.dart';

import 'package:presto_bible/features/bible/selection_range.dart';
import 'package:presto_bible/features/bible/verse_selection_gesture.dart';
import 'package:presto_bible/features/bible/verse_words.dart';

void main() {
  group('SpanIndexBuilder', () {
    test('maps merged CJK run to the covering word slice', () {
      final words = sliceVerseWords('起初神创造天地');
      final b = SpanIndexBuilder();
      b.text(
        value: '起初神创造天地',
        verse: 1,
        verseStart: 0,
        words: words,
      );
      final loc = b.build();
      expect(loc.anchorAt(0)?.start, 0);
      expect(loc.anchorAt(3)?.verse, 1);
      expect(loc.anchorAt(3)!.end - loc.anchorAt(3)!.start, lessThanOrEqualTo(4));
    });

    test('placeholder chip wins over surrounding text', () {
      final b = SpanIndexBuilder();
      b.text(
        value: '但',
        verse: 1,
        verseStart: 0,
        words: const [VerseWordSlice(text: '但', start: 0, end: 1)],
      );
      b.placeholder(
        anchor: const WordAnchor(verse: 1, start: 1, end: 3),
      );
      b.text(
        value: '说',
        verse: 1,
        verseStart: 3,
        words: const [VerseWordSlice(text: '说', start: 3, end: 4)],
      );
      final loc = b.build();
      expect(loc.anchorAt(1), const WordAnchor(verse: 1, start: 1, end: 3));
      expect(loc.anchorAt(0), const WordAnchor(verse: 1, start: 0, end: 1));
    });
  });

  group('wordRangesEqual / edges', () {
    test('selection edge flags the first and last overlapping word', () {
      const range = WordRange(
        anchor: WordAnchor(verse: 1, start: 2, end: 4),
        focus: WordAnchor(verse: 1, start: 6, end: 8),
      );
      expect(wordSelectionEdge(1, 2, 4, range), (left: true, right: false));
      expect(wordSelectionEdge(1, 6, 8, range), (left: false, right: true));
    });
  });
}
