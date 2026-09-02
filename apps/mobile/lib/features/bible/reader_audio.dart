/// 本章朗读：FHL/cuvs 章级 MP3，对齐 PWA BIBLE-AUDIO v1.3。
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/peiai_haptics.dart';
import '../../core/theme.dart';
import 'reader_audio_handler.dart';
import 'offline_notice.dart';
import 'reader_sheet.dart';

class ReaderAudioSettings {
  const ReaderAudioSettings({
    this.backgroundPlay = true,
    this.pauseOnTabLeave = false,
    this.continueOnChapterSwipe = true,
    this.continuousChapter = false,
    this.speed = 1.0,
    this.sleepTimer = 'off',
  });

  final bool backgroundPlay;
  final bool pauseOnTabLeave;
  final bool continueOnChapterSwipe;
  final bool continuousChapter;
  final double speed;
  final String sleepTimer;

  ReaderAudioSettings copyWith({
    bool? backgroundPlay,
    bool? pauseOnTabLeave,
    bool? continueOnChapterSwipe,
    bool? continuousChapter,
    double? speed,
    String? sleepTimer,
  }) =>
      ReaderAudioSettings(
        backgroundPlay: backgroundPlay ?? this.backgroundPlay,
        pauseOnTabLeave: pauseOnTabLeave ?? this.pauseOnTabLeave,
        continueOnChapterSwipe:
            continueOnChapterSwipe ?? this.continueOnChapterSwipe,
        continuousChapter: continuousChapter ?? this.continuousChapter,
        speed: speed ?? this.speed,
        sleepTimer: sleepTimer ?? this.sleepTimer,
      );

  static Future<ReaderAudioSettings> load() async {
    final p = await SharedPreferences.getInstance();
    return ReaderAudioSettings(
      backgroundPlay: p.getBool('reader_audio_background') ?? true,
      pauseOnTabLeave: p.getBool('reader_audio_pause_tab') ?? false,
      continueOnChapterSwipe: p.getBool('reader_audio_swipe_cont') ?? true,
      continuousChapter: p.getBool('reader_audio_continuous') ?? false,
      speed: p.getDouble('reader_audio_speed') ?? 1.0,
      sleepTimer: p.getString('reader_audio_sleep') ?? 'off',
    );
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('reader_audio_background', backgroundPlay);
    await p.setBool('reader_audio_pause_tab', pauseOnTabLeave);
    await p.setBool('reader_audio_swipe_cont', continueOnChapterSwipe);
    await p.setBool('reader_audio_continuous', continuousChapter);
    await p.setDouble('reader_audio_speed', speed);
    await p.setString('reader_audio_sleep', sleepTimer);
  }
}

enum ReaderAudioState { off, loading, playing, paused, error }

class AudioTimestampVerse {
  const AudioTimestampVerse({required this.verse, required this.startMs});

  final int verse;
  final int startMs;

  factory AudioTimestampVerse.fromJson(Map<String, dynamic> j) =>
      AudioTimestampVerse(
        verse: (j['verse'] as num).toInt(),
        startMs: (j['start_ms'] as num).toInt(),
      );
}

int? resolveAudioCurrentVerse(int positionMs, List<AudioTimestampVerse> rows) {
  if (rows.isEmpty) return null;
  var current = rows.first.verse;
  for (final row in rows) {
    if (row.startMs <= positionMs + 120) {
      current = row.verse;
    } else {
      break;
    }
  }
  return current;
}

class ReaderAudioSession {
  const ReaderAudioSession({
    this.state = ReaderAudioState.off,
    this.available = true,
    this.collapsed = false,
    this.focusOpen = false,
    this.settingsOpen = false,
    this.coachVisible = false,
    this.bookId = '',
    this.bookName = '',
    this.chapter = 1,
    this.audioLabel = '和合本朗读',
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.copyright = '',
    this.currentVerse,
    this.timestamps = const [],
    this.chapterVerses = const [],
  });

  final ReaderAudioState state;
  final bool available;
  final bool collapsed;
  final bool focusOpen;
  final bool settingsOpen;
  final bool coachVisible;
  final String bookId;
  final String bookName;
  final int chapter;
  final String audioLabel;
  final Duration position;
  final Duration duration;
  final String copyright;
  final int? currentVerse;
  final List<AudioTimestampVerse> timestamps;
  final List<Map<String, dynamic>> chapterVerses;

