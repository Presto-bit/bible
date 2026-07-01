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
  GroupTask({required this.id, required this.title, this.ref});
  final String id;
  final String title;
  final String? ref;
  factory GroupTask.fromJson(Map<String, dynamic> j) =>
      GroupTask(id: j['id'] as String, title: j['title'] as String, ref: j['ref'] as String?);
}

class GroupMember {
  GroupMember({required this.name, required this.role});
  final String name;
  final String role;
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
  });
  final String id;
  final String name;
  final String? intro;
  final String? joinCode;
  final String role;
  final List<GroupMember> members;
  final List<GroupTask> tasks;
  bool get isOwner => role == 'owner';

  factory GroupDetail.fromJson(Map<String, dynamic> j) => GroupDetail(
        id: j['id'] as String,
        name: j['name'] as String,
        intro: j['intro'] as String?,
        joinCode: j['join_code'] as String?,
        role: (j['role'] ?? 'member') as String,
        members: ((j['members'] ?? []) as List)
            .map((m) => GroupMember(
                name: (m['name'] ?? '匿名') as String, role: m['role'] as String))
            .toList(),
        tasks: ((j['tasks'] ?? []) as List)
            .map((t) => GroupTask.fromJson(t as Map<String, dynamic>))
            .toList(),
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
