/// 「我的」页：头像 + 签名 + 今日时长 + 成就 + 统计磁贴 + 功能入口。布局对齐 canvas。
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/gamification.dart';
import '../core/theme.dart';
import '../core/widgets/avatar_bubble.dart';
import '../core/widgets/sync_migrate_sheet.dart';
import '../core/widgets/sync_status_badge.dart';
import '../features/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
import '../features/bible/reader_experience.dart' show readerFontProvider, ReaderFontSize, ReaderFontSizeX;
import '../features/bible/reading_progress_card.dart';
import '../features/bible/reading_report_screen.dart';
import '../features/bible/reading_repository.dart';
import '../features/notes/notes_repository.dart' show profileSyncProvider;
import '../features/notes/notes_screen.dart';
import '../features/bible/offline_download_sheet.dart';
import '../features/notes/favorite_review.dart';
import '../features/bible/markings_repository.dart';
import '../core/widgets/paper_card.dart';
import '../core/notifications.dart';

final healthProvider = FutureProvider<bool>((ref) async {
  final Dio dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/health');
    return (res.data['status'] == 'ok');
  } catch (_) {
    return false;
  }
});


class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _idCopied = false;

  void _showBadgeGallery(List<BadgeDef> badges) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _BadgeGallerySheet(badges: badges),
    );
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _maybeOnboard();
      if (mounted) await maybeShowSyncMigrateSheet(context, ref);
    });
  }

  Future<void> _maybeOnboard() async {
    final auth = ref.read(authControllerProvider.notifier);
    if (auth.isOnboarded) return;
    if (!mounted) return;
    final gid = ref.read(sessionProvider).guestId;
    final nameCtl = TextEditingController(
        text: ref.read(prefsProvider).getString('onboarding_name') ?? '');
    final pwdCtl = TextEditingController();
    String? err;
    final result = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('设置你的名称和密码'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('免注册即用，你的用户ID 是 $gid。设置用户名（不可重复）与密码后，可在其它设备用「用户名 + 密码」登录。',
                  style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
              const SizedBox(height: 12),
              TextField(
                controller: nameCtl,
                decoration: const InputDecoration(
                    labelText: '用户名（≥2 字，不可重复）',
                    border: OutlineInputBorder()),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: pwdCtl,
                obscureText: true,
                decoration: const InputDecoration(
                    labelText: '密码（≥6 位）', border: OutlineInputBorder()),
              ),
              if (err != null) ...[
                const SizedBox(height: 8),
                Text(err!, style: const TextStyle(color: Color(0xFFB1554A), fontSize: 12)),
              ],
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, 'skip'),
                child: const Text('暂时跳过')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.accentDeep),
              onPressed: () async {
                final u = nameCtl.text.trim();
                if (u.length < 2) {
                  setLocal(() => err = '名称至少 2 个字');
                  return;
                }
                if (pwdCtl.text.length < 6) {
                  setLocal(() => err = '密码至少 6 位');
                  return;
                }
                final ok = await auth.usernameAvailable(u);
                if (!ok) {
                  setLocal(() => err = '该用户名已被占用，请换一个');
                  return;
                }
                if (ctx.mounted) Navigator.pop(ctx, 'ok');
              },
              child: const Text('保存并继续'),
            ),
          ],
        ),
      ),
    );
    if (result == 'ok') {
      await auth.setCredentials(
          username: nameCtl.text.trim(), password: pwdCtl.text);
      if (mounted) setState(() {});
    } else {
      await auth.setCredentials(username: '', password: '');
      await auth.markOnboarded();
    }
  }

  Future<void> _copyId(String id) async {
    await Clipboard.setData(ClipboardData(text: id));
    setState(() => _idCopied = true);
    Future.delayed(const Duration(milliseconds: 1600), () {
      if (mounted) setState(() => _idCopied = false);
    });
  }

  Future<void> _pickAvatar(String current) async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.of(ctx).size.height * 0.7),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('选择头像',
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: AppColors.ink)),
                const SizedBox(height: 2),
                Text('${presetAvatars.length} 款预设 · 圣经主题插画',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.inkFaint)),
                const SizedBox(height: 12),
                Flexible(
                  child: GridView.builder(
                    shrinkWrap: true,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 5,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                    ),
                    itemCount: presetAvatars.length,
                    itemBuilder: (_, i) {
                      final a = presetAvatars[i];
                      final selected = a.id == current;
                      return GestureDetector(
                        onTap: () => Navigator.pop(ctx, a.id),
                        child: Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: selected
                                  ? AppColors.accentDeep
                                  : Colors.transparent,
                              width: 2,
                            ),
                          ),
                          child: ClipOval(
                            child: AvatarBubble(id: a.id, size: 48),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (picked != null) {
      await ref.read(prefsProvider).setString('profile_avatar', picked);
      await ref.read(profileSyncProvider).pushAvatar(picked);
      if (mounted) setState(() {});
    }
  }

  Future<void> _editField({
    required String title,
    required String key,
    required String current,
    int maxLines = 1,
    int? maxLength,
  }) async {
    final ctl = TextEditingController(text: current);
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctl,
          autofocus: true,
          maxLines: maxLines,
          maxLength: maxLength,
          decoration: const InputDecoration(border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('取消')),
          FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.accentDeep),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('保存')),
        ],
      ),
    );
    if (saved == true) {
      var text = ctl.text.trim();
      if (maxLength != null && text.length > maxLength) {
        text = text.substring(0, maxLength);
      }
      await ref.read(prefsProvider).setString(key, text);
      final sync = ref.read(profileSyncProvider);
      if (key == 'profile_bio') {
        await sync.pushBio(text);
      } else if (key == 'onboarding_name') {
        await sync.pushUsername(text);
      }
      if (mounted) setState(() {});
    }
  }

  Future<void> _changePassword() async {
    final auth = ref.read(authControllerProvider.notifier);
    final needOld = ref.read(authControllerProvider).hasPassword;
    final oldCtl = TextEditingController();
    final newCtl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('修改密码'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (needOld)
              TextField(
                controller: oldCtl,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: '当前密码',
                  border: OutlineInputBorder(),
                ),
              ),
            if (needOld) const SizedBox(height: 10),
            TextField(
              controller: newCtl,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: '新密码（≥6 位）',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('取消')),
          FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.accentDeep),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('保存')),
        ],
      ),
    );
    if (ok == true && newCtl.text.trim().length >= 6) {
      try {
        await auth.changePassword(
          oldPassword: needOld ? oldCtl.text : null,
          newPassword: newCtl.text.trim(),
        );
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text('密码已更新')));
          setState(() {});
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('$e')));
        }
      }
    }
  }

  void _openSettings() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.paper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _SettingsSheet(
        onEditField: _editField,
        onChangePassword: _changePassword,
        onCopyId: _copyId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final auth = ref.watch(authControllerProvider);
    final prefs = ref.watch(prefsProvider);
    final todayMin = ref.watch(todayReadingProvider);

    final name = prefs.getString('onboarding_name') ??
        auth.displayName ??
        '读经伙伴';
    final bio = prefs.getString('profile_bio') ?? '愿日日亲近主话';
    final userId = session.userId ?? session.guestId;
    final avatarId =
        prefs.getString('profile_avatar') ?? defaultAvatarId(userId);

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => _pickAvatar(avatarId),
                        child: ClipOval(
                          child: AvatarBubble(id: avatarId, size: 48),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name,
                                style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700)),
                            GestureDetector(
                              onTap: () => _editField(
                                title: '个性签名',
                                key: 'profile_bio',
                                current: bio == '愿日日亲近主话' ? '' : bio,
                                maxLines: 2,
                                maxLength: 15,
                              ),
                              child: Text(
                                bio.isEmpty || bio == '愿日日亲近主话'
                                    ? '点击添加签名'
                                    : bio,
                                style: TextStyle(
                                  color: AppColors.inkFaint,
                                  fontSize: 12,
                                  fontStyle: bio.isEmpty ||
                                          bio == '愿日日亲近主话'
                                      ? FontStyle.italic
                                      : FontStyle.normal,
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            GestureDetector(
                              onLongPress: () => _copyId(userId),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _idCopied
                                      ? AppColors.accentWash
                                      : AppColors.surfaceSunken,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  _idCopied ? '已复制 ✓' : 'ID $userId',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: _idCopied
                                        ? AppColors.accentDeep
                                        : AppColors.inkFaint,
                                  ),
                                ),
                              ),
                            ),
                            Text(
                              auth.hasPassword ? '已设密码 · 可换机登录' : '未设密码 · 建议设置',
                              style: const TextStyle(
                                  fontSize: 11, color: AppColors.inkFaint),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SyncStatusBadge(),
                IconButton(
                  onPressed: _openSettings,
                  icon: const Icon(Icons.settings_outlined),
                ),
              ],
            ),
            PaperCard(
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      auth.hasPassword
                          ? '已设密码，换机可用 ID 或用户名登录'
                          : '建议设置密码，换机更方便',
                      style: const TextStyle(
                          color: AppColors.inkSoft, fontSize: 13),
                    ),
                  ),
                  FilledButton(
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accentDeep),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                          builder: (_) => const LoginScreen()),
                    ),
                    child: const Text('切换账号'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            PaperCard(
              tier: 2,
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => const ReadingReportScreen(),
              )),
              child: Row(
                children: [
                  const Text('阅读时长',
                      style: TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14)),
                  const Spacer(),
                  todayMin.when(
                    loading: () => const Text('…',
                        style: TextStyle(
                            color: AppColors.inkFaint, fontSize: 12)),
                    error: (_, __) => const Text('读经回顾 ›',
                        style: TextStyle(
                            color: AppColors.inkFaint, fontSize: 12)),
                    data: (m) => Text('今日 $m 分钟 · 读经回顾 ›',
                        style: const TextStyle(
                            color: AppColors.inkFaint, fontSize: 12)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            PaperCard(
              tier: 2,
              onTap: () => context.push('/wrapped'),
              child: const Row(
                children: [
                  Text('读经 Wrapped',
                      style: TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14)),
                  Spacer(),
                  Text('月/年回顾 ›',
                      style: TextStyle(
                          color: AppColors.inkFaint, fontSize: 12)),
                ],
              ),
            ),
            const SizedBox(height: 14),
            ref.watch(bookmarksProvider).maybeWhen(
                  data: (bookmarks) {
                    final cards = favoriteReviewCards(bookmarks);
                    if (cards.isEmpty) return const SizedBox.shrink();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('收藏复习',
                            style: TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 14)),
                        const SizedBox(height: 8),
                        ...cards.map((c) => Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: PaperCard(
                                onTap: () {
                                  final m = RegExp(r'^([A-Za-z0-9]+)\.(\d+)')
                                      .firstMatch(c.ref);
                                  if (m != null) {
                                    context.push(
                                        '/reader?book=${m.group(1)}&chapter=${m.group(2)}');
                                  }
                                },
                                child: Text(c.label,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600)),
                              ),
                            )),
                        const SizedBox(height: 6),
                      ],
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
            ref.watch(reviewDataProvider).maybeWhen(
                  data: (data) {
                    final streak = readingStreak(data);
                    if (streak <= 0) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(colors: [
                            const Color(0xFFFFF5EB),
                            AppColors.accentWash,
                          ]),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.line),
                        ),
                        child: Row(
                          children: [
                            const Text('🔥', style: TextStyle(fontSize: 20)),
                            const SizedBox(width: 8),
                            Text('连续读经 $streak 天',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
            const SizedBox(height: 12),
            PaperCard(
              onTap: () {
                ref.read(badgesProvider).whenData(_showBadgeGallery);
              },
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Text('成就徽章',
                          style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 14)),
                      const Spacer(),
                      const Text('查看全部 ›',
                          style: TextStyle(
                              color: AppColors.inkFaint, fontSize: 12)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ref.watch(badgesProvider).when(
                        loading: () => const SizedBox(
                            height: 72,
                            child: Center(child: CircularProgressIndicator())),
                        error: (_, __) => const SizedBox.shrink(),
                        data: (badges) {
                          final preview = profilePreviewBadges(badges);
                          return SizedBox(
                          height: 72,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: preview.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(width: 10),
                            itemBuilder: (_, i) {
                              final b = preview[i];
                              return Column(
                                children: [
                                  Container(
                                    width: 48,
                                    height: 48,
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                        colors: [
                                          AppColors.accentWash,
                                          AppColors.goldWash,
                                        ],
                                      ),
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                          color: b.done
                                              ? AppColors.accentDeep
                                              : AppColors.line),
                                    ),
                                    child: Center(
                                      child: Text(
                                          b.done ? b.icon : b.progress,
                                          style: const TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                              color: AppColors.accentDeep)),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(b.label,
                                      style: const TextStyle(
                                          fontSize: 10,
                                          color: AppColors.inkFaint)),
                                ],
                              );
                            },
                          ),
                        );
                        },
                      ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            PaperCard(
              onTap: () => context.push('/challenge'),
              child: Row(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.accentWash,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('每日问答',
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.accentDeep)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text('圣经知识闯关',
                            style: TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 14)),
                        SizedBox(height: 2),
                        Text('关卡制答题 · 巩固所学',
                            style: TextStyle(
                                fontSize: 12, color: AppColors.inkFaint)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: AppColors.inkFaint),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const ReadingProgressCard(),
            const SizedBox(height: 16),
            _LinkCard(
              icon: Icons.edit_note_outlined,
              label: '我的笔记',
              subtitle: auth.signedIn ? '云端同步 · 多设备' : '本地保存 · 登录后云同步',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const NotesScreen()),
              ),
            ),
            if (auth.signedIn) ...[
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFB1554A),
                    side: const BorderSide(color: AppColors.line),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: () =>
                      ref.read(authControllerProvider.notifier).logout(),
                  child: const Text('退出登录'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LinkCard extends StatelessWidget {
  const _LinkCard({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      onTap: onTap,
      child: Row(
        children: [
          Icon(icon, color: AppColors.accentDeep),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, color: AppColors.ink)),
                Text(subtitle,
                    style: const TextStyle(
                        color: AppColors.inkFaint, fontSize: 12)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppColors.inkFaint),
        ],
      ),
    );
  }
}

