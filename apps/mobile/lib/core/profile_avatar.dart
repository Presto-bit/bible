/// 自定义头像 id / URL 解析（对齐 Web `profile_avatar.ts`）。
library;

import 'config.dart';

const customAvatarPrefix = 'u:';
const customAvatarKeyPrefix = 'u:key:';

bool isCustomAvatarId(String? id) {
  if (id == null || id.isEmpty) return false;
  return id.startsWith(customAvatarPrefix) ||
      id.startsWith('http://') ||
      id.startsWith('https://') ||
      id.startsWith('data:');
}

String? extractAvatarStorageKey(String id) {
  final raw = id.trim();
  if (raw.isEmpty) return null;
  if (raw.startsWith(customAvatarKeyPrefix)) {
    final k = raw.substring(customAvatarKeyPrefix.length).trim();
    return k.isEmpty ? null : k;
  }
  final withoutPrefix =
      raw.startsWith(customAvatarPrefix) ? raw.substring(customAvatarPrefix.length) : raw;
  try {
    final u = Uri.parse(withoutPrefix.startsWith('http')
        ? withoutPrefix
        : '${AppConfig.baseUrl}${(withoutPrefix.startsWith('/') ? '' : '/')}$withoutPrefix');
    final k = u.queryParameters['key'] ??
        u.queryParameters['k'] ??
        u.queryParameters['storage_key'];
    if (k != null && k.isNotEmpty) return k;
    final m = RegExp(r'/social/media/assets/([^/?#]+)').firstMatch(u.path);
    if (m != null) return Uri.decodeComponent(m.group(1)!);
  } catch (_) {/* ignore */}
  if (withoutPrefix.startsWith('profile-avatar-') ||
      withoutPrefix.startsWith('social-im/') ||
      withoutPrefix.startsWith('profile-avatars/')) {
    return withoutPrefix;
  }
  return null;
}

/// 可给 Image.network 用的地址。
String customAvatarSrc(String id) {
  final t = id.trim();
  if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:')) {
    final key = extractAvatarStorageKey(t);
    if (key != null && (t.contains('sig=') || t.contains('/social/media/'))) {
      return '${AppConfig.baseUrl}/social/media/profile-asset?key=${Uri.encodeComponent(key)}';
    }
    return t;
  }
  if (t.startsWith(customAvatarPrefix)) {
    final rest = t.substring(customAvatarPrefix.length);
    if (rest.startsWith('data:')) return rest;
    if (rest.startsWith('http://') || rest.startsWith('https://')) {
      return customAvatarSrc(rest);
    }
    if (rest.startsWith('key:')) {
      final key = rest.substring(4);
      return '${AppConfig.baseUrl}/social/media/profile-asset?key=${Uri.encodeComponent(key)}';
    }
    final key = extractAvatarStorageKey(t);
    if (key != null) {
      return '${AppConfig.baseUrl}/social/media/profile-asset?key=${Uri.encodeComponent(key)}';
    }
  }
  final key = extractAvatarStorageKey(t);
  if (key != null) {
    return '${AppConfig.baseUrl}/social/media/profile-asset?key=${Uri.encodeComponent(key)}';
  }
  return t;
}
