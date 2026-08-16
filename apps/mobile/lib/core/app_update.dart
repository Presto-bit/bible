/// 官网 APK 更新：检查同域版本元数据，下载完成后交给 Android 系统安装器。
library;

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import 'config.dart';

class AppUpdate {
  const AppUpdate({
    required this.versionCode,
    required this.versionName,
    required this.downloadUrl,
  });

  final int versionCode;
  final String versionName;
  final Uri downloadUrl;
}

class AppUpdateService {
  const AppUpdateService();

  static const _channel = MethodChannel('cn.prestoai.peiai/app_update');

  Future<AppUpdate?> check() async {
    if (!Platform.isAndroid) return null;
    final current = await _channel.invokeMethod<int>('versionCode') ?? 0;
    final base = AppConfig.webBaseUrl.replaceFirst(RegExp(r'/+$'), '');
    final response = await Dio().get<Map<String, dynamic>>(
      '$base/downloads/biai-android.json',
      options: Options(
        responseType: ResponseType.json,
        receiveTimeout: const Duration(seconds: 12),
        sendTimeout: const Duration(seconds: 12),
      ),
    );
    final data = response.data;
    if (data == null) return null;
    final remote = (data['versionCode'] as num?)?.toInt() ?? 0;
    final path = (data['downloadUrl'] as String?)?.trim() ?? '';
    if (remote <= current || path.isEmpty) return null;
    return AppUpdate(
      versionCode: remote,
      versionName: (data['versionName'] as String?)?.trim().isNotEmpty == true
          ? data['versionName'] as String
          : '$remote',
      downloadUrl: Uri.parse(path).isAbsolute
          ? Uri.parse(path)
          : Uri.parse('$base$path'),
    );
  }

  Future<void> downloadAndPromptInstall(
    AppUpdate update, {
    required void Function(double progress) onProgress,
  }) async {
    final dir = await getTemporaryDirectory();
    final output = File('${dir.path}/biai-${update.versionCode}.apk');
    await Dio().download(
      update.downloadUrl.toString(),
      output.path,
      deleteOnError: true,
      onReceiveProgress: (received, total) {
        onProgress(total > 0 ? received / total : 0);
      },
      options: Options(
        receiveTimeout: const Duration(minutes: 5),
        sendTimeout: const Duration(seconds: 20),
      ),
    );
    if (!await output.exists() || await output.length() < 50 * 1024) {
      throw const FileSystemException('安装包下载不完整');
    }
    await _channel.invokeMethod<void>('promptInstall', {'path': output.path});
  }
}
