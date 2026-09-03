/// 教案素材播放辅助（音频 / 视频请求头）。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

import '../../core/api_client.dart';

Future<Map<String, String>> shelfMediaAuthHeaders(WidgetRef ref) async {
  final session = ref.read(sessionProvider);
  final token = await session.token();
  if (token == null || token.isEmpty) return const {};
  return {'Authorization': 'Bearer $token'};
}

Future<AudioPlayer> createShelfAudioPlayer(WidgetRef ref, String url) async {
  final player = AudioPlayer();
  await player.setUrl(url, headers: await shelfMediaAuthHeaders(ref));
  return player;
}
