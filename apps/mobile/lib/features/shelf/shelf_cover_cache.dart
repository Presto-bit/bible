/// 书架封面磁盘缓存：列表缩略优先本地，解码按格子 cacheWidth。
library;

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';

final _coverInFlight = <String, Future<File?>>{};

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

Future<Directory> _coverDir() async {
  final root = await getApplicationSupportDirectory();
  return Directory('${root.path}/shelf_covers');
}

Future<File?> cachedShelfCoverFile(String url) async {
  final dir = await _coverDir();
  final f = File('${dir.path}/${_urlKey(url)}.img');
  if (await f.exists() && await f.length() > 64) return f;
  return null;
}

Future<File?> ensureShelfCoverFile(String url, {Dio? dio}) async {
  final dir = await _coverDir();
  if (!await dir.exists()) await dir.create(recursive: true);

  final f = File('${dir.path}/${_urlKey(url)}.img');
  if (await f.exists() && await f.length() > 64) return f;

  final running = _coverInFlight[url];
  if (running != null) return running;

  final task = _downloadCover(url, f, dio);
  _coverInFlight[url] = task;
  try {
    return await task;
  } finally {
    _coverInFlight.remove(url);
  }
}

Future<File?> _downloadCover(String url, File destination, Dio? dio) async {
  try {
    final client = dio ?? Dio();
    final res = await client.get<List<int>>(
      url,
      options: Options(responseType: ResponseType.bytes),
    );
    final bytes = res.data;
    if (bytes == null || bytes.length < 64) return null;
    await destination.writeAsBytes(bytes, flush: true);
    return destination;
  } catch (_) {
    return null;
  }
}

/// 预热前 N 张封面（不 await UI）。
void prefetchShelfCovers(Iterable<String> urls, {int limit = 9}) {
  var n = 0;
  for (final url in urls) {
    final u = url.trim();
    if (u.isEmpty) continue;
    ensureShelfCoverFile(u);
    n++;
    if (n >= limit) break;
  }
}

/// 列表/详情封面：磁盘优先，失败回落网络；按 cacheWidth 解码。
class ShelfCoverNetworkImage extends StatefulWidget {
  const ShelfCoverNetworkImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.cacheWidth,
    this.errorBuilder,
  });

  final String url;
  final BoxFit fit;
  final int? cacheWidth;
  final ImageErrorWidgetBuilder? errorBuilder;

  @override
  State<ShelfCoverNetworkImage> createState() => _ShelfCoverNetworkImageState();
}

class _ShelfCoverNetworkImageState extends State<ShelfCoverNetworkImage> {
  File? _file;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ShelfCoverNetworkImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _ready = false;
      _file = null;
      _load();
    }
  }

  Future<void> _load() async {
    final cached = await cachedShelfCoverFile(widget.url);
    if (!mounted) return;
    if (cached != null) {
      setState(() {
        _file = cached;
        _ready = true;
      });
      return;
    }
    final got = await ensureShelfCoverFile(widget.url);
    if (!mounted) return;
    setState(() {
      _file = got;
      _ready = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const SizedBox.expand();
    }
    final f = _file;
    if (f != null) {
      return Image.file(
        f,
        fit: widget.fit,
        cacheWidth: widget.cacheWidth,
        gaplessPlayback: true,
        errorBuilder:
            widget.errorBuilder ??
            (_, __, ___) => Image.network(
              widget.url,
              fit: widget.fit,
              cacheWidth: widget.cacheWidth,
              gaplessPlayback: true,
            ),
      );
    }
    return Image.network(
      widget.url,
      fit: widget.fit,
      cacheWidth: widget.cacheWidth,
      gaplessPlayback: true,
      errorBuilder: widget.errorBuilder,
    );
  }
}
