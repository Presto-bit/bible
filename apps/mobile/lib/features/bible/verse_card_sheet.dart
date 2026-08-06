/// 金句卡：风景底 + 经文 + 分享（对齐 PWA VerseCardSheet 主路径）。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/daily_verse_wallpaper.dart';
import '../../core/theme.dart';

Future<void> showVerseCardSheet(
  BuildContext context, {
  required String refLabel,
  required String text,
  String versionLabel = '和合本',
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _VerseCardSheet(
      refLabel: refLabel,
      text: text,
      versionLabel: versionLabel,
    ),
  );
}

class _VerseCardSheet extends StatelessWidget {
  const _VerseCardSheet({
    required this.refLabel,
    required this.text,
    required this.versionLabel,
  });

  final String refLabel;
  final String text;
  final String versionLabel;

  String get _quote {
    final t = text.trim();
    if (t.length <= 160) return t;
    return '${t.substring(0, 159)}…';
  }

  Future<void> _share(BuildContext context) async {
    final body = refLabel.isEmpty
        ? '「$_quote」\n—— 彼爱 · $versionLabel'
        : '「$_quote」\n—— $refLabel · $versionLabel\n彼爱 · 安静读经';
    await Share.share(body);
  }

  @override
  Widget build(BuildContext context) {
    final wall = dailyVerseWallpaperUrl(
      (refLabel.hashCode.abs() % dailyWallpaperFiles.length) + 1,
    );
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      margin: EdgeInsets.fromLTRB(12, 0, 12, 12 + bottom),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.72,
      ),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
            child: Row(
              children: [
                const Text(
                  '金句卡',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: AspectRatio(
                  aspectRatio: 3 / 4,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        wall,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const ColoredBox(
                          color: Color(0xFF2C4034),
                        ),
                      ),
                      DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.black.withValues(alpha: 0.25),
                              Colors.black.withValues(alpha: 0.72),
                            ],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(22),
                        child: Column(
                          children: [
                            const Spacer(),
                            Text(
                              '「$_quote」',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontFamily: 'Songti SC',
                                fontFamilyFallback: [
                                  'STSong',
                                  'Noto Serif SC',
                                  'serif'
                                ],
                                color: Colors.white,
                                fontSize: 20,
                                height: 1.65,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(height: 16),
                            if (refLabel.isNotEmpty)
                              Text(
                                refLabel,
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.88),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            const SizedBox(height: 6),
                            Text(
                              versionLabel,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.65),
                                fontSize: 11,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              '彼爱 · 安静读经',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.55),
                                fontSize: 11,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final payload =
                          refLabel.isEmpty ? _quote : '$refLabel\n$_quote';
                      await Clipboard.setData(ClipboardData(text: payload));
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('经文已复制')),
                      );
                    },
                    child: const Text('复制'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.accentDeep,
                    ),
                    onPressed: () => _share(context),
                    child: const Text('分享'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
