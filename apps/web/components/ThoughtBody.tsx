'use client';

import dynamic from 'next/dynamic';

type Props = {
  text: string;
  className?: string;
};

const AnswerText = dynamic(() => import('./AnswerText'), {
  ssr: false,
  loading: () => (
    <div className="thought-body-md">
      <p className="muted" style={{ margin: 0, lineHeight: 1.65 }}>
        …
      </p>
    </div>
  ),
});

/** 想法详情：按 Markdown 渲染（兼容小爱存入的回答与手写正文）。 */
export default function ThoughtBody({ text, className }: Props) {
  const body = (text || '').trim();
  if (!body) {
    return (
      <div className={`thought-body-md${className ? ` ${className}` : ''}`}>
        <p className="muted" style={{ margin: 0 }}>
          （空）
        </p>
      </div>
    );
  }
  return (
    <div className={`thought-body-md${className ? ` ${className}` : ''}`}>
      <AnswerText text={body} dense />
    </div>
  );
}
