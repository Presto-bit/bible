/// 回答后横向可滑「参考来源」卡（与 PWA CitationEvidenceRail 对齐）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'models.dart';

/// 将 RAG 文档标题规范为中文展示名。
String formatCitationTitle(String? title, {String? bookName}) {
  final raw = (title ?? '').trim();
  final stripped = raw.replaceFirst(RegExp(r'^\d+-'), '').trim();
  final zhCore = stripped.replaceAll(RegExp(r'[A-Za-z0-9_\-.]'), '').trim();
  if (zhCore.length >= 2) {
    if (RegExp(r'背景|注释|释义|导论|概述').hasMatch(stripped)) return stripped;
    return '$stripped · 背景注释';
  }
  if (bookName != null && bookName.trim().isNotEmpty) {
    return '${bookName.trim()} · 背景注释';
  }
  return '圣经背景注释';
}

class CitationEvidenceRail extends StatelessWidget {
  const CitationEvidenceRail({
    super.key,
    required this.citations,
    this.bookName,
    this.onOpen,
  });

  final List<Citation> citations;
  final String? bookName;
  final void Function(int n)? onOpen;

  @override
  Widget build(BuildContext context) {
    if (citations.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '参考来源',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.6,
              color: AppColors.inkSoft,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 118,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: citations.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final c = citations[i];
                final title = formatCitationTitle(c.title, bookName: bookName);
                var snip = (c.snippet ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();
                if (snip.length > 48) snip = '${snip.substring(0, 48)}…';
                return Material(
                  color: Color.lerp(AppColors.goldWash, Colors.white, 0.45) ??
                      AppColors.goldWash,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: onOpen == null ? null : () => onOpen!(c.n),
                    child: Container(
                      width: 200,
                      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.line.withValues(alpha: 0.9),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '[${c.n}]',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.accentDeep,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              height: 1.35,
                              color: AppColors.ink,
                            ),
                          ),
                          if (snip.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              snip,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                height: 1.4,
                                color: AppColors.inkSoft,
                              ),
                            ),
                          ],
                          const Spacer(),
                          const Text(
                            '注释',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.4,
                              color: AppColors.inkFaint,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
