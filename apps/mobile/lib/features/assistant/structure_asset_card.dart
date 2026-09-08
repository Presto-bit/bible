/// 预置静态结构参考卡（对齐 PWA `StructureAssetCard.tsx`）。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import 'assistant_blocks.dart';
import 'timeline_rail.dart';

class StructureAssetCard extends StatelessWidget {
  const StructureAssetCard({super.key, required this.asset});

  final StructureAsset asset;

  String get _kindLabel {
    switch (asset.kind) {
      case 'diagram':
        return '示意图';
      case 'graph':
        return '结构图';
      default:
        return '年表';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Color.lerp(AppColors.surface, AppColors.accentWash, 0.25) ??
            AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Color.lerp(AppColors.line, AppColors.accentDeep, 0.18)!,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _kindLabel,
            style: const TextStyle(fontSize: 11, color: AppColors.inkFaint),
          ),
          Text(
            asset.label,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          if (asset.subtitle != null && asset.subtitle!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 8),
              child: Text(
                asset.subtitle!,
                style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
              ),
            ),
          if (asset.nodes.isNotEmpty)
            TimelineRail(nodes: asset.nodes, preset: true),
          if (asset.href != null && asset.href!.isNotEmpty)
            TextButton(
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: () => context.push(asset.href!),
              child: Text('查看完整$_kindLabel ›'),
            ),
        ],
      ),
    );
  }
}
