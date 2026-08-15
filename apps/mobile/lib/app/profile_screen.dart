/// 「我的」页：头像 + 签名 + 今日时长 + 成就 + 统计磁贴 + 功能入口。布局对齐 canvas。
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:share_plus/share_plus.dart';

import 'app_shell.dart' show navIndexProvider;
import '../core/api_client.dart';
import '../core/config.dart';
import '../core/gamification.dart';
import '../core/h5_bridge_channel.dart' show discoverH5PathProvider;
import '../core/open_h5.dart';
import '../core/profile_avatar.dart';
import '../core/profile_footprint.dart';
import '../core/theme.dart';
import '../core/widgets/avatar_bubble.dart';
import '../core/widgets/sync_migrate_sheet.dart';
import '../features/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
import '../features/bible/reader_experience.dart'
    show readerFontProvider, ReaderFontSize, ReaderFontSizeX;
import '../features/bible/bible_repository.dart';
import '../features/bible/markings_repository.dart';
import '../features/bible/thoughts_repository.dart';
import '../features/bible/models.dart';
import '../features/bible/reading_repository.dart';
import '../features/notes/notes_repository.dart' show profileSyncProvider;
import '../features/notes/notes_screen.dart';
import '../features/bible/offline_download_sheet.dart';
import '../features/bible/offline_bible.dart';
import '../core/widgets/paper_card.dart';
import '../core/notifications.dart';
import '../core/notif_prefs.dart';
import '../core/user_storage.dart';
import '../features/social/social_repository.dart';

