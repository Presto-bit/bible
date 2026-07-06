/** 小爱流式问答（全页 / 半屏共用） */

import { chatStream, type ChatHistoryTurn, type Citation } from './api';
import { citationsUsedInText } from './citation_display';
import type { AssistantScene } from './assistant_scenes';

export type AssistantStreamOpts = {
  ref: string | null;
  question: string;
  mode: string;
  scene: AssistantScene;
  history?: ChatHistoryTurn[];
  surface?: string;
  signal?: AbortSignal;
  onMeta?: (meta: { citations?: Citation[]; scene_label?: string }) => void;
  onDelta?: (acc: string) => void;
  onFollowups?: (items: string[]) => void;
  onError?: (msg: string) => void;
  onDone?: (payload: { followups?: string[]; scene?: string } | null) => void;
};

export type AssistantStreamResult = {
  text: string;
  citations: Citation[];
  followups: string[];
  sceneLabel?: string;
};

export async function runAssistantStream(opts: AssistantStreamOpts): Promise<AssistantStreamResult> {
  let acc = '';
  let cites: Citation[] = [];
  let followups: string[] = [];
  let sceneLabel: string | undefined;

  await chatStream(
    {
      ref: opts.ref,
      question: opts.question,
      mode: opts.mode,
      scene: opts.scene,
      history: opts.history,
      surface: opts.surface,
    },
    {
      onMeta: (meta) => {
        cites = meta.citations ?? [];
        if (meta.scene_label) sceneLabel = meta.scene_label;
        opts.onMeta?.(meta);
      },
      onDelta: (t) => {
        acc += t;
        opts.onDelta?.(acc);
      },
      onFollowups: (items) => {
        followups = items;
        opts.onFollowups?.(items);
      },
      onError: (msg) => {
        acc = `⚠️ ${msg}`;
        opts.onError?.(msg);
        opts.onDelta?.(acc);
      },
      onDone: (payload) => {
        if (payload?.followups?.length) followups = payload.followups;
        opts.onDone?.(payload ?? null);
      },
    },
    opts.signal ? { signal: opts.signal } : undefined,
  );

  return {
    text: acc,
    citations: citationsUsedInText(acc, cites),
    followups,
    sceneLabel,
  };
}