/// 设置面板（对齐 canvas）：个人资料 / 阅读 / 提醒 / 账号 / 关于。
class _SettingsSheet extends ConsumerWidget {
  const _SettingsSheet({
    required this.onEditField,
    required this.onChangePassword,
    required this.onCopyId,
  });

  final Future<void> Function({
    required String title,
    required String key,
    required String current,
    int maxLines,
    int? maxLength,
  }) onEditField;
  final Future<void> Function() onChangePassword;
  final Future<void> Function(String id) onCopyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    final session = ref.watch(sessionProvider);
    final auth = ref.watch(authControllerProvider);
    final font = ref.watch(readerFontProvider);

    final name = prefs.getString('onboarding_name') ?? '读经伙伴';
    final userId = session.userId ?? session.guestId;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.88),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: AppColors.line,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 12),
            const Text('设置',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                    color: AppColors.ink)),
            const SizedBox(height: 16),
            _section('个人资料', [
              _row('昵称', name,
                  onTap: () => onEditField(
                      title: '昵称', key: 'onboarding_name', current: name)),
            ]),
            const SizedBox(height: 12),
            _section('提醒', [
              _ReminderRow(prefs: prefs),
            ]),
            const SizedBox(height: 12),
            _section('阅读', [
              _row('外观', '主题与翻页', onTap: () {
                Navigator.pop(context);
                context.push('/profile/appearance');
              }),
              _row('离线圣经', '下载 CNV 经包', onTap: () {
                Navigator.pop(context);
                showOfflineDownloadSheet(context, ref);
              }),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    const Text('字号',
                        style: TextStyle(color: AppColors.inkSoft)),
                    const Spacer(),
                    ...ReaderFontSize.values.map((s) {
                      final active = s == font;
                      return Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: GestureDetector(
                          onTap: () =>
                              ref.read(readerFontProvider.notifier).set(s),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: active
                                  ? AppColors.accentWash
                                  : AppColors.surface,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                  color: active
                                      ? AppColors.accent
                                      : AppColors.line),
                            ),
                            child: Text(s.label,
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: active
                                        ? AppColors.accentDeep
                                        : AppColors.inkSoft)),
                          ),
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ]),
            const SizedBox(height: 12),
            _section('账号', [
              Row(
                children: [
                  const Text('用户 ID',
                      style: TextStyle(color: AppColors.inkSoft)),
                  const Spacer(),
                  Text(userId,
                      style: const TextStyle(
                          color: AppColors.ink, fontSize: 13)),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.copy, size: 16),
                    onPressed: () => onCopyId(userId),
                  ),
                ],
              ),
              _row('修改密码', '', onTap: onChangePassword),
              if (auth.signedIn)
                _row('退出登录', '',
                    danger: true,
                    onTap: () => ref
                        .read(authControllerProvider.notifier)
                        .logout()),
            ]),
            const SizedBox(height: 12),
            _section('关于', [
              _InfoTile(label: '版本', value: '1.0.0 (P1)'),
              const SizedBox(height: 8),
              _InfoTile(label: '后端地址', value: AppConfig.baseUrl),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () => ref.refresh(healthProvider),
                child: const Text('重新检测连通'),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkFaint)),
          const SizedBox(height: 4),
          ...children,
        ],
      ),
    );
  }

  Widget _row(String label, String value,
      {VoidCallback? onTap, bool danger = false}) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Text(label,
                style: TextStyle(
                    color: danger ? const Color(0xFFB1554A) : AppColors.ink)),
            const Spacer(),
            if (value.isNotEmpty)
              Flexible(
                child: Text(value,
                    textAlign: TextAlign.right,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: AppColors.inkFaint, fontSize: 13)),
              ),
            if (onTap != null && !danger)
              const Padding(
                padding: EdgeInsets.only(left: 4),
                child: Icon(Icons.chevron_right,
                    size: 18, color: AppColors.inkFaint),
              ),
          ],
        ),
      ),
    );
  }
}

