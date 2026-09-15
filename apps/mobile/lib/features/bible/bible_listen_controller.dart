/// AI 听经会话：按需合成 + 全屏面 + MediaSession。
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';
import '../../core/peiai_haptics.dart';
import 'bible_listen_api.dart';
import 'reader_audio_handler.dart';

enum BibleListenUi { idle, preparing, playing, paused, error }

class BibleListenSettings {
  const BibleListenSettings({
    this.speed = 1.0,
    this.continuousChapter = true,
    this.sleepMinutes,
    this.voice = kListenDefaultVoice,
  });

  final double speed;
  final bool continuousChapter;
  final int? sleepMinutes;
  final String voice;

  BibleListenSettings copyWith({
    double? speed,
    bool? continuousChapter,
    int? sleepMinutes,
    bool clearSleep = false,
    String? voice,
  }) {
    return BibleListenSettings(
      speed: speed ?? this.speed,
      continuousChapter: continuousChapter ?? this.continuousChapter,
      sleepMinutes: clearSleep ? null : (sleepMinutes ?? this.sleepMinutes),
      voice: voice ?? this.voice,
    );
  }

  static BibleListenSettings loadSync(SharedPreferences prefs) {
    final rawVoice = prefs.getString('bible_listen_voice') ?? kListenDefaultVoice;
    final voice = kListenVoices.any((v) => v.id == rawVoice)
        ? rawVoice
        : kListenDefaultVoice;
    return BibleListenSettings(
      speed: prefs.getDouble('bible_listen_speed') ?? 1.0,
      continuousChapter: true,
      sleepMinutes: prefs.getInt('bible_listen_sleep'),
      voice: voice,
    );
  }

  static Future<BibleListenSettings> load(SharedPreferences prefs) async {
    return loadSync(prefs);
  }

  Future<void> save(SharedPreferences prefs) async {
    await prefs.setDouble('bible_listen_speed', speed);
    await prefs.setBool('bible_listen_continuous', continuousChapter);
    await prefs.setString('bible_listen_voice', voice);
    if (sleepMinutes == null) {
      await prefs.remove('bible_listen_sleep');
    } else {
      await prefs.setInt('bible_listen_sleep', sleepMinutes!);
    }
  }
}

class BibleListenSession {
  const BibleListenSession({
    this.ui = BibleListenUi.idle,
    this.sheetOpen = false,
    this.error,
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.currentVerse,
    this.verseText = '',
    this.meta,
    this.settings = const BibleListenSettings(),
    this.bookId = '',
    this.bookName = '',
    this.chapter = 0,
    this.translation = '',
    this.translationLabel = '',
    this.sleepClosing = false,
  });

  final BibleListenUi ui;
  final bool sheetOpen;
  final String? error;
  final Duration position;
  final Duration duration;
  final int? currentVerse;
  final String verseText;
  final ListenChapterReady? meta;
  final BibleListenSettings settings;
  final String bookId;
  final String bookName;
  final int chapter;
  final String translation;
  final String translationLabel;
  final bool sleepClosing;

  bool get sessionActive =>
      ui == BibleListenUi.playing ||
      ui == BibleListenUi.paused ||
      ui == BibleListenUi.preparing;

  bool get canSeek => (meta?.timeline.isNotEmpty ?? false);

  BibleListenSession copyWith({
    BibleListenUi? ui,
    bool? sheetOpen,
    String? error,
    bool clearError = false,
    Duration? position,
    Duration? duration,
    int? currentVerse,
    bool clearVerse = false,
    String? verseText,
    ListenChapterReady? meta,
    bool clearMeta = false,
    BibleListenSettings? settings,
    String? bookId,
    String? bookName,
    int? chapter,
    String? translation,
    String? translationLabel,
    bool? sleepClosing,
  }) {
    return BibleListenSession(
      ui: ui ?? this.ui,
      sheetOpen: sheetOpen ?? this.sheetOpen,
      error: clearError ? null : (error ?? this.error),
      position: position ?? this.position,
      duration: duration ?? this.duration,
      currentVerse: clearVerse ? null : (currentVerse ?? this.currentVerse),
      verseText: verseText ?? this.verseText,
      meta: clearMeta ? null : (meta ?? this.meta),
      settings: settings ?? this.settings,
      bookId: bookId ?? this.bookId,
      bookName: bookName ?? this.bookName,
      chapter: chapter ?? this.chapter,
      translation: translation ?? this.translation,
      translationLabel: translationLabel ?? this.translationLabel,
      sleepClosing: sleepClosing ?? this.sleepClosing,
    );
  }
}

