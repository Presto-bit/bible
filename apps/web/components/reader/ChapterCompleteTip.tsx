'use client';

type Props = {
  bookName: string;
  chapter: number;
  englishUI?: boolean;
  meditate?: boolean;
  onThought: () => void;
  onNextChapter: () => void;
  onDismiss: () => void;
};

/** 日常章末轻提示：不挡正文。 */
export function ChapterCompleteTip({
  bookName,
  chapter,
  englishUI = false,
  meditate = false,
  onThought,
  onNextChapter,
  onDismiss,
}: Props) {
  if (englishUI) {
    return (
      <div className="chapter-complete-tip" role="status">
        <span className="chapter-complete-tip-text">
          Finished {bookName} {chapter}
        </span>
        <div className="chapter-complete-tip-actions">
          {meditate ? (
            <button type="button" className="chapter-complete-tip-primary" onClick={onThought}>
              Thought
            </button>
          ) : null}
          <button type="button" className="chapter-complete-tip-primary" onClick={onNextChapter}>
            Next
          </button>
          <button type="button" className="chapter-complete-tip-skip" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chapter-complete-tip" role="status">
      <span className="chapter-complete-tip-text">
        本章读完 · {bookName} 第 {chapter} 章
      </span>
      <div className="chapter-complete-tip-actions">
        {meditate ? (
          <button type="button" className="chapter-complete-tip-primary" onClick={onThought}>
            写想法
          </button>
        ) : (
          <button type="button" className="chapter-complete-tip-primary" onClick={onThought}>
            写想法
          </button>
        )}
        <button type="button" className="chapter-complete-tip-primary" onClick={onNextChapter}>
          下一章
        </button>
        <button type="button" className="chapter-complete-tip-skip" onClick={onDismiss}>
          关闭
        </button>
      </div>
    </div>
  );
}
