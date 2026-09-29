/// 书架书目分享半屏：上半最近群/好友，下半系统分享（对齐 Web ShelfShareSheet）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/activity_log.dart';
import '../../core/api_client.dart';
import '../../core/badge_stats.dart';
import '../../core/config.dart';
import '../../core/share_card.dart';
import '../../core/theme.dart';
import '../../core/widgets/avatar_bubble.dart';
import '../social/social_repository.dart';
import 'shelf_repository.dart';

const _checkinBodyMax = 120;
const _sectionChips = [
  '读到这里很有感触 🙏',
  '完成本节 ✓',
  '愿与弟兄共勉',
];
const _bookChips = [
  '推荐一本好书 📖',
  '一起来读',
  '愿与弟兄共勉',
];

class _ShareTarget {
  const _ShareTarget.group({required this.id, required this.label})
      : kind = _ShareKind.group,
        peerId = null;
  const _ShareTarget.dm({required String peerId, required this.label})
      : kind = _ShareKind.dm,
        id = peerId,
        peerId = peerId;

  final _ShareKind kind;
  final String id;
  final String? peerId;
  final String label;

  String get key => kind == _ShareKind.group ? 'group:$id' : 'dm:$peerId';
}

enum _ShareKind { group, dm }

Future<void> showShelfShareSheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String bookTitle,
  String subtitle = '',
  String author = '',
  String? sectionId,
  String sectionTitle = '',
  int pageIndex = 0,
  String? presetGroupId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.paper,
    builder: (ctx) => _ShelfShareSheet(
      bookId: bookId,
      bookTitle: bookTitle,
      subtitle: subtitle,
      author: author,
      sectionId: sectionId,
      sectionTitle: sectionTitle,
      pageIndex: pageIndex,
      presetGroupId: presetGroupId,
      userCode: ref.read(sessionProvider).effectiveUserCode,
    ),
  );
}

String shelfBookShareUrl(String bookId, {String? userCode}) {
  final base = AppConfig.webBaseUrl.replaceAll(RegExp(r'/+$'), '');
  final id = bookId.trim();
  final code = (userCode ?? '').trim();
  final l3 = code.isNotEmpty ? 'shelf:$id.u:$code' : 'shelf:$id';
  return '$base/share/shelf/${Uri.encodeComponent(id)}?l1=share&l2=system_share&l3=$l3';
}

String _normalizeBody(String raw, {required bool bookShare}) {
  final t = raw.trim();
  if (t.isEmpty) return bookShare ? '一起来读' : '完成本节 ✓';
  return t.length > _checkinBodyMax ? t.substring(0, _checkinBodyMax) : t;
}

class _ShelfShareSheet extends ConsumerStatefulWidget {
  const _ShelfShareSheet({
    required this.bookId,
    required this.bookTitle,
    this.subtitle = '',
    this.author = '',
    this.sectionId,
    this.sectionTitle = '',
    this.pageIndex = 0,
    this.presetGroupId,
    this.userCode = '',
  });

  final String bookId;
  final String bookTitle;
  final String subtitle;
  final String author;
  final String? sectionId;
  final String sectionTitle;
  final int pageIndex;
  final String? presetGroupId;
  final String userCode;

  @override
  ConsumerState<_ShelfShareSheet> createState() => _ShelfShareSheetState();
}

class _ShelfShareSheetState extends ConsumerState<_ShelfShareSheet> {
  var _busy = false;
  var _showMore = false;
  String? _err;
  _ShareTarget? _selected;
  final _body = TextEditingController();

  bool get _bookShare =>
      widget.sectionId == null || widget.sectionId!.trim().isEmpty;

  String get _title =>
      widget.bookTitle.trim().isEmpty ? '推荐书目' : widget.bookTitle.trim();

  String get _meta {
    final author = widget.author.trim();
    final subtitle = widget.subtitle.trim();
    return [
      if (author.isNotEmpty) '作者 $author',
      if (subtitle.isNotEmpty) subtitle,
    ].join(' · ');
  }

  String get _ref => _bookShare
      ? shelfBookShareRef(widget.bookId)
      : shelfCheckinRef(widget.bookId, widget.sectionId!, widget.pageIndex);

  List<String> get _chips => _bookShare ? _bookChips : _sectionChips;

  String get _dmDefaultBody {
    if (!_bookShare) {
      return shelfCheckinLabel(widget.bookTitle, widget.sectionTitle);
    }
    final url = shelfBookShareUrl(widget.bookId, userCode: widget.userCode);
    final meta = _meta;
    return [
      '彼爱推荐一本好书《$_title》',
      if (meta.isNotEmpty) meta,
      '打开后保存到主屏幕，在彼爱一起读。',
      url,
    ].join('\n');
  }

