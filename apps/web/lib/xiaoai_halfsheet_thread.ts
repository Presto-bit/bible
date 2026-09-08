/** 半屏小爱会话 thread（进程内；关半屏同 ref+选区 可恢复） */

import type { Citation } from './api';
import type { AssistantScene } from './assistant_scenes';

export type HalfSheetTurn = {
  id: string;
  userQuestion: string;
  answer: string;
  citations: Citation[];
  scene: AssistantScene;
  followups: string[];
};

export type HalfSheetThread = {
  ref: string;
  selectionKey: string;
  turns: HalfSheetTurn[];
};

const MAX_TURNS = 3;
const _threads = new Map<string, HalfSheetThread>();

function threadKey(ref: string, selectionKey: string): string {
  return `${ref.trim().toUpperCase()}\x1e${selectionKey}`;
}

export function readHalfSheetThread(
  ref: string,
  selectionKey: string,
): HalfSheetThread | null {
  return _threads.get(threadKey(ref, selectionKey)) ?? null;
}

export function writeHalfSheetThread(thread: HalfSheetThread): void {
  const turns = thread.turns.slice(-MAX_TURNS);
  _threads.set(threadKey(thread.ref, thread.selectionKey), {
    ...thread,
    turns,
  });
  if (_threads.size > 32) {
    const first = _threads.keys().next().value;
    if (first) _threads.delete(first);
  }
}

export function newTurnId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
