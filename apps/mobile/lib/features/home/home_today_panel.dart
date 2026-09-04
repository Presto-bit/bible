/// 首页「今日推荐」：2×2 固定四坑，对齐 PWA HomeTodayPanel。
library;

import 'package:flutter/material.dart';

import '../../core/config.dart';
import '../../core/daily_verse_wallpaper.dart';
import '../../core/home_day_wallpaper_cache.dart';
import '../../core/theme.dart';

class HomeTodaySlot {
  const HomeTodaySlot({
    required this.id,
    required this.tag,
    required this.title,
    required this.sub,
    required this.href,
    this.cta,
    this.progressPct,
    this.badge,
    this.done = false,
    this.pending = false,
    this.coverUrl,
  });

  final String id;
  final String tag;
  final String title;
  final String sub;
  final String href;
  final String? cta;
  final int? progressPct;
  final String? badge;
  final bool done;
  final bool pending;
  final String? coverUrl;
}

class HomeTodayPanel extends StatelessWidget {
  const HomeTodayPanel({
    super.key,
    required this.activity,
    required this.read,
    required this.group,
    required this.prayer,
    required this.onActivity,
    required this.onRead,
    required this.onGroup,
    required this.onPrayer,
    this.groupFlash = false,
  });

  final HomeTodaySlot activity;
  final HomeTodaySlot read;
  final HomeTodaySlot group;
  final HomeTodaySlot prayer;
  final VoidCallback onActivity;
  final VoidCallback onRead;
  final VoidCallback onGroup;
  final VoidCallback onPrayer;
  final bool groupFlash;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '今日推荐',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.inkSoft,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _TileCard(slot: activity, onTap: onActivity),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _TileCard(slot: read, onTap: onRead),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _TileCard(slot: group, onTap: onGroup, flash: groupFlash),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _TileCard(slot: prayer, onTap: onPrayer),
            ),
          ],
        ),
      ],
    );
  }
}

String _homeTileImage(HomeTodaySlot slot) {
  final resolved = resolveCampaignCoverUrl(slot.coverUrl);
  if (resolved != null) return resolved;
  if (slot.id.startsWith('campaign-')) {
    return _illustrationAssetUrl('home/tile_activity.jpg');
  }
  if (slot.id == 'shelf') {
    return _illustrationAssetUrl('home/tile_shelf.jpg');
  }
  if (slot.id == 'group' || slot.tag == '共读') {
    return _illustrationAssetUrl('home/tile_fellowship.jpg');
  }
  if (slot.id == 'prayer' || slot.tag == '祷告') {
    return _illustrationAssetUrl('home/tile_prayer.jpg');
  }
  if (slot.id == 'suggest') {
    return _illustrationAssetUrl('home/tile_read.jpg');
  }
  final h = slot.id.hashCode.abs();
  final day = (h % illustrationFiles.length) + 1;
  return dailyVerseWallpaperUrl(day);
}

String _illustrationAssetUrl(String relative) {
  final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
  return '$base/illustrations/$relative';
}


class _TileCard extends StatelessWidget {
  const _TileCard({
    required this.slot,
    required this.onTap,
    this.flash = false,
  });

  final HomeTodaySlot slot;
  final VoidCallback onTap;
  final bool flash;

  @override
  Widget build(BuildContext context) {
    final src = _homeTileImage(slot);
    final borderColor = slot.pending
        ? AppColors.accentDeep.withValues(alpha: 0.55)
        : AppColors.line.withValues(alpha: 0.55);

    return AnimatedScale(
      scale: flash ? 1.02 : 1.0,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
      child: Material(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: borderColor, width: flash ? 1.5 : 1),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Opacity(
            opacity: slot.done ? 0.58 : 1,
            child: SizedBox(
              height: 132,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    height: 84,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        HomeDayNetworkImage(
                          url: src,
                          fit: BoxFit.cover,
                          cacheWidth: 400,
                          cacheHeight: 200,
                          errorBuilder: (_, __, ___) => Container(
                            color: const Color(0xFFE6E3DC),
                          ),
                        ),
                        DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.transparent,
                                Colors.black.withValues(alpha: 0.12),
                              ],
                              stops: const [0.55, 1],
                            ),
                          ),
                        ),
                        Positioned(
                          left: 6,
                          bottom: 6,
                          right: slot.badge != null && slot.badge!.isNotEmpty
                              ? 40
                              : 6,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.88),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              slot.tag,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: AppColors.ink,
                              ),
                            ),
                          ),
                        ),
                        if (slot.badge != null && slot.badge!.isNotEmpty)
                          Positioned(
                            top: 6,
                            right: 6,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.88),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                slot.badge!,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            slot.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.ink,
                            ),
                          ),
                          if (slot.sub.isNotEmpty)
                            Text(
                              slot.sub,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.inkFaint,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