  @override
  void initState() {
    super.initState();
    final preset = widget.presetGroupId?.trim();
    if (preset != null && preset.isNotEmpty) {
      _selected = _ShareTarget.group(id: preset, label: '共读群');
    }
  }

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  List<_ShareTarget> _recentFrom(
    List<ConversationItem> items,
    List<Friend> friends,
  ) {
    final friendById = {for (final f in friends) f.userId: f};
    final out = <_ShareTarget>[];
    for (final it in items) {
      if (it.scope == 'dm' && (it.peerUserId ?? '').isNotEmpty) {
        final peer = it.peerUserId!;
        final fr = friendById[peer];
        out.add(_ShareTarget.dm(
          peerId: peer,
          label: fr?.name ?? (it.title.isNotEmpty ? it.title : '私信'),
        ));
      } else if (it.scope == 'group') {
        out.add(_ShareTarget.group(
          id: it.refId,
          label: it.title.isNotEmpty ? it.title : '共读群',
        ));
      }
      if (out.length >= 8) break;
    }
    return out;
  }

  Future<void> _shareSystem() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final url = shelfBookShareUrl(widget.bookId, userCode: widget.userCode);
      final meta = _meta;
      final body = meta.isNotEmpty ? meta : '在彼爱书架，安静读完这一本。';
      final shareText = [
        '彼爱推荐一本好书《$_title》',
        if (meta.isNotEmpty) meta,
        '打开后保存到主屏幕，在彼爱一起读。',
        url,
      ].join('\n');
      final ok = await shareBrandCard(
        context,
        ShareCardInput(
          title: '《$_title》',
          subtitle:
              widget.author.trim().isNotEmpty ? widget.author.trim() : '书架推荐',
          body: body,
          badge: '书架',
          day: 6,
          shareText: shareText,
          shareUrl: url,
          subject: '《$_title》｜彼爱',
        ),
      );
      if (ok && mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) setState(() => _err = '分享失败');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send(_ShareTarget target) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final repo = ref.read(socialRepoProvider);
      if (target.kind == _ShareKind.group) {
        await repo.checkin(
          target.id,
          ref: _ref,
          body: _normalizeBody(_body.text, bookShare: _bookShare),
        );
        ref
            .read(badgeStatsRecorderProvider)
            .recordGroupCheckin(groupId: target.id);
      } else {
        final peer = target.peerId!;
        final threadId = await repo.openDm(peer);
        final text = _body.text.trim().isEmpty
            ? _dmDefaultBody
            : _body.text.trim();
        await repo.sendDm(threadId, text);
      }
      await logShelfCheckin(
        // ignore: argument_type_not_assignable — WidgetRef / Ref 仓库既有用法
        ref,
        widget.bookId,
        sectionId: widget.sectionId,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _err = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final convAsync = ref.watch(conversationsProvider);
    final friendsAsync = ref.watch(friendsProvider);
    final groupsAsync = ref.watch(myGroupsProvider);

    final friends = friendsAsync.maybeWhen(
      data: (v) => v,
      orElse: () => const <Friend>[],
    );
    final recent = convAsync.when(
      data: (items) => _recentFrom(items, friends),
      loading: () => const <_ShareTarget>[],
      error: (_, _) => const <_ShareTarget>[],
    );

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: _showMore
            ? _buildMore(groupsAsync, friendsAsync)
            : _buildMain(recent, convAsync.isLoading),
      ),
    );
  }

  Widget _buildMain(List<_ShareTarget> recent, bool loadingRecent) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          '分享书籍',
          textAlign: TextAlign.center,
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        const SizedBox(height: 16),
        Text(
          '《$_title》',
          style: const TextStyle(
            fontSize: 14,
            height: 1.55,
            color: AppColors.inkSoft,
          ),
        ),
        if (_meta.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            _meta,
            style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
          ),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            const Text(
              '最近',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.inkFaint,
              ),
            ),
            const Spacer(),
            TextButton(
              onPressed: _busy ? null : () => setState(() => _showMore = true),
              child: const Text('更多'),
            ),
          ],
        ),
        if (loadingRecent)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: LinearProgressIndicator(),
          )
        else if (recent.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text(
              '暂无最近会话，点「更多」选择群或好友。',
              style: TextStyle(fontSize: 13, color: AppColors.inkFaint),
            ),
          )
        else
          SizedBox(
            height: 92,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: recent.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (ctx, i) {
                final t = recent[i];
                final on = _selected?.key == t.key;
                return _RecentChip(
                  target: t,
                  selected: on,
                  onTap: _busy
                      ? null
                      : () => setState(() {
                            _selected = on ? null : t;
                          }),
                );
              },
            ),
          ),
        if (_selected != null) ...[
          const SizedBox(height: 12),
          if (_selected!.kind == _ShareKind.group)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final chip in _chips)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(chip, style: const TextStyle(fontSize: 12)),
                        selected: _body.text == chip,
                        onSelected: _busy
                            ? null
                            : (v) => setState(() {
                                  _body.text = v ? chip : '';
                                }),
                      ),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _body,
                  enabled: !_busy,
                  maxLength: _checkinBodyMax,
                  decoration: InputDecoration(
                    hintText: _selected!.kind == _ShareKind.group
                        ? '附言（可选）'
                        : '留言（可选，默认分享文案）',
                    counterText: '',
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _busy ? null : () => _send(_selected!),
                child: Text(_busy ? '…' : '发送'),
              ),
            ],
          ),
        ],
        const SizedBox(height: 18),
        const Divider(height: 1),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _shareSystem,
          child: Text(_busy && _selected == null ? '准备中…' : '系统分享'),
        ),
        const SizedBox(height: 6),
        const Text(
          '微信、短信等其它应用',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
        ),
        if (_err != null) ...[
          const SizedBox(height: 8),
          Text(
            _err!,
            style: const TextStyle(color: AppColors.inkSoft, fontSize: 13),
          ),
        ],
      ],
    );
  }

  Widget _buildMore(
    AsyncValue<List<Group>> groupsAsync,
    AsyncValue<List<Friend>> friendsAsync,
  ) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            TextButton(
              onPressed: _busy ? null : () => setState(() => _showMore = false),
              child: const Text('返回'),
            ),
            const Expanded(
              child: Text(
                '选择群或好友',
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ),
            const SizedBox(width: 48),
          ],
        ),
        const SizedBox(height: 8),
        ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.45,
          ),
          child: ListView(
            shrinkWrap: true,
            children: [
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  '共读群',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkFaint,
                  ),
                ),
              ),
              groupsAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text('$e'),
                data: (list) {
                  if (list.isEmpty) {
                    return const Text(
                      '暂无共读群',
                      style: TextStyle(color: AppColors.inkFaint, fontSize: 13),
                    );
                  }
                  return Column(
                    children: list
                        .map(
                          (g) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: ClipOval(
                              child: AvatarBubble(
                                id: defaultAvatarId(g.id),
                                size: 40,
                              ),
                            ),
                            title: Text(g.name),
                            onTap: _busy
                                ? null
                                : () {
                                    setState(() {
                                      _selected = _ShareTarget.group(
                                        id: g.id,
                                        label: g.name,
                                      );
                                      _showMore = false;
                                    });
                                  },
                          ),
                        )
                        .toList(),
                  );
                },
              ),
              const Padding(
                padding: EdgeInsets.only(top: 12, bottom: 6),
                child: Text(
                  '好友',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkFaint,
                  ),
                ),
              ),
              friendsAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text('$e'),
                data: (list) {
                  if (list.isEmpty) {
                    return const Text(
                      '暂无好友',
                      style: TextStyle(color: AppColors.inkFaint, fontSize: 13),
                    );
                  }
                  return Column(
                    children: list
                        .map(
                          (f) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: ClipOval(
                              child: AvatarBubble(
                                id: defaultAvatarId(f.userId),
                                size: 40,
                              ),
                            ),
                            title: Text(f.name),
                            subtitle: const Text(
                              '私信',
                              style: TextStyle(fontSize: 12),
                            ),
                            onTap: _busy
                                ? null
                                : () {
                                    setState(() {
                                      _selected = _ShareTarget.dm(
                                        peerId: f.userId,
                                        label: f.name,
                                      );
                                      _showMore = false;
                                    });
                                  },
                          ),
                        )
                        .toList(),
                  );
                },
              ),
            ],
          ),
        ),
        if (_err != null) ...[
          const SizedBox(height: 8),
          Text(
            _err!,
            style: const TextStyle(color: AppColors.inkSoft, fontSize: 13),
          ),
        ],
      ],
    );
  }
}

class _RecentChip extends StatelessWidget {
  const _RecentChip({
    required this.target,
    required this.selected,
    this.onTap,
  });

  final _ShareTarget target;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final seed = target.kind == _ShareKind.group
        ? target.id
        : (target.peerId ?? target.id);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: 64,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: selected
                        ? Border.all(color: AppColors.accentDeep, width: 2)
                        : null,
                  ),
                  child: ClipOval(
                    child: AvatarBubble(id: defaultAvatarId(seed), size: 48),
                  ),
                ),
                if (selected)
                  Positioned(
                    right: -2,
                    top: -2,
                    child: Container(
                      width: 18,
                      height: 18,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(
                        color: AppColors.accentDeep,
                        shape: BoxShape.circle,
                      ),
                      child: const Text(
                        '✓',
                        style: TextStyle(color: Colors.white, fontSize: 11),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              target.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11, color: AppColors.inkSoft),
            ),
          ],
        ),
      ),
    );
  }
}
