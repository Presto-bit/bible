import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'badge_engine.dart' show badgesProvider;

void queueBadgeRecheck(Ref ref) {
  Future<void>.delayed(const Duration(milliseconds: 500), () {
    ref.invalidate(badgesProvider);
  });
}
