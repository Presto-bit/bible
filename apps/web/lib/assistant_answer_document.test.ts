import { describe, expect, it } from 'vitest';
import { pickStreamDoneText, sectionTitlesInMarkdown } from './assistant_answer_document';

describe('pickStreamDoneText', () => {
  it('keeps stream when it has more sections than normalized document', () => {
    const doc = '### 摘要\n- 概要一句。';
    const stream = [
      '### 摘要',
      '- 概要一句。',
      '',
      '### 经文背景',
      '- 背景要点。',
      '',
      '### 经文解释',
      '- 解释要点。',
    ].join('\n');
    expect(pickStreamDoneText({ documentText: doc, streamBuilt: stream })).toBe(stream);
  });

  it('uses document for lead_only policy', () => {
    const doc = '### 摘要\n- 仅摘要。';
    const stream = `${doc}\n\n### 经文解释\n- 不应保留。`;
    expect(
      pickStreamDoneText({
        documentText: doc,
        streamBuilt: stream,
        sectionPolicy: 'lead_only',
      }),
    ).toBe(doc);
  });

  it('prefers normalized document when equally complete', () => {
    const doc = '### 摘要\n- 概要。\n\n### 经文解释\n- 解释。';
    const stream = `${doc} 多余空白`;
    expect(pickStreamDoneText({ documentText: doc, streamBuilt: stream.trim() })).toBe(doc);
  });
});

describe('sectionTitlesInMarkdown', () => {
  it('lists section titles excluding followups', () => {
    expect(
      sectionTitlesInMarkdown('### 摘要\nA\n\n### 经文解释\nB\n\n### 相关追问\n- Q'),
    ).toEqual(['摘要', '经文解释']);
  });
});
