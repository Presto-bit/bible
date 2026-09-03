'use client';

import type { ShelfLibraryTab, ShelfUserGroup } from '@/lib/shelf_library';
import { SHELF_UNGROUPED_ID } from '@/lib/shelf_library';

type Props = {
  active: ShelfLibraryTab;
  userGroups: ShelfUserGroup[];
  showUngrouped: boolean;
  canAddGroup: boolean;
  onSelect: (tab: ShelfLibraryTab) => void;
  onAddGroup: () => void;
  onLongPressGroup?: (group: ShelfUserGroup) => void;
};

function tabKey(tab: ShelfLibraryTab): string {
  if (tab.kind === 'last_read') return 'last_read';
  if (tab.kind === 'added') return 'added';
  return `group:${tab.groupId}`;
}

function isActive(a: ShelfLibraryTab, b: ShelfLibraryTab): boolean {
  return tabKey(a) === tabKey(b);
}

export default function ShelfLibraryTabs({
  active,
  userGroups,
  showUngrouped,
  canAddGroup,
  onSelect,
  onAddGroup,
  onLongPressGroup,
}: Props) {
  const tabs: { tab: ShelfLibraryTab; label: string }[] = [
    { tab: { kind: 'last_read' }, label: '最近阅读' },
    { tab: { kind: 'added' }, label: '上架时间' },
    ...userGroups.map((g) => ({ tab: { kind: 'group' as const, groupId: g.id }, label: g.title })),
  ];
  if (showUngrouped) {
    tabs.push({ tab: { kind: 'group', groupId: SHELF_UNGROUPED_ID }, label: '未分组' });
  }

  return (
    <div className="shelf-library-tabs-wrap">
      <div className="shelf-library-tabs" role="tablist" aria-label="书架分组">
        {tabs.map(({ tab, label }) => {
          const selected = isActive(active, tab);
          const group = tab.kind === 'group' && tab.groupId !== SHELF_UNGROUPED_ID
            ? userGroups.find((g) => g.id === tab.groupId)
            : null;
          return (
            <button
              key={tabKey(tab)}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`shelf-library-tab${selected ? ' is-active' : ''}`}
              onClick={() => onSelect(tab)}
              onContextMenu={(e) => {
                if (!group || !onLongPressGroup) return;
                e.preventDefault();
                onLongPressGroup(group);
              }}
            >
              {label}
            </button>
          );
        })}
        {canAddGroup ? (
          <button type="button" className="shelf-library-tab shelf-library-tab-add" aria-label="新建分组" onClick={onAddGroup}>
            ＋
          </button>
        ) : null}
      </div>
    </div>
  );
}
