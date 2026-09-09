import { describe, expect, it } from 'vitest';
import { formatQuotesForDisplay } from './quote_display';

describe('formatQuotesForDisplay', () => {
  it('keeps source text in source mode', () => {
    const raw = '耶稣说：「你们要彼此相爱。」';
    expect(formatQuotesForDisplay(raw, 'source')).toBe(raw);
  });

  it('maps corner quotes to western in western mode', () => {
    const raw = '耶稣说：「你们要彼此相爱。」『主啊』';
    expect(formatQuotesForDisplay(raw, 'western')).toBe(
      '耶稣说：“你们要彼此相爱。”‘主啊’',
    );
  });

  it('skips transform when no corner quotes', () => {
    const raw = 'In the beginning God created the heaven and the earth.';
    expect(formatQuotesForDisplay(raw, 'western')).toBe(raw);
  });
});
