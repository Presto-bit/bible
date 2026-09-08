/// 小节胶囊导航（对齐 PWA `SectionToc.tsx`）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'assistant_sections.dart';

class SectionToc extends StatelessWidget {
  const SectionToc({
    super.key,
    required this.sections,
    this.activeId,
    this.writtenSectionIds,
    this.streaming = false,
    required this.onSelect,
  });

  final List<AnswerSection> sections;
  final String? activeId;
  final Set<String>? writtenSectionIds;
  final bool streaming;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    if (sections.length < 2) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final s in sections)
          _SectionChip(
            title: s.title,
            active: activeId == s.id,
            pending: streaming && !(writtenSectionIds?.contains(s.id) ?? false),
            onTap: () => onSelect(s.id),
          ),
      ],
    );
  }
}

class _SectionChip extends StatelessWidget {
  const _SectionChip({
    required this.title,
    required this.active,
    required this.pending,
    required this.onTap,
  });

  final String title;
  final bool active;
  final bool pending;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final borderColor = active
        ? AppColors.accentDeep
        : pending
            ? Color.lerp(AppColors.line, AppColors.accentDeep, 0.22)!
            : Color.lerp(AppColors.line, AppColors.accentDeep, 0.45)!;
    return Material(
      color: active
          ? Color.lerp(AppColors.surface, AppColors.accentWash, 0.45) ??
              AppColors.surface
          : AppColors.surface,
      shape: StadiumBorder(
        side: BorderSide(
          color: borderColor,
          style: pending ? BorderStyle.solid : BorderStyle.solid,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          child: Text(
            pending ? '$title…' : title,
            style: TextStyle(
              fontSize: 12,
              color: active
                  ? AppColors.accentDeep
                  : pending
                      ? AppColors.inkFaint
                      : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}