class _ReminderRow extends StatefulWidget {
  const _ReminderRow({required this.prefs});
  final SharedPreferences prefs;

  @override
  State<_ReminderRow> createState() => _ReminderRowState();
}

class _ReminderRowState extends State<_ReminderRow> {
  static const _enabledKey = 'reminder_daily_enabled';
  static const _hourKey = 'reminder_daily_hour';
  static const _minuteKey = 'reminder_daily_minute';

  late bool _enabled;
  late TimeOfDay _time;

  @override
  void initState() {
    super.initState();
    _enabled = widget.prefs.getBool(_enabledKey) ?? false;
    _time = TimeOfDay(
      hour: widget.prefs.getInt(_hourKey) ?? 7,
      minute: widget.prefs.getInt(_minuteKey) ?? 30,
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
    await widget.prefs.setBool(_enabledKey, on);
    if (on) {
      await NotificationService.instance.scheduleDaily(_time.hour, _time.minute);
    } else {
      await NotificationService.instance.cancelDaily();
    }
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time);
    if (picked == null) return;
    setState(() => _time = picked);
    await widget.prefs.setInt(_hourKey, picked.hour);
    await widget.prefs.setInt(_minuteKey, picked.minute);
    if (_enabled) {
      await NotificationService.instance.scheduleDaily(picked.hour, picked.minute);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('每日读经提醒'),
          subtitle: Text(
            _enabled
                ? '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')} 推送本地通知'
                : '关闭',
            style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
          ),
          value: _enabled,
          onChanged: _toggle,
        ),
        if (_enabled)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('提醒时间'),
            trailing: Text(
              '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}',
              style: const TextStyle(color: AppColors.accentDeep),
            ),
            onTap: _pickTime,
          ),
      ],
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.label, this.value});
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.inkSoft)),
        Flexible(
          child: Text(
            value ?? '',
            textAlign: TextAlign.right,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppColors.ink, fontSize: 12),
          ),
        ),
      ],
    );
  }
}

