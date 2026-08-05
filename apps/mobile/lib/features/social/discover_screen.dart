/// 发现 Tab：嵌 Web IM（PRODUCT §24 H5 白名单）。
/// edge 交 H5 自算（与 iOS PWA 顶栏同源），外层仅 Flutter 胶囊底栏。
library;

import 'package:flutter/material.dart';

import '../../core/h5_host_page.dart';

class DiscoverScreen extends StatelessWidget {
  const DiscoverScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const H5HostPage(
      path: '/discover',
      embedInTab: true,
      showAppBar: false,
    );
  }
}
