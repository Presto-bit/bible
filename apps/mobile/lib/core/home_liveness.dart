/// 首页活感：打卡 flash / 计划完成 / 欢迎回来（对齐 Web `home_liveness.ts`）。
library;

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'daily_clock.dart';

const _kPlanDoneDay = 'home_plan_done_day_ymd';
const _kCheckinFlash = 'home_checkin_flash_pending';
const _kPlanDoneHaptic = 'home_plan_done_haptic_pending';

bool isPlanDayDoneToday(SharedPreferences prefs) {
  return prefs.getString(_kPlanDoneDay) == chinaTodayYmd();
}

Future<void> markPlanDayDoneToday(SharedPreferences prefs) async {
  await prefs.setString(_kPlanDoneDay, chinaTodayYmd());
  await prefs.setBool(_kPlanDoneHaptic, true);
}

Future<void> armCheckinFlash(SharedPreferences prefs) async {
  await prefs.setBool(_kCheckinFlash, true);
}

/// 消费一次打卡 flash；返回是否应播放。
bool consumeCheckinFlash(SharedPreferences prefs) {
  if (prefs.getBool(_kCheckinFlash) != true) return false;
  prefs.setBool(_kCheckinFlash, false);
  return true;
}

/// 消费计划完成回首页成功触觉。
bool consumePlanDoneHomeHaptic(SharedPreferences prefs) {
  if (prefs.getBool(_kPlanDoneHaptic) != true) return false;
  prefs.setBool(_kPlanDoneHaptic, false);
  return true;
}

bool _homeStaggerPlayedThisProcess = false;

/// 每进程首页错落入场一次（对齐 Web sessionStorage `shouldPlayHomeStagger`）。
bool shouldPlayHomeStagger() {
  if (_homeStaggerPlayedThisProcess) return false;
  _homeStaggerPlayedThisProcess = true;
  return true;
}

void peiaiHapticLight() {
  HapticFeedback.lightImpact();
}

void peiaiHapticSuccess() {
  HapticFeedback.mediumImpact();
}

/// 距上次有效阅读 ≥ [gapDays] 整天则视为「欢迎回来」。
bool isWelcomeBackGap({
  required Iterable<String> recentActiveYmds,
  int gapDays = 3,
}) {
  final today = chinaTodayYmd();
  final sorted = recentActiveYmds
      .where((d) => d.isNotEmpty && d.compareTo(today) <= 0)
      .toList()
    ..sort();
  if (sorted.isEmpty) return false;
  final last = sorted.last;
  try {
    final lastDt = DateTime.parse(last);
    final todayDt = DateTime.parse(today);
    return todayDt.difference(lastDt).inDays >= gapDays;
  } catch (_) {
    return false;
  }
}
