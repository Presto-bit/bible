import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'assistant_instant.dart';

class InstantAnswerStatus extends StatelessWidget {
  const InstantAnswerStatus({
    super.key,
    this.instant = false,
    this.cacheSource,
    this.local = false,
  });

  final bool instant;
  final String? cacheSource;
  final bool local;

  @override
  Widget build(BuildContext context) {
    if (!instant && !local) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        instantAnswerLabel(cacheSource: cacheSource, local: local),
        style: const TextStyle(
          fontSize: 12,
          height: 1.4,
          color: AppColors.inkFaint,
        ),
      ),
    );
  }
}
