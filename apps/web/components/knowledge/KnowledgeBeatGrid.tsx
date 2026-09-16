'use client';

type Props = {
  items: Array<{
    order: number;
    placeId: string;
    label: string;
    happen?: string;
    thumb?: string;
  }>;
  activeOrder: number;
  onSelect: (order: number) => void;
};

/** 多格叙事入口 · §19.14.12 策略 2 */
export function KnowledgeBeatGrid({ items, activeOrder, onSelect }: Props) {
  return (
    <div className="knowledge-beat-grid" role="list">
      {items.map((it) => (
        <button
          key={`${it.placeId}-${it.order}`}
          type="button"
          role="listitem"
          className={`knowledge-beat-cell${it.order === activeOrder ? ' is-active' : ''}`}
          onClick={() => onSelect(it.order)}
        >
          <div
            className="knowledge-beat-thumb"
            style={it.thumb ? { backgroundImage: `url(${it.thumb})` } : undefined}
            aria-hidden
          />
          <div className="knowledge-beat-meta">
            <div className="knowledge-beat-name">
              <span className="knowledge-beat-n">{it.order}</span>
              {it.label}
            </div>
            {it.happen ? <p className="knowledge-beat-happen">{it.happen}</p> : null}
          </div>
        </button>
      ))}
    </div>
  );
}
