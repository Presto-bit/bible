/// 静态内容：交叉引用（串珠）+ 圣经词典（人物/地名词条）。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

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
    required this.name,
    required this.type,
    required this.summary,
    required this.refs,
  });
  final String name;
  final String type;
  final String summary;
  final List<String> refs;
  factory DictEntity.fromJson(Map<String, dynamic> j) => DictEntity(
        name: (j['name'] ?? '') as String,
        type: (j['type'] ?? '') as String,
        summary: (j['summary'] ?? '') as String,
        refs: ((j['refs'] ?? []) as List).map((e) => '$e').toList(),
      );
}

class ContentRepository {
  ContentRepository(this._dio);
  final Dio _dio;

  Future<CrossrefResult> crossrefs(String ref) async {
    final res = await _dio.get('/content/crossrefs',
        queryParameters: {'ref': ref});
    return CrossrefResult.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<DictEntity>> dictionary({String? term, String? ref}) async {
    final res = await _dio.get('/content/dictionary',
        queryParameters: {
          if (term != null && term.isNotEmpty) 'term': term,
          if (ref != null && ref.isNotEmpty) 'ref': ref,
        });
    return ((res.data['entities'] ?? []) as List)
        .map((e) => DictEntity.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<StrongsWord>> strongs(String ref) async {
    final res = await _dio.get('/content/strongs', queryParameters: {'ref': ref});
    return ((res.data['words'] ?? []) as List)
        .map((e) => StrongsWord.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<SectionMark>> sectionTitles(String book, int chapter) async {
    final res = await _dio.get('/content/sections',
        queryParameters: {'book': book, 'chapter': chapter});
    return ((res.data['sections'] ?? []) as List)
        .map((e) => SectionMark.fromJson(e as Map<String, dynamic>))
        .toList();
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

final contentRepoProvider =
    Provider<ContentRepository>((ref) => ContentRepository(ref.watch(dioProvider)));

final crossrefsProvider = FutureProvider.family<CrossrefResult, String>(
    (ref, refStr) => ref.watch(contentRepoProvider).crossrefs(refStr));

final dictionaryProvider = FutureProvider.family<List<DictEntity>, String>(
    (ref, term) => ref.watch(contentRepoProvider).dictionary(term: term));

final strongsProvider = FutureProvider.family<List<StrongsWord>, String>(
    (ref, refStr) => ref.watch(contentRepoProvider).strongs(refStr));

final sectionTitlesProvider =
    FutureProvider.family<List<SectionMark>, ({String book, int chapter})>(
        (ref, args) => ref
            .watch(contentRepoProvider)
            .sectionTitles(args.book, args.chapter));

final topicsProvider = FutureProvider<List<TopicEntry>>(
    (ref) => ref.watch(contentRepoProvider).topics());

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

final mapToursProvider =
    FutureProvider<List<MapTour>>((ref) => ref.watch(contentRepoProvider).mapTours());

final mapTourProvider = FutureProvider.family<MapTour, String>(
    (ref, id) => ref.watch(contentRepoProvider).mapTour(id));

final timelineToursProvider = FutureProvider<List<TimelineTour>>(
    (ref) => ref.watch(contentRepoProvider).timelineTours());

final timelineTourProvider = FutureProvider.family<TimelineTour, String>(
    (ref, id) => ref.watch(contentRepoProvider).timelineTour(id));

final diagramsProvider =
    FutureProvider<List<DiagramItem>>((ref) => ref.watch(contentRepoProvider).diagrams());

final diagramProvider = FutureProvider.family<DiagramItem, String>(
    (ref, id) => ref.watch(contentRepoProvider).diagram(id));

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
  GraphEdge({required this.from, required this.to, this.type, this.label});
  final String from;
  final String to;
  final String? type;
  final String? label;
  factory GraphEdge.fromJson(Map<String, dynamic> j) => GraphEdge(
        from: (j['from'] ?? '') as String,
        to: (j['to'] ?? '') as String,
        type: j['type'] as String?,
        label: j['label'] as String?,
      );
}

class GraphData {
  GraphData({this.nodes = const [], this.edges = const []});
  final List<GraphNode> nodes;
  final List<GraphEdge> edges;
  factory GraphData.fromJson(Map<String, dynamic> j) => GraphData(
        nodes: ((j['nodes'] ?? []) as List)
            .map((e) => GraphNode.fromJson(e as Map<String, dynamic>))
            .toList(),
        edges: ((j['edges'] ?? []) as List)
            .map((e) => GraphEdge.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

final graphTopicsProvider =
    FutureProvider<List<GraphTopic>>((ref) => ref.watch(contentRepoProvider).graphTopics());

final graphTopicProvider = FutureProvider.family<({GraphTopic topic, GraphData graph}), String>(
    (ref, id) => ref.watch(contentRepoProvider).graphTopic(id));
