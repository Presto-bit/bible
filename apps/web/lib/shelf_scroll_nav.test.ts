import { describe, expect, it } from 'vitest';
import {
  resolveShelfFlowScrollApply,
  shouldAcceptShelfFlowScrollReport,
} from './shelf_scroll_nav';

describe('resolveShelfFlowScrollApply', () => {
  it('左右滑 start：对齐后强制开头，忽略脏 anchor', () => {
    expect(
      resolveShelfFlowScrollApply({
        intent: 'start',
        sectionMatches: true,
        flowRatio: 0.6,
        savedAnchor: { paragraphIndex: 12 },
        flowAnchor: { paragraphIndex: 12 },
      }),
    ).toEqual({ scrollOffset: 0, scrollAnchor: undefined, scrollToEnd: false });
  });

  it('旧 DOM + 新 sectionId：不套中部', () => {
    expect(
      resolveShelfFlowScrollApply({
        intent: 'resume',
        sectionMatches: false,
        flowRatio: 0.6,
        savedAnchor: { paragraphIndex: 12 },
      }),
    ).toEqual({ scrollOffset: 0, scrollAnchor: undefined, scrollToEnd: false });
  });

  it('目录续读 resume：保留比例与 anchor', () => {
    expect(
      resolveShelfFlowScrollApply({
        intent: 'resume',
        sectionMatches: true,
        flowRatio: 0.42,
        savedAnchor: { paragraphIndex: 3 },
      }),
    ).toEqual({
      scrollOffset: 0.42,
      scrollAnchor: { paragraphIndex: 3 },
      scrollToEnd: false,
    });
  });

  it('scroll end：到末尾', () => {
    expect(
      resolveShelfFlowScrollApply({
        intent: 'end',
        sectionMatches: true,
        flowRatio: 0,
      }),
    ).toEqual({ scrollOffset: 1, scrollAnchor: undefined, scrollToEnd: true });
  });
});

describe('shouldAcceptShelfFlowScrollReport', () => {
  it('start 钉住阶段丢弃回写', () => {
    expect(
      shouldAcceptShelfFlowScrollReport({
        intent: 'start',
        sectionMatches: true,
        navEpoch: 2,
        reportEpoch: 2,
      }),
    ).toBe(false);
  });

  it('节未对齐或 epoch 过期丢弃', () => {
    expect(
      shouldAcceptShelfFlowScrollReport({
        intent: 'resume',
        sectionMatches: false,
        navEpoch: 2,
        reportEpoch: 2,
      }),
    ).toBe(false);
    expect(
      shouldAcceptShelfFlowScrollReport({
        intent: 'resume',
        sectionMatches: true,
        navEpoch: 3,
        reportEpoch: 2,
      }),
    ).toBe(false);
  });

  it('对齐且 resume 接受', () => {
    expect(
      shouldAcceptShelfFlowScrollReport({
        intent: 'resume',
        sectionMatches: true,
        navEpoch: 2,
        reportEpoch: 2,
      }),
    ).toBe(true);
  });
});
