/// 每日经文全屏壁纸：对齐 PWA（风景 + 经文 + 底栏互动 dock）。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/daily_verse_wallpaper.dart';
import '../../core/home_greeting.dart';
import 'home_hero_metrics.dart';

class DailyVerseWallpaperScreen extends StatelessWidget {
  const DailyVerseWallpaperScreen({
    super.key,
    required this.day,
    required this.ref,
    required this.text,
    required this.theme,
    this.liked = false,
    this.likeCount = 0,
    this.myReact,
    this.onToggleLike,
    this.onOpenReact,
    this.onAskXiaoAi,
    this.onShare,
  });

  final int day;
  final String ref;
  final String text;
  final String theme;
  final bool liked;
  final int likeCount;
  final String? myReact;
  final VoidCallback? onToggleLike;
  final VoidCallback? onOpenReact;
  final VoidCallback? onAskXiaoAi;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    final wall = dailyVerseWallpaperUrl(day < 1 ? 1 : day);
    final bottom = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: const Color(0xFF14100C),
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 点击任意空白关闭（对齐 PWA）
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            behavior: HitTestBehavior.opaque,
            child: Stack(
              fit: StackFit.expand,
              children: [
                const ColoredBox(color: Color(0xFF14100C)),
                Image.network(
                  wall,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.28),
                        Colors.black.withValues(alpha: 0.55),
                      ],
                    ),
                  ),
                ),
              ],
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
          // 经文（居中偏上）
          Positioned(
            left: 28,
            right: 28,
            top: MediaQuery.sizeOf(context).height * 0.28,
            child: GestureDetector(
              onTap: () {}, // 阻断关闭
              child: Column(
                children: [
                  Text(
                    formatDailyVerseQuote(text),
                    textAlign: TextAlign.center,
                    style: homeHeroVerseTextStyle(context).copyWith(
                      shadows: const [
                        Shadow(
                          color: Color(0x8C000000),
                          blurRadius: 12,
                          offset: Offset(0, 2),
                        ),
                        Shadow(
                          color: Color(0x73000000),
                          blurRadius: 3,
                          offset: Offset(0, 1),
                        ),
                      ],
                    ),
                  ),
                  if (ref.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      ref,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: 'Georgia',
                        fontFamilyFallback: const [
                          'Songti SC',
                          'STSong',
                          'Noto Serif SC',
                          'serif',
                        ],
                        color: Colors.white.withValues(alpha: 0.92),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.48,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          // 底栏 dock：赞 / 回应 / 小爱 / 分享
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: GestureDetector(
              onTap: () {},
              child: Container(
                padding: EdgeInsets.fromLTRB(20, 14, 20, 16 + bottom),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.55),
                    ],
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _DockBtn(
                      icon: liked ? Icons.favorite : Icons.favorite_border,
                      label: likeCount > 0 ? '$likeCount' : '赞',
                      active: liked,
                      onTap: onToggleLike,
                    ),
                    _DockBtn(
                      icon: Icons.chat_bubble_outline,
                      label: myReact ?? '回应',
                      active: myReact != null,
                      onTap: onOpenReact,
                    ),
                    _DockBtn(
                      icon: Icons.auto_awesome_outlined,
                      label: '小爱',
                      onTap: onAskXiaoAi,
                    ),
                    _DockBtn(
                      icon: Icons.ios_share_outlined,
                      label: '分享',
                      onTap: onShare ??
                          () async {
                            final payload =
                                ref.isEmpty ? text : '$ref\n$text';
                            await Clipboard.setData(
                                ClipboardData(text: payload));
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('经文已复制，可粘贴分享')),
                            );
                          },
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DockBtn extends StatelessWidget {
  const _DockBtn({
    required this.icon,
    required this.label,
    this.active = false,
    this.onTap,
  });
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                color: active ? const Color(0xFFE8B4A8) : Colors.white,
                size: 22),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.9),
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
