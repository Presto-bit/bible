/// 读经回顾分享图（对齐 Web `wrapped_share.ts`）。
library;

import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/config.dart';
import '../../core/daily_verse_wallpaper.dart';
import '../../core/home_day_wallpaper_cache.dart';
import '../../core/theme.dart';
import 'wrapped.dart';

int _wallpaperDayFor(WrappedStats w) {
  if (w.yearVerse != null) {
    return bookThemeDay(w.yearVerse!.ref.split('.').firstOrNull);
  }
  if (w.topBookId != null) return bookThemeDay(w.topBookId);
  return w.period == 'year' ? 21 : 14;
}

/// 调起系统分享（优先海报图 + 文案）；失败回落纯文字。
Future<bool> shareWrappedPoster(
  BuildContext context,
  WrappedStats stats,
) async {
  final shareText = wrappedShareText(stats);
  final overlay = Overlay.maybeOf(context);
  if (overlay == null) {
    await SharePlus.instance.share(ShareParams(text: shareText));
    return true;
  }

  final key = GlobalKey();
  final ready = Completer<void>();
  late OverlayEntry entry;
  entry = OverlayEntry(
    builder: (ctx) => Positioned(
      left: -5000,
      top: 0,
      child: Material(
        color: Colors.transparent,
        child: SizedBox(
          width: 360,
          child: RepaintBoundary(
            key: key,
            child: _WrappedSharePoster(
              stats: stats,
              onReady: () {
                if (!ready.isCompleted) ready.complete();
              },
            ),
          ),
        ),
      ),
    ),
  );
  overlay.insert(entry);

  try {
    await ready.future.timeout(const Duration(seconds: 5), onTimeout: () {});
    await Future<void>.delayed(const Duration(milliseconds: 80));
    final boundary =
        key.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) {
      await SharePlus.instance.share(ShareParams(text: shareText));
      return true;
    }
    final image = await boundary.toImage(pixelRatio: 3);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    if (byteData == null) {
      await SharePlus.instance.share(ShareParams(text: shareText));
      return true;
    }
    final dir = await getTemporaryDirectory();
    final file = File(
      '${dir.path}/peiai_wrapped_${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(byteData.buffer.asUint8List());
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: 'image/png')],
        text: shareText,
        subject: '${stats.label}｜彼爱',
      ),
    );
    return true;
  } catch (_) {
    try {
      await SharePlus.instance.share(ShareParams(text: shareText));
      return true;
    } catch (_) {
      return false;
    }
  } finally {
    entry.remove();
  }
}

class _WrappedSharePoster extends StatefulWidget {
  const _WrappedSharePoster({required this.stats, required this.onReady});

  final WrappedStats stats;
  final VoidCallback onReady;

  @override
  State<_WrappedSharePoster> createState() => _WrappedSharePosterState();
}

class _WrappedSharePosterState extends State<_WrappedSharePoster> {
  var _fired = false;

  void _markReady() {
    if (_fired) return;
    _fired = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => widget.onReady());
  }

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 600), _markReady);
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.stats;
    final day = _wallpaperDayFor(w);
    final tiles = <({String value, String label})>[
      (value: '${w.totalMinutes}', label: '分钟'),
      (value: '${w.activeDays}', label: '活跃天'),
      (value: '${w.streak}', label: '连续天'),
    ];
    if (w.chapters > 0) {
      tiles.add((value: '${w.chapters}', label: '章'));
    }

    return AspectRatio(
      aspectRatio: 9 / 16,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: Stack(
          fit: StackFit.expand,
          children: [
            HomeDayNetworkImage(
              url: dailyVerseWallpaperUrl(day),
              fit: BoxFit.cover,
              onReady: _markReady,
              errorBuilder: (_, __, ___) =>
                  const ColoredBox(color: Color(0xFF1C332C)),
            ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x94100C12),
                    Color(0x57100C12),
                    Color(0xCC100C12),
                  ],
                  stops: [0, 0.42, 1],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ClipOval(
                        child: Image.network(
                          '${AppConfig.webBaseUrl}/icon-512.png',
                          width: 28,
                          height: 28,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            width: 28,
                            height: 28,
                            color: AppColors.accentDeep,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '彼爱',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              w.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.68),
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Text(
                    w.period == 'year' ? '年度回顾' : '本月回顾',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.55),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (w.yearVerse?.text != null &&
                      w.yearVerse!.text!.trim().isNotEmpty) ...[
                    Text(
                      '「${w.yearVerse!.text!.trim()}」',
                      maxLines: 5,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        height: 1.45,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '— ${w.yearVerse!.label}',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.78),
                        fontSize: 13,
                      ),
                    ),
                  ] else
                    Text(
                      w.highlight,
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        height: 1.45,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  const SizedBox(height: 20),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: tiles.take(4).map((t) {
                      return Container(
                        width: 148,
                        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              t.value,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 28,
                                fontWeight: FontWeight.w700,
                                height: 1.1,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              t.label,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.7),
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                  if (w.topBookName != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        '常读 · 《${w.topBookName}》',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                  const Spacer(),
                  const Text(
                    '彼爱',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '安静读经，在话语中相遇',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.62),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
