/// 每日经文分享：文字 + 卡图（对齐 Web `daily_verse_share.ts`）。
library;

import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'daily_verse_wallpaper.dart';

import 'home_greeting.dart' show formatDailyVerseQuote;

String buildDailyVerseShareText({
  required String ref,
  required String text,
  int? day,
  String? versionLabel,
}) {
  final quote = formatDailyVerseQuote(text);
  final r = ref.trim();
  final ver = versionLabel?.trim();
  final d = (day != null && day > 0) ? day : 1;
  final lines = <String>[
    if (quote.isNotEmpty) quote,
    if (r.isNotEmpty) '—— $r${ver != null && ver.isNotEmpty ? ' · $ver' : ''}',
    '',
    '彼爱 · 每日经文',
    '安静读经，在话语中相遇',
    '打开链接，把彼爱保存到主屏幕',
    'https://2sc.prestoai.cn/?ch=daily_verse&day=$d',
  ];
  return lines.join('\n');
}

/// 调起系统分享（优先卡图 + 文案）；失败回落纯文字。
Future<bool> shareDailyVerseCard(
  BuildContext context, {
  required String ref,
  required String text,
  int day = 1,
  String versionLabel = '和合本',
}) async {
  final body = text.trim();
  if (body.isEmpty) return false;
  final shareText = buildDailyVerseShareText(
    ref: ref,
    text: body,
    day: day,
    versionLabel: versionLabel,
  );

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
      left: -4000,
      top: 0,
      child: Material(
        color: Colors.transparent,
        child: SizedBox(
          width: 360,
          child: RepaintBoundary(
            key: key,
            child: _DailyVerseSharePoster(
              refLabel: ref.trim(),
              quote: formatDailyVerseQuote(body),
              day: day < 1 ? 1 : day,
              versionLabel: versionLabel,
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
    await ready.future.timeout(const Duration(seconds: 4), onTimeout: () {});
    // 再等一帧确保绘制完成
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
      '${dir.path}/peiai_daily_${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(byteData.buffer.asUint8List());
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: 'image/png')],
        text: shareText,
        subject: '${ref.trim().isEmpty ? '每日经文' : ref.trim()}｜彼爱',
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

class _DailyVerseSharePoster extends StatefulWidget {
  const _DailyVerseSharePoster({
    required this.refLabel,
    required this.quote,
    required this.day,
    required this.versionLabel,
    required this.onReady,
  });

  final String refLabel;
  final String quote;
  final int day;
  final String versionLabel;
  final VoidCallback onReady;

  @override
  State<_DailyVerseSharePoster> createState() => _DailyVerseSharePosterState();
}

class _DailyVerseSharePosterState extends State<_DailyVerseSharePoster> {
  var _fired = false;

  void _markReady() {
    if (_fired) return;
    _fired = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => widget.onReady());
  }

  @override
  void initState() {
    super.initState();
    // 无图也要 ready，避免一直卡住
    Future<void>.delayed(const Duration(milliseconds: 600), _markReady);
  }

  @override
  Widget build(BuildContext context) {
    final wall = dailyVerseWallpaperUrl(widget.day);
    return AspectRatio(
      aspectRatio: 1080 / 1350,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              wall,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const ColoredBox(
                color: Color(0xFFD9C5AE),
              ),
              frameBuilder: (ctx, child, frame, sync) {
                if (sync || frame != null) _markReady();
                return child;
              },
            ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x6B14181C),
                    Color(0x4714181C),
                    Color(0x8C14181C),
                  ],
                  stops: [0, 0.48, 1],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 32, 28, 28),
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
                  const SizedBox(height: 2),
                  Text(
                    '每日经文',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.72),
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const Spacer(flex: 2),
                  if (widget.refLabel.isNotEmpty)
                    Text(
                      widget.refLabel,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        shadows: const [
                          Shadow(
                            color: Color(0x47000000),
                            blurRadius: 8,
                            offset: Offset(0, 1),
                          ),
                        ],
                      ),
                    ),
                  if (widget.refLabel.isNotEmpty) const SizedBox(height: 10),
                  Text(
                    widget.quote,
                    maxLines: 9,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      height: 1.45,
                      fontWeight: FontWeight.w400,
                      shadows: [
                        Shadow(
                          color: Color(0x59000000),
                          blurRadius: 10,
                          offset: Offset(0, 1),
                        ),
                      ],
                    ),
                  ),
                  if (widget.versionLabel.trim().isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(
                      widget.versionLabel.trim(),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.72),
                        fontSize: 12,
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
                  const SizedBox(height: 2),
                  Text(
                    '保存到主屏幕 · 下次一点就开',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.5),
                      fontSize: 10,
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
