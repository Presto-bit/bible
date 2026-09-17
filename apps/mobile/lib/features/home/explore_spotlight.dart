/// 首页探索坑：今日默认保罗首发（对齐 Web `explore_spotlight.ts`）。
library;

import '../../core/daily_clock.dart';

const _paulId = 'paul-first-journey';

class ExploreSpotlight {
  const ExploreSpotlight({
    required this.id,
    required this.title,
    required this.hook,
    required this.href,
    required this.coverUrl,
    this.mediaBadge,
  });

  final String id;
  final String title;
  final String hook;
  final String href;
  final String coverUrl;
  /// 有音/视频时「听」「看」
  final String? mediaBadge;
}

const defaultExploreSpotlight = ExploreSpotlight(
  id: _paulId,
  title: '保罗首发',
  hook: '安提阿到加拉太',
  href: '/search/map/$_paulId?view=1',
  coverUrl: '/knowledge/infographics/paul-first-journey-comic.png',
);

class KnowledgeLayoutRow {
  const KnowledgeLayoutRow({
    required this.id,
    this.title,
    this.guideOneLiner,
    this.sourceId,
    this.coverImage,
    this.kind,
    this.mediaKinds = const [],
  });

  final String id;
  final String? title;
  final String? guideOneLiner;
  final String? sourceId;
  final String? coverImage;
  final String? kind;
  final List<String> mediaKinds;

  factory KnowledgeLayoutRow.fromJson(Map<String, dynamic> j) {
    final source = j['source'];
    String? sourceId;
    if (source is Map) {
      sourceId = '${source['id'] ?? ''}';
      if (sourceId.isEmpty) sourceId = null;
    }
    final sourceKind = source is Map ? '${source['kind'] ?? ''}' : '';
    final kinds = <String>[];
    final rawKinds = j['media_kinds'];
    if (rawKinds is List) {
      for (final k in rawKinds) {
        final s = '$k'.trim();
        if (s.isNotEmpty) kinds.add(s);
      }
    }
    return KnowledgeLayoutRow(
      id: '${j['id'] ?? ''}',
      title: j['title'] as String?,
      guideOneLiner: j['guide_one_liner'] as String?,
      sourceId: sourceId,
      coverImage: j['cover_image'] as String?,
      kind: (j['kind'] as String?) ??
          (sourceKind == 'note' ? 'note' : null),
      mediaKinds: kinds,
    );
  }
}

String _shortTitle(String title) {
  final t = title.replaceAll(RegExp(r'\s+'), '').trim();
  if (t.length <= 8) return t;
  return t.substring(0, 8);
}

String _shortHook(String? guide) {
  final g = (guide ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();
  if (g.isEmpty) return '彼爱手稿';
  if (g.length <= 14) return g;
  return '${g.substring(0, 13)}…';
}

String _coverOf(KnowledgeLayoutRow row) {
  final cover = (row.coverImage ?? '').trim();
  if (cover.isNotEmpty) return cover;
  if (row.id == 'exodus-wilderness') {
    return '/knowledge/vignettes/wilderness/00_overview.png';
  }
  if (row.id == _paulId) {
    return '/knowledge/infographics/paul-first-journey-comic.png';
  }
  return '/knowledge/infographics/_paper_texture.jpg';
}

String? _mediaBadge(List<String> kinds) {
  if (kinds.contains('video')) return '看';
  if (kinds.contains('audio')) return '听';
  return null;
}

bool _isNote(KnowledgeLayoutRow row) {
  final id = row.id;
  return row.kind == 'note' || id.startsWith('note-');
}

bool _isPaul(KnowledgeLayoutRow row) {
  return row.id == _paulId || (row.sourceId ?? '') == _paulId;
}

ExploreSpotlight _toSpotlight(KnowledgeLayoutRow row, {int fallbackIndex = 0}) {
  final id = row.id.isEmpty ? 'topic-$fallbackIndex' : row.id;
  final sourceId = (row.sourceId ?? id).trim();
  final href = _isNote(row)
      ? '/knowledge/${Uri.encodeComponent(sourceId)}?view=1'
      : '/search/map/${Uri.encodeComponent(sourceId)}?view=1';
  return ExploreSpotlight(
    id: id,
    title: _shortTitle((row.title ?? id).trim()),
    hook: _shortHook(row.guideOneLiner),
    href: href,
    coverUrl: _coverOf(row),
    mediaBadge: _mediaBadge(row.mediaKinds),
  );
}

/// 今日探索默认保罗首发；无保罗则回退首条行程。
ExploreSpotlight? pickExploreSpotlight(
  List<KnowledgeLayoutRow> layouts, {
  String? dayKey,
}) {
  if (layouts.isEmpty) return null;
  // dayKey 保留以兼容调用方（按日缓存等）
  // ignore: unused_local_variable
  final _ = dayKey ?? chinaTodayYmd();
  for (final row in layouts) {
    if (_isPaul(row)) return _toSpotlight(row);
  }
  for (final row in layouts) {
    if (!_isNote(row)) return _toSpotlight(row);
  }
  return _toSpotlight(layouts.first);
}
