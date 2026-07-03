/// 每日经文全屏壁纸（欣赏 + 分享入口）。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/config.dart';

class DailyVerseWallpaperScreen extends StatelessWidget {
  const DailyVerseWallpaperScreen({
    super.key,
    required this.ref,
    required this.text,
    required this.theme,
  });

  final String ref;
  final String text;
  final String theme;

  String? get _illustrationUrl {
    final t = theme.trim();
    if (t.isEmpty) return null;
    final encoded = Uri.encodeComponent(t);
    return '${AppConfig.baseUrl}/content/illustrations/theme_$encoded.svg';
  }

  @override
  Widget build(BuildContext context) {
    final bg = _illustrationUrl;
    return Scaffold(
      backgroundColor: const Color(0xFF14100C),
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (bg != null)
            Image.network(
              bg,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
            ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.35),
                  Colors.black.withValues(alpha: 0.75),
                ],
              ),
            ),
          ),
          Positioned(
            top: MediaQuery.paddingOf(context).top + 12,
            right: 16,
            child: IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close, color: Colors.white70),
              style: IconButton.styleFrom(
                backgroundColor: Colors.black.withValues(alpha: 0.3),
              ),
            ),
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    '每日经文',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 13,
                      letterSpacing: 4,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text('✦', style: TextStyle(color: Color(0xFFD6BC8C), fontSize: 18)),
                  if (ref.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Text(
                      ref,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Text(
                    '「$text」',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontFamily: 'Songti SC',
                      fontFamilyFallback: ['STSong', 'Noto Serif SC', 'serif'],
                      color: Colors.white,
                      fontSize: 24,
                      height: 1.85,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (theme.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      '$theme系列',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.55),
                        fontSize: 12,
                        letterSpacing: 3,
                      ),
                    ),
                  ],
                  const SizedBox(height: 28),
                  OutlinedButton(
                    onPressed: () async {
                      final payload = ref.isEmpty ? text : '$ref\n$text';
                      await Clipboard.setData(ClipboardData(text: payload));
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('经文已复制，可粘贴分享')),
                      );
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: BorderSide(color: Colors.white.withValues(alpha: 0.6)),
                      backgroundColor: Colors.white.withValues(alpha: 0.12),
                      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(22),
                      ),
                    ),
                    child: const Text('分享 / 壁纸'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
