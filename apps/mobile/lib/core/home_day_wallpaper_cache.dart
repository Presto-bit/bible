/// 首页背景图按本地自然日磁盘缓存。
library;

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';

final _wallpaperInFlight = <String, Future<File?>>{};

String homeWallpaperLocalYmd([DateTime? now]) {
  final d = now ?? DateTime.now();
  final m = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '${d.year}-$m-$day';
}

String _urlKey(String url) {
  var h = 0;
  for (final c in url.codeUnits) {
    h = 0x1fffffff & (h + c);
    h = 0x1fffffff & (h + ((0x0007ffff & h) << 10));
    h ^= h >> 6;
  }
  h = 0x1fffffff & (h + ((0x03ffffff & h) << 3));
  h ^= h >> 11;
  return (0x1fffffff & (h + ((0x00003fff & h) << 15))).toRadixString(16);
}

Future<Directory> _dayDir(String ymd) async {
  final root = await getApplicationSupportDirectory();
  return Directory('${root.path}/home_bg/$ymd');
}

Future<File?> cachedHomeWallpaperFile(String url, {String? ymd}) async {
  final day = ymd ?? homeWallpaperLocalYmd();
  final dir = await _dayDir(day);
  final f = File('${dir.path}/${_urlKey(url)}.img');
  if (await f.exists() && await f.length() > 200) return f;
  return null;
}

Future<File?> ensureHomeDayWallpaper(
  String url, {
  String? ymd,
  Dio? dio,
}) async {
  final day = ymd ?? homeWallpaperLocalYmd();
  final dir = await _dayDir(day);
  if (!await dir.exists()) await dir.create(recursive: true);

  try {
    final parent = dir.parent;
    if (await parent.exists()) {
      await for (final e in parent.list()) {
        if (e is Directory && e.path != dir.path) {
          await e.delete(recursive: true);
        }
      }
    }
  } catch (_) {
    /* ignore */
  }

  final f = File('${dir.path}/${_urlKey(url)}.img');
  if (await f.exists() && await f.length() > 200) return f;

  final cacheKey = '$day:${_urlKey(url)}';
  final running = _wallpaperInFlight[cacheKey];
  if (running != null) return running;

  final task = _downloadHomeWallpaper(url, f, dio);
  _wallpaperInFlight[cacheKey] = task;
  try {
    return await task;
  } finally {
    _wallpaperInFlight.remove(cacheKey);
  }
}

Future<File?> _downloadHomeWallpaper(
  String url,
  File destination,
  Dio? dio,
) async {
  try {
    final client = dio ?? Dio();
    final res = await client.get<List<int>>(
      url,
      options: Options(responseType: ResponseType.bytes),
    );
    final bytes = res.data;
    if (bytes == null || bytes.length < 200) return null;
    await destination.writeAsBytes(bytes, flush: true);
    return destination;
  } catch (_) {
    return null;
  }
}

/// 优先本地日缓存，否则网络；解码尺寸按卡片约束。
class HomeDayNetworkImage extends StatefulWidget {
  const HomeDayNetworkImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.cacheWidth,
    this.cacheHeight,
    this.errorBuilder,
    this.onReady,
  });

  final String url;
  final BoxFit fit;
  final int? cacheWidth;
  final int? cacheHeight;
  final ImageErrorWidgetBuilder? errorBuilder;
  final VoidCallback? onReady;

  @override
  State<HomeDayNetworkImage> createState() => _HomeDayNetworkImageState();
}

class _HomeDayNetworkImageState extends State<HomeDayNetworkImage> {
  File? _file;
  bool _ready = false;
  bool _notified = false;

  void _notifyReady() {
    if (_notified) return;
    _notified = true;
    widget.onReady?.call();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant HomeDayNetworkImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _notified = false;
      _load();
    }
  }

  Future<void> _load() async {
    final cached = await cachedHomeWallpaperFile(widget.url);
    if (!mounted) return;
    if (cached != null) {
      setState(() {
        _file = cached;
        _ready = true;
      });
      _notifyReady();
      return;
    }
    final got = await ensureHomeDayWallpaper(widget.url);
    if (!mounted) return;
    setState(() {
      _file = got;
      _ready = true;
    });
    _notifyReady();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      // 磁盘缓存任务是唯一网络 source，避免 Image.network 与 Dio 双请求/双解码。
      return const SizedBox.expand();
    }
    final f = _file;
    if (f != null) {
      return Image.file(
        f,
        fit: widget.fit,
        cacheWidth: widget.cacheWidth,
        cacheHeight: widget.cacheHeight,
        errorBuilder:
            widget.errorBuilder ??
            (_, __, ___) => Image.network(
              widget.url,
              fit: widget.fit,
              cacheWidth: widget.cacheWidth,
              cacheHeight: widget.cacheHeight,
            ),
        frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
          if (wasSynchronouslyLoaded || frame != null) {
            WidgetsBinding.instance.addPostFrameCallback((_) => _notifyReady());
          }
          return child;
        },
      );
    }
    return Image.network(
      widget.url,
      fit: widget.fit,
      cacheWidth: widget.cacheWidth,
      cacheHeight: widget.cacheHeight,
      errorBuilder: widget.errorBuilder,
      frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
        if (wasSynchronouslyLoaded || frame != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) => _notifyReady());
        }
        return child;
      },
    );
  }
}
