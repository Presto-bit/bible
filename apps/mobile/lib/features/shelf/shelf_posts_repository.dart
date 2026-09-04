/// 书架书评 / 公开笔记 API（对齐 Web shelf_posts.ts）。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

final shelfPostsRepoProvider = Provider<ShelfPostsRepository>((ref) {
  return ShelfPostsRepository(ref.watch(dioProvider));
});

enum ShelfPostVisibility { public, friends, private }

enum ShelfPostKind { review, note }

extension ShelfPostVisibilityApi on ShelfPostVisibility {
  String get apiValue => name;
}

class ShelfPostAuthor {
  const ShelfPostAuthor({required this.id, required this.name});

  final String id;
  final String name;

  factory ShelfPostAuthor.fromJson(Map<String, dynamic> j) => ShelfPostAuthor(
        id: '${j['id'] ?? ''}',
        name: '${j['name'] ?? '读者'}',
      );
}

class ShelfPostReply {
  const ShelfPostReply({
    required this.id,
    required this.postId,
    required this.body,
    required this.author,
    this.createdAt,
  });

  final String id;
  final String postId;
  final String body;
  final ShelfPostAuthor author;
  final String? createdAt;

  factory ShelfPostReply.fromJson(Map<String, dynamic> j) => ShelfPostReply(
        id: '${j['id'] ?? ''}',
        postId: '${j['post_id'] ?? ''}',
        body: '${j['body'] ?? ''}',
        createdAt: j['created_at'] as String?,
        author: ShelfPostAuthor.fromJson(
          Map<String, dynamic>.from(j['author'] as Map? ?? const {}),
        ),
      );
}

class ShelfPost {
  const ShelfPost({
    required this.id,
    required this.bookId,
    required this.userId,
    required this.kind,
    required this.ref,
    required this.body,
    required this.visibility,
    required this.author,
    this.abstractText,
    this.sectionId,
    this.pageIndex,
    this.spanStart,
    this.spanEnd,
    this.readStatus,
    this.likesCount = 0,
    this.repliesCount = 0,
    this.createdAt,
    this.liked = false,
    this.replies = const [],
  });

  final String id;
  final String bookId;
  final String userId;
  final ShelfPostKind kind;
  final String ref;
  final String body;
  final String? abstractText;
  final ShelfPostVisibility visibility;
  final String? sectionId;
  final int? pageIndex;
  final int? spanStart;
  final int? spanEnd;
  final String? readStatus;
  final int likesCount;
  final int repliesCount;
  final String? createdAt;
  final bool liked;
  final ShelfPostAuthor author;
  final List<ShelfPostReply> replies;

