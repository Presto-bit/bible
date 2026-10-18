import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/features/bible/paragraphs.dart';

void main() {
  test('段中小标题处断段', () {
    expect(
      splitRangesAtSections([(1, 8), (9, 12)], [1, 5, 9]),
      [(1, 4), (5, 8), (9, 12)],
    );
  });

  test('无小标题时原样返回', () {
    expect(splitRangesAtSections([(1, 8)], const []), [(1, 8)]);
  });
}
