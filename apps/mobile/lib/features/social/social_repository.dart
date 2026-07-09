/// 社交仓库：共读群（打卡/任务）+ 好友。对接后端 /social/*。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class Group {
  Group({
    required this.id,
    required this.name,
    this.intro,
    this.joinCode,
    required this.role,
    this.members = 0,
  });
  final String id;
  final String name;
  final String? intro;
  final String? joinCode;
  final String role;
  final int members;

  bool get isOwner => role == 'owner';

  factory Group.fromJson(Map<String, dynamic> j) => Group(
        id: j['id'] as String,
        name: j['name'] as String,
        intro: j['intro'] as String?,
        joinCode: j['join_code'] as String?,
        role: (j['role'] ?? 'member') as String,
        members: (j['members'] ?? 0) as int,
      );
}

class GroupTask {
  GroupTask({
    required this.id,
    required this.title,
    this.ref,
    this.dueAt,
    this.completed = false,
    this.pinned = false,
  });
  final String id;
  final String title;
  final String? ref;
  final String? dueAt;
  final bool completed;
  final bool pinned;
  factory GroupTask.fromJson(Map<String, dynamic> j) => GroupTask(
        id: j['id'] as String,
        title: j['title'] as String,
        ref: j['ref'] as String?,
        dueAt: j['due_at'] as String?,
        completed: (j['completed'] ?? false) as bool,
        pinned: (j['pinned'] ?? false) as bool,
      );
}

class GroupMember {
  GroupMember({
    required this.userId,
    required this.name,
    required this.role,
    this.checkedInToday = false,
    this.isMe = false,
    this.planDay = 0,
    this.avatarId,
  });
  final String userId;
  final String name;
  final String role;
  final bool checkedInToday;
  final bool isMe;
  final int planDay;
  final String? avatarId;

  factory GroupMember.fromJson(Map<String, dynamic> j) => GroupMember(
        userId: (j['user_id'] ?? '') as String,
        name: (j['name'] ?? '匿名') as String,
        role: (j['role'] ?? 'member') as String,
        checkedInToday: (j['checked_in_today'] ?? false) as bool,
        isMe: (j['is_me'] ?? false) as bool,
        planDay: (j['plan_day'] ?? 0) as int,
        avatarId: j['avatar_id'] as String?,
      );
}

class GroupDetail {
  GroupDetail({
    required this.id,
    required this.name,
    this.intro,
    this.joinCode,
    required this.role,
    required this.members,
    required this.tasks,
    this.planId,
    this.planTitle,
    this.announcement,
    this.myCheckedInToday = false,
    this.checkedInToday = 0,
    this.memberCount = 0,
    this.myPlanDay = 0,
    this.planDaysTotal = 0,
    this.planProgressPct = 0,
    this.pinnedTaskId,
  });
  final String id;
  final String name;
  final String? intro;
  final String? joinCode;
  final String role;
  final List<GroupMember> members;
  final List<GroupTask> tasks;
  final String? planId;
  final String? planTitle;
  final String? announcement;
  final bool myCheckedInToday;
  final int checkedInToday;
  final int memberCount;
  final int myPlanDay;
  final int planDaysTotal;
  final int planProgressPct;
  final String? pinnedTaskId;
  bool get isOwner => role == 'owner';

  int get pendingCount =>
      (memberCount > 0 ? memberCount : members.length) - checkedInToday;

  int get checkinPct {
    final total = memberCount > 0 ? memberCount : members.length;
    if (total <= 0) return 0;
    return ((checkedInToday / total) * 100).round();
  }

  factory GroupDetail.fromJson(Map<String, dynamic> j) => GroupDetail(
        id: j['id'] as String,
        name: j['name'] as String,
        intro: j['intro'] as String?,
        joinCode: j['join_code'] as String?,
        role: (j['role'] ?? 'member') as String,
        members: ((j['members'] ?? []) as List)
            .map((m) => GroupMember.fromJson(m as Map<String, dynamic>))
            .toList(),
        tasks: ((j['tasks'] ?? []) as List)
            .map((t) => GroupTask.fromJson(t as Map<String, dynamic>))
            .toList(),
        planId: j['plan_id'] as String?,
        planTitle: j['plan_title'] as String?,
        announcement: j['announcement'] as String?,
        myCheckedInToday: (j['my_checked_in_today'] ?? false) as bool,
        checkedInToday: (j['checked_in_today'] ?? 0) as int,
        memberCount: ((j['members'] as List?)?.length ?? 0),
        myPlanDay: (j['my_plan_day'] ?? 0) as int,
        planDaysTotal: (j['plan_days_total'] ?? 0) as int,
        planProgressPct: (j['plan_progress_pct'] ?? 0) as int,
        pinnedTaskId: j['pinned_task_id'] as String?,
      );
}

