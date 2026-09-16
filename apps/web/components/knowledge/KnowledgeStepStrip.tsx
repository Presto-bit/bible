'use client';

type Step = {
  order: number;
  label: string;
  happen?: string;
};

/** 站序事实条 · 一眼看见全线 happen（字在 UI，不烤图） */
export function KnowledgeStepStrip({
  steps,
  activeOrder,
  onSelect,
}: {
  steps: Step[];
  activeOrder: number;
  onSelect: (order: number) => void;
}) {
  if (!steps.length) return null;
  return (
    <ol className="knowledge-step-strip" aria-label="站序事实">
      {steps.map((s) => (
        <li key={s.order}>
          <button
            type="button"
            className={`knowledge-step-item${s.order === activeOrder ? ' is-active' : ''}`}
            onClick={() => onSelect(s.order)}
          >
            <span className="knowledge-step-n">{s.order}</span>
            <span className="knowledge-step-body">
              <span className="knowledge-step-label">{s.label}</span>
              {s.happen ? <span className="knowledge-step-happen">{s.happen}</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
