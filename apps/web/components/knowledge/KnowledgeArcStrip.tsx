'use client';

type Arc = { name: string; stop_orders: number[] };

/** 叙事弧 · §19.14.13 结构层同屏可见 */
export function KnowledgeArcStrip({
  arcs,
  activeOrder,
  onSelectOrder,
}: {
  arcs: Arc[];
  activeOrder: number;
  onSelectOrder?: (order: number) => void;
}) {
  if (!arcs.length) return null;
  return (
    <ul className="knowledge-arc" aria-label="叙事弧">
      {arcs.map((a) => {
        const active = a.stop_orders.includes(activeOrder);
        const first = a.stop_orders[0];
        return (
          <li key={a.name}>
            <button
              type="button"
              className={`knowledge-arc-item${active ? ' is-active' : ''}`}
              onClick={() => {
                if (first != null && onSelectOrder) onSelectOrder(first);
              }}
            >
              <strong>{a.name}</strong>
              <span>站 {a.stop_orders.join(' · ')}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