class GroupMessage {
  GroupMessage({
    required this.id,
    required this.author,
    required this.mine,
    required this.kind,
    this.ref,
    this.body,
    required this.reactions,
    required this.createdAt,
  });
  final String id;
  final String author;
  final bool mine;
  final String kind;
  final String? ref;
  final String? body;
  final Map<String, List<String>> reactions;
  final DateTime createdAt;

  factory GroupMessage.fromJson(Map<String, dynamic> j) => GroupMessage(
        id: j['id'] as String,
        author: (j['author'] ?? '匿名') as String,
        mine: (j['mine'] ?? false) as bool,
        kind: (j['kind'] ?? 'checkin') as String,
        ref: j['ref'] as String?,
        body: j['body'] as String?,
        reactions: ((j['reactions'] ?? {}) as Map).map(
            (k, v) => MapEntry(k as String, (v as List).cast<String>())),
        createdAt: DateTime.tryParse(j['created_at'] as String? ?? '') ??
            DateTime.now(),
      );
}

class Friend {
  Friend({required this.userId, this.handle, this.displayName});
  final String userId;
  final String? handle;
  final String? displayName;
  String get name => displayName ?? handle ?? userId;
  factory Friend.fromJson(Map<String, dynamic> j) => Friend(
        userId: j['user_id'] as String,
        handle: j['handle'] as String?,
        displayName: j['display_name'] as String?,
      );
}

class GroupInvite {
  GroupInvite({
    required this.id,
    required this.groupId,
    required this.groupName,
    this.inviterName,
    this.message,
  });
  final String id;
  final String groupId;
  final String groupName;
  final String? inviterName;
  final String? message;
  factory GroupInvite.fromJson(Map<String, dynamic> j) => GroupInvite(
        id: j['id'] as String,
        groupId: j['group_id'] as String,
        groupName: (j['group_name'] ?? '') as String,
        inviterName: j['inviter_name'] as String?,
        message: j['message'] as String?,
      );
}

class SocialRepository {
  SocialRepository(this._dio);
  final Dio _dio;

