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

/// 当前安装包与官网 APK 的版本状态，供「我的 · 设置」明确展示。
class AppUpdateStatus {
  const AppUpdateStatus({
    required this.currentVersionName,
    required this.currentVersionCode,
    this.update,
    this.checkFailed = false,
  });

  final String currentVersionName;
  final int currentVersionCode;
  final AppUpdate? update;
  final bool checkFailed;

  bool get isLatest => update == null;
}

class AppUpdateService {
  const AppUpdateService();

  static const _channel = MethodChannel('cn.prestoai.peiai/app_update');

  Future<AppUpdateStatus> status() async {
    if (!Platform.isAndroid) {
      return const AppUpdateStatus(
        currentVersionName: '—',
        currentVersionCode: 0,
      );
    }
    final current = await _currentVersion();
    try {
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
      final remote = (data?['versionCode'] as num?)?.toInt() ?? 0;
      final path = (data?['downloadUrl'] as String?)?.trim() ?? '';
      final update = remote > current.code && path.isNotEmpty
          ? AppUpdate(
              versionCode: remote,
              versionName:
                  (data?['versionName'] as String?)?.trim().isNotEmpty == true
                  ? data!['versionName'] as String
                  : '$remote',
              downloadUrl: Uri.parse(path).isAbsolute
                  ? Uri.parse(path)
                  : Uri.parse('$base$path'),
            )
          : null;
      return AppUpdateStatus(
        currentVersionName: current.name,
        currentVersionCode: current.code,
        update: update,
      );
    } catch (_) {
      return AppUpdateStatus(
        currentVersionName: current.name,
        currentVersionCode: current.code,
        checkFailed: true,
      );
    }
  }

  Future<AppUpdate?> check() async {
    return (await status()).update;
  }

  /// 供 Flutter 嵌 H5 写入实际安装包版本，避免设置页误当成浏览器下载入口。
  Future<({String name, int code})> installedVersion() {
    if (!Platform.isAndroid) return Future.value((name: 'flutter', code: 0));
    return _currentVersion();
  }

  Future<({String name, int code})> _currentVersion() async {
    final info = await _channel.invokeMapMethod<String, dynamic>(
      'versionInfo',
    );
    final name = (info?['versionName'] as String?)?.trim();
    final code = (info?['versionCode'] as num?)?.toInt() ?? 0;
    return (name: name?.isNotEmpty == true ? name! : '$code', code: code);
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
