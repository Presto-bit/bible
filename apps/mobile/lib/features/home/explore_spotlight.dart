/// 首页探索坑：按日稳定随机挑一个专题封面缩写（对齐 Web `explore_spotlight.ts`）。
library;

import '../../core/daily_clock.dart';

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
  id: 'explore',
  title: '探索手稿',
  hook: '经文结构速览',
  href: '/knowledge',
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

int _hashDay(String seed) {
  var h = 2166136261;
  for (final c in seed.codeUnits) {
    h ^= c;
    h = (h * 16777619) & 0xFFFFFFFF;
  }
  return h;
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
  if (row.id == 'paul-first-journey') {
    return '/knowledge/infographics/paul-first-journey-comic.png';
  }
  return '/knowledge/infographics/_paper_texture.jpg';
}

String? _mediaBadge(List<String> kinds) {
  if (kinds.contains('video')) return '看';
  if (kinds.contains('audio')) return '听';
  return null;
}

ExploreSpotlight? pickExploreSpotlight(
  List<KnowledgeLayoutRow> layouts, {
  String? dayKey,
}) {
  if (layouts.isEmpty) return null;
  final key = dayKey ?? chinaTodayYmd();
  final i = _hashDay('explore:$key') % layouts.length;
  final row = layouts[i];
  final id = row.id.isEmpty ? 'topic-$i' : row.id;
  final sourceId = (row.sourceId ?? id).trim();
  final isNote =
      row.kind == 'note' || id.startsWith('note-');
  final href = isNote
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
