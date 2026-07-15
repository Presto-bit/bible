'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminHeroCampaigns,
} from '@/lib/admin_hero_b';
import { fetchRagWorkspaceTree, type RagWorkspaceTree } from '@/lib/admin_rag';
import type { HeroBCampaignAdmin } from '@/lib/hero_b_campaign';

export type AdminTab = 'stats' | 'ops' | 'rag' | 'moderation';

type CommandItem = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
};

export default function AdminCommandPalette({
  open,
  onClose,
  tab,
  onTab,
  onOpenRagFile,
}: {
  open: boolean;
  onClose: () => void;
  tab: AdminTab;
  onTab: (t: AdminTab) => void;
  onOpenRagFile?: (collectionId: string, path: string) => void;
}) {
  const [q, setQ] = useState('');
  const [campaigns, setCampaigns] = useState<HeroBCampaignAdmin[]>([]);
  const [tree, setTree] = useState<RagWorkspaceTree | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    void fetchAdminHeroCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
    void fetchRagWorkspaceTree().then(setTree).catch(() => setTree(null));
  }, [open]);

  const items = useMemo(() => {
    const out: CommandItem[] = [
      {
        id: 'nav-stats',
        group: '导航',
        label: '数据预览',
        hint: '仪表盘',
        run: () => onTab('stats'),
      },
      {
        id: 'nav-ops',
        group: '导航',
        label: '运营 · Hero B',
        hint: '活动配置',
        run: () => onTab('ops'),
      },
      {
        id: 'nav-rag',
        group: '导航',
        label: 'RAG 注释库',
        hint: '资料工作台',
        run: () => onTab('rag'),
      },
      {
        id: 'nav-moderation',
        group: '导航',
        label: '内容审核',
        hint: '举报工单',
        run: () => onTab('moderation'),
      },
    ];

    for (const c of campaigns) {
      out.push({
        id: `ops-${c.id}`,
        group: '运营活动',
        label: c.name,
        hint: c.status,
        run: () => {
          onTab('ops');
          window.dispatchEvent(new CustomEvent('admin-ops-open', { detail: { id: c.id } }));
        },
      });
    }

    const walk = (collectionId: string, nodes: RagWorkspaceTree['collections'][0]['children']) => {
      for (const n of nodes || []) {
        if (n.type === 'folder') walk(collectionId, n.children || []);
        else {
          out.push({
            id: `rag-${collectionId}-${n.path}`,
            group: 'RAG 文件',
            label: n.title || n.name,
            hint: `${collectionId}/${n.path}`,
            run: () => {
              onTab('rag');
              onOpenRagFile?.(collectionId, n.path);
              window.dispatchEvent(
                new CustomEvent('admin-rag-open', {
                  detail: { collectionId, path: n.path },
                }),
              );
            },
          });
        }
      }
    };
    for (const coll of tree?.collections || []) walk(coll.id, coll.children);

    const needle = q.trim().toLowerCase();
    if (!needle) return out.slice(0, 40);
    return out
      .filter((i) => `${i.label} ${i.hint || ''} ${i.group}`.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [campaigns, tree, q, onTab, onOpenRagFile]);

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  const runActive = useCallback(() => {
    const item = items[active];
    if (!item) return;
    item.run();
    onClose();
  }, [items, active, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runActive();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, runActive, onClose]);

  if (!open) return null;

  let lastGroup = '';

  return (
    <div className="admin-cmd-backdrop" onClick={onClose} role="presentation">
      <div
        className="admin-cmd"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          className="admin-cmd-input"
          autoFocus
          placeholder={`搜索导航 / 活动 / 文件…（当前：${tab}）`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="admin-cmd-list">
          {items.length === 0 ? (
            <p className="muted admin-cmd-empty">无匹配结果</p>
          ) : (
            items.map((item, idx) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {showGroup ? <p className="admin-cmd-group">{item.group}</p> : null}
                  <button
                    type="button"
                    className={`admin-cmd-item ${idx === active ? 'is-active' : ''}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.hint ? <span className="muted">{item.hint}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <p className="admin-cmd-foot muted">↑↓ 选择 · Enter 打开 · Esc 关闭</p>
      </div>
    </div>
  );
}
