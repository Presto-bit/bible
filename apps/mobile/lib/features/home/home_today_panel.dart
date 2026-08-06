/// 首页「今日推荐」：左大右双，封面主卡 + 主题侧卡，对齐 PWA HomeTodayPanel。
library;

import 'package:flutter/material.dart';

import '../../core/daily_verse_wallpaper.dart';
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
    required this.primary,
    required this.sideTop,
    required this.sideBottom,
    required this.onPrimary,
    required this.onSideTop,
    required this.onSideBottom,
  });

  final HomeTodaySlot primary;
  final HomeTodaySlot sideTop;
  final HomeTodaySlot sideBottom;
  final VoidCallback onPrimary;
  final VoidCallback onSideTop;
  final VoidCallback onSideBottom;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '今日推荐',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          // 对齐 PWA `.home-today-panel` min-height: 168px
          height: 168,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 155,
                child: _PrimaryCard(slot: primary, onTap: onPrimary),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 100,
                child: Column(
                  children: [
                    Expanded(
                      child: _SideCard(
                        slot: sideTop,
                        onTap: onSideTop,
                        tone: _SideTone.group,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: _SideCard(
                        slot: sideBottom,
                        onTap: onSideBottom,
                        tone: _SideTone.prayer,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

enum _SideTone { group, prayer }

String _coverFor(HomeTodaySlot slot) {
  final resolved = resolveCampaignCoverUrl(slot.coverUrl);
  if (resolved != null) return resolved;
  // 稳定风景：用 slot id 哈希选 illustration
  final h = slot.id.hashCode.abs();
  final day = (h % illustrationFiles.length) + 1;
  return dailyVerseWallpaperUrl(day);
}

class _PrimaryCard extends StatelessWidget {
  const _PrimaryCard({required this.slot, required this.onTap});
  final HomeTodaySlot slot;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final src = _coverFor(slot);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                src,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF3D5A48), Color(0xFF2C4034)],
                    ),
                  ),
                ),
              ),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.15),
                      Colors.black.withValues(alpha: 0.55),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        slot.tag,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const Spacer(),
                    Text(
                      slot.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        height: 1.25,
                      ),
                    ),
                    if (slot.sub.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        slot.sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.82),
                          fontSize: 12,
                        ),
                      ),
                    ],
                    if (slot.progressPct != null && slot.progressPct! > 0) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: (slot.progressPct!.clamp(0, 100)) / 100,
                                minHeight: 4,
                                backgroundColor:
                                    Colors.white.withValues(alpha: 0.22),
                                color: Colors.white.withValues(alpha: 0.92),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '${slot.progressPct}%',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.9),
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (slot.cta != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        slot.cta!,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.95),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SideCard extends StatelessWidget {
  const _SideCard({
    required this.slot,
    required this.onTap,
    required this.tone,
  });
  final HomeTodaySlot slot;
  final VoidCallback onTap;
  final _SideTone tone;

  @override
  Widget build(BuildContext context) {
    final muted = slot.done;
    final base = tone == _SideTone.group
        ? const Color(0xFFE8F0EA)
        : const Color(0xFFF3EDE4);
    final accent = tone == _SideTone.group
        ? AppColors.accentDeep
        : const Color(0xFF8A6A3B);

    // 填满 Expanded，保证上下副卡等高（对齐 PWA SideCard flex:1）
    return SizedBox.expand(
      child: Material(
        color: muted ? base.withValues(alpha: 0.55) : base,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: slot.pending
                    ? accent.withValues(alpha: 0.35)
                    : AppColors.line.withValues(alpha: 0.6),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        slot.tag,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: accent.withValues(alpha: muted ? 0.55 : 0.9),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        slot.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 12.5,
                          height: 1.25,
                          color: muted ? AppColors.inkFaint : AppColors.ink,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        slot.cta ?? slot.sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 10.5,
                          color: muted
                              ? AppColors.inkFaint.withValues(alpha: 0.8)
                              : AppColors.inkFaint,
                        ),
                      ),
                    ],
                  ),
                ),
                if (slot.badge != null && slot.badge!.isNotEmpty) ...[
                  const SizedBox(width: 4),
                  Align(
                    alignment: Alignment.center,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 40),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 5, vertical: 2),
                        decoration: BoxDecoration(
                          color: accent.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          slot.badge!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                            color: accent,
                          ),
                        ),
                      ),
                    ),
                  ),
                ] else
                  Padding(
                    padding: const EdgeInsets.only(left: 2),
                    child: Icon(
                      tone == _SideTone.group
                          ? Icons.groups_outlined
                          : Icons.volunteer_activism_outlined,
                      size: 16,
                      color: accent.withValues(alpha: 0.55),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
