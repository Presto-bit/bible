/// 首页群/共读文案（对齐 Web `home_group_line.ts` / `home_social_line.ts`）。
library;

import '../social/social_repository.dart';

class HomeGroupRailInput {
  const HomeGroupRailInput({
    required this.title,
    required this.sub,
    required this.href,
    this.statLabel,
  });

  final String title;
  final String sub;
  final String href;
  final String? statLabel;
}

class _HomeGroupLine {
  const _HomeGroupLine({
    required this.status,
    required this.name,
    required this.title,
    required this.href,
    this.pending = false,
    this.statLabel,
  });

  final String status;
  final String name;
  final String title;
  final String href;
  final bool pending;
  final String? statLabel;
}

Group? _pickFocusGroup(
  List<Group> groups,
  Map<String, dynamic>? summary,
) {
  if (groups.isEmpty) return null;
  final pendingId = summary?['first_pending_group_id'] as String?;
  if (pendingId != null && pendingId.isNotEmpty) {
    for (final g in groups) {
      if (g.id == pendingId) return g;
    }
  }
  for (final g in groups) {
    if (!g.myCheckedInToday) return g;
  }
  for (final g in groups) {
    if (g.openTasks > 0) return g;
  }
  return groups.first;
}

_HomeGroupLine? _formatHomeGroupLine(
  List<Group> groups,
  Map<String, dynamic>? summary,
) {
  if (groups.isEmpty) return null;
  final g = _pickFocusGroup(groups, summary);
  if (g == null) return null;

  final members = g.members > 0 ? g.members : 1;
  final checked = g.checkedInToday;
  final statLabel = members > 0 ? '$checked/$members' : null;

  if (!g.myCheckedInToday) {
    return _HomeGroupLine(
      status: '等你打卡',
      name: g.name,
      title: '${g.name} · 等你打卡',
      href: '/discover/group/${g.id}?focus=checkin',
      pending: true,
      statLabel: statLabel,
    );
  }

  if (g.openTasks > 0) {
    return _HomeGroupLine(
      status: '${g.openTasks} 个任务',
      name: g.name,
      title: '${g.name} · ${g.openTasks} 个任务',
      href: '/discover/group/${g.id}',
      pending: true,
      statLabel: statLabel,
    );
  }

  if (checked > 0) {
    return _HomeGroupLine(
      status: '今日 $checked 人打卡',
      name: g.name,
      title: '${g.name} · 今日 $checked 人打卡',
      href: '/discover/group/${g.id}',
      statLabel: statLabel,
    );
  }

  return _HomeGroupLine(
    status: '今日已打卡',
    name: g.name,
    title: '${g.name} · 今日已打卡',
    href: '/discover/group/${g.id}',
    statLabel: statLabel,
  );
}

({String title, String href})? _formatFriendsCheckedLine(
  Map<String, dynamic>? summary,
) {
  final n = (summary?['friends_checked_in_today'] as num?)?.toInt() ?? 0;
  if (n <= 0) return null;
  return (title: '今天 $n 位好友已打卡', href: '/discover');
}

/// 共读侧卡输入：与 PWA `buildHomeGroupRailInput` 一致。
HomeGroupRailInput buildHomeGroupRailInput(
  List<Group> groups,
  Map<String, dynamic>? summary,
) {
  if (groups.isEmpty) {
    return const HomeGroupRailInput(
      title: '创建共读',
      sub: '创建或加入',
      href: '/discover',
    );
  }

  final line = _formatHomeGroupLine(groups, summary);
  if (line != null && line.pending && line.status == '等你打卡') {
    return HomeGroupRailInput(
      title: '今日待打卡',
      sub: line.name,
      href: line.href,
      statLabel: line.statLabel,
    );
  }
  if (line != null && line.pending && line.status.contains('任务')) {
    return HomeGroupRailInput(
      title: line.status,
      sub: line.name,
      href: line.href,
      statLabel: line.statLabel,
    );
  }

  final friends = _formatFriendsCheckedLine(summary);
  if (friends != null && line != null && !line.pending) {
    return HomeGroupRailInput(
      title: friends.title.replaceFirst(RegExp(r'^今天\s*'), ''),
      sub: '看看动态',
      href: friends.href,
    );
  }

  if (line != null) {
    return HomeGroupRailInput(
      title: line.status,
      sub: line.name,
      href: line.href,
      statLabel: line.statLabel,
    );
  }

  final primary = groups.first;
  return HomeGroupRailInput(
    title: primary.name,
    sub: '今日已打卡',
    href: '/discover/group/${primary.id}',
  );
}
