/// 离线 CNV 经包：下载 zip → 解压 sqlite → 本地读章。
library;

import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqlite3/sqlite3.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../bible/models.dart';

const _metaKey = 'presto_offline_cnv_meta_v1';
const _sqliteRel = 'bible/bible_cnv.sqlite';

class OfflinePackMeta {
  OfflinePackMeta({required this.version, required this.installedAt});
  final String version;
  final int installedAt;

  Map<String, dynamic> toJson() => {
        'version': version,
        'installedAt': installedAt,
      };

  factory OfflinePackMeta.fromJson(Map<String, dynamic> j) => OfflinePackMeta(
        version: (j['version'] ?? '') as String,
        installedAt: (j['installedAt'] as num?)?.toInt() ?? 0,
      );
}

class OfflineBibleService {
  OfflineBibleService(this._dio, this._prefs);
  final Dio _dio;
  final SharedPreferences _prefs;
  Database? _db;

  Future<void>? _activeDownload;
  double? _downloadProgress;
  String? _downloadError;
  final List<void Function()> _downloadListeners = [];

  /// 是否有进行中的经包下载（Sheet 关闭后仍继续）。
  bool get isDownloading => _activeDownload != null;
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

  String get _base =>
      AppConfig.baseUrl.replaceAll(RegExp(r'/+$'), '');

  Future<Directory> _offlineDir() async {
    final root = await getApplicationSupportDirectory();
    final dir = Directory(p.join(root.path, 'offline_bible'));
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return dir;
  }

  Future<File> _sqliteFile() async {
    final dir = await _offlineDir();
    return File(p.join(dir.path, 'bible_cnv.sqlite'));
  }

  OfflinePackMeta? loadMeta() {
    final raw = _prefs.getString(_metaKey);
    if (raw == null) return null;
    try {
      return OfflinePackMeta.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  bool get isInstalled => loadMeta() != null && _sqliteFileSync()?.existsSync() == true;

  File? _sqliteFileSync() {
    try {
      // sync path only when dir already resolved — best-effort
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<bool> checkInstalled() async {
    final meta = loadMeta();
    if (meta == null) return false;
    final f = await _sqliteFile();
    return f.existsSync();
  }

  Database? _openDb(File file) {
    if (!file.existsSync()) return null;
    try {
      _db ??= sqlite3.open(file.path, mode: OpenMode.readOnly);
      return _db!;
    } catch (_) {
      return null;
    }
  }

  Future<Database?> db() async {
    final f = await _sqliteFile();
    return _openDb(f);
  }

  void close() {
    _db?.dispose();
    _db = null;
  }

  Future<void> deletePack() async {
    close();
    final f = await _sqliteFile();
    if (f.existsSync()) await f.delete();
    await _prefs.remove(_metaKey);
  }

  Future<void> downloadPack({void Function(double progress)? onProgress}) {
    if (_activeDownload != null) {
      return _activeDownload!;
    }
    _downloadError = null;
    _downloadProgress = 0;
    _notifyDownload();
    _activeDownload = _runDownload(onProgress: onProgress).whenComplete(() {
      _activeDownload = null;
      _notifyDownload();
    });
    return _activeDownload!;
  }

  Future<void> _runDownload({void Function(double progress)? onProgress}) async {
    try {
      final manifestRes = await _dio.get(
        '$_base/offline/manifest.json',
        options: Options(responseType: ResponseType.json),
      );
      final manifest = manifestRes.data as Map<String, dynamic>;
      final version = (manifest['version'] ?? '') as String;
      final zipName = (manifest['zip'] ?? 'bible_offline.zip') as String;

      final zipRes = await _dio.get<List<int>>(
        '$_base/offline/$zipName',
        options: Options(responseType: ResponseType.bytes),
        onReceiveProgress: (got, total) {
          if (total > 0) {
            final p = got / total;
            _downloadProgress = p;
            onProgress?.call(p);
            _notifyDownload();
          }
        },
      );
      final bytes = zipRes.data;
      if (bytes == null || bytes.isEmpty) {
        throw StateError('离线包下载失败');
      }

      final archive = ZipDecoder().decodeBytes(bytes);
      ArchiveFile? entry;
      for (final f in archive) {
        if (f.name == _sqliteRel || f.name.endsWith('bible_cnv.sqlite')) {
          entry = f;
          break;
        }
      }
      if (entry == null) {
        throw StateError('离线包中未找到 CNV 数据库');
      }

      final out = await _sqliteFile();
      await out.writeAsBytes(entry.content as List<int>, flush: true);
      await _prefs.setString(
        _metaKey,
        jsonEncode(OfflinePackMeta(
          version: version,
          installedAt: DateTime.now().millisecondsSinceEpoch,
        ).toJson()),
      );
      close();
      _downloadProgress = 1;
      _downloadError = null;
    } catch (e) {
      _downloadError = '$e';
      rethrow;
    } finally {
      _notifyDownload();
    }
  }

  Future<List<BibleBook>> listBooks() async {
    final database = await db();
    if (database == null) return [];
    try {
      final rs = database.select(
        'SELECT id, name, testament, chapter_count, sort_order FROM books ORDER BY sort_order',
      );
      return rs
          .map((r) => BibleBook(
                id: r['id'] as String,
                name: r['name'] as String,
                testament: (r['testament'] ?? '') as String,
                sortOrder: (r['sort_order'] as int?) ?? 0,
                chapterCount: (r['chapter_count'] as int?) ?? 0,
              ))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<Chapter?> chapter(String bookId, int chapter) async {
    final database = await db();
    if (database == null) return null;
    for (final id in [bookId, bookId.toUpperCase(), bookId.toLowerCase()]) {
      try {
        final rs = database.select(
          'SELECT verse, text FROM verses WHERE book = ? AND chapter = ? ORDER BY verse',
          [id, chapter],
        );
        if (rs.isEmpty) continue;
        final verses = rs
            .map((r) => Verse(
                  verse: r['verse'] as int,
                  text: (r['text'] ?? '') as String,
                ))
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

final offlineInstalledProvider = FutureProvider<bool>((ref) async {
  return ref.watch(offlineBibleProvider).checkInstalled();
});
