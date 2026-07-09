/// 用户资料云同步（avatar / bio / 昵称），与 Web profile_sync 对齐。
library;

import 'sync_engine.dart';

class ProfileSync {
  ProfileSync(this._sync);

  final SyncEngine _sync;

  Future<void> pushAvatar(String avatarId) =>
      _sync.enqueueUserProfile({'avatar_id': avatarId});

  Future<void> pushBio(String bio) => _sync.enqueueUserProfile({'bio': bio});

  Future<void> pushUsername(String username) =>
      _sync.enqueueUserProfile({'username': username});
}
