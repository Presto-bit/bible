/// 首页「今日推荐」：2×2 固定四坑，对齐 PWA HomeTodayPanel。
library;

import 'package:flutter/material.dart';

import '../../core/book_cover.dart';
import '../../core/daily_verse_wallpaper.dart';
import '../../core/home_day_wallpaper_cache.dart';
import '../../core/peiai_polish.dart';
import '../../core/theme.dart';
import 'home_illustrations.dart';

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
    this.bookId,
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
  final String? bookId;
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
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppColors.inkSoft,
            letterSpacing: 0.72,
          ),
        ),
        const SizedBox(height: 10),
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

String? _homeTileFile(HomeTodaySlot slot) {
  if (slot.id.startsWith('campaign-')) return 'tile_activity.jpg';
  if (slot.id == 'shelf') return 'tile_shelf.jpg';
  if (slot.id == 'group' || slot.tag == '共读') return 'tile_fellowship.jpg';
  if (slot.id == 'prayer' || slot.tag == '祷告') return 'tile_prayer.jpg';
  if (slot.id == 'suggest' || slot.id == 'resume') return 'tile_read.jpg';
  return null;
}

String _homeTileImage(HomeTodaySlot slot) {
  final resolved = resolveCampaignCoverUrl(slot.coverUrl);
  if (resolved != null) return resolved;
  final bookId = slot.bookId ?? bookIdFromReaderHref(slot.href);
  if (bookId != null && bookId.isNotEmpty) {
    return bookCoverImageUrl(bookId);
  }
  final file = _homeTileFile(slot);
  if (file != null) return homeIllustration(file).url;
  return homeIllustration('tile_read.jpg').url;
}


/// 松手且位移不超过此值才算点击（对齐 Web shellTap phase=up）。
const _tileTapSlop = 18.0;

class _TileCard extends StatefulWidget {
  const _TileCard({
    required this.slot,
    required this.onTap,
    this.flash = false,
  });

  final HomeTodaySlot slot;
  final VoidCallback onTap;
  final bool flash;

  @override
  State<_TileCard> createState() => _TileCardState();
}

class _TileCardState extends State<_TileCard> {
  Offset? _down;
  bool _moved = false;
  bool _pressed = false;

  void _onPointerDown(PointerDownEvent e) {
    _down = e.position;
    _moved = false;
    setState(() => _pressed = true);
  }

  void _onPointerMove(PointerMoveEvent e) {
    final start = _down;
    if (start == null || _moved) return;
    if ((e.position - start).distance > _tileTapSlop) {
      _moved = true;
    }
  }

  void _onPointerUp(PointerUpEvent e) {
    final start = _down;
    _down = null;
    setState(() => _pressed = false);
    if (start == null || _moved) return;
    if ((e.position - start).distance > _tileTapSlop) return;
    widget.onTap();
  }

  void _onPointerCancel(PointerCancelEvent e) {
    _down = null;
    _moved = false;
    setState(() => _pressed = false);
  }

  @override
  Widget build(BuildContext context) {
    const mediaH = 104.0;
    const cardH = 156.0;
    final slot = widget.slot;
    final flash = widget.flash;
    final src = _homeTileImage(slot);
    final tileFile = _homeTileFile(slot);
    final borderColor = slot.pending
        ? AppColors.accentDeep.withValues(alpha: 0.55)
        : AppColors.ink.withValues(alpha: 0.07);
    final shadows = List<BoxShadow>.from(PeiaiShadows.card(false));
    if (slot.pending) {
      shadows.insert(
        0,
        BoxShadow(
          color: AppColors.accentDeep.withValues(alpha: 0.24),
          blurRadius: 0,
          spreadRadius: 1,
        ),
      );
    }

    Widget tileBody = SizedBox(
      height: cardH,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
                  SizedBox(
                    height: mediaH,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        tileFile != null && resolveCampaignCoverUrl(slot.coverUrl) == null
                            ? buildHomeIllustration(
                                tileFile,
                                width: double.infinity,
                                height: mediaH,
                              )
                            : HomeDayNetworkImage(
                                url: src,
                                fit: BoxFit.cover,
                                cacheWidth: 480,
                                cacheHeight: 260,
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
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.88),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.55),
                              ),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
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
                              letterSpacing: -0.13,
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
            );
    if (slot.done) {
      tileBody = ColorFiltered(
        colorFilter: const ColorFilter.matrix(<double>[
          0.72, 0.12, 0.12, 0, 0,
          0.12, 0.72, 0.12, 0, 0,
          0.12, 0.12, 0.72, 0, 0,
          0, 0, 0, 0.72, 0,
        ]),
        child: Opacity(opacity: 0.82, child: tileBody),
      );
    }

    return AnimatedScale(
      scale: flash ? 1.02 : (_pressed ? 0.978 : 1.0),
      duration: flash ? const Duration(milliseconds: 280) : PeiaiMotion.fast,
      curve: PeiaiMotion.fastCurve,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          boxShadow: _pressed ? PeiaiShadows.cardLift(false) : shadows,
        ),
        child: Material(
          color: AppColors.surface,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: borderColor, width: flash ? 1.5 : 1),
          ),
          clipBehavior: Clip.antiAlias,
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerDown: _onPointerDown,
            onPointerMove: _onPointerMove,
            onPointerUp: _onPointerUp,
            onPointerCancel: _onPointerCancel,
            child: tileBody,
          ),
        ),
      ),
    );
  }
}
