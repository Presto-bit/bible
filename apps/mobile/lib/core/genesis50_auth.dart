/// 创世记 50 天自动登录（对齐 `apps/web/lib/genesis50_auth.ts`）。
///
/// 用邀请码换 Supabase session，再把 token 写入目标站 query，
/// 跳过对方邀请码页（WebView / detectSessionInUrl）。
library;

import 'package:dio/dio.dart';

const _g50Host = 'genesis-50.pages.dev';
const _g50SupabaseUrl = 'https://ytiwfmufekvxdgyaokae.supabase.co';
/// 对方前端公开 anon key（与 genesis-50 包内一致）
const _g50AnonKey = 'sb_publishable_aH3DWsTgZ4X0A4W_zJmyzw_wd7yk7pm';
/// 运营未在链接里带 ?code= 时的默认邀请码
const _g50DefaultCode = '0CIW43NR';

class Genesis50Session {
  const Genesis50Session({
    required this.accessToken,
    required this.refreshToken,
    this.expiresIn,
    this.expiresAt,
    this.tokenType,
  });

  final String accessToken;
  final String refreshToken;
  final int? expiresIn;
  final int? expiresAt;
  final String? tokenType;
}

String normalizeGenesis50Href(String href) {
  final t = href.trim();
  if (t.isEmpty) return '';
  if (t.startsWith('//')) return 'https:$t';
  return t;
}

bool isGenesis50Href(String href) {
  try {
    final u = Uri.parse(normalizeGenesis50Href(href));
    final host = u.host.toLowerCase();
    return host == _g50Host || host.endsWith('.$_g50Host');
  } catch (_) {
    return false;
  }
}

String resolveGenesis50InviteCode(String href) {
  try {
    final u = Uri.parse(normalizeGenesis50Href(href));
    final fromQs = (u.queryParameters['code'] ??
            u.queryParameters['invite'] ??
            '')
        .trim()
        .toUpperCase();
    if (fromQs.isNotEmpty) return fromQs;
  } catch (_) {}
  return _g50DefaultCode;
}

String _inviteEmail(String code) =>
    '${code.trim().toLowerCase()}@invite.local';

String _invitePassword(String code) => 'G50-${code.trim().toUpperCase()}';

Map<String, String> _authHeaders({String? bearer}) => {
      'apikey': _g50AnonKey,
      'Authorization': 'Bearer ${bearer ?? _g50AnonKey}',
      'Content-Type': 'application/json',
    };

Genesis50Session _parseSession(Map data) {
  final access = '${data['access_token'] ?? ''}';
  final refresh = '${data['refresh_token'] ?? ''}';
  if (access.isEmpty || refresh.isEmpty) {
    throw StateError(
      '${data['error_description'] ?? data['msg'] ?? data['error'] ?? '登录失败'}',
    );
  }
  return Genesis50Session(
    accessToken: access,
    refreshToken: refresh,
    expiresIn: data['expires_in'] is int
        ? data['expires_in'] as int
        : int.tryParse('${data['expires_in'] ?? ''}'),
    expiresAt: data['expires_at'] is int
        ? data['expires_at'] as int
        : int.tryParse('${data['expires_at'] ?? ''}'),
    tokenType: data['token_type'] as String?,
  );
}

Future<Genesis50Session> _signInWithInvite(Dio dio, String code) async {
  final res = await dio.post<Map<String, dynamic>>(
    '$_g50SupabaseUrl/auth/v1/token?grant_type=password',
    data: {
      'email': _inviteEmail(code),
      'password': _invitePassword(code),
    },
    options: Options(headers: _authHeaders()),
  );
  final data = res.data ?? {};
  if (res.statusCode == null ||
      res.statusCode! < 200 ||
      res.statusCode! >= 300) {
    throw StateError(
      '${data['error_description'] ?? data['msg'] ?? data['error'] ?? '登录失败'}',
    );
  }
  return _parseSession(data);
}

Future<Genesis50Session> _signUpWithInvite(
  Dio dio,
  String code,
  String nickname,
) async {
  final res = await dio.post<Map<String, dynamic>>(
    '$_g50SupabaseUrl/auth/v1/signup',
    data: {
      'email': _inviteEmail(code),
      'password': _invitePassword(code),
      'data': {'nickname': nickname},
    },
    options: Options(headers: _authHeaders()),
  );
  final data = res.data ?? {};
  if (res.statusCode == null ||
      res.statusCode! < 200 ||
      res.statusCode! >= 300) {
    throw StateError(
      '${data['error_description'] ?? data['msg'] ?? data['message'] ?? data['error'] ?? '注册失败'}',
    );
  }
  final session = _parseSession(data);
  try {
    await dio.post(
      '$_g50SupabaseUrl/rest/v1/rpc/complete_registration',
      data: {
        'invite_code': code.trim().toUpperCase(),
        'user_nickname': nickname.trim().isEmpty ? '同行者' : nickname.trim(),
      },
      options: Options(
        headers: {
          ..._authHeaders(bearer: session.accessToken),
          'Prefer': 'return=minimal',
        },
      ),
    );
  } catch (_) {}
  return session;
}

Future<Genesis50Session> obtainGenesis50Session(
  String code, {
  String nickname = '同行者',
  Dio? dio,
}) async {
  final client = dio ??
      Dio(
        BaseOptions(
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 20),
          validateStatus: (_) => true,
        ),
      );
  try {
    return await _signInWithInvite(client, code);
  } catch (signInErr) {
    try {
      return await _signUpWithInvite(client, code, nickname);
    } catch (_) {
      try {
        return await _signInWithInvite(client, code);
      } catch (_) {
        throw signInErr;
      }
    }
  }
}

String buildGenesis50AuthedUrl(String href, Genesis50Session session) {
  final u = Uri.parse(normalizeGenesis50Href(href));
  final q = Map<String, String>.from(u.queryParameters)
    ..remove('code')
    ..remove('invite')
    ..['access_token'] = session.accessToken
    ..['refresh_token'] = session.refreshToken
    ..['expires_in'] = '${session.expiresIn ?? 3600}'
    ..['token_type'] = session.tokenType ?? 'bearer'
    ..['type'] = 'magiclink';
  if (session.expiresAt != null) {
    q['expires_at'] = '${session.expiresAt}';
  }
  return u.replace(queryParameters: q, fragment: '').toString();
}

String buildGenesis50FallbackUrl(String href, String code) {
  final u = Uri.parse(normalizeGenesis50Href(href));
  final q = Map<String, String>.from(u.queryParameters);
  if ((q['code'] ?? '').isEmpty && (q['invite'] ?? '').isEmpty) {
    q['code'] = code;
  }
  return u.replace(queryParameters: q).toString();
}

/// 解析可打开的创世记 50 URL：优先带 session，失败则带邀请码兜底。
Future<String> resolveGenesis50OpenUrl(
  String href, {
  String nickname = '同行者',
}) async {
  final code = resolveGenesis50InviteCode(href);
  final fallback = normalizeGenesis50Href(href);
  try {
    final session = await obtainGenesis50Session(code, nickname: nickname);
    return buildGenesis50AuthedUrl(fallback, session);
  } catch (_) {
    return buildGenesis50FallbackUrl(fallback, code);
  }
}
