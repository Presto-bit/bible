import 'package:presto_bible/features/shelf/shelf_prose_html.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('strips Word margin/width that squeeze the prose column', () {
    final out = prepareShelfDocxLayoutHtml(
      '<div style="margin-left:72pt;width:360px;max-width:50%">'
      '<p class="shelf-docx-p" style="text-indent:2em;width:280px">正文</p>'
      '</div>',
    );
    expect(out.contains('margin-left'), isFalse);
    expect(out.contains('width:'), isFalse);
    expect(out.contains('text-indent'), isFalse);
    expect(out.contains('正文'), isTrue);
  });

  test('unwraps singleton layout tables that leave right-side whitespace', () {
    final out = prepareShelfDocxLayoutHtml(
      '<table width="100%"><tr>'
      '<td width="480"><p class="shelf-docx-p">窄列正文</p></td>'
      '</tr></table>',
    );
    expect(out.contains('<table'), isFalse);
    expect(out.contains('窄列正文'), isTrue);
    expect(out.contains('width='), isFalse);
  });

  test('unwraps spacer-cell layout tables', () {
    final out = prepareShelfDocxLayoutHtml(
      '<table><tr>'
      '<td width="48"></td>'
      '<td><p class="shelf-docx-p">对话正文</p></td>'
      '<td width="120"></td>'
      '</tr></table>',
    );
    expect(out.contains('<table'), isFalse);
    expect(out.contains('对话正文'), isTrue);
  });

  test('wraps remaining content tables for full-bleed width', () {
    final out = prepareShelfDocxLayoutHtml(
      '<table border="1"><tr><td>甲</td><td>乙</td></tr></table>',
    );
    expect(out.contains('shelf-docx-table-wrap'), isTrue);
    expect(out.contains('shelf-docx-table'), isTrue);
    expect(out.contains('甲'), isTrue);
  });

  test('strips single-quoted style attributes', () {
    final out = prepareShelfDocxLayoutHtml(
      "<p class='shelf-docx-p' style='margin-left:2cm;width:50%'>句</p>",
    );
    expect(out.contains('margin-left'), isFalse);
    expect(out.contains('width'), isFalse);
    expect(out.contains('句'), isTrue);
  });
}
