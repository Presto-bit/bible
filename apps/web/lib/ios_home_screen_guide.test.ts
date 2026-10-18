import { describe, expect, it } from 'vitest';
import { resolveIosAddToHomeGuide } from './ios_home_screen_guide';

function iphone(os: string) {
  return `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${os.replace('_', '.')} Mobile/15E148 Safari/604.1`;
}

describe('resolveIosAddToHomeGuide', () => {
  it('points older iPhones at the bottom-center share button', () => {
    const guide = resolveIosAddToHomeGuide({ ua: iphone('18_7') });
    expect(guide.id).toBe('legacy-center');
    expect(guide.anchor).toBe('bottom-center');
    expect(guide.summary).toBe('底部中间「共享」→ 添加到主屏幕');
    expect(guide.steps.map((s) => s.title)).not.toContain('点「查看更多」');
  });

  it('keeps the iOS 26 compact path on the right more button', () => {
    const guide = resolveIosAddToHomeGuide({ ua: iphone('26_1') });
    expect(guide.id).toBe('ios26-compact');
    expect(guide.anchor).toBe('bottom-right');
    expect(guide.steps[0]?.title).toBe('点右侧 ···');
    expect(guide.alternate).toContain('底部中间');
  });

  it('moves iOS 27 compact share into the menu beside the address', () => {
    const guide = resolveIosAddToHomeGuide({ ua: iphone('27_0') });
    expect(guide.id).toBe('ios27-page-menu');
    expect(guide.anchor).toBe('bottom-left');
    expect(guide.steps[0]?.title).toBe('点网址左侧图标');
    expect(guide.summary).not.toContain('右侧 ···');
  });

  it('uses the top-right share button in landscape', () => {
    const older = resolveIosAddToHomeGuide({ ua: iphone('18_5'), landscape: true });
    expect(older.id).toBe('corner-share');
    expect(older.anchor).toBe('top-right');

    const newer = resolveIosAddToHomeGuide({ ua: iphone('26_0'), landscape: true });
    expect(newer.id).toBe('corner-share-more');
    expect(newer.steps.map((s) => s.title)).toContain('点「查看更多」');
  });

  it('treats iPad desktop UA as the corner share button', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15';
    const guide = resolveIosAddToHomeGuide({
      ua,
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(guide.anchor).toBe('top-right');
    expect(guide.summary).toContain('查看更多');
  });

  it('falls back to the current iOS 26 path when the version is missing', () => {
    expect(resolveIosAddToHomeGuide({ ua: '' }).id).toBe('ios26-compact');
  });
});
