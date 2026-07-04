'use client';

type PlanCardItem = {
  id: string;
  title: string;
  days: number;
  kind: 'reading' | 'prayer';
  isActive?: boolean;
  onClick: () => void;
};

export function PlanCategoryGrid({ items }: { items: PlanCardItem[] }) {
  if (!items.length) return null;
  return (
    <div className="plan-category-scroll">
      {items.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`plan-category-card${p.isActive ? ' plan-category-card-active' : ''}`}
          onClick={p.onClick}
        >
          <span className={`pill plan-category-tag ${p.kind === 'reading' ? 'pill-active' : ''}`}>
            {p.kind === 'prayer' ? '祷告' : '读经'}
          </span>
          {p.isActive && <span className="plan-category-active-tag">进行中</span>}
          <strong className="plan-category-title">{p.title}</strong>
          <span className="muted plan-category-days">{p.days} 天 · 查看</span>
        </button>
      ))}
    </div>
  );
}
