import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/core/genesis50_auth.dart';

void main() {
  test('希伯来书 30 天链接可识别，创世记 50 天不误判', () {
    expect(isHebrews30Href('https://hebrews-30.pages.dev/'), isTrue);
    expect(
      isHebrews30Href('https://hebrews-30.pages.dev/day/3?code=ABC'),
      isTrue,
    );
    expect(isHebrews30Href('https://www.hebrews-30.pages.dev/'), isTrue);
    expect(isGenesis50Href('https://hebrews-30.pages.dev/'), isTrue);
    expect(isHebrews30Href('https://genesis-50.pages.dev/'), isFalse);
    expect(
      inviteCampaignDisplayTitle('https://hebrews-30.pages.dev/'),
      '希伯来书 30 天',
    );
    expect(
      inviteCampaignDisplayTitle('https://genesis-50.pages.dev/'),
      '创世记 50 天',
    );
  });

  test('桥接链 query 指向希伯来书时走 App 内打开', () {
    const bridge =
        'https://2sc.prestoai.cn/campaigns/genesis-50/enter'
        '?href=https%3A%2F%2Fhebrews-30.pages.dev%2F';
    expect(isHebrews30Href(bridge), isTrue);
    expect(isGenesis50BridgeHref(bridge), isTrue);

    const genesisBridge =
        'https://2sc.prestoai.cn/campaigns/genesis-50/enter'
        '?href=https%3A%2F%2Fgenesis-50.pages.dev%2F';
    expect(isHebrews30Href(genesisBridge), isFalse);
  });
}
