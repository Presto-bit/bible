import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  DISCOVER_UNREAD_CHANGED,
  formatDiscoverTabBadge,
  notifyDiscoverUnreadChanged,
  subscribeDiscoverUnreadChanged,
} from './discover_unread';

describe('discover_unread', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dispatches namespaced event for in-page unread only', () => {
    notifyDiscoverUnreadChanged({ delta: -1 });
    expect(window.dispatchEvent).toHaveBeenCalled();
    const ev = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls[0][0] as CustomEvent;
    expect(ev.type).toBe(DISCOVER_UNREAD_CHANGED);
    expect(ev.detail).toEqual({ delta: -1 });
  });

  it('formatDiscoverTabBadge follows 0 / 99+ rules', () => {
    expect(formatDiscoverTabBadge(0)).toBeNull();
    expect(formatDiscoverTabBadge(3)).toBe('3');
    expect(formatDiscoverTabBadge(99)).toBe('99');
    expect(formatDiscoverTabBadge(100)).toBe('99+');
  });

  it('subscribe returns unsubscribe', () => {
    const fn = vi.fn();
    const off = subscribeDiscoverUnreadChanged(fn);
    expect(window.addEventListener).toHaveBeenCalledWith(
      DISCOVER_UNREAD_CHANGED,
      expect.any(Function),
    );
    off();
    expect(window.removeEventListener).toHaveBeenCalled();
  });
});
