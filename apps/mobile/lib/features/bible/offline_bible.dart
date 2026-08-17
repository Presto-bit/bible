/// 离线圣经经包：和合本（cuvs）主本 + 可选新译本（cnv）。
/// 对齐 Web offline_pack：优先直链 sqlite，zip 回退。
library;

import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqlite3/sqlite3.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../bible/models.dart';

/// 当前默认主离线译本（产品：和合本）。
const kPrimaryOfflineTranslation = 'cuvs';

const _legacyCnvMetaKey = 'presto_offline_cnv_meta_v1';

/// ZIP 校验与解压均为同步 CPU 工作，必须放到后台 isolate。
List<int> _extractOfflineSqlite({
  required List<int> zipBytes,
  required String translationId,
  required String? expectedSha,
}) {
  if (expectedSha != null && expectedSha.isNotEmpty) {
    final got = sha256.convert(zipBytes).toString();
    if (got.toLowerCase() != expectedSha.toLowerCase()) {
      throw StateError('离线包校验失败，请重试');
    }
  }
  final archive = ZipDecoder().decodeBytes(zipBytes);
  final wantRel = 'bible_$translationId.sqlite';
  ArchiveFile? entry;
  for (final f in archive) {
    if (f.name == wantRel || f.name.endsWith(wantRel)) {
      entry = f;
      break;
    }
  }
  if (entry == null && translationId == 'cnv') {
    for (final f in archive) {
      if (f.name.endsWith('bible_cnv.sqlite')) {
        entry = f;
        break;
      }
    }
  }
  if (entry == null) {
    throw StateError('离线包中未找到 $translationId 数据库');
  }
  return List<int>.from(entry.content as List<int>);
}

class OfflinePackMeta {
  OfflinePackMeta({
    required this.version,
    required this.installedAt,
    this.translationId = kPrimaryOfflineTranslation,
  });
  final String version;
  final int installedAt;
  final String translationId;

  Map<String, dynamic> toJson() => {
    'version': version,
    'installedAt': installedAt,
    'translationId': translationId,
  };

  factory OfflinePackMeta.fromJson(Map<String, dynamic> j) => OfflinePackMeta(
    version: (j['version'] ?? '') as String,
    installedAt: (j['installedAt'] as num?)?.toInt() ?? 0,
    translationId: (j['translationId'] ?? 'cuvs') as String,
  );
}

class OfflineBibleService {
  OfflineBibleService(this._dio, this._prefs);
  final Dio _dio;
  final SharedPreferences _prefs;
  final Map<String, Database> _dbs = {};

  Future<void>? _activeDownload;
  String? _downloadingId;
  double? _downloadProgress;
  String? _downloadError;
  final List<void Function()> _downloadListeners = [];

  bool get isDownloading => _activeDownload != null;
  String? get downloadingId => _downloadingId;
  double? get downloadProgress => _downloadProgress;
  String? get downloadError => _downloadError;

  void addDownloadListener(void Function() fn) => _downloadListeners.add(fn);
  void removeDownloadListener(void Function() fn) =>
      _downloadListeners.remove(fn);

  void _notifyDownload() {
    for (final fn in List<void Function()>.from(_downloadListeners)) {
      try {
        fn();
      } catch (_) {}
    }
  }

  String get _base => AppConfig.baseUrl.replaceAll(RegExp(r'/+$'), '');

  String _metaKey(String id) => 'presto_offline_${id}_meta_v1';
  String _fileName(String id) => 'bible_$id.sqlite';
  String _zipRel(String id) => 'bible/bible_$id.sqlite';

  Future<Directory> _offlineDir() async {
    final root = await getApplicationSupportDirectory();
    final dir = Directory(p.join(root.path, 'offline_bible'));
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return dir;
  }

  Future<File> _sqliteFile(String translationId) async {
    final dir = await _offlineDir();
    // 兼容旧版仅 CNV 文件名
    if (translationId == 'cnv') {
      final legacy = File(p.join(dir.path, 'bible_cnv.sqlite'));
      if (legacy.existsSync()) return legacy;
    }
    return File(p.join(dir.path, _fileName(translationId)));
  }