class BibleListenController extends Notifier<BibleListenSession> {
  StreamSubscription? _posSub;
  StreamSubscription? _playerStateSub;
  Timer? _sleepTimer;
  Timer? _sleepFadeTick;
  int _gen = 0;
  List<({int verse, String text})> _verses = const [];
  void Function(String book, int chapter)? onContinuousNext;
  String? _prefetchKey;

  @override
  BibleListenSession build() {
    ref.onDispose(() {
      _posSub?.cancel();
      _playerStateSub?.cancel();
      _clearSleepTimers(restoreVolume: true);
    });
    final settings = BibleListenSettings.loadSync(ref.read(prefsProvider));
    return BibleListenSession(settings: settings);
  }

  bool _followChapterOnce = false;

  /// 章末续听等听读驱动换章：关面时也允许跟听下一章。
  void markFollowChapterOnce() {
    _followChapterOnce = true;
  }

  Future<void> openSheet({
    required String bookId,
    required String bookName,
    required int chapter,
    required String translation,
    required String translationLabel,
    required List<({int verse, String text})> verses,
  }) async {
    _verses = verses;
    state = state.copyWith(
      sheetOpen: true,
      bookId: bookId,
      bookName: bookName,
      chapter: chapter,
      translation: translation,
      translationLabel: translationLabel,
      verseText: verses.isNotEmpty ? verses.first.text : '',
    );
    final same = state.meta != null &&
        state.meta!.book == bookId &&
        state.meta!.chapter == chapter &&
        state.meta!.translation == translation &&
        state.meta!.voice == state.settings.voice;
    final player = ReaderAudioHandler.instance?.player;
    if (same && player != null && player.playing) {
      state = state.copyWith(ui: BibleListenUi.playing);
      return;
    }
    if (same &&
        player != null &&
        !player.playing &&
        state.ui != BibleListenUi.error &&
        state.ui != BibleListenUi.idle) {
      state = state.copyWith(ui: BibleListenUi.paused);
      return;
    }
    await prepareAndPlay(
      bookId: bookId,
      bookName: bookName,
      chapter: chapter,
      translation: translation,
      translationLabel: translationLabel,
      verses: verses,
    );
  }

  void closeSheet({bool cancelIfPreparing = true}) {
    state = state.copyWith(sheetOpen: false);
    if (cancelIfPreparing && state.ui == BibleListenUi.preparing) {
      final player = ReaderAudioHandler.instance?.player;
      final started = player != null &&
          player.playing &&
          player.position > const Duration(milliseconds: 50);
      if (!started) {
        _gen++;
        state = state.copyWith(ui: BibleListenUi.idle, clearError: true);
      }
    }
  }

  Future<void> prepareAndPlay({
    required String bookId,
    required String bookName,
    required int chapter,
    required String translation,
    required String translationLabel,
    required List<({int verse, String text})> verses,
  }) async {
    final gen = ++_gen;
    _verses = verses;
    state = state.copyWith(
      ui: BibleListenUi.preparing,
      clearError: true,
      bookId: bookId,
      bookName: bookName,
      chapter: chapter,
      translation: translation,
      translationLabel: translationLabel,
      verseText: verses.isNotEmpty ? verses.first.text : state.verseText,
    );
    try {
      final api = ref.read(bibleListenApiProvider);
      final ready = await api.ensureChapter(
        translation: translation,
        book: bookId,
        chapter: chapter,
        voice: state.settings.voice,
      );
      if (gen != _gen || !ref.mounted) return;
      final handler = ensureReaderAudioHandler();
      final player = handler.player;
      await handler.setChapterMedia(
        bookId: bookId,
        chapter: chapter,
        bookName: bookName,
        audioLabel: ready.translationLabel.isNotEmpty
            ? ready.translationLabel
            : '彼爱听读',
      );
      await handler.loadUrl(ready.url);
      await player.setSpeed(state.settings.speed);
      await _attachStreams();
      peiaiHapticAudioToggle();
      await handler.play();
      if (gen != _gen || !ref.mounted) return;
      state = state.copyWith(
        ui: BibleListenUi.playing,
        meta: ready,
        duration: Duration(milliseconds: ready.durationMs),
        clearError: true,
      );
      _applySleepTimer();
    } catch (e) {
      if (gen != _gen || !ref.mounted) return;
      state = state.copyWith(
        ui: BibleListenUi.error,
        error: e.toString().replaceFirst('DioException: ', ''),
      );
    }
  }

