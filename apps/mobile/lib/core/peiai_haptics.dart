/// 轻触反馈（尊重系统减少动态效果）。
library;

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

bool peiaiReduceMotion(BuildContext context) =>
    MediaQuery.disableAnimationsOf(context) ||
    MediaQuery.maybeOf(context)?.disableAnimations == true;

void peiaiHapticLight(BuildContext context) {
  if (peiaiReduceMotion(context)) return;
  HapticFeedback.lightImpact();
}

void peiaiHapticSelection(BuildContext context) {
  if (peiaiReduceMotion(context)) return;
  HapticFeedback.selectionClick();
}

/// 朗读播/停：约 10ms 轻触（Android；无 context 场景）。
void peiaiHapticAudioToggle() {
  HapticFeedback.lightImpact();
}