  bool get hasTimestamps => timestamps.isNotEmpty;

  bool get visible =>
      state == ReaderAudioState.playing ||
      state == ReaderAudioState.paused ||
      state == ReaderAudioState.loading;

  ReaderAudioSession copyWith({
    ReaderAudioState? state,
    bool? available,
    bool? collapsed,
    bool? focusOpen,
    bool? settingsOpen,
    bool? coachVisible,
    String? bookId,
    String? bookName,
    int? chapter,
    String? audioLabel,
    Duration? position,
    Duration? duration,
    String? copyright,
    int? currentVerse,
    List<AudioTimestampVerse>? timestamps,
    List<Map<String, dynamic>>? chapterVerses,
    bool clearCurrentVerse = false,
  }) =>
      ReaderAudioSession(
        state: state ?? this.state,
        available: available ?? this.available,
        collapsed: collapsed ?? this.collapsed,
        focusOpen: focusOpen ?? this.focusOpen,
        settingsOpen: settingsOpen ?? this.settingsOpen,
        coachVisible: coachVisible ?? this.coachVisible,
        bookId: bookId ?? this.bookId,
        bookName: bookName ?? this.bookName,
        chapter: chapter ?? this.chapter,
        audioLabel: audioLabel ?? this.audioLabel,
        position: position ?? this.position,
        duration: duration ?? this.duration,
        copyright: copyright ?? this.copyright,
        currentVerse: clearCurrentVerse ? null : (currentVerse ?? this.currentVerse),
        timestamps: timestamps ?? this.timestamps,
        chapterVerses: chapterVerses ?? this.chapterVerses,
      );
}

class ReaderAudioController extends Notifier<ReaderAudioSession> {
  ReaderAudioSettings _settings = const ReaderAudioSettings();
  StreamSubscription<Duration>? _posSub;
  StreamSubscription<PlayerState>? _stateSub;
  Timer? _sleepTimer;
  String _screenVersion = 'cuvs';
  List<AudioTimestampVerse> _timestamps = [];
  int _manualScrollUntilMs = 0;
  String? _prefetchedNextKey;
  int _checkpointSaveMs = 0;
  static const _checkpointKey = 'reader_audio_checkpoint';
  static const _checkpointTtlMs = 24 * 60 * 60 * 1000;

  void Function()? onSkipPreviousChapter;
  void Function()? onSkipNextChapter;
  void Function()? onContinuousNextChapter;

  AudioPlayer? get _player => ReaderAudioHandler.instance?.player;

  ReaderAudioHandler? get _handler => ReaderAudioHandler.instance;

  @override
  ReaderAudioSession build() {
    ref.onDispose(_dispose);
    Future.microtask(() async {
      _settings = await ReaderAudioSettings.load();
      _syncHandlerCallbacks();
    });
    return const ReaderAudioSession();
  }

  void _syncHandlerCallbacks() {
    final h = _handler;
    if (h == null) return;
    h.onSkipPrevious = onSkipPreviousChapter;
    h.onSkipNext = onSkipNextChapter;
  }

  void setNotificationHandlers({
    void Function()? onPrevious,
    void Function()? onNext,
    void Function()? onContinuousNext,
  }) {
    onSkipPreviousChapter = onPrevious;
    onSkipNextChapter = onNext;
    onContinuousNextChapter = onContinuousNext;
    _syncHandlerCallbacks();
  }

  /// 离开 App 且关闭「后台继续」时暂停。
  void onAppBackground() {
    if (!_settings.backgroundPlay && state.state == ReaderAudioState.playing) {
      unawaited(_saveCheckpointFromPlayer());
      unawaited(_handler?.pause());
      state = state.copyWith(state: ReaderAudioState.paused);
    }
  }

