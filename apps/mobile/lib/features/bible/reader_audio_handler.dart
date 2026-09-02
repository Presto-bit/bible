/// Android 通知栏 / 锁屏控制：just_audio + audio_service。
library;

import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';

class ReaderAudioHandler extends BaseAudioHandler with SeekHandler {
  ReaderAudioHandler() {
    _player.playbackEventStream.listen(_broadcastState);
  }

  static ReaderAudioHandler? instance;

  final AudioPlayer player = AudioPlayer();

  void Function()? onSkipPrevious;
  void Function()? onSkipNext;

  Future<void> setChapterMedia({
    required String bookId,
    required int chapter,
    required String bookName,
    required String audioLabel,
  }) async {
    mediaItem.add(
      MediaItem(
        id: '$bookId.$chapter',
        title: '$bookName $chapter',
        artist: audioLabel,
        album: '彼爱',
      ),
    );
  }

  Future<void> loadUrl(String url) => player.setUrl(url);

  @override
  Future<void> play() => player.play();

  @override
  Future<void> pause() => player.pause();

  @override
  Future<void> stop() async {
    await player.stop();
    await super.stop();
  }

  @override
  Future<void> seek(Duration position) => player.seek(position);

  @override
  Future<void> skipToPrevious() async {
    onSkipPrevious?.call();
  }

  @override
  Future<void> skipToNext() async {
    onSkipNext?.call();
  }

  void _broadcastState(PlaybackEvent event) {
    final playing = _player.playing;
    playbackState.add(
      PlaybackState(
        controls: [
          MediaControl.skipToPrevious,
          if (playing) MediaControl.pause else MediaControl.play,
          MediaControl.skipToNext,
        ],
        systemActions: const {
          MediaAction.seek,
          MediaAction.seekForward,
          MediaAction.seekBackward,
        },
        androidCompactActionIndices: const [0, 1, 2],
        processingState: const {
          ProcessingState.idle: AudioProcessingState.idle,
          ProcessingState.loading: AudioProcessingState.loading,
          ProcessingState.buffering: AudioProcessingState.buffering,
          ProcessingState.ready: AudioProcessingState.ready,
          ProcessingState.completed: AudioProcessingState.completed,
        }[_player.processingState]!,
        playing: playing,
        updatePosition: _player.position,
        bufferedPosition: _player.bufferedPosition,
        speed: _player.speed,
        queueIndex: 0,
      ),
    );
  }

  AudioPlayer get _player => player;
}

Future<ReaderAudioHandler> initReaderAudioService() async {
  final handler = await AudioService.init(
    builder: () {
      final h = ReaderAudioHandler();
      ReaderAudioHandler.instance = h;
      return h;
    },
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'reader_audio',
      androidNotificationChannelName: '圣经朗读',
      androidNotificationOngoing: true,
      androidStopForegroundOnPause: true,
      androidNotificationIcon: 'mipmap/ic_launcher',
    ),
  );
  ReaderAudioHandler.instance = handler;
  return handler;
}