  Future<void> _attachStreams() async {
    await _posSub?.cancel();
    await _playerStateSub?.cancel();
    final player = ReaderAudioHandler.instance?.player;
    if (player == null) return;
    _posSub = player.positionStream.listen((pos) {
      if (!ref.mounted) return;
      final ms = pos.inMilliseconds;
      final verse = resolveListenVerse(state.meta?.timeline ?? const [], ms);
      String text = state.verseText;
      if (verse != null) {
        for (final v in _verses) {
          if (v.verse == verse) {
            text = v.text;
            break;
          }
        }
      }
      state = state.copyWith(
        position: pos,
        duration: player.duration ?? state.duration,
        currentVerse: verse,
        verseText: text,
      );
      _maybePrefetch(pos, player.duration);
    });
    _playerStateSub = player.playerStateStream.listen((ps) {
      if (!ref.mounted) return;
      if (state.ui == BibleListenUi.preparing) return;
      if (ps.processingState == ProcessingState.completed) {
        final m = state.meta;
        if (state.settings.continuousChapter &&
            m?.nextBook != null &&
            m?.nextChapter != null) {
          _followChapterOnce = true;
          onContinuousNext?.call(m!.nextBook!, m.nextChapter!);
          return;
        }
        state = state.copyWith(ui: BibleListenUi.paused);
        return;
      }
      if (ps.playing) {
        state = state.copyWith(ui: BibleListenUi.playing);
      } else if (state.ui == BibleListenUi.playing) {
        state = state.copyWith(ui: BibleListenUi.paused);
      }
    });
  }

  void _maybePrefetch(Duration pos, Duration? dur) {
    final m = state.meta;
    if (!state.settings.continuousChapter || m?.nextBook == null || dur == null) {
      return;
    }
    if (dur.inMilliseconds <= 0) return;
    if (pos.inMilliseconds / dur.inMilliseconds < 0.7) return;
    final key = '${m!.translation}:${m.nextBook}:${m.nextChapter}';
    if (_prefetchKey == key) return;
    _prefetchKey = key;
    unawaited(
      ref.read(bibleListenApiProvider).ensureChapter(
            translation: m.translation,
            book: m.nextBook!,
            chapter: m.nextChapter!,
            voice: state.settings.voice,
          ),
    );
  }

  Future<void> togglePlayPause() async {
    final handler = ensureReaderAudioHandler();
    final player = handler.player;
    if (state.ui == BibleListenUi.preparing) return;
    if (state.ui == BibleListenUi.error || state.ui == BibleListenUi.idle) {
      await prepareAndPlay(
        bookId: state.bookId,
        bookName: state.bookName,
        chapter: state.chapter,
        translation: state.translation,
        translationLabel: state.translationLabel,
        verses: _verses,
      );
      return;
    }
    if (player.playing) {
      await handler.pause();
      state = state.copyWith(ui: BibleListenUi.paused);
    } else {
      await handler.play();
      state = state.copyWith(ui: BibleListenUi.playing);
    }
  }

  Future<void> seekMs(int ms) async {
    final player = ensureReaderAudioHandler().player;
    if (!state.canSeek) return;
    await player.seek(Duration(milliseconds: ms));
  }

  Future<void> seekVerse(int verse) async {
    final tl = state.meta?.timeline ?? const [];
    final hit = tl.where((t) => t.verse == verse).toList();
    if (hit.isEmpty) return;
    await seekMs(hit.first.startMs);
  }

  List<({int verse, String text})> get verses => _verses;

  Future<void> stepVerse(int dir) async {
    final tl = state.meta?.timeline ?? const [];
    if (tl.isEmpty) return;
    final cur = state.currentVerse ?? tl.first.verse;
    final idx = tl.indexWhere((t) => t.verse == cur);
    final nextIdx = (idx < 0 ? 0 : idx) + dir;
    if (nextIdx < 0 || nextIdx >= tl.length) return;
    await seekMs(tl[nextIdx].startMs);
  }

