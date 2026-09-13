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

  it('prefers shorter normalized document when sections are complete', () => {
    const doc = '### 摘要\n- 概要。\n\n### 经文解释\n- 解释一。\n- 解释二。';
    const stream = [
      '### 摘要',
      '- 概要。',
      '',
      '### 经文解释',
      '- 解释一，附带大量重复背景与套话填充。',
      '- 解释二，继续堆砌形容词与泛泛应用建议。',
      '- 解释三，为凑字数而拆碎的半句观点。',
    ].join('\n');
    expect(pickStreamDoneText({ documentText: doc, streamBuilt: stream })).toBe(doc);
  });
});

describe('sectionTitlesInMarkdown', () => {
  it('lists section titles excluding followups', () => {
    expect(
      sectionTitlesInMarkdown('### 摘要\nA\n\n### 经文解释\nB\n\n### 相关追问\n- Q'),
    ).toEqual(['摘要', '经文解释']);
  });
});
