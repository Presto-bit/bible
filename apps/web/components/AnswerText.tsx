'use client';

import dynamic from 'next/dynamic';

type Props = {
  text: string;
  streaming?: boolean;
  dense?: boolean;
  onCitationClick?: (n: number) => void;
};

const AnswerTextMarkdown = dynamic(() => import('./AnswerTextMarkdown'), {
  ssr: false,
  loading: () => (
    <div className="answer-rich answer-rich-md">
      <p className="ans-md-p muted">…</p>
    </div>
  ),
});

/** 懒加载 react-markdown，避免助手 Tab 首包过重 */
export default function AnswerText(props: Props) {
  return <AnswerTextMarkdown {...props} />;
}

export { FOOTNOTE_RE } from '@/lib/assistant_markdown';
