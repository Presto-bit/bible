/// 小爱输入框草稿：离开 Tab 后恢复，避免输入中断丢失。
library;

import 'package:shared_preferences/shared_preferences.dart';

const kComposerDraftKey = 'assistant_composer_draft_v1';

Future<String> loadComposerDraft() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(kComposerDraftKey) ?? '';
  } catch (_) {
    return '';
  }
}

Future<void> saveComposerDraft(String text) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final t = text.trim();
    if (t.isEmpty) {
      await prefs.remove(kComposerDraftKey);
    } else {
      await prefs.setString(kComposerDraftKey, text);
    }
  } catch (_) {/* ignore */}
}

Future<void> clearComposerDraft() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(kComposerDraftKey);
  } catch (_) {/* ignore */}
}
