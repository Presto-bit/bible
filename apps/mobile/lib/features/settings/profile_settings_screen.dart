/// 我的 · 设置（Flutter 原生，布局对齐 PWA ProfileSettingsPanel）。
library;

import 'dart:async' show unawaited;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/app_update.dart';
import '../../core/app_update_dialog.dart';
import '../../core/h5_bridge_channel.dart' show discoverH5PathProvider;
import '../../core/overlay_h5.dart';
import '../../core/sync/sync_controller.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../bible/offline_download_sheet.dart';
import '../social/social_repository.dart';

const _kOfficialSupportUserCode = '70625146';

class ProfileSettingsScreen extends ConsumerStatefulWidget {
  const ProfileSettingsScreen({super.key});

  @override
  ConsumerState<ProfileSettingsScreen> createState() =>
      _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends ConsumerState<ProfileSettingsScreen> {
  var _syncing = false;
  var _checkingUpdate = false;
  String? _versionLabel;

  @override
  void initState() {
    super.initState();
    unawaited(_loadVersion());
  }

  Future<void> _loadVersion() async {
    final v = await const AppUpdateService().installedVersion();
    if (!mounted) return;
    setState(() {
      _versionLabel = v.code > 0 ? '${v.name} (${v.code})' : v.name;
    });
  }

  Future<void> _openSupport() async {
    try {
      final tid =
          await ref.read(socialRepoProvider).openDm(_kOfficialSupportUserCode);
      if (!mounted) return;
      ref.read(navIndexProvider.notifier).set(3);
      ref.read(discoverH5PathProvider.notifier).go('/discover/dm/$tid');
      context.go('/');
    } catch (_) {
      if (!mounted) return;
      ref.read(navIndexProvider.notifier).set(3);
      context.go('/');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('暂时无法直达客服，已打开消息页')),
      );
    }
  }

  Future<void> _checkUpdate() async {
    if (_checkingUpdate) return;
    setState(() => _checkingUpdate = true);
    try {
      final update = await const AppUpdateService().check();
      if (!mounted) return;
      if (update == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已是最新版本')),
        );
        return;
      }
      await showAppUpdateDialog(context: context, update: update);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('检查更新失败：$e')),
      );
    } finally {
      if (mounted) setState(() => _checkingUpdate = false);
    }
  }

  Future<void> _sync() async {
    if (_syncing) return;
    setState(() => _syncing = true);
    HapticFeedback.lightImpact();
    try {
      await ref.read(syncControllerProvider.notifier).runSync(force: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已同步')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('同步失败：$e')),
      );
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('退出登录'),
        content: const Text('确定退出当前账号？本地数据仍保留。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('退出', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await ref.read(authControllerProvider.notifier).logout();
    if (!mounted) return;
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final signedIn = auth.signedIn;

    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('设置', style: AppTypography.title),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 40),
        children: [
          // 顺序对齐 PWA：账号 → 读经体验 → 支持关于 → 数据
          _SettingsGroup(
            label: '账号与安全',
            children: [
              _SettingsNavRow(
                title: '账号与安全',
                hint: '密码、手机号、设备',
                icon: Icons.manage_accounts_outlined,
                onTap: () => openOverlayH5(
                  context,
                  '/profile/settings',
                  title: '账号与安全',
                ),
              ),
              if (!signedIn)
                _SettingsNavRow(
                  title: '在其他设备恢复',
                  hint: '登录或恢复账号',
                  icon: Icons.phonelink_lock_outlined,
                  onTap: () => openOverlayH5(context, '/login', title: '登录'),
                ),
            ],
          ),
          _SettingsGroup(
            label: '读经与体验',
            children: [
              _SettingsNavRow(
                title: '外观',
                hint: '主题与阅读器',
                icon: Icons.wb_sunny_outlined,
                onTap: () => context.push('/profile/appearance'),
              ),
              _SettingsNavRow(
                title: '提醒与勿扰',
                hint: '读经提醒 · 圣经勿扰',
                icon: Icons.notifications_none_rounded,
                onTap: () => context.push('/profile/reminders'),
              ),
              _SettingsNavRow(
                title: '离线下载',
                hint: '圣经与资料',
                icon: Icons.download_outlined,
                onTap: () => showOfflineDownloadSheet(context, ref),
              ),
              _SettingsNavRow(
                title: '知识库',
                hint: '知识库与专题',
                icon: Icons.menu_book_outlined,
                onTap: () => context.push('/knowledge-bases'),
              ),
            ],
          ),
          _SettingsGroup(
            label: '支持与关于',
            children: [
              _SettingsNavRow(
                title: '帮助与反馈',
                hint: '帮助与反馈',
                icon: Icons.help_outline_rounded,
                onTap: () => unawaited(_openSupport()),
              ),
              _SettingsNavRow(
                title: '数据来源与许可',
                hint: '经文与资料出处',
                icon: Icons.description_outlined,
                onTap: () =>
                    openOverlayH5(context, '/profile/licenses', title: '许可'),
              ),
              _SettingsNavRow(
                title: _checkingUpdate ? '正在检查…' : '检查更新',
                hint: _versionLabel == null
                    ? '彼爱安装包'
                    : '彼爱 $_versionLabel',
                icon: Icons.system_update_alt_outlined,
                onTap:
                    _checkingUpdate ? null : () => unawaited(_checkUpdate()),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                child: Text(
                  '版本 ${_versionLabel ?? '…'}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.inkFaint,
                  ),
                ),
              ),
            ],
          ),
          _SettingsGroup(
            label: '数据',
            children: [
              _SettingsNavRow(
                title: _syncing ? '同步中…' : '同步到云端',
                hint: signedIn ? '上传本地进度与想法' : '登录后可同步',
                icon: Icons.cloud_sync_outlined,
                onTap: !signedIn || _syncing
                    ? null
                    : () => unawaited(_sync()),
              ),
              if (signedIn)
                _SettingsNavRow(
                  title: '退出登录',
                  icon: Icons.logout_rounded,
                  danger: true,
                  onTap: () => unawaited(_logout()),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SettingsGroup extends StatelessWidget {
  const _SettingsGroup({required this.label, required this.children});

  final String label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 2, bottom: 8),
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.4,
                color: AppColors.inkFaint,
              ),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.line),
            ),
            child: Column(
              children: [
                for (var i = 0; i < children.length; i++) ...[
                  if (i > 0)
                    const Divider(height: 1, indent: 48, endIndent: 0),
                  children[i],
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsNavRow extends StatelessWidget {
  const _SettingsNavRow({
    required this.title,
    this.hint,
    this.icon,
    this.onTap,
    this.danger = false,
  });

  final String title;
  final String? hint;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    final ink = danger ? const Color(0xFFB42318) : AppColors.ink;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Opacity(
          opacity: enabled ? 1 : 0.45,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 13, 12, 13),
            child: Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 20, color: ink.withValues(alpha: 0.78)),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          height: 1.25,
                          color: ink,
                        ),
                      ),
                      if (hint != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          hint!,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.35,
                            color: AppColors.inkFaint,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (!danger)
                  const Icon(
                    Icons.chevron_right,
                    size: 20,
                    color: AppColors.inkFaint,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