  factory ShelfPost.fromJson(Map<String, dynamic> j) {
    final visRaw = '${j['visibility'] ?? 'public'}';
    final visibility = ShelfPostVisibility.values.firstWhere(
      (v) => v.name == visRaw,
      orElse: () => ShelfPostVisibility.public,
    );
    final kindRaw = '${j['kind'] ?? 'note'}';
    final kind = kindRaw == 'review' ? ShelfPostKind.review : ShelfPostKind.note;
    return ShelfPost(
      id: '${j['id'] ?? ''}',
      bookId: '${j['book_id'] ?? ''}',
      userId: '${j['user_id'] ?? ''}',
      kind: kind,
      ref: '${j['ref'] ?? ''}',
      body: '${j['body'] ?? ''}',
      abstractText: j['abstract'] as String?,
      visibility: visibility,
      sectionId: j['section_id'] as String?,
      pageIndex: (j['page_index'] as num?)?.toInt(),
      spanStart: (j['span_start'] as num?)?.toInt(),
      spanEnd: (j['span_end'] as num?)?.toInt(),
      readStatus: j['read_status'] as String?,
      likesCount: (j['likes_count'] as num?)?.toInt() ?? 0,
      repliesCount: (j['replies_count'] as num?)?.toInt() ?? 0,
      createdAt: j['created_at'] as String?,
      liked: j['liked'] == true,
      author: ShelfPostAuthor.fromJson(
        Map<String, dynamic>.from(j['author'] as Map? ?? const {}),
      ),
      replies: (j['replies'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map((e) => ShelfPostReply.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class ShelfPostList {
  const ShelfPostList({required this.items, required this.stats});

  final List<ShelfPost> items;
  final ({int reviews, int notes}) stats;
}

String formatShelfPostTime(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final d = DateTime.tryParse(iso);
  if (d == null) return '';
  final local = d.toLocal();
  final h = local.hour.toString().padLeft(2, '0');
  final m = local.minute.toString().padLeft(2, '0');
  return '${local.month}/${local.day} $h:$m';
}

class ShelfPostsRepository {
  ShelfPostsRepository(this._dio);

  final Dio _dio;

  String _bookPath(String bookId) =>
      '/shelf/platform/${Uri.encodeComponent(bookId)}';

  Future<ShelfPostList> listPosts(
    String bookId, {
    ShelfPostKind? kind,
    String? sectionId,
    bool mine = false,
    String sort = 'latest',
  }) async {
    final q = <String, dynamic>{};
    if (kind != null) q['kind'] = kind == ShelfPostKind.review ? 'review' : 'note';
    if (sectionId != null) q['section_id'] = sectionId;
    if (mine) q['mine'] = 'true';
    if (sort.isNotEmpty) q['sort'] = sort;
    final res = await _dio.get<Map<String, dynamic>>(
      '${_bookPath(bookId)}/posts',
      queryParameters: q.isEmpty ? null : q,
    );
    final data = res.data ?? const {};
    final statsRaw = data['stats'] as Map? ?? const {};
    return ShelfPostList(
      items: (data['items'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map((e) => ShelfPost.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      stats: (
        reviews: (statsRaw['reviews'] as num?)?.toInt() ?? 0,
        notes: (statsRaw['notes'] as num?)?.toInt() ?? 0,
      ),
    );
  }

  Future<List<ShelfPost>> sectionPublicNotes(String bookId, String sectionId) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '${_bookPath(bookId)}/posts/section/${Uri.encodeComponent(sectionId)}/public-notes',
    );
    return (res.data?['items'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((e) => ShelfPost.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<ShelfPost> getPost(String bookId, String postId) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '${_bookPath(bookId)}/posts/${Uri.encodeComponent(postId)}',
    );
    return ShelfPost.fromJson(res.data ?? const {});
  }

  Future<ShelfPost> createPost(
    String bookId, {
    required ShelfPostKind kind,
    required String ref,
    required String body,
    ShelfPostVisibility visibility = ShelfPostVisibility.public,
    String? sectionId,
    int? pageIndex,
    int? spanStart,
    int? spanEnd,
    String? readStatus,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '${_bookPath(bookId)}/posts',
      data: {
        'kind': kind == ShelfPostKind.review ? 'review' : 'note',
        'ref': ref,
        'body': body,
        'visibility': visibility.apiValue,
        if (sectionId != null) 'section_id': sectionId,
        if (pageIndex != null) 'page_index': pageIndex,
        if (spanStart != null) 'span_start': spanStart,
        if (spanEnd != null) 'span_end': spanEnd,
        if (readStatus != null) 'read_status': readStatus,
      },
    );
    return ShelfPost.fromJson(res.data ?? const {});
  }

  Future<ShelfPostReply> replyPost(String bookId, String postId, String body) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '${_bookPath(bookId)}/posts/${Uri.encodeComponent(postId)}/replies',
      data: {'body': body},
    );
    return ShelfPostReply.fromJson(res.data ?? const {});
  }

  Future<({bool liked, int likesCount})> toggleLike(String bookId, String postId) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '${_bookPath(bookId)}/posts/${Uri.encodeComponent(postId)}/like',
      data: const {},
    );
    final data = res.data ?? const {};
    return (
      liked: data['liked'] == true,
      likesCount: (data['likes_count'] as num?)?.toInt() ?? 0,
    );
  }

  Future<ShelfPost> updateVisibility(
    String bookId,
    String postId,
    ShelfPostVisibility visibility,
  ) async {
    final res = await _dio.patch<Map<String, dynamic>>(
      '${_bookPath(bookId)}/posts/${Uri.encodeComponent(postId)}/visibility',
      data: {'visibility': visibility.apiValue},
    );
    return ShelfPost.fromJson(res.data ?? const {});
  }

  Future<void> deletePost(String bookId, String postId) async {
    await _dio.delete<void>('${_bookPath(bookId)}/posts/${Uri.encodeComponent(postId)}');
  }
}
