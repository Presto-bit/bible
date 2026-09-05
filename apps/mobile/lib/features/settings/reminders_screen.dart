/// 提醒与勿扰（Flutter 原生，对齐产品「默认关提醒 / 默认开勿扰」）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart' show prefsProvider;
import '../../core/notif_prefs.dart';
import '../../core/notifications.dart';
import '../../core/theme.dart';

class RemindersScreen extends ConsumerStatefulWidget {
  const RemindersScreen({super.key});

  @override
  ConsumerState<RemindersScreen> createState() => _RemindersScreenState();
}

class _RemindersScreenState extends ConsumerState<RemindersScreen> {
  late bool _enabled;
  late bool _dnd;
  late TimeOfDay _time;
  late SharedPreferences _prefs;

  @override
  void initState() {
    super.initState();
    _prefs = ref.read(prefsProvider);
    _enabled = NotifPrefs.dailyEnabled(_prefs);
    _dnd = NotifPrefs.readingDnd(_prefs);
    _time = TimeOfDay(
      hour: NotifPrefs.dailyHour(_prefs),
      minute: NotifPrefs.dailyMinute(_prefs),
    );
  }

  Future<void> _toggle(bool on) async {
    if (on) {
      final ok = await NotificationService.instance.requestPermission();
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('请在系统设置中允许通知')),
        );
        return;
      }
    }
    setState(() => _enabled = on);
    await NotifPrefs.setDailyEnabled(_prefs, on);
    if (on) {
      await NotificationService.instance.scheduleDaily(_time.hour, _time.minute);
    } else {
      await NotificationService.instance.cancelDaily();
    }
  }

  Future<void> _toggleDnd(bool on) async {
    setState(() => _dnd = on);
    await NotifPrefs.setReadingDnd(_prefs, on);
    ref.read(readingDndEpochProvider.notifier).bump();
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time);
    if (picked == null) return;
    setState(() => _time = picked);
    await NotifPrefs.setDailyTime(
      _prefs,
      hour: picked.hour,
      minute: picked.minute,
    );
    if (_enabled) {
      await NotificationService.instance.scheduleDaily(picked.hour, picked.minute);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('提醒与勿扰')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.line),
            ),
            child: Column(
              children: [
                SwitchListTile(
                  title: const Text('每日读经提醒'),
                  subtitle: Text(
                    _enabled
                        ? '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')} 推送本地通知'
                        : '默认关闭 · 安静为主',
                    style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
                  ),
                  value: _enabled,
                  onChanged: _toggle,
                ),
                if (_enabled)
                  ListTile(
                    title: const Text('提醒时间'),
                    trailing: Text(
                      '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}',
                      style: const TextStyle(color: AppColors.accentDeep),
                    ),
                    onTap: _pickTime,
                  ),
                const Divider(height: 1),
                SwitchListTile(
                  title: const Text('读经勿扰'),
                  subtitle: const Text(
                    '默认开启 · 圣经页不弹社交提示',
                    style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
                  ),
                  value: _dnd,
                  onChanged: _toggleDnd,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            '提醒默认关闭，勿扰默认开启。不会用「你落后了」一类文案催促。',
            style: TextStyle(fontSize: 13, color: AppColors.inkFaint, height: 1.45),
          ),
        ],
      ),
    );
  }
}