class _BadgeGallerySheet extends ConsumerStatefulWidget {
  const _BadgeGallerySheet({required this.badges});

  final List<BadgeDef> badges;

  @override
  ConsumerState<_BadgeGallerySheet> createState() => _BadgeGallerySheetState();
}

class _BadgeGallerySheetState extends ConsumerState<_BadgeGallerySheet> {
  String _tab = 'all';

  @override
  Widget build(BuildContext context) {
    final catalog = ref.watch(badgeCatalogProvider);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      maxChildSize: 0.92,
      builder: (_, scroll) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: catalog.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => const SizedBox.shrink(),
          data: (cat) {
            final filtered = _tab == 'all'
                ? widget.badges
                : widget.badges.where((b) => b.category == _tab).toList();
            final earned = widget.badges.where((b) => b.done).length;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.line,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text('成就徽章',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700, color: AppColors.ink)),
                Text('已收集 $earned / ${widget.badges.length}',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.inkFaint)),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _BadgeTab(
                        label: '全部',
                        active: _tab == 'all',
                        onTap: () => setState(() => _tab = 'all'),
                      ),
                      for (final c in cat.categoryOrder)
                        _BadgeTab(
                          label: cat.categoryLabels[c] ?? c,
                          active: _tab == c,
                          onTap: () => setState(() => _tab = c),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Expanded(
                  child: GridView.builder(
                    controller: scroll,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      mainAxisSpacing: 14,
                      crossAxisSpacing: 10,
                      childAspectRatio: 0.72,
                    ),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final b = filtered[i];
                      return Opacity(
                        opacity: b.done ? 1 : 0.55,
                        child: Column(
                          children: [
                            Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    AppColors.accentWash,
                                    AppColors.goldWash,
                                  ],
                                ),
                                shape: BoxShape.circle,
                                border: Border.all(
                                    color: b.done
                                        ? AppColors.accentDeep
                                        : AppColors.line),
                              ),
                              child: Center(
                                child: Text(b.icon,
                                    style: const TextStyle(fontSize: 20)),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(b.label,
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.ink)),
                            Text(b.desc,
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 10, color: AppColors.inkFaint)),
                            if (!b.done) ...[
                              Text(b.hint,
                                  textAlign: TextAlign.center,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontSize: 9, color: AppColors.accentDeep)),
                              Text(b.progress,
                                  style: const TextStyle(
                                      fontSize: 10,
                                      color: AppColors.inkFaint)),
                            ],
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _BadgeTab extends StatelessWidget {
  const _BadgeTab({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: active ? AppColors.accentWash : AppColors.paper,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
                color: active ? AppColors.accentDeep : AppColors.line),
          ),
          child: Text(label,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                  color: active ? AppColors.accentDeep : AppColors.inkSoft)),
        ),
      ),
    );
  }
}
