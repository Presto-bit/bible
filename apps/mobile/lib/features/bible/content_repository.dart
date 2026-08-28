/// 静态内容：交叉引用（串珠）+ 圣经词典（人物/地名词条）。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'paragraphs.dart';

class RelatedVerse {
  RelatedVerse({required this.ref, required this.text});
  final String ref; // 如 "JHN 3:17"
  final String text;
  factory RelatedVerse.fromJson(Map<String, dynamic> j) => RelatedVerse(
    ref: (j['ref'] ?? '') as String,
    text: (j['text'] ?? '') as String,
  );

  /// 解析为 (bookId, chapter)，失败返回 null。
  ({String book, int chapter})? get target {
    final m = RegExp(r'^([A-Za-z0-9]+)\s+(\d+)').firstMatch(ref.trim());
    if (m == null) return null;
    return (book: m.group(1)!.toUpperCase(), chapter: int.parse(m.group(2)!));
  }
}

class CrossrefResult {
  CrossrefResult({required this.label, required this.related});
  final String label;
  final List<RelatedVerse> related;
  factory CrossrefResult.fromJson(Map<String, dynamic> j) => CrossrefResult(
    label: (j['label'] ?? j['ref'] ?? '') as String,
    related: ((j['related'] ?? []) as List)
        .map((e) => RelatedVerse.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class DictEntity {
  DictEntity({
    required this.id,
    required this.name,
    required this.type,
    required this.summary,
    required this.refs,
    this.aliases = const [],
    this.disambiguation,
    this.testament,
    this.scopeBooks = const [],
  });
  final String id;
  final String name;
  final String type;
  final String summary;
  final List<String> refs;
  final List<String> aliases;
  final String? disambiguation;
  final String? testament;
  final List<String> scopeBooks;

  factory DictEntity.fromJson(Map<String, dynamic> j) {
    final name = (j['name'] ?? '') as String;
    return DictEntity(
      id: ((j['id'] ?? name) as String).trim().isEmpty
          ? name
          : (j['id'] as String? ?? name),
      name: name,
      type: (j['type'] ?? '') as String,
      summary: (j['summary'] ?? '') as String,
      refs: ((j['refs'] ?? []) as List).map((e) => '$e').toList(),
      aliases: ((j['aliases'] ?? []) as List).map((e) => '$e').toList(),
      disambiguation: j['disambiguation'] as String?,
      testament: j['testament'] as String?,
      scopeBooks: ((j['scope_books'] ?? []) as List).map((e) => '$e').toList(),
    );
  }
}

/// 词典词条详情；与 PWA `EntityKnowledgeSheet` 复用同一接口。
class EntityKnowledge {
  EntityKnowledge({
    required this.entity,
    this.graph,
    this.place,
    this.mapTours = const [],
    this.diagrams = const [],
  });

  final DictEntity entity;
  final GraphData? graph;
  final GeoPlace? place;
  final List<MapTour> mapTours;
  final List<DiagramItem> diagrams;

  factory EntityKnowledge.fromJson(Map<String, dynamic> json) {
    final rawEntity = json['entity'];
    final rawGraph = json['graph'];
    final rawPlace = json['place'];
    return EntityKnowledge(
      entity: DictEntity.fromJson(
        rawEntity is Map
            ? Map<String, dynamic>.from(rawEntity)
            : <String, dynamic>{},
      ),
      // Dio 解码的嵌套 JSON 在部分 Android 运行时只保证 `Map`；
      // 显式转换避免地点 / 关系数据因泛型不匹配被当成空数据。
      graph: rawGraph is Map
          ? GraphData.fromJson(Map<String, dynamic>.from(rawGraph))
          : null,
      place: rawPlace is Map
          ? GeoPlace.fromJson(Map<String, dynamic>.from(rawPlace))
          : null,
      mapTours: ((json['map_tours'] ?? []) as List)
          .whereType<Map>()
          .map((e) => MapTour.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      diagrams: ((json['diagrams'] ?? []) as List)
          .whereType<Map>()
          .map((e) => DiagramItem.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class ContentRepository {
  ContentRepository(this._dio);
  final Dio _dio;
  final Map<String, List<(int, int)>> _paragraphRangesByChapter = {};
  Future<void>? _paragraphIndexLoad;

  String _paragraphChapterKey(String book, int chapter) =>
      '${book.toUpperCase()}.$chapter';

  /// 同步读已缓存的段落表（preload 或单章请求后可用）。
  List<(int, int)>? paragraphRangesCached(String book, int chapter) {
    final ranges = _paragraphRangesByChapter[_paragraphChapterKey(book, chapter)];
    return ranges != null && ranges.isNotEmpty ? ranges : null;
  }

  Future<void> preloadParagraphRangesIndex() {
    _paragraphIndexLoad ??= _loadParagraphRangesIndex();
    return _paragraphIndexLoad!;
  }

  Future<void> _loadParagraphRangesIndex() async {
    try {
      final res = await _dio.get('/content/paragraphs');
      final chapters =
          (res.data['chapters'] as Map?)?.cast<String, dynamic>() ?? {};
      for (final entry in chapters.entries) {
        final parsed = parseParagraphRangesJson(entry.value as List);
        if (parsed.isNotEmpty) {
          _paragraphRangesByChapter[entry.key.toUpperCase()] = parsed;
        }
      }
    } catch (_) {
      // 离线或未部署时静默；阅读器走兜底算法
    }
  }

  Future<CrossrefResult> crossrefs(String ref) async {
    final res = await _dio.get(
      '/content/crossrefs',
      queryParameters: {'ref': ref},
    );
    return CrossrefResult.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<DictEntity>> dictionary({String? term, String? ref}) async {
    final res = await _dio.get(
      '/content/dictionary',
      queryParameters: {
        if (term != null && term.isNotEmpty) 'term': term,
        if (ref != null && ref.isNotEmpty) 'ref': ref,
      },
    );
    return ((res.data['entities'] ?? []) as List)
        .map((e) => DictEntity.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<EntityKnowledge> entityKnowledge(String entityId) async {
    final res = await _dio.get(
      '/content/entities/${Uri.encodeComponent(entityId)}/knowledge',
    );
    return EntityKnowledge.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<StrongsWord>> strongs(String ref) async {
    final res = await _dio.get(
      '/content/strongs',
      queryParameters: {'ref': ref},
    );
    return ((res.data['words'] ?? []) as List)
        .map((e) => StrongsWord.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<SectionMark>> sectionTitles(String book, int chapter) async {
    final res = await _dio.get(
      '/content/sections',
      queryParameters: {'book': book, 'chapter': chapter},
    );
    return ((res.data['sections'] ?? []) as List)
        .map((e) => SectionMark.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<(int, int)>> paragraphRanges(String book, int chapter) async {
    final key = _paragraphChapterKey(book, chapter);
    final cached = _paragraphRangesByChapter[key];
    if (cached != null && cached.isNotEmpty) return cached;

    final res = await _dio.get(
      '/content/paragraphs',
      queryParameters: {'book': book, 'chapter': chapter},
    );
    final raw = (res.data['paragraphs'] ?? []) as List;
    final parsed = raw
        .map((e) {
          if (e is! List || e.length < 2) return null;
          final a = (e[0] as num?)?.toInt();
          final b = (e[1] as num?)?.toInt();
          if (a == null || b == null) return null;
          return (a, b);
        })
        .whereType<(int, int)>()
        .toList();
    if (parsed.isNotEmpty) {
      _paragraphRangesByChapter[key] = parsed;
    }
    return parsed;
  }

  Future<List<TopicEntry>> topics() async {
    final res = await _dio.get('/content/topics');
    return ((res.data['topics'] ?? []) as List)
        .map((e) => TopicEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<MapTour>> mapTours() async {
    final res = await _dio.get('/content/map-tours');
    return ((res.data['tours'] ?? []) as List)
        .map((e) => MapTour.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<MapTour> mapTour(String id) async {
    final res = await _dio.get('/content/map-tours/$id');
    return MapTour.fromJson(res.data['tour'] as Map<String, dynamic>);
  }

  Future<List<TimelineTour>> timelineTours() async {
    final res = await _dio.get('/content/timeline-tours');
    return ((res.data['tours'] ?? []) as List)
        .map((e) => TimelineTour.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<TimelineTour> timelineTour(String id) async {
    final res = await _dio.get('/content/timeline-tours/$id');
    return TimelineTour.fromJson(res.data['tour'] as Map<String, dynamic>);
  }

  /// 本章时间线（SummarySheet「本章背景」）。
  Future<TimelineChapterRow?> timelineForChapter(
    String book,
    int chapter,
  ) async {
    try {
      final res = await _dio.get(
        '/content/timeline',
        queryParameters: {'book': book, 'chapter': chapter},
      );
      final row = res.data['timeline'];
      if (row is Map<String, dynamic>) {
        return TimelineChapterRow.fromJson(row);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /// 本章相关地点。
  Future<List<GeoPlace>> geographyForChapter(String book, int chapter) async {
    try {
      final res = await _dio.get(
        '/content/geography',
        queryParameters: {'book': book, 'chapter': chapter},
      );
      return ((res.data['places'] ?? []) as List)
          .map((e) => GeoPlace.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<List<DiagramItem>> diagrams() async {
    final res = await _dio.get('/content/diagrams');
    return ((res.data['items'] ?? []) as List)
        .map((e) => DiagramItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<DiagramItem> diagram(String id) async {
    final res = await _dio.get('/content/diagrams/$id');
    return DiagramItem.fromJson(res.data['diagram'] as Map<String, dynamic>);
  }

  Future<List<GraphTopic>> graphTopics() async {
    final res = await _dio.get('/content/graph-topics');
    return ((res.data['topics'] ?? []) as List)
        .map((e) => GraphTopic.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<({GraphTopic topic, GraphData graph})> graphTopic(String id) async {
    final res = await _dio.get('/content/graph-topics/$id');
    final data = res.data as Map<String, dynamic>;
    return (
      topic: GraphTopic.fromJson(data['topic'] as Map<String, dynamic>),
      graph: GraphData.fromJson(data['graph'] as Map<String, dynamic>),
    );
  }
}

class StrongsWord {
  StrongsWord({
    required this.position,
    this.word,
    this.strongs,
    this.lemma,
    this.gloss,
    this.morphology,
  });
  final int position;
  final String? word;
  final String? strongs;
  final String? lemma;
  final String? gloss;
  final String? morphology;
  factory StrongsWord.fromJson(Map<String, dynamic> j) => StrongsWord(
    position: (j['position'] as num?)?.toInt() ?? 0,
    word: j['word'] as String?,
    strongs: j['strongs'] as String?,
    lemma: j['lemma'] as String?,
    gloss: j['gloss'] as String?,
    morphology: j['morphology'] as String?,
  );
}

class SectionMark {
  SectionMark({required this.verse, required this.title});
  final int verse;
  final String title;
  factory SectionMark.fromJson(Map<String, dynamic> j) => SectionMark(
    verse: (j['verse'] as num?)?.toInt() ?? 1,
    title: (j['title'] ?? '') as String,
  );
}

class TopicEntry {
  TopicEntry({required this.id, required this.name, this.refs = const []});
  final String id;
  final String name;
  final List<String> refs;
  factory TopicEntry.fromJson(Map<String, dynamic> j) => TopicEntry(
    id: (j['id'] ?? j['name'] ?? '') as String,
    name: (j['name'] ?? '') as String,
    refs: ((j['refs'] ?? []) as List).map((e) => '$e').toList(),
  );
}

final contentRepoProvider = Provider<ContentRepository>(
  (ref) => ContentRepository(ref.watch(dioProvider)),
);

final crossrefsProvider = FutureProvider.family<CrossrefResult, String>(
  (ref, refStr) => ref.watch(contentRepoProvider).crossrefs(refStr),
);

final dictionaryProvider = FutureProvider.family<List<DictEntity>, String>(
  (ref, term) => ref.watch(contentRepoProvider).dictionary(term: term),
);

final entityKnowledgeProvider = FutureProvider.family<EntityKnowledge, String>(
  (ref, entityId) => ref.watch(contentRepoProvider).entityKnowledge(entityId),
);

final strongsProvider = FutureProvider.family<List<StrongsWord>, String>(
  (ref, refStr) => ref.watch(contentRepoProvider).strongs(refStr),
);

final sectionTitlesProvider =
    FutureProvider.family<List<SectionMark>, ({String book, int chapter})>(
      (ref, args) =>
          ref.watch(contentRepoProvider).sectionTitles(args.book, args.chapter),
    );

final paragraphRangesProvider =
    FutureProvider.family<List<(int, int)>, ({String book, int chapter})>(
      (ref, args) => ref
          .watch(contentRepoProvider)
          .paragraphRanges(args.book, args.chapter),
    );

final topicsProvider = FutureProvider<List<TopicEntry>>(
  (ref) => ref.watch(contentRepoProvider).topics(),
);

class TourStop {
  TourStop({required this.order, required this.label, this.ref, this.note});
  final int order;
  final String label;
  final String? ref;
  final String? note;
  factory TourStop.fromJson(Map<String, dynamic> j) => TourStop(
    order: (j['order'] as num?)?.toInt() ?? 0,
    label: (j['label'] ?? '') as String,
    ref: j['ref'] as String?,
    note: j['note'] as String?,
  );
}

class MapTour {
  MapTour({
    required this.id,
    required this.title,
    this.subtitle,
    this.description,
    this.stops = const [],
  });
  final String id;
  final String title;
  final String? subtitle;
  final String? description;
  final List<TourStop> stops;
  factory MapTour.fromJson(Map<String, dynamic> j) => MapTour(
    id: (j['id'] ?? '') as String,
    title: (j['title'] ?? '') as String,
    subtitle: j['subtitle'] as String?,
    description: j['description'] as String?,
    stops: ((j['stops'] ?? []) as List)
        .map((e) => TourStop.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class TimelineEvent {
  TimelineEvent({required this.order, required this.label, this.ref, this.era});
  final int order;
  final String label;
  final String? ref;
  final String? era;
  factory TimelineEvent.fromJson(Map<String, dynamic> j) => TimelineEvent(
    order: (j['order'] as num?)?.toInt() ?? 0,
    label: (j['label'] ?? j['title'] ?? '') as String,
    ref: j['ref'] as String?,
    era: j['era'] as String?,
  );
}

/// 章级时间轴条目（/content/timeline?book&chapter）。
class TimelineChapterRow {
  TimelineChapterRow({this.yearDisplay, this.era, this.year});
  final String? yearDisplay;
  final String? era;
  final int? year;

  factory TimelineChapterRow.fromJson(Map<String, dynamic> j) =>
      TimelineChapterRow(
        yearDisplay: j['year_display'] as String?,
        era: j['era'] as String?,
        year: (j['year'] as num?)?.toInt(),
      );

  String? get eraLabel {
    if (yearDisplay != null && yearDisplay!.trim().isNotEmpty) {
      return yearDisplay;
    }
    if (era != null && era!.trim().isNotEmpty) return era;
    if (year != null) {
      return year! < 0 ? '${year!.abs()} BC' : '$year AD';
    }
    return null;
  }
}

class GeoPlace {
  GeoPlace({
    required this.id,
    required this.name,
    this.modernName,
    this.type,
    this.latitude,
    this.longitude,
    this.refs = const [],
  });
  final String id;
  final String name;
  final String? modernName;
  final String? type;
  final double? latitude;
  final double? longitude;
  final List<String> refs;
  factory GeoPlace.fromJson(Map<String, dynamic> j) => GeoPlace(
    id: '${j['id'] ?? j['name'] ?? ''}',
    name: (j['name'] ?? j['title'] ?? '') as String,
    modernName: j['modern_name'] as String? ?? j['modern'] as String?,
    type: j['type'] as String?,
    latitude: (j['latitude'] as num?)?.toDouble(),
    longitude: (j['longitude'] as num?)?.toDouble(),
    refs: ((j['refs'] ?? []) as List).map((e) => '$e').toList(),
  );
}

class TimelineTour {
  TimelineTour({
    required this.id,
    required this.title,
    this.subtitle,
    this.description,
    this.events = const [],
  });
  final String id;
  final String title;
  final String? subtitle;
  final String? description;
  final List<TimelineEvent> events;
  factory TimelineTour.fromJson(Map<String, dynamic> j) => TimelineTour(
    id: (j['id'] ?? '') as String,
    title: (j['title'] ?? '') as String,
    subtitle: j['subtitle'] as String?,
    description: j['description'] as String?,
    events: ((j['events'] ?? j['stops'] ?? []) as List)
        .map((e) => TimelineEvent.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class DiagramHotspot {
  DiagramHotspot({
    required this.id,
    required this.label,
    this.ref,
    this.x = 0.5,
    this.y = 0.5,
  });
  final String id;
  final String label;
  final String? ref;
  final double x;
  final double y;
  factory DiagramHotspot.fromJson(Map<String, dynamic> j) => DiagramHotspot(
    id: (j['id'] ?? '') as String,
    label: (j['label'] ?? '') as String,
    ref: j['ref'] as String?,
    x: (j['x'] as num?)?.toDouble() ?? 0.5,
    y: (j['y'] as num?)?.toDouble() ?? 0.5,
  );
}

class DiagramItem {
  DiagramItem({
    required this.id,
    required this.title,
    this.summary,
    this.file,
    this.hotspots = const [],
  });
  final String id;
  final String title;
  final String? summary;
  final String? file;
  final List<DiagramHotspot> hotspots;
  factory DiagramItem.fromJson(Map<String, dynamic> j) => DiagramItem(
    id: (j['id'] ?? '') as String,
    title: (j['title'] ?? '') as String,
    summary: j['summary'] as String?,
    file: j['file'] as String?,
    hotspots: ((j['hotspots'] ?? []) as List)
        .map((e) => DiagramHotspot.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

final mapToursProvider = FutureProvider<List<MapTour>>(
  (ref) => ref.watch(contentRepoProvider).mapTours(),
);

final mapTourProvider = FutureProvider.family<MapTour, String>(
  (ref, id) => ref.watch(contentRepoProvider).mapTour(id),
);

final timelineToursProvider = FutureProvider<List<TimelineTour>>(
  (ref) => ref.watch(contentRepoProvider).timelineTours(),
);

final timelineTourProvider = FutureProvider.family<TimelineTour, String>(
  (ref, id) => ref.watch(contentRepoProvider).timelineTour(id),
);

final diagramsProvider = FutureProvider<List<DiagramItem>>(
  (ref) => ref.watch(contentRepoProvider).diagrams(),
);

final diagramProvider = FutureProvider.family<DiagramItem, String>(
  (ref, id) => ref.watch(contentRepoProvider).diagram(id),
);

class GraphTopic {
  GraphTopic({
    required this.id,
    required this.title,
    this.subtitle,
    this.entityIds = const [],
  });
  final String id;
  final String title;
  final String? subtitle;
  final List<String> entityIds;
  factory GraphTopic.fromJson(Map<String, dynamic> j) => GraphTopic(
    id: (j['id'] ?? '') as String,
    title: (j['title'] ?? '') as String,
    subtitle: j['subtitle'] as String?,
    entityIds: ((j['entity_ids'] ?? []) as List).map((e) => '$e').toList(),
  );
}

class GraphNode {
  GraphNode({required this.id, required this.name, this.type});
  final String id;
  final String name;
  final String? type;
  factory GraphNode.fromJson(Map<String, dynamic> j) => GraphNode(
    id: (j['id'] ?? '') as String,
    name: (j['name'] ?? '') as String,
    type: j['type'] as String?,
  );
}

class GraphEdge {
  GraphEdge({
    required this.from,
    required this.to,
    this.type,
    this.label,
    this.peerId,
    this.peerName,
    this.refs = const [],
  });
  final String from;
  final String to;
  final String? type;
  final String? label;
  final String? peerId;
  final String? peerName;
  final List<String> refs;
  factory GraphEdge.fromJson(Map<String, dynamic> j) => GraphEdge(
    from: (j['from'] ?? '') as String,
    to: (j['to'] ?? '') as String,
    type: j['type'] as String?,
    label: j['label'] as String?,
    peerId: j['peer_id'] as String?,
    peerName: j['peer_name'] as String?,
    refs: ((j['refs'] ?? []) as List).map((e) => e.toString()).toList(),
  );
}

class GraphData {
  GraphData({this.center, this.nodes = const [], this.edges = const []});
  final DictEntity? center;
  final List<GraphNode> nodes;
  final List<GraphEdge> edges;
  factory GraphData.fromJson(Map<String, dynamic> j) => GraphData(
    center: j['center'] is Map
        ? DictEntity.fromJson(Map<String, dynamic>.from(j['center'] as Map))
        : null,
    nodes: ((j['nodes'] ?? []) as List)
        .map((e) => GraphNode.fromJson(e as Map<String, dynamic>))
        .toList(),
    edges: ((j['edges'] ?? []) as List)
        .map((e) => GraphEdge.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

final graphTopicsProvider = FutureProvider<List<GraphTopic>>(
  (ref) => ref.watch(contentRepoProvider).graphTopics(),
);

final graphTopicProvider =
    FutureProvider.family<({GraphTopic topic, GraphData graph}), String>(
      (ref, id) => ref.watch(contentRepoProvider).graphTopic(id),
    );