  OfflinePackMeta? loadMeta([
    String translationId = kPrimaryOfflineTranslation,
  ]) {
    var raw = _prefs.getString(_metaKey(translationId));
    if (raw == null && translationId == 'cnv') {
      raw = _prefs.getString(_legacyCnvMetaKey);
    }
    if (raw == null) return null;
    try {
      return OfflinePackMeta.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<bool> checkInstalled([
    String translationId = kPrimaryOfflineTranslation,
  ]) async {
    final meta = loadMeta(translationId);
    if (meta == null && translationId != 'cnv') {
      // 允许仅有文件也算装妥
    }
    final f = await _sqliteFile(translationId);
    final ok = f.existsSync() && f.lengthSync() > 1024;
    if (ok && translationId == kPrimaryOfflineTranslation) {
      await _prefs.remove('offline_bible_card_dismissed_v1');
    }
    return ok;
  }

  Future<bool> checkAnyInstalled() async {
    for (final id in const ['cuvs', 'cnv', 'contemporary', 'kjv']) {
      if (await checkInstalled(id)) return true;
    }
    return false;
  }

  void _closeId(String id) {
    _dbs[id]?.dispose();
    _dbs.remove(id);
  }

  void close() {
    for (final id in _dbs.keys.toList()) {
      _closeId(id);
    }
  }

  Database? _openDb(String translationId, File file) {
    if (!file.existsSync()) return null;
    try {
      return _dbs.putIfAbsent(
        translationId,
        () => sqlite3.open(file.path, mode: OpenMode.readOnly),
      );
    } catch (_) {
      return null;
    }
  }

  Future<Database?> db([
    String translationId = kPrimaryOfflineTranslation,
  ]) async {
    final f = await _sqliteFile(translationId);
    return _openDb(translationId, f);
  }

  Future<void> deletePack([
    String translationId = kPrimaryOfflineTranslation,
  ]) async {
    _closeId(translationId);
    final f = await _sqliteFile(translationId);
    if (f.existsSync()) await f.delete();
    await _prefs.remove(_metaKey(translationId));
    if (translationId == 'cnv') {
      await _prefs.remove(_legacyCnvMetaKey);
    }
  }

  /// 下载指定译本（默认和合本）。关闭 Sheet 不中断。
  Future<void> downloadPack({
    String translationId = kPrimaryOfflineTranslation,
    void Function(double progress)? onProgress,
  }) {
    if (_activeDownload != null) return _activeDownload!;
    _downloadError = null;
    _downloadProgress = 0;
    _downloadingId = translationId;
    _notifyDownload();
    _activeDownload =
        _runDownload(
          translationId: translationId,
          onProgress: onProgress,
        ).whenComplete(() {
          _activeDownload = null;
          _downloadingId = null;
          _notifyDownload();
        });
    return _activeDownload!;
  }

  Future<void> _runDownload({
    required String translationId,
    void Function(double progress)? onProgress,
  }) async {
    try {
      final manifestRes = await _dio.get(
        '$_base/offline/manifest.json',
        options: Options(responseType: ResponseType.json),
      );
      final manifest = manifestRes.data as Map<String, dynamic>;
      final version = (manifest['version'] ?? '') as String;

      // 直链优先（对齐 web downloadOfflineItem）
      final directKey = '${translationId}_sqlite';
      final directUrl =
          manifest[directKey] as String? ??
          manifest['${translationId}_sqlite_url'] as String?;

      List<int>? bytes;
      // 直链相对路径对齐 Web：`/offline/${fileName}`；失败则回退 zip。
      if (directUrl != null && directUrl.toString().isNotEmpty) {
        try {
          final raw = directUrl.toString().trim();
          final url = raw.startsWith('http')
              ? raw
              : (raw.startsWith('/offline/')
                    ? '$_base$raw'
                    : '$_base/offline/${raw.replaceFirst(RegExp(r'^/+'), '')}');
          final res = await _dio.get<List<int>>(
            url,
            options: Options(responseType: ResponseType.bytes),
            onReceiveProgress: (got, total) {
              if (total > 0) {
                _downloadProgress = got / total;
                onProgress?.call(_downloadProgress!);
                _notifyDownload();
              }
            },
          );
          bytes = res.data;
          if (bytes != null && bytes.isNotEmpty) {
            final out = await _sqliteFile(translationId);
            await out.writeAsBytes(bytes, flush: true);
            await _saveMeta(translationId, version);
            return;
          }
        } catch (_) {
          bytes = null;
        }
      }

      // zip 回退
      final zipName = (manifest['zip'] ?? 'bible_offline.zip') as String;
      final zipRes = await _dio.get<List<int>>(
        '$_base/offline/$zipName',
        options: Options(responseType: ResponseType.bytes),
        onReceiveProgress: (got, total) {
          if (total > 0) {
            _downloadProgress = got / total;
            onProgress?.call(_downloadProgress!);
            _notifyDownload();
          }
        },
      );
      bytes = zipRes.data;
      if (bytes == null || bytes.isEmpty) {
        throw StateError('离线包下载失败');
      }

      final expectedSha =
          (manifest['zip_sha256'] ?? manifest['zipSha256']) as String?;
      final sqliteBytes = await Isolate.run(
        () => _extractOfflineSqlite(
          zipBytes: bytes!,
          translationId: translationId,
          expectedSha: expectedSha,
        ),
      );

      final out = await _sqliteFile(translationId);
      await out.writeAsBytes(sqliteBytes, flush: true);
      await _saveMeta(translationId, version);
    } catch (e) {
      _downloadError = '$e';
      rethrow;
    } finally {
      _notifyDownload();
    }
  }

  Future<void> _saveMeta(String translationId, String version) async {
    _closeId(translationId);
    await _prefs.setString(
      _metaKey(translationId),
      jsonEncode(
        OfflinePackMeta(
          version: version,
          installedAt: DateTime.now().millisecondsSinceEpoch,
          translationId: translationId,
        ).toJson(),
      ),
    );
    _downloadProgress = 1;
    _downloadError = null;
    if (translationId == kPrimaryOfflineTranslation) {
      await _prefs.remove('offline_bible_card_dismissed_v1');
    }
  }

  Future<List<BibleBook>> listBooks([
    String translationId = kPrimaryOfflineTranslation,
  ]) async {
    final database = await db(translationId);
    if (database == null) {
      // 主本缺失时尝试任意已装
      for (final id in const ['cnv', 'contemporary', 'kjv']) {
        final d = await db(id);
        if (d != null) {
          return _listBooksFrom(d);
        }
      }
      return [];
    }
    return _listBooksFrom(database);
  }

  List<BibleBook> _listBooksFrom(Database database) {
    try {
      final rs = database.select(
        'SELECT id, name, testament, chapter_count, sort_order FROM books ORDER BY sort_order',
      );
      return rs
          .map(
            (r) => BibleBook(
              id: r['id'] as String,
              name: r['name'] as String,
              testament: (r['testament'] ?? '') as String,
              sortOrder: (r['sort_order'] as int?) ?? 0,
              chapterCount: (r['chapter_count'] as int?) ?? 0,
            ),
          )
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<Chapter?> chapter(
    String bookId,
    int chapter, {
    String? version,
  }) async {
    final prefer = (version == null || version.isEmpty)
        ? kPrimaryOfflineTranslation
        : version.toLowerCase();
    final tryOrder = <String>[
      prefer,
      if (prefer != 'cuvs') 'cuvs',
      if (prefer != 'cnv') 'cnv',
    ];
    for (final tid in tryOrder) {
      if (!await checkInstalled(tid)) continue;
      final ch = await _chapterFromDb(tid, bookId, chapter);
      if (ch != null) return ch;
    }
    return null;
  }

  Future<Chapter?> _chapterFromDb(
    String translationId,
    String bookId,
    int chapter,
  ) async {
    final database = await db(translationId);
    if (database == null) return null;
    for (final id in [bookId, bookId.toUpperCase(), bookId.toLowerCase()]) {
      try {
        final rs = database.select(
          'SELECT verse, text FROM verses WHERE book = ? AND chapter = ? ORDER BY verse',
          [id, chapter],
        );
        if (rs.isEmpty) continue;
        final verses = rs
            .map(
              (r) => Verse(
                verse: r['verse'] as int,
                text: (r['text'] ?? '') as String,
              ),
            )
            .toList();
        String bookName = id;
        final nameRs = database.select(
          'SELECT name FROM books WHERE id = ? LIMIT 1',
          [id],
        );
        if (nameRs.isNotEmpty) {
          bookName = nameRs.first['name'] as String;
        }
        return Chapter(
          bookId: id.toUpperCase(),
          bookName: bookName,
          chapter: chapter,
          verses: verses,
        );
      } catch (_) {
        continue;
      }
    }
    return null;
  }
}

final offlineBibleProvider = Provider<OfflineBibleService>((ref) {
  return OfflineBibleService(ref.watch(dioProvider), ref.watch(prefsProvider));
});

/// 主本（和合本）是否已装。
final offlineInstalledProvider = FutureProvider<bool>((ref) async {
  return ref
      .watch(offlineBibleProvider)
      .checkInstalled(kPrimaryOfflineTranslation);
});

final offlineTranslationInstalledProvider = FutureProvider.family<bool, String>(
  (ref, id) async {
    return ref.watch(offlineBibleProvider).checkInstalled(id);
  },
);
