import 'dart:convert';

import 'package:flutter/services.dart';

class BadgeSpec {
  BadgeSpec({
    required this.id,
    required this.label,
    required this.desc,
    required this.hint,
    required this.icon,
    required this.category,
    required this.interesting,
    required this.rule,
    required this.progress,
  });

  final String id;
  final String label;
  final String desc;
  final String hint;
  final String icon;
  final String category;
  final bool interesting;
  final Map<String, dynamic> rule;
  final Map<String, dynamic> progress;

  factory BadgeSpec.fromJson(Map<String, dynamic> json) => BadgeSpec(
        id: json['id'] as String,
        label: json['label'] as String,
        desc: json['desc'] as String,
        hint: json['hint'] as String,
        icon: json['icon'] as String,
        category: json['category'] as String,
        interesting: json['interesting'] as bool? ?? true,
        rule: Map<String, dynamic>.from(json['rule'] as Map),
        progress: Map<String, dynamic>.from(json['progress'] as Map),
      );
}

class BadgeCatalog {
  BadgeCatalog._(this.version, this.categoryLabels, this.categoryOrder, this.specs);

  final int version;
  final Map<String, String> categoryLabels;
  final List<String> categoryOrder;
  final List<BadgeSpec> specs;

  static BadgeCatalog? _cache;

  static Future<BadgeCatalog> load() async {
    if (_cache != null) return _cache!;
    final raw = await rootBundle.loadString('assets/badges.json');
    final json = jsonDecode(raw) as Map<String, dynamic>;
    final cats = (json['categories'] as Map).map(
      (k, v) => MapEntry('$k', '$v'),
    );
    final order = (json['categoryOrder'] as List).cast<String>();
    final specs = (json['badges'] as List)
        .map((e) => BadgeSpec.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
    _cache = BadgeCatalog._(json['version'] as int? ?? 1, cats, order, specs);
    return _cache!;
  }
}

/// 旧版 Mobile 成就 ID → 统一契约 ID
const legacyBadgeIdMap = <String, String>{
  'streak7': 'streak_7',
  'streak30': 'streak_30',
  'books10': 'books_5',
  'nt': 'books_27',
  'notes10': 'note_first',
};

String normalizeBadgeId(String id) => legacyBadgeIdMap[id] ?? id;