/// 官方客服账号（用户 ID），设置「帮助与反馈」直达私信。
const kOfficialSupportUserCode = '70625146';

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
  String? _avatarOverride;

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
    // 名称+密码只在欢迎页一次完成（对齐 PWA：不再强制账号门闸）。
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (mounted) await maybeShowSyncMigrateSheet(context, ref);
    });
  }

  Future<void> _copyId(String id) async {
    await Clipboard.setData(ClipboardData(text: id));
    setState(() => _idCopied = true);
    Future.delayed(const Duration(milliseconds: 1600), () {
      if (mounted) setState(() => _idCopied = false);
    });
  }

  Future<void> _pickAvatar(String current) async {
    final h = MediaQuery.of(context).size.height * 0.62;
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: SizedBox(
          height: h,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '选择头像',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  isCustomAvatarId(current)
                      ? '当前：自定义'
                      : '${presetAvatars.length} 款预设 · 也可从相册上传',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.inkFaint,
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.pop(ctx, '__album__'),
                    icon: const Icon(Icons.photo_library_outlined, size: 18),
                    label: const Text('从相册选择'),
                  ),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: GridView.builder(
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
    if (picked == null || !mounted) return;
    if (picked == '__album__') {
      await _uploadCustomAvatar();
      return;
    }
    setState(() => _avatarOverride = picked);
    await userPrefSetString(ref.read(prefsProvider), 'profile_avatar', picked);
    try {
      await ref.read(profileSyncProvider).pushAvatar(picked);
    } catch (_) {
      /* 静默；本地已更新 */
    }
  }

  Future<void> _uploadCustomAvatar() async {
    try {
      final picker = ImagePicker();
      final x = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (x == null || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('正在上传头像…'),
          duration: Duration(seconds: 2),
        ),
      );
      final dio = ref.read(dioProvider);
      final form = FormData.fromMap({
        'file': await MultipartFile.fromFile(x.path, filename: 'avatar.jpg'),
      });
      final res = await dio.post(
        '/social/uploads/avatar',
        data: form,
        options: Options(contentType: 'multipart/form-data'),
      );
      final data = res.data as Map<String, dynamic>? ?? {};
      final nextId = (data['avatar_id'] as String?)?.trim();
      if (nextId == null || nextId.isEmpty) {
        throw StateError('上传响应缺少 avatar_id');
      }
      if (!mounted) return;
      setState(() => _avatarOverride = nextId);
      await userPrefSetString(
        ref.read(prefsProvider),
        'profile_avatar',
        nextId,
      );
      try {
        await ref.read(profileSyncProvider).pushAvatar(nextId);
      } catch (_) {
        /* 服务端已写 profile */
      }
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('头像已更新')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('头像上传失败：$e')));
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
            child: const Text('取消'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.accentDeep,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('保存'),
          ),
        ],
      ),
    );
    if (saved == true) {
      var text = ctl.text.trim();
      if (maxLength != null && text.length > maxLength) {
        text = text.substring(0, maxLength);
      }
      await userPrefSetString(ref.read(prefsProvider), key, text);
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
            child: const Text('取消'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.accentDeep,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('保存'),
          ),
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
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('密码已更新')));
          setState(() {});
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('$e')));
        }
      }
    }
  }

  void _openSettings() {
    // §24：说明型设置走 H5，与 iOS PWA 同稿
    context.push('/profile/settings');
  }

  Future<void> _openSupport() async {
    try {
      final tid = await ref
          .read(socialRepoProvider)
          .openDm(kOfficialSupportUserCode);
      if (!mounted) return;
      context.push('/discover/dm/$tid');
    } catch (_) {
      if (!mounted) return;
      context.push('/discover');
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('暂时无法直达客服，已打开消息页')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final auth = ref.watch(authControllerProvider);
    final prefs = ref.watch(prefsProvider);
    final todayMin = ref.watch(todayReadingProvider);
    final review = ref.watch(reviewDataProvider);
    final books = ref.watch(booksProvider).value ?? const <BibleBook>[];
    final thoughts = ref.watch(myThoughtsProvider);
    final highlights = ref
        .watch(highlightListProvider)
        .maybeWhen(data: (h) => h.length, orElse: () => 0);
    final badgeCount = ref
        .watch(badgesProvider)
        .maybeWhen(data: (b) => b.where((x) => x.done).length, orElse: () => 0);

    final name =
        userPrefGetString(prefs, 'onboarding_name') ??
        auth.displayName ??
        '读经伙伴';
    final bio = userPrefGetString(prefs, 'profile_bio') ?? '愿日日亲近主话';
    final userId = session.userId ?? session.guestId;
    final avatarId =
        _avatarOverride ??
        userPrefGetString(prefs, 'profile_avatar') ??
        defaultAvatarId(userId);

    final mins = todayMin.maybeWhen(data: (m) => m, orElse: () => 0);
    final streak = review.maybeWhen(
      data: (d) => readingStreak(d),
      orElse: () => 0,
    );
    var journeyPct = 0;
    review.whenData((data) {
      if (books.isEmpty) return;
      final totals = {for (final b in books) b.id: b.chapterCount};
      final allTime = data.bookProgress(totals);
      final readBooks = allTime.values
          .where((p) => p.distinctChapters > 0 || p.passes >= 1)
          .length;
      journeyPct = (readBooks / books.length * 100).round();
    });

    // 本周分钟
    var weekMins = 0;
    review.whenData((d) {
      final now = DateTime.now();
      final startW = now.subtract(Duration(days: now.weekday - 1));
      final startMs = DateTime(
        startW.year,
        startW.month,
        startW.day,
      ).millisecondsSinceEpoch;
      final endMs = DateTime(
        now.year,
        now.month,
        now.day,
        23,
        59,
      ).millisecondsSinceEpoch;
      weekMins = d.rangeStats(startMs, endMs).minutes;
    });

    final thoughtPreview = thoughts.isNotEmpty
        ? thoughts.first.body.trim()
        : '';
    String markPreview = '';
    final hl = ref
        .watch(highlightListProvider)
        .maybeWhen(data: (list) => list, orElse: () => const []);
    if (hl.isNotEmpty) {
      markPreview = hl.first.ref;
    }
    final doneBadges = ref
        .watch(badgesProvider)
        .maybeWhen(
          data: (b) => b.where((x) => x.done).take(3).toList(),
          orElse: () => const <BadgeDef>[],
        );

    final seen = readFootprintSeen(prefs);
    final thoughtNew = footprintHasNew(seen, 'thoughts', thoughts.length);
    final markNew = footprintHasNew(seen, 'marks', highlights);
    final badgeNew = footprintHasNew(seen, 'badges', badgeCount);

    final milestone = pendingStreakMilestone(prefs, streak);

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            // 顶栏：右侧 [分享][设置] 分组（分享在设置左边）
            Row(
              children: [
                const Spacer(),
                IconButton(
                  tooltip: '分享彼爱',
                  onPressed: () {
                    Share.share(
                      '彼爱 · 安静读经，在话语中相遇\nhttps://2sc.prestoai.cn',
                      subject: '彼爱',
                    );
                  },
                  icon: const Icon(Icons.ios_share_outlined, size: 22),
                ),
                IconButton(
                  tooltip: '设置',
                  onPressed: _openSettings,
                  icon: const Icon(Icons.settings_outlined, size: 22),
                ),
              ],
            ),
            const SizedBox(height: 4),
            // Hero
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onTap: () => _pickAvatar(avatarId),
                  child: ClipOval(child: AvatarBubble(id: avatarId, size: 72)),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        onTap: () => _editField(
                          title: '昵称',
                          key: 'onboarding_name',
                          current: name,
                        ),
                        child: Text(
                          name,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            height: 1.2,
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      GestureDetector(
                        onTap: () => _editField(
                          title: '个性签名',
                          key: 'profile_bio',
                          current: bio == '愿日日亲近主话' ? '' : bio,
                          maxLines: 2,
                          maxLength: 15,
                        ),
                        child: Text(
                          bio.isEmpty || bio == '愿日日亲近主话' ? '点击添加签名' : bio,
                          style: TextStyle(
                            color: AppColors.inkFaint,
                            fontSize: 14,
                            fontStyle: bio.isEmpty || bio == '愿日日亲近主话'
                                ? FontStyle.italic
                                : FontStyle.normal,
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      GestureDetector(
                        onTap: () => _copyId(userId),
                        child: Text(
                          _idCopied ? '已复制' : 'ID $userId',
                          style: TextStyle(
                            fontSize: 12,
                            color: _idCopied
                                ? AppColors.accentDeep
                                : AppColors.inkFaint,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (!auth.hasPassword) ...[
              const SizedBox(height: 14),
              PaperCard(
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        '建议设置密码，换机更方便',
                        style: TextStyle(
                          color: AppColors.inkSoft,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accentDeep,
                      ),
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                      ),
                      child: const Text('账号安全'),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            // 同行主卡（§5.5 · soft card 同构首页）
            PaperCard(
              tier: 2,
              tint: AppColors.accent,
              padding: const EdgeInsets.fromLTRB(18, 20, 16, 20),
              onTap: () {
                if (!openH5IfAllowed(context, '/report')) {
                  context.push('/report');
                }
              },
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (streak > 0) ...[
                          const Text(
                            '已同行',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.inkSoft,
                              letterSpacing: 0.4,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: '$streak',
                                  style: const TextStyle(
                                    fontSize: 36,
                                    fontWeight: FontWeight.w700,
                                    height: 1.05,
                                    letterSpacing: -0.4,
                                    color: AppColors.ink,
                                  ),
                                ),
                                const TextSpan(
                                  text: ' 天',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.inkSoft,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ] else
                          const Text(
                            '开始同行读经',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.3,
                            ),
                          ),
                        const SizedBox(height: 8),
                        Text(
                          '今日 $mins 分钟 · 本周 $weekMins 分钟',
                          style: const TextStyle(
                            color: AppColors.inkFaint,
                            fontSize: 13,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _JourneyRing(pct: journeyPct),
                ],
              ),
            ),
            if (milestone != null) ...[
              const SizedBox(height: 10),
              PaperCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '同行 $milestone 天 · 可分享这一刻',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                    TextButton(
                      onPressed: () async {
                        Share.share('我在彼爱已同行读经 $milestone 天。愿话语继续同行。');
                        await markStreakMilestoneShared(prefs, milestone!);
                        if (mounted) setState(() {});
                      },
                      child: const Text('分享'),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 20),
            const Text(
              '我的足迹',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.inkSoft,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 10),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.28,
              children: [
                _FootprintCell(
                  // 足迹入口统一用用户可理解的「笔记」；底层仍复用经文想法数据。
                  kind: '笔记',
                  count: thoughts.length,
                  value: thoughtPreview.isEmpty ? '写下第一句' : thoughtPreview,
                  empty: thoughtPreview.isEmpty,
                  isNew: thoughtNew,
                  onTap: () async {
                    await markFootprintSeen(prefs, 'thoughts', thoughts.length);
                    if (!context.mounted) return;
                    context.push('/notes');
                  },
                ),
                _FootprintCell(
                  kind: '划线',
                  count: highlights,
                  value: markPreview.isEmpty ? '去读经划线' : markPreview,
                  empty: markPreview.isEmpty,
                  isNew: markNew,
                  onTap: () async {
                    await markFootprintSeen(prefs, 'marks', highlights);
                    if (!context.mounted) return;
                    context.push('/notes?tab=highlights');
                  },
                ),
                _FootprintCell(
                  kind: '成就',
                  count: badgeCount,
                  value: badgeCount == 0 ? '去解锁第一枚' : '',
                  empty: badgeCount == 0,
                  hideValue: badgeCount > 0,
                  isNew: badgeNew,
                  badgeIcons: doneBadges.map((b) => b.icon).toList(),
                  onTap: () async {
                    await markFootprintSeen(prefs, 'badges', badgeCount);
                    if (!mounted) return;
                    ref.read(badgesProvider).whenData(_showBadgeGallery);
                    setState(() {});
                  },
                ),
                _FootprintCell(
                  kind: '旅程',
                  count: 0,
                  value: journeyPct > 0 ? '通读 $journeyPct% · 继续' : '开始通读计划',
                  empty: journeyPct == 0,
                  onTap: () => context.push('/plans'),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Text(
              '常用',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.inkSoft,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 10),
            _ShortcutTabs(
              onWarmup: () => context.push('/challenge'),
              onRemind: () => context.push('/profile/reminders'),
              onOffline: () => showOfflineDownloadSheet(context, ref),
              onRemindLongPress: () {
                showModalBottomSheet(
                  context: context,
                  backgroundColor: AppColors.paper,
                  shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(20),
                    ),
                  ),
                  builder: (_) => SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '提醒与勿扰',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _ReminderRow(prefs: prefs),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
            // 帮助/协议已迁入设置（与 PWA ProfileSettings 一致）
            if (auth.signedIn) ...[
              const SizedBox(height: 16),
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
            const SizedBox(height: 24),
            const Center(
              child: Text(
                '彼爱 · 安静读经',
                style: TextStyle(
                  fontSize: 12,
                  letterSpacing: 0.8,
                  color: AppColors.inkFaint,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _JourneyRing extends StatelessWidget {
  const _JourneyRing({required this.pct});
  final int pct;

  @override
  Widget build(BuildContext context) {
    final p = (pct.clamp(0, 100)) / 100.0;
    return SizedBox(
      width: 76,
      height: 76,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 76,
            height: 76,
            child: CircularProgressIndicator(
              value: p,
              strokeWidth: 6,
              backgroundColor: AppColors.line,
              color: AppColors.accentDeep,
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$pct',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  height: 1,
                  color: AppColors.ink,
                ),
              ),
              const Text(
                '%',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkFaint,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FootprintCell extends StatelessWidget {
  const _FootprintCell({
    required this.kind,
    required this.count,
    required this.value,
    required this.empty,
    required this.onTap,
    this.hideValue = false,
    this.isNew = false,
    this.badgeIcons = const [],
  });

  final String kind;
  final int count;
  final String value;
  final bool empty;
  final bool hideValue;
  final bool isNew;
  final List<String> badgeIcons;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      tier: 2,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                kind,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkFaint,
                ),
              ),
              if (isNew) ...[
                const SizedBox(width: 6),
                Container(
                  width: 7,
                  height: 7,
                  decoration: const BoxDecoration(
                    color: AppColors.accentDeep,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
              const Spacer(),
              if (count > 0)
                Text(
                  '$count',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkSoft,
                  ),
                ),
            ],
          ),
          const Spacer(),
          if (badgeIcons.isNotEmpty)
            Row(
              children: [
                for (final icon in badgeIcons.take(3))
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Text(icon, style: const TextStyle(fontSize: 18)),
                  ),
              ],
            )
          else if (!hideValue)
            Text(
              value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: empty ? 13 : 14,
                height: 1.35,
                fontWeight: empty ? FontWeight.w500 : FontWeight.w600,
                fontStyle: empty ? FontStyle.italic : FontStyle.normal,
                color: empty ? AppColors.inkFaint : AppColors.ink,
              ),
            ),
        ],
      ),
    );
  }
}

class _ShortcutTabs extends ConsumerStatefulWidget {
  const _ShortcutTabs({
    required this.onWarmup,
    required this.onRemind,
    required this.onOffline,
    this.onRemindLongPress,
  });

  final VoidCallback onWarmup;
  final VoidCallback onRemind;
  final VoidCallback onOffline;
  final VoidCallback? onRemindLongPress;

  @override
  ConsumerState<_ShortcutTabs> createState() => _ShortcutTabsState();
}

class _ShortcutTabsState extends ConsumerState<_ShortcutTabs> {
  /// challenge | remind | offline — 对齐 PWA 常用 tab 面板
  String _tab = 'challenge';

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    final installed = ref
        .watch(offlineInstalledProvider)
        .maybeWhen(data: (v) => v, orElse: () => false);
    final remindOn = NotifPrefs.dailyEnabled(prefs);
    final hour = NotifPrefs.dailyHour(prefs);
    final minute = NotifPrefs.dailyMinute(prefs);
    final timeLabel =
        '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              Expanded(
                child: _ShortcutTabItem(
                  label: '今日温习',
                  active: _tab == 'challenge',
                  onTap: () => setState(() => _tab = 'challenge'),
                ),
              ),
              Container(width: 1, height: 36, color: AppColors.line),
              Expanded(
                child: _ShortcutTabItem(
                  label: '提醒',
                  active: _tab == 'remind',
                  onTap: () => setState(() => _tab = 'remind'),
                  onLongPress: widget.onRemindLongPress,
                ),
              ),
              Container(width: 1, height: 36, color: AppColors.line),
              Expanded(
                child: _ShortcutTabItem(
                  label: '离线',
                  active: _tab == 'offline',
                  onTap: () => setState(() => _tab = 'offline'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        PaperCard(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_tab == 'challenge') ...[
                const Text(
                  '五道轻问，巩固读过的经文',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
                const SizedBox(height: 4),
                const Text(
                  '不是考试；答错后会优先再遇见',
                  style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accentDeep,
                      ),
                      onPressed: widget.onWarmup,
                      child: const Text('开始温习'),
                    ),
                    const SizedBox(width: 12),
                    TextButton(
                      onPressed: widget.onWarmup,
                      child: const Text('温习页 ›'),
                    ),
                  ],
                ),
              ] else if (_tab == 'remind') ...[
                Text(
                  remindOn ? '每日 $timeLabel 提醒你读经' : '读经提醒默认关闭',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  remindOn ? '轻声提醒，不制造落后感' : '需要时再打开，可随时关闭',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.inkFaint,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accentDeep,
                      ),
                      onPressed: widget.onRemind,
                      child: Text(remindOn ? '管理提醒' : '开启提醒'),
                    ),
                    const SizedBox(width: 12),
                    TextButton(
                      onPressed: widget.onRemind,
                      child: const Text('提醒与勿扰 ›'),
                    ),
                  ],
                ),
              ] else ...[
                Text(
                  installed ? '离线圣经已就绪' : '离线圣经未下载',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  installed ? '可在无网时继续读经；也可管理译本与资料' : '下载后无网也能读；资料包可按需管理',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.inkFaint,
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accentDeep,
                  ),
                  onPressed: widget.onOffline,
                  child: Text(installed ? '管理离线包' : '下载离线包'),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ShortcutTabItem extends StatelessWidget {
  const _ShortcutTabItem({
    required this.label,
    required this.onTap,
    this.onLongPress,
    this.active = false,
  });
  final String label;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: active ? AppColors.accentWash.withValues(alpha: 0.55) : null,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: active ? AppColors.accentDeep : AppColors.ink,
            ),
          ),
        ),
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
  })
  onEditField;
  final Future<void> Function() onChangePassword;
  final Future<void> Function(String id) onCopyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    final session = ref.watch(sessionProvider);
    final auth = ref.watch(authControllerProvider);
    final font = ref.watch(readerFontProvider);

    final name = userPrefGetString(prefs, 'onboarding_name') ?? '读经伙伴';
    final userId = session.userId ?? session.guestId;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.88,
        ),
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
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              '设置',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 18,
                color: AppColors.ink,
              ),
            ),
            const SizedBox(height: 16),
            _section('个人资料', [
              _row(
                '昵称',
                name,
                onTap: () => onEditField(
                  title: '昵称',
                  key: 'onboarding_name',
                  current: name,
                ),
              ),
            ]),
            const SizedBox(height: 12),
            _section('提醒', [_ReminderRow(prefs: prefs)]),
            const SizedBox(height: 12),
            _section('阅读', [
              _row(
                '外观',
                '主题与翻页',
                onTap: () {
                  Navigator.pop(context);
                  context.push('/profile/appearance');
                },
              ),
              _row(
                '知识库',
                '平台与专题资料',
                onTap: () {
                  Navigator.pop(context);
                  context.push('/knowledge-bases');
                },
              ),
              _row(
                '离线圣经',
                '下载和合本经包',
                onTap: () {
                  Navigator.pop(context);
                  showOfflineDownloadSheet(context, ref);
                },
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    const Text(
                      '字号',
                      style: TextStyle(color: AppColors.inkSoft),
                    ),
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
                              horizontal: 12,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: active
                                  ? AppColors.accentWash
                                  : AppColors.surface,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: active
                                    ? AppColors.accent
                                    : AppColors.line,
                              ),
                            ),
                            child: Text(
                              s.label,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: active
                                    ? AppColors.accentDeep
                                    : AppColors.inkSoft,
                              ),
                            ),
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
                  const Text(
                    '用户 ID',
                    style: TextStyle(color: AppColors.inkSoft),
                  ),
                  const Spacer(),
                  Text(
                    userId,
                    style: const TextStyle(color: AppColors.ink, fontSize: 13),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.copy, size: 16),
                    onPressed: () => onCopyId(userId),
                  ),
                ],
              ),
              _row('修改密码', '', onTap: onChangePassword),
              if (auth.signedIn)
                _row(
                  '退出登录',
                  '',
                  danger: true,
                  onTap: () =>
                      ref.read(authControllerProvider.notifier).logout(),
                ),
            ]),
            const SizedBox(height: 12),
            _section('关于', [
              const _InfoTile(label: '版本', value: '3.0.0 (Flutter)'),
              const SizedBox(height: 8),
              _InfoTile(label: '后端地址', value: AppConfig.baseUrl),
              const SizedBox(height: 8),
              _row(
                '数据与来源许可',
                '经文与资料出处',
                onTap: () {
                  Navigator.pop(context);
                  if (!openH5IfAllowed(context, '/profile/licenses')) {
                    context.push('/profile/licenses');
                  }
                },
              ),
              const SizedBox(height: 8),
              _row(
                '帮助中心',
                '使用说明与常见问题',
                onTap: () {
                  Navigator.pop(context);
                  if (!openH5IfAllowed(context, '/help')) {
                    context.push('/help');
                  }
                },
              ),
              const SizedBox(height: 8),
              _row(
                '隐私政策',
                '',
                onTap: () {
                  Navigator.pop(context);
                  openH5IfAllowed(context, '/privacy');
                },
              ),
              const SizedBox(height: 8),
              _row(
                '用户协议',
                '',
                onTap: () {
                  Navigator.pop(context);
                  openH5IfAllowed(context, '/terms');
                },
              ),
              const SizedBox(height: 8),
              _row(
                '提醒设置',
                '读经提醒',
                onTap: () {
                  Navigator.pop(context);
                  if (!openH5IfAllowed(context, '/profile/reminders')) {
                    context.push('/profile/reminders');
                  }
                },
              ),
              const SizedBox(height: 8),
              _row(
                '帮助与反馈',
                '官方客服私信',
                onTap: () async {
                  Navigator.pop(context);
                  try {
                    final tid = await ref
                        .read(socialRepoProvider)
                        .openDm(kOfficialSupportUserCode);
                    if (!context.mounted) return;
                    ref.read(navIndexProvider.notifier).set(3);
                    ref
                        .read(discoverH5PathProvider.notifier)
                        .go('/discover/dm/$tid');
                  } catch (_) {
                    if (!context.mounted) return;
                    ref.read(navIndexProvider.notifier).set(3);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('暂时无法直达客服，已打开消息页')),
                    );
                  }
                },
              ),
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
          Text(
            title,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.inkFaint,
            ),
          ),
          const SizedBox(height: 4),
          ...children,
        ],
      ),
    );
  }

  Widget _row(
    String label,
    String value, {
    VoidCallback? onTap,
    bool danger = false,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Text(
              label,
              style: TextStyle(
                color: danger ? const Color(0xFFB1554A) : AppColors.ink,
              ),
            ),
            const Spacer(),
            if (value.isNotEmpty)
              Flexible(
                child: Text(
                  value,
                  textAlign: TextAlign.right,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.inkFaint,
                    fontSize: 13,
                  ),
                ),
              ),
            if (onTap != null && !danger)
              const Padding(
                padding: EdgeInsets.only(left: 4),
                child: Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: AppColors.inkFaint,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ReminderRow extends ConsumerStatefulWidget {
  const _ReminderRow({required this.prefs});
  final SharedPreferences prefs;

  @override
  ConsumerState<_ReminderRow> createState() => _ReminderRowState();
}

class _ReminderRowState extends ConsumerState<_ReminderRow> {
  late bool _enabled;
  late bool _dnd;
  late TimeOfDay _time;

  @override
  void initState() {
    super.initState();
    _enabled = NotifPrefs.dailyEnabled(widget.prefs);
    _dnd = NotifPrefs.readingDnd(widget.prefs);
    _time = TimeOfDay(
      hour: NotifPrefs.dailyHour(widget.prefs),
      minute: NotifPrefs.dailyMinute(widget.prefs),
    );
  }

  Future<void> _toggle(bool on) async {
    if (on) {
      final ok = await NotificationService.instance.requestPermission();
      if (!ok && mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('请在系统设置中允许通知')));
        return;
      }
    }
    setState(() => _enabled = on);
    await NotifPrefs.setDailyEnabled(widget.prefs, on);
    if (on) {
      await NotificationService.instance.scheduleDaily(
        _time.hour,
        _time.minute,
      );
    } else {
      await NotificationService.instance.cancelDaily();
    }
  }

  Future<void> _toggleDnd(bool on) async {
    setState(() => _dnd = on);
    await NotifPrefs.setReadingDnd(widget.prefs, on);
    ref.read(readingDndEpochProvider.notifier).bump();
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time);
    if (picked == null) return;
    setState(() => _time = picked);
    await NotifPrefs.setDailyTime(
      widget.prefs,
      hour: picked.hour,
      minute: picked.minute,
    );
    if (_enabled) {
      await NotificationService.instance.scheduleDaily(
        picked.hour,
        picked.minute,
      );
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
                : '默认关闭 · 安静为主',
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
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('读经勿扰'),
          subtitle: const Text(
            '默认开启 · 圣经页不弹社交提示',
            style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
          ),
          value: _dnd,
          onChanged: _toggleDnd,
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
                Text(
                  '成就徽章',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                Text(
                  '已收集 $earned / ${widget.badges.length}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.inkFaint,
                  ),
                ),
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
                                      : AppColors.line,
                                ),
                              ),
                              child: Center(
                                child: Text(
                                  b.icon,
                                  style: const TextStyle(fontSize: 20),
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              b.label,
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: AppColors.ink,
                              ),
                            ),
                            Text(
                              b.desc,
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.inkFaint,
                              ),
                            ),
                            if (!b.done) ...[
                              Text(
                                b.hint,
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 9,
                                  color: AppColors.accentDeep,
                                ),
                              ),
                              Text(
                                b.progress,
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: AppColors.inkFaint,
                                ),
                              ),
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
              color: active ? AppColors.accentDeep : AppColors.line,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: active ? FontWeight.w600 : FontWeight.w400,
              color: active ? AppColors.accentDeep : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}
