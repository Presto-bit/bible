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