  Future<List<Group>> myGroups() async {
    final res = await _dio.get('/social/groups');
    return ((res.data['groups'] ?? []) as List)
        .map((e) => Group.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Group> createGroup(String name, {String? intro}) async {
    final res = await _dio.post('/social/groups',
        data: {'name': name, 'intro': ?intro});
    return Group.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Group> joinGroup(String code) async {
    final res =
        await _dio.post('/social/groups/join', data: {'join_code': code});
    return Group.fromJson(res.data as Map<String, dynamic>);
  }

  Future<GroupDetail> detail(String gid) async {
    final res = await _dio.get('/social/groups/$gid');
    return GroupDetail.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<GroupMessage>> feed(String gid) async {
    final res = await _dio.get('/social/groups/$gid/feed');
    return ((res.data['messages'] ?? []) as List)
        .map((e) => GroupMessage.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> checkin(String gid, {String? ref, String? taskId, String? body}) =>
      _dio.post('/social/groups/$gid/checkin',
          data: {'ref': ref, 'task_id': taskId, 'body': body});

  Future<GroupTask> createTask(String gid, String title, {String? ref}) async {
    final res = await _dio.post('/social/groups/$gid/tasks',
        data: {'title': title, 'ref': ?ref});
    return GroupTask.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Map<String, List<String>>> react(String mid, String emoji) async {
    final res = await _dio.post('/social/messages/$mid/react', data: {'emoji': emoji});
    return ((res.data['reactions'] ?? {}) as Map)
        .map((k, v) => MapEntry(k as String, (v as List).cast<String>()));
  }

  Future<Map<String, dynamic>> reportMessage(String mid, {String? reason}) async {
    final res = await _dio.post('/social/messages/$mid/report',
        data: {'reason': reason});
    return (res.data as Map).cast<String, dynamic>();
  }

  Future<void> deleteMessage(String mid) =>
      _dio.delete('/social/messages/$mid');

  Future<List<Friend>> friends() async {
    final res = await _dio.get('/social/friends');
    return ((res.data['friends'] ?? []) as List)
        .map((e) => Friend.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Friend> addFriend(String handle) async {
    final res = await _dio.post('/social/friends', data: {'handle': handle});
    return Friend(
        userId: res.data['friend_id'] as String,
        displayName: res.data['display_name'] as String?);
  }

  Future<List<GroupInvite>> inviteInbox() async {
    final res = await _dio.get('/social/invites/inbox');
    return ((res.data['invites'] ?? []) as List)
        .map((e) => GroupInvite.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Group> acceptInvite(String inviteId) async {
    final res = await _dio.post('/social/invites/$inviteId/accept');
    return Group(
      id: res.data['group_id'] as String,
      name: res.data['name'] as String,
      role: 'member',
    );
  }

  Future<void> declineInvite(String inviteId) =>
      _dio.post('/social/invites/$inviteId/decline');

  Future<void> bindPlan(String gid, String? planId) => _dio.patch(
        '/social/groups/$gid',
        data: planId == null ? {'clear_plan': true} : {'plan_id': planId},
      );

  Future<Group> createGroupFromPlan(String planId, {String? name}) async {
    final res = await _dio.post('/social/groups/from-plan', data: {
      'plan_id': planId,
      if (name != null) 'name': name,
    });
    return Group.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> shareToGroup(String gid, {String? ref, String? body}) =>
      _dio.post('/social/groups/$gid/checkin', data: {
        if (ref != null) 'ref': ref,
        if (body != null) 'body': body,
      });

  Future<void> publishShare({String? ref, required String body, String kind = 'verse'}) =>
      _dio.post('/social/shares', data: {
        if (ref != null) 'ref': ref,
        'body': body,
        'kind': kind,
      });

  Future<int> sendGroupInvites(String gid, List<String> friendIds) async {
    final res = await _dio.post('/social/groups/$gid/invites',
        data: {'friend_ids': friendIds});
    return (res.data['sent'] ?? 0) as int;
  }

  Future<List<String>> groupPendingInviteIds(String gid) async {
    final res = await _dio.get('/social/groups/$gid/invites/pending');
    return ((res.data['friend_ids'] ?? []) as List).cast<String>();
  }

  Future<void> cancelGroupInvite(String gid, String friendId) =>
      _dio.delete('/social/groups/$gid/invites/$friendId');

  Future<void> updateGroup(
    String gid, {
    String? name,
    String? announcement,
    String? planId,
    bool clearPlan = false,
  }) =>
      _dio.patch('/social/groups/$gid', data: {
        if (name != null) 'name': name,
        if (announcement != null) 'announcement': announcement,
        if (clearPlan) 'clear_plan': true,
        if (planId != null) 'plan_id': planId,
      });

  Future<Map<String, dynamic>> discoverSummary() async {
    final res = await _dio.get('/social/discover/summary');
    return (res.data as Map).cast<String, dynamic>();
  }
}

final socialRepoProvider =
    Provider<SocialRepository>((ref) => SocialRepository(ref.read(dioProvider)));

final myGroupsProvider = FutureProvider<List<Group>>(
    (ref) => ref.read(socialRepoProvider).myGroups());

final friendsProvider =
    FutureProvider<List<Friend>>((ref) => ref.read(socialRepoProvider).friends());

final groupFeedProvider = FutureProvider.family<List<GroupMessage>, String>(
    (ref, gid) => ref.read(socialRepoProvider).feed(gid));

final groupDetailProvider = FutureProvider.family<GroupDetail, String>(
    (ref, gid) => ref.read(socialRepoProvider).detail(gid));

final groupInvitesProvider = FutureProvider<List<GroupInvite>>(
    (ref) => ref.read(socialRepoProvider).inviteInbox());

final discoverSummaryProvider = FutureProvider<Map<String, dynamic>>(
    (ref) => ref.read(socialRepoProvider).discoverSummary());
