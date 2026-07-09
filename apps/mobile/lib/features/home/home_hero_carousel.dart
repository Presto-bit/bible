/// 首页 Hero 轮播：每日经文 + Hero B 运营位。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'hero_b_campaign.dart';

class HomeHeroCarousel extends StatefulWidget {
  const HomeHeroCarousel({
    super.key,
    required this.verseSlide,
    this.campaign,
    this.campaignReady = false,
    required this.onCampaignTap,
  });

  final Widget verseSlide;
  final HeroBCampaign? campaign;
  final bool campaignReady;
  final VoidCallback? onCampaignTap;

  @override
  State<HomeHeroCarousel> createState() => _HomeHeroCarouselState();
}

class _HomeHeroCarouselState extends State<HomeHeroCarousel> {
  final _page = PageController();
  var _index = 0;

  bool get _hasOps => widget.campaign != null && widget.campaignReady;

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasOps) return widget.verseSlide;

    return Column(
      children: [
        SizedBox(
          height: 220,
          child: PageView(
            controller: _page,
            onPageChanged: (i) => setState(() => _index = i),
            children: [
              widget.verseSlide,
              _CampaignCard(
                campaign: widget.campaign!,
                onTap: widget.onCampaignTap,
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _dot(0),
            const SizedBox(width: 6),
            _dot(1),
          ],
        ),
      ],
    );
  }

  Widget _dot(int i) {
    final active = _index == i;
    return Container(
      width: active ? 16 : 6,
      height: 6,
      decoration: BoxDecoration(
        color: active ? AppColors.accentDeep : AppColors.line,
        borderRadius: BorderRadius.circular(3),
      ),
    );
  }
}

class _CampaignCard extends StatelessWidget {
  const _CampaignCard({required this.campaign, this.onTap});

  final HeroBCampaign campaign;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              campaign.imageSrc,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(color: AppColors.surfaceSunken),
            ),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.55),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 14,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (campaign.badge != null && campaign.badge!.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.accentDeep.withValues(alpha: 0.9),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        campaign.badge!,
                        style: const TextStyle(color: Colors.white, fontSize: 11),
                      ),
                    ),
                  if (campaign.badge != null) const SizedBox(height: 6),
                  Text(
                    campaign.alt,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
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