  Future<void> updateSettings(BibleListenSettings next) async {
    final voiceChanged = next.voice != state.settings.voice;
    state = state.copyWith(settings: next);
    await next.save(ref.read(prefsProvider));
    final player = ReaderAudioHandler.instance?.player;
    await player?.setSpeed(next.speed);
    _applySleepTimer();
    if (voiceChanged && state.sessionActive) {
      await prepareAndPlay(
        bookId: state.bookId,
        bookName: state.bookName,
        chapter: state.chapter,
        translation: state.translation,
        translationLabel: state.translationLabel,
        verses: _verses,
      );
    }
  }

  Future<void> selectVoice(String voice) async {
    if (!kListenVoices.any((v) => v.id == voice)) return;
    await updateSettings(state.settings.copyWith(voice: voice));
  }

  void armSleep(int? minutes) {
    unawaited(
      updateSettings(
        state.settings.copyWith(
          sleepMinutes: minutes,
          clearSleep: minutes == null,
        ),
      ),
    );
  }

  void _clearSleepTimers({bool restoreVolume = false}) {
    _sleepTimer?.cancel();
    _sleepTimer = null;
    _sleepFadeTick?.cancel();
    _sleepFadeTick = null;
    if (restoreVolume) {
      unawaited(ReaderAudioHandler.instance?.player.setVolume(1));
    }
    if (ref.mounted && state.sleepClosing) {
      state = state.copyWith(sleepClosing: false);
    }
  }

  void _applySleepTimer() {
    _clearSleepTimers(restoreVolume: true);
    final m = state.settings.sleepMinutes;
    if (m == null || m <= 0) return;
    final total = Duration(minutes: m);
    final fadeCap = const Duration(seconds: 30);
    final fadeDur = total < fadeCap ? total : fadeCap;
    final fadeStart = total - fadeDur;
    _sleepTimer = Timer(fadeStart, () {
      if (!ref.mounted) return;
      state = state.copyWith(sleepClosing: true);
      final player = ReaderAudioHandler.instance?.player;
      const steps = 30;
      var step = 0;
      final tickMs = (fadeDur.inMilliseconds / steps).round().clamp(50, 2000);
      _sleepFadeTick = Timer.periodic(Duration(milliseconds: tickMs), (t) {
        step++;
        final vol = (1.0 - step / steps).clamp(0.0, 1.0);
        unawaited(player?.setVolume(vol));
        if (step >= steps) {
          t.cancel();
          _sleepFadeTick = null;
          unawaited(() async {
            await ReaderAudioHandler.instance?.pause();
            await player?.setVolume(1);
            if (!ref.mounted) return;
            final nextSettings = state.settings.copyWith(clearSleep: true);
            state = state.copyWith(
              ui: BibleListenUi.paused,
              sleepClosing: false,
              settings: nextSettings,
            );
            await nextSettings.save(ref.read(prefsProvider));
          }());
        }
      });
    });
  }

  Future<void> stopSession() async {
    _gen++;
    _clearSleepTimers(restoreVolume: true);
    await ReaderAudioHandler.instance?.stop();
    state = state.copyWith(
      ui: BibleListenUi.idle,
      sheetOpen: false,
      clearMeta: true,
      clearError: true,
      clearVerse: true,
      position: Duration.zero,
      duration: Duration.zero,
      verseText: '',
      sleepClosing: false,
    );
  }

  /// 同译本换章：听读面内或章末续听才跟听；其它导航结束听读。
  Future<void> onChapterChanged({
    required String bookId,
    required String bookName,
    required int chapter,
    required String translation,
    required String translationLabel,
    required List<({int verse, String text})> verses,
  }) async {
    if (state.translation.isNotEmpty && state.translation != translation) {
      await stopSession();
      return;
    }
    if (!state.sessionActive && !state.sheetOpen) return;
    final follow = state.sheetOpen || _followChapterOnce;
    _followChapterOnce = false;
    if (!follow) {
      await stopSession();
      return;
    }
    await prepareAndPlay(
      bookId: bookId,
      bookName: bookName,
      chapter: chapter,
      translation: translation,
      translationLabel: translationLabel,
      verses: verses,
    );
  }
}

final bibleListenProvider =
    NotifierProvider<BibleListenController, BibleListenSession>(
  BibleListenController.new,
);

String formatListenTime(Duration d) {
  final total = d.inSeconds;
  final m = total ~/ 60;
  final s = total % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}