  Future<void> _saveCheckpointFromPlayer() async {
    final player = _player;
    if (player == null || state.bookId.isEmpty) return;
    final pos = player.position;
    final dur = player.duration;
    if (pos.inSeconds < 3) return;
    if (dur != null && dur.inSeconds > 0 && pos >= dur - const Duration(seconds: 5)) {
      await _clearCheckpoint();
      return;
    }
    final p = await SharedPreferences.getInstance();
    await p.setString(
      _checkpointKey,
      jsonEncode({
        'book': state.bookId,
        'chapter': state.chapter,
        'ms': pos.inMilliseconds,
        'at': DateTime.now().millisecondsSinceEpoch,
      }),
    );
  }

  Future<Duration?> _loadCheckpoint(String bookId, int chapter) async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_checkpointKey);
    if (raw == null) return null;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      if (m['book'] != bookId || (m['chapter'] as num).toInt() != chapter) {
        return null;
      }
      final at = (m['at'] as num).toInt();
      if (DateTime.now().millisecondsSinceEpoch - at > _checkpointTtlMs) {
        return null;
      }
      final ms = (m['ms'] as num).toInt();
      if (ms < 3000) return null;
      return Duration(milliseconds: ms);
    } catch (_) {
      return null;
    }
  }

  Future<void> _clearCheckpoint() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_checkpointKey);
  }

  Future<void> _prefetchNextChapter(String bookId, int nextChapter) async {
    final key = '$bookId:$nextChapter';
    if (_prefetchedNextKey == key) return;
    _prefetchedNextKey = key;
    final meta = await _fetchMeta(bookId, nextChapter, _screenVersion);
    if (meta == null || meta['available'] != true) return;
    final path = meta['stream_path'] as String?;
    if (path == null) return;
    try {
      final client = ref.read(dioProvider);
      await client.get<Object?>(
        path,
        options: Options(
          headers: {'Range': 'bytes=0-65535'},
          responseType: ResponseType.bytes,
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
    } catch (_) {
      /* 弱网静默失败 */
    }
  }

  ReaderAudioSettings get settings => _settings;

  void notifyManualScroll() {
    _manualScrollUntilMs = DateTime.now().millisecondsSinceEpoch + 8000;
  }

  Future<void> _dispose() async {
    _sleepTimer?.cancel();
    await _posSub?.cancel();
    await _stateSub?.cancel();
    _posSub = null;
    _stateSub = null;
  }

  Future<void> _attachPlayerStreams() async {
    await _posSub?.cancel();
    await _stateSub?.cancel();
    final player = _player;
    if (player == null) return;
    _posSub = player.positionStream.listen((p) {
      _updateVerseFromPosition(p);
      final dur = player.duration;
      state = state.copyWith(
        position: p,
        duration: dur ?? state.duration,
      );
      if (dur != null && dur.inMilliseconds > 0 && p.inMilliseconds / dur.inMilliseconds > 0.7) {
        unawaited(_prefetchNextChapter(state.bookId, state.chapter + 1));
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      if (now - _checkpointSaveMs > 5000) {
        _checkpointSaveMs = now;
        unawaited(_saveCheckpointFromPlayer());
      }
    });
    _stateSub = player.playerStateStream.listen((ps) {
      if (ps.processingState == ProcessingState.completed) {
        unawaited(_clearCheckpoint());
        if (_settings.sleepTimer == 'chapter') {
          stop();
          return;
        }
        if (_settings.continuousChapter) {
          onContinuousNextChapter?.call();
        } else {
          stop();
        }
      }
      final playing = ps.playing;
      if (playing && state.state != ReaderAudioState.playing) {
        state = state.copyWith(state: ReaderAudioState.playing);
      } else if (!playing &&
          ps.processingState != ProcessingState.completed &&
          state.state == ReaderAudioState.playing) {
        state = state.copyWith(state: ReaderAudioState.paused);
      }
    });
  }

  void _applySleepTimer() {
    _sleepTimer?.cancel();
    _sleepTimer = null;
    if (_settings.sleepTimer == 'off') return;
    if (_settings.sleepTimer == '15') {
      _sleepTimer = Timer(const Duration(minutes: 15), _pauseForSleepTimer);
    } else if (_settings.sleepTimer == '30') {
      _sleepTimer = Timer(const Duration(minutes: 30), _pauseForSleepTimer);
    }
  }

  void _pauseForSleepTimer() {
    _player?.pause();
    state = state.copyWith(state: ReaderAudioState.paused);
  }

  Future<List<AudioTimestampVerse>> _fetchTimestamps(
    String audioVersion,
    String bookId,
    int chapter,
  ) async {
    final client = ref.read(dioProvider);
    try {
      final res = await client.get(
        '/bible/audio/timestamps/$audioVersion/$bookId/$chapter',
      );
      final data = Map<String, dynamic>.from(res.data as Map);
      final rows = data['verses'] as List<dynamic>? ?? const [];
      return rows
          .map((e) => AudioTimestampVerse.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  void _updateVerseFromPosition(Duration pos) {
    final verse = resolveAudioCurrentVerse(pos.inMilliseconds, _timestamps);
    if (verse != state.currentVerse) {
      state = state.copyWith(currentVerse: verse);
      if (verse != null &&
          state.state == ReaderAudioState.playing &&
          DateTime.now().millisecondsSinceEpoch >= _manualScrollUntilMs) {
        // scroll handled by ReaderChapterBody via watch
      }
    }
  }

  Future<Map<String, dynamic>?> _fetchMeta(
    String bookId,
    int chapter,
    String screenVersion,
  ) async {
    final client = ref.read(dioProvider);
    try {
      final res = await client.get(
        '/bible/audio/chapter',
        queryParameters: {
          'book': bookId,
          'chapter': chapter,
          'version': screenVersion,
        },
      );
      return Map<String, dynamic>.from(res.data as Map);
    } catch (_) {
      return null;
    }
  }

  Future<void> bindChapter({
    required String bookId,
    required String bookName,
    required int chapter,
    required String screenVersion,
    bool pausedByOverlay = false,
  }) async {
    _screenVersion = screenVersion;
    final prevBook = state.bookId;
    final prevChapter = state.chapter;
    final wasActive = state.state == ReaderAudioState.playing ||
        state.state == ReaderAudioState.paused;
    final meta = await _fetchMeta(bookId, chapter, screenVersion);
    final available = meta?['available'] == true;
    state = state.copyWith(
      bookId: bookId,
      bookName: bookName,
      chapter: chapter,
      available: available,
      audioLabel: meta?['audio_label'] as String? ?? '和合本朗读',
      copyright: meta?['copyright'] as String? ?? '',
    );
    if (pausedByOverlay && _player != null) {
      await _handler?.pause();
      state = state.copyWith(state: ReaderAudioState.paused);
    }
    if (wasActive && (prevBook != bookId || prevChapter != chapter)) {
      if (_settings.continueOnChapterSwipe &&
          state.state == ReaderAudioState.playing) {
        await play(
          bookId: bookId,
          bookName: bookName,
          chapter: chapter,
          skipCheckpoint: true,
        );
      } else if (state.state != ReaderAudioState.paused) {
        await stop();
      }
    }
  }

  Future<void> toggle({
    required String bookId,
    required String bookName,
    required int chapter,
    required String screenVersion,
  }) async {
    if (state.state == ReaderAudioState.playing) {
      peiaiHapticAudioToggle();
      await _saveCheckpointFromPlayer();
      await _handler?.pause();
      state = state.copyWith(state: ReaderAudioState.paused);
      return;
    }
    if (state.state == ReaderAudioState.paused) {
      peiaiHapticAudioToggle();
      await _handler?.play();
      state = state.copyWith(state: ReaderAudioState.playing);
      return;
    }
    await play(
      bookId: bookId,
      bookName: bookName,
      chapter: chapter,
      screenVersion: screenVersion,
    );
  }

  Future<bool> _networkOk() async {
    final net = ref.read(networkOkProvider);
    return net.maybeWhen(data: (ok) => ok, orElse: () => true);
  }

  Future<void> play({
    required String bookId,
    required String bookName,
    required int chapter,
    String? screenVersion,
    bool skipCheckpoint = false,
  }) async {
    state = state.copyWith(
      state: ReaderAudioState.loading,
      bookId: bookId,
      bookName: bookName,
      chapter: chapter,
    );
    _prefetchedNextKey = null;
    _checkpointSaveMs = 0;
    if (!await _networkOk()) {
      state = state.copyWith(state: ReaderAudioState.error);
      return;
    }
    final meta = await _fetchMeta(
      bookId,
      chapter,
      screenVersion ?? _screenVersion,
    );
    if (meta == null || meta['available'] != true) {
      state = state.copyWith(state: ReaderAudioState.off, available: false);
      return;
    }
    final path = meta['stream_path'] as String?;
    if (path == null) {
      state = state.copyWith(state: ReaderAudioState.error);
      return;
    }
    final audioVersion = meta['audio_version'] as String? ?? 'cuvs';
    _timestamps = meta['has_timestamps'] == true
        ? await _fetchTimestamps(audioVersion, bookId, chapter)
        : const [];
    final handler = _handler;
    final player = _player;
    if (handler == null || player == null) {
      state = state.copyWith(state: ReaderAudioState.error);
      return;
    }
    final url = '${AppConfig.baseUrl}$path';
    final audioLabel = meta['audio_label'] as String? ?? '和合本朗读';
    try {
      await handler.setChapterMedia(
        bookId: bookId,
        chapter: chapter,
        bookName: bookName,
        audioLabel: audioLabel,
      );
      await handler.loadUrl(url);
      await player.setSpeed(_settings.speed);
      for (var i = 0; i < 40; i++) {
        final dur = player.duration;
        if (dur != null && dur > Duration.zero) break;
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      if (!skipCheckpoint) {
        final cp = await _loadCheckpoint(bookId, chapter);
        final dur = player.duration;
        if (cp != null && dur != null && cp < dur - const Duration(seconds: 5)) {
          await player.seek(cp);
          _updateVerseFromPosition(cp);
        }
      }
      _applySleepTimer();
      await _attachPlayerStreams();
      peiaiHapticAudioToggle();
      await handler.play();
      final prefs = await SharedPreferences.getInstance();
      final coachSeen = prefs.getBool('reader_audio_coach_seen') ?? false;
      state = state.copyWith(
        state: ReaderAudioState.playing,
        available: true,
        audioLabel: meta['audio_label'] as String? ?? '和合本朗读',
        copyright: meta['copyright'] as String? ?? '',
        coachVisible: !coachSeen,
        duration: player.duration ?? Duration.zero,
        timestamps: _timestamps,
      );
      if (!coachSeen) {
        await prefs.setBool('reader_audio_coach_seen', true);
        Future.delayed(const Duration(milliseconds: 2500), () {
          if (ref.mounted) state = state.copyWith(coachVisible: false);
        });
      }
    } catch (_) {
      state = state.copyWith(state: ReaderAudioState.error);
    }
  }

  Future<void> stop() async {
    _sleepTimer?.cancel();
    _sleepTimer = null;
    await _saveCheckpointFromPlayer();
    await _posSub?.cancel();
    await _stateSub?.cancel();
    _posSub = null;
    _stateSub = null;
    _prefetchedNextKey = null;
    await _handler?.stop();
    _timestamps = [];
    state = state.copyWith(
      state: ReaderAudioState.off,
      position: Duration.zero,
      duration: Duration.zero,
      collapsed: false,
      focusOpen: false,
      clearCurrentVerse: true,
      timestamps: const [],
    );
  }

  Future<void> retry() async {
    if (state.bookId.isEmpty) return;
    await play(
      bookId: state.bookId,
      bookName: state.bookName,
      chapter: state.chapter,
    );
  }

  Future<void> seek(Duration pos) async {
    await _player?.seek(pos);
    unawaited(_saveCheckpointFromPlayer());
  }

  void setCollapsed(bool v) => state = state.copyWith(collapsed: v);

  void setFocusOpen(bool v) => state = state.copyWith(focusOpen: v);

  void setSettingsOpen(bool v) => state = state.copyWith(settingsOpen: v);

  Future<void> updateSettings(ReaderAudioSettings next) async {
    _settings = next;
    await next.save();
    await _player?.setSpeed(next.speed);
    _applySleepTimer();
  }

  Future<void> seekToVerse(int verse) async {
    AudioTimestampVerse? row;
    for (final t in _timestamps) {
      if (t.verse == verse) {
        row = t;
        break;
      }
    }
    if (row == null) return;
    await seek(Duration(milliseconds: row.startMs));
  }

  void setChapterVerses(List<Map<String, dynamic>> verses) {
    state = state.copyWith(chapterVerses: verses);
  }
}

final readerAudioProvider =
    NotifierProvider<ReaderAudioController, ReaderAudioSession>(
  ReaderAudioController.new,
);

String formatAudioTime(Duration d) {
  final sec = d.inSeconds;
  final m = sec ~/ 60;
  final s = sec % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

class ReaderAudioWaveform extends StatelessWidget {
  const ReaderAudioWaveform({
    super.key,
    required this.playing,
    required this.unavailable,
  });

  final bool playing;
  final bool unavailable;

  @override
  Widget build(BuildContext context) {
    final c = unavailable
        ? AppColors.inkFaint.withValues(alpha: 0.35)
        : playing
            ? AppColors.accentDeep
            : AppColors.inkFaint;
    return SizedBox(
      width: 12,
      height: 12,
      child: CustomPaint(
        painter: _WavePainter(color: c, unavailable: unavailable, paused: !playing && !unavailable),
      ),
    );
  }
}

class _WavePainter extends CustomPainter {
  _WavePainter({required this.color, required this.unavailable, required this.paused});

  final Color color;
  final bool unavailable;
  final bool paused;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round;
    if (unavailable) {
      canvas.drawLine(const Offset(1, 11), const Offset(11, 1), paint);
      return;
    }
    if (paused && !unavailable) {
      canvas.drawLine(const Offset(3.5, 4), const Offset(3.5, 8), paint);
      canvas.drawLine(const Offset(8.5, 4), const Offset(8.5, 8), paint);
      return;
    }
    canvas.drawLine(const Offset(2, 10), const Offset(2, 6), paint);
    canvas.drawLine(const Offset(6, 10), const Offset(6, 3), paint);
    canvas.drawLine(const Offset(10, 10), const Offset(10, 5), paint);
  }

  @override
  bool shouldRepaint(covariant _WavePainter oldDelegate) =>
      oldDelegate.color != color ||
      oldDelegate.unavailable != unavailable ||
      oldDelegate.paused != paused;
}

class ReaderAudioTopButton extends StatelessWidget {
  const ReaderAudioTopButton({
    super.key,
    required this.session,
    required this.onTap,
    required this.onLongPress,
  });

  final ReaderAudioSession session;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final playing = session.state == ReaderAudioState.playing;
    return GestureDetector(
      onLongPress: onLongPress,
      child: TextButton(
        onPressed: session.available ? onTap : null,
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          minimumSize: const Size(44, 40),
          foregroundColor: playing ? AppColors.accentDeep : AppColors.inkFaint,
          backgroundColor: playing
              ? AppColors.accentWash.withValues(alpha: 0.55)
              : Colors.transparent,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ReaderAudioWaveform(
              playing: playing,
              unavailable: !session.available,
            ),
            const SizedBox(width: 4),
            const Text('朗读', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}

class ReaderAudioMiniBar extends StatelessWidget {
  const ReaderAudioMiniBar({
    super.key,
    required this.session,
    required this.bottomInset,
    required this.onToggle,
    required this.onExpand,
    required this.onSeek,
    this.onRetry,
    this.onDismiss,
  });

  final ReaderAudioSession session;
  final double bottomInset;
  final VoidCallback onToggle;
  final VoidCallback onExpand;
  final ValueChanged<double> onSeek;
  final VoidCallback? onRetry;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    if (!session.visible || session.focusOpen || session.settingsOpen) {
      return const SizedBox.shrink();
    }
    final loading = session.state == ReaderAudioState.loading;
    final errored = session.state == ReaderAudioState.error;
    if (session.collapsed && !errored) {
      final pct = session.duration.inMilliseconds > 0
          ? session.position.inMilliseconds / session.duration.inMilliseconds
          : 0.0;
      return Positioned(
        left: 12,
        right: 12,
        bottom: bottomInset + 8,
        child: Container(
          height: 4,
          decoration: BoxDecoration(
            color: AppColors.line,
            borderRadius: BorderRadius.circular(2),
          ),
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: pct.clamp(0.0, 1.0),
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.accentDeep,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
        ),
      );
    }
    final playing = session.state == ReaderAudioState.playing;
    return Positioned(
      left: 12,
      right: 12,
      bottom: bottomInset + 8,
      child: Material(
        elevation: 0,
        color: AppColors.surface.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.line),
          ),
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading)
                const LinearProgressIndicator(minHeight: 3)
              else if (!errored)
                SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 3,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                  ),
                  child: Slider(
                    value: session.duration.inMilliseconds > 0
                        ? session.position.inMilliseconds
                            .clamp(0, session.duration.inMilliseconds)
                            .toDouble()
                        : 0,
                    max: session.duration.inMilliseconds > 0
                        ? session.duration.inMilliseconds.toDouble()
                        : 1,
                    onChanged: onSeek,
                  ),
                ),
              Row(
                children: [
                  if (errored) ...[
                    TextButton(
                      onPressed: onRetry,
                      child: const Text('重试'),
                    ),
                    Expanded(
                      child: Text(
                        '${session.bookName} ${session.chapter} · 加载失败',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      onPressed: onDismiss,
                      icon: const Icon(Icons.close),
                    ),
                  ] else ...[
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      onPressed: loading ? null : onToggle,
                      icon: Icon(playing ? Icons.pause : Icons.play_arrow),
                    ),
                    Expanded(
                      child: Text(
                        loading
                            ? '${session.bookName} ${session.chapter} · 加载中…'
                            : '${session.bookName} ${session.chapter} · ${session.audioLabel}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      onPressed: onExpand,
                      icon: const Icon(Icons.keyboard_arrow_up),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> showReaderAudioSettingsSheet(
  BuildContext context,
  WidgetRef ref,
) async {
  final ctrl = ref.read(readerAudioProvider.notifier);
  var settings = ctrl.settings;
  final copyright = ref.read(readerAudioProvider).copyright;
  await showReaderSheet(
    context: context,
    heightFactor: 0.72,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setLocal) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text('朗读', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  ),
                  ReaderSheetCloseButton(onPressed: () => Navigator.of(ctx).pop()),
                ],
              ),
              const SizedBox(height: 12),
              _AudioSegRow(
                label: '倍速',
                value: settings.speed.toString(),
                options: const ['0.75', '1', '1.25', '1.5'],
                onChanged: (v) {
                  final next = settings.copyWith(speed: double.parse(v));
                  settings = next;
                  setLocal(() {});
                  ctrl.updateSettings(next);
                },
              ),
              _AudioSegRow(
                label: '定时停止',
                value: settings.sleepTimer,
                options: const ['off', '15', '30', 'chapter'],
                labels: const {'off': '关', '15': '15分', '30': '30分', 'chapter': '本章末'},
                onChanged: (v) {
                  final next = settings.copyWith(sleepTimer: v);
                  settings = next;
                  setLocal(() {});
                  ctrl.updateSettings(next);
                },
              ),
              const Text('播放', style: TextStyle(fontSize: 13, color: AppColors.inkSoft)),
              _AudioToggleRow(
                label: '锁屏或切换应用后继续',
                value: settings.backgroundPlay,
                onChanged: (v) {
                  final next = settings.copyWith(backgroundPlay: v);
                  settings = next;
                  setLocal(() {});
                  ctrl.updateSettings(next);
                },
              ),
              _AudioToggleRow(
                label: '离开圣经 Tab 时暂停',
                hint: '离开 Tab 优先于「继续播放」。',
                value: settings.pauseOnTabLeave,
                onChanged: (v) {
                  final next = settings.copyWith(pauseOnTabLeave: v);
                  settings = next;
                  setLocal(() {});
                  ctrl.updateSettings(next);
                },
              ),
              _AudioToggleRow(
                label: '播放中滑动换章后继续',
                value: settings.continueOnChapterSwipe,
                onChanged: (v) {
                  final next = settings.copyWith(continueOnChapterSwipe: v);
                  settings = next;
                  setLocal(() {});
                  ctrl.updateSettings(next);
                },
              ),
              _AudioSegRow(
                label: '连续朗读',
                value: settings.continuousChapter ? 'on' : 'off',
                options: const ['off', 'on'],
                labels: const {'off': '关', 'on': '本章结束后下一章'},
                onChanged: (v) {
                  final next = settings.copyWith(continuousChapter: v == 'on');
                  settings = next;
                  setLocal(() {});
                  ctrl.updateSettings(next);
                },
              ),
              const SizedBox(height: 8),
              const Text(
                '朗读需联网流式播放，不提供音频文件下载。iOS 锁屏可能因系统限制暂停，可重新点朗读。',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
              if (copyright.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(copyright, style: const TextStyle(fontSize: 11, color: AppColors.inkFaint)),
                ),
            ],
          ),
        );
      },
    ),
  );
  ctrl.setSettingsOpen(false);
}

class _AudioSegRow extends StatelessWidget {
  const _AudioSegRow({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    this.labels,
  });

  final String label;
  final String value;
  final List<String> options;
  final Map<String, String>? labels;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final o in options)
                ChoiceChip(
                  label: Text(labels?[o] ?? o),
                  selected: value == o,
                  onSelected: (_) => onChanged(o),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AudioToggleRow extends StatelessWidget {
  const _AudioToggleRow({
    required this.label,
    required this.value,
    required this.onChanged,
    this.hint,
  });

  final String label;
  final String? hint;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(label, style: const TextStyle(fontSize: 14)),
      subtitle: hint == null ? null : Text(hint!, style: const TextStyle(fontSize: 12)),
      value: value,
      onChanged: onChanged,
    );
  }
}

class ReaderAudioFocusOverlay extends ConsumerWidget {
  const ReaderAudioFocusOverlay({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(readerAudioProvider);
    final ctrl = ref.read(readerAudioProvider.notifier);
    if (!session.focusOpen) return const SizedBox.shrink();
    final playing = session.state == ReaderAudioState.playing;
    final pct = session.duration.inMilliseconds > 0
        ? session.position.inMilliseconds / session.duration.inMilliseconds
        : 0.0;

    return Material(
      color: Colors.black.withValues(alpha: 0.42),
      child: SafeArea(
        child: Center(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 20),
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.line),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => ctrl.setFocusOpen(false),
                    child: const Text('回到阅读'),
                  ),
                ),
                Text(
                  '${session.bookName} ${session.chapter}',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                ),
                Text(session.audioLabel, style: const TextStyle(color: AppColors.inkSoft)),
                if (session.hasTimestamps && session.chapterVerses.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.36),
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: session.chapterVerses.length,
                      itemBuilder: (ctx, i) {
                        final row = session.chapterVerses[i];
                        final verse = (row['verse'] as num).toInt();
                        final text = row['text'] as String? ?? '';
                        final active = session.currentVerse == verse;
                        return ListTile(
                          dense: true,
                          selected: active,
                          selectedTileColor: AppColors.accentWash.withValues(alpha: 0.45),
                          title: Text('$verse  $text', maxLines: 3, overflow: TextOverflow.ellipsis),
                          onTap: () => ctrl.seekToVerse(verse),
                        );
                      },
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                LinearProgressIndicator(value: pct.clamp(0.0, 1.0)),
                Text(
                  '${formatAudioTime(session.position)} / ${formatAudioTime(session.duration)}',
                  style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
                ),
                IconButton(
                  iconSize: 44,
                  onPressed: () => ctrl.toggle(
                    bookId: session.bookId,
                    bookName: session.bookName,
                    chapter: session.chapter,
                  ),
                  icon: Icon(playing ? Icons.pause_circle_filled : Icons.play_circle_filled),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    TextButton(
                      onPressed: () => ctrl.seek(session.position - const Duration(seconds: 15)),
                      child: const Text('−15s'),
                    ),
                    TextButton(
                      onPressed: () {
                        ctrl.setFocusOpen(false);
                        showReaderAudioSettingsSheet(context, ref);
                      },
                      child: const Text('设置'),
                    ),
                    TextButton(
                      onPressed: () => ctrl.seek(session.position + const Duration(seconds: 15)),
                      child: const Text('+15s'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
