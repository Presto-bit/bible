/// 首页插图：优先本地 assets，避免 Android 依赖线上 /illustrations 未部署。
library;

import 'package:flutter/material.dart';

import '../../core/config.dart';

/// 返回可展示 URL；[assetPath] 供 Image.asset 使用。
({String assetPath, String url}) homeIllustration(String file) {
  final assetPath = 'assets/illustrations/home/$file';
  final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
  return (assetPath: assetPath, url: '$base/illustrations/home/$file');
}

/// 本地 bundle 优先，失败再拉线上。
Widget buildHomeIllustration(
  String file, {
  required double width,
  required double height,
  BoxFit fit = BoxFit.cover,
  Widget? fallback,
}) {
  final ill = homeIllustration(file);
  final fb = fallback ??
      ColoredBox(
        color: const Color(0xFFE6E3DC),
        child: SizedBox(width: width, height: height),
      );
  return Image.asset(
    ill.assetPath,
    width: width,
    height: height,
    fit: fit,
    errorBuilder: (_, __, ___) => Image.network(
      ill.url,
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (_, __, ___) => fb,
    ),
  );
}
