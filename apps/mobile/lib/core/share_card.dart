/// 品牌出站分享图（对齐 Web `share_card.ts`）。
library;

import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'config.dart';
import 'daily_verse_wallpaper.dart';
import 'home_day_wallpaper_cache.dart';
import 'theme.dart';

class ShareCardInput {
  const ShareCardInput({
    required this.title,
    required this.body,
    this.subtitle,
    this.footer,
    this.badge,
    this.day = 1,
    this.shareText,
    this.shareUrl,
    this.subject,
  });

  final String title;
  final String body;
  final String? subtitle;
  final String? footer;
  final String? badge;
  final int day;
  final String? shareText;
  final String? shareUrl;
  final String? subject;
}

String buildShareCardText(ShareCardInput input) {
  final lines = <String>[
    input.title.trim(),
    if ((input.subtitle ?? '').trim().isNotEmpty) input.subtitle!.trim(),
    if (input.body.trim().isNotEmpty) input.body.trim(),
    '',
    input.footer?.trim().isNotEmpty == true
        ? input.footer!.trim()
        : '彼爱 · 安静读经，在话语中相遇',
    if ((input.shareUrl ?? '').trim().isNotEmpty) input.shareUrl!.trim(),
  ];
  return lines.where((l) => l.isNotEmpty).join('\n');
}

Future<bool> shareBrandCard(
  BuildContext context,
  ShareCardInput input,
) async {
  final shareText = (input.shareText ?? buildShareCardText(input)).trim();
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
            child: _ShareCardPoster(
              input: input,
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
      '${dir.path}/peiai_share_${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(byteData.buffer.asUint8List());
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: 'image/png')],
        text: shareText,
        subject: input.subject ?? input.title,
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

class _ShareCardPoster extends StatefulWidget {
  const _ShareCardPoster({required this.input, required this.onReady});

  final ShareCardInput input;
  final VoidCallback onReady;

  @override
  State<_ShareCardPoster> createState() => _ShareCardPosterState();
}

class _ShareCardPosterState extends State<_ShareCardPoster> {
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
    final input = widget.input;
    final day = input.day < 1 ? 1 : input.day;
    final badge = (input.badge ?? '').trim();
    return AspectRatio(
      aspectRatio: 1080 / 1350,
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
                  const ColoredBox(color: Color(0xFFD9C5AE)),
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
                            if (badge.isNotEmpty)
                              Text(
                                badge,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.72),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Spacer(flex: 2),
                  if ((input.subtitle ?? '').trim().isNotEmpty) ...[
                    Text(
                      input.subtitle!.trim(),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.78),
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  Text(
                    input.title.trim(),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      height: 1.35,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    input.body.trim(),
                    maxLines: 6,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      height: 1.5,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    (input.footer ?? '彼爱 · 安静读经，在话语中相遇').trim(),
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

String inviteShareUrl(String userCode) {
  final code = userCode.trim();
  final l3 = RegExp(r'^\d{8,10}$').hasMatch(code) ? 'invite.u:$code' : 'invite';
  return '${AppConfig.webBaseUrl}/share/app?l1=share&l2=system_share&l3=$l3';
}

Future<bool> shareInviteProduct(
  BuildContext context, {
  required String userCode,
}) async {
  return shareBrandCard(
    context,
    ShareCardInput(
      title: '彼爱 · 陪你读懂圣经',
      subtitle: '邀请朋友一起读',
      body: '陪你读经，也帮你读懂。保存到主屏幕，像打开 App 一样安静读。',
      footer: '彼爱 · 安静读经，在话语中相遇',
      badge: '产品邀请',
      shareText:
          '我在用彼爱读经——不只自己读，还能问明白每一节。\n打开后保存到主屏幕，我们一起读。\n${inviteShareUrl(userCode)}',
      shareUrl: inviteShareUrl(userCode),
      subject: '彼爱 · 陪你读懂圣经',
    ),
  );
}
