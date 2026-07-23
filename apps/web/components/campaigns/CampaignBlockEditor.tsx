'use client';

import { useEffect, useState } from 'react';
import type { OpsCampaignLanding } from '@/lib/api';
import {
  BLOCK_CATALOG,
  addLandingBlock,
  availableBlockTypes,
  blockSummary,
  blocksByCategory,
  nid,
  normalizeBlocks,
  removeLandingBlock,
  reorderLandingBlocks,
  updateBlockData,
  type OpsBlockType,
  type OpsLandingBlock,
} from '@/lib/campaign_blocks';
import { resolvePrimaryCta } from '@/lib/campaign_nav';
import { parseDaysFromBulkText } from '@/lib/campaign_ops';
import {
  applyReadingExample,
  getReadingExample,
  getReadingPlaceholders,
  hasReadingExample,
  landingHasReadableContent,
} from '@/lib/campaign_example_copy';

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** 落地页搭建：分类控件库 → 画布排序 → 点击配置 */
export function CampaignBlockEditor({
  landing,
  setLanding,
  templateId,
  campaignId,
  onHint,
  onError,
}: {
  landing: OpsCampaignLanding;
  setLanding: (next: OpsCampaignLanding) => void;
  templateId: string;
  campaignId: string;
  onHint?: (msg: string) => void;
  onError?: (msg: string) => void;
}) {
  const blocks = normalizeBlocks(landing.blocks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(blocks[0]?.id || null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [paletteCat, setPaletteCat] = useState<string>('all');

  useEffect(() => {
    if (selectedId && !blocks.some((b) => b.id === selectedId)) {
      setSelectedId(blocks[0]?.id || null);
    }
  }, [blocks, selectedId]);

  const available = availableBlockTypes(landing);
  const groups = blocksByCategory(available);
  const filteredGroups =
    paletteCat === 'all' ? groups : groups.filter((g) => g.category === paletteCat);
  const selected = blocks.find((b) => b.id === selectedId) || null;

  const patch = (next: OpsCampaignLanding) => setLanding(next);

  const onAdd = (type: OpsBlockType) => {
    const next = addLandingBlock(landing, type);
    patch(next);
    const added = normalizeBlocks(next.blocks).filter((b) => b.type === type).at(-1);
    if (added) setSelectedId(added.id);
  };

  const updateDay = (
    idx: number,
    dayPatch: Partial<NonNullable<OpsCampaignLanding['days']>[number]>,
  ) => {
    const days = [...(landing.days || [])];
    days[idx] = { ...days[idx], ...dayPatch, day: days[idx]?.day || idx + 1 };
    patch({ ...landing, days });
  };

  const addDay = () => {
    const days = [...(landing.days || [])];
    const next = (days[days.length - 1]?.day || days.length) + 1;
    days.push({ day: next, title: `第 ${next} 天`, body: '', verseRef: '', discussionHint: '' });
    patch({ ...landing, days });
  };

  const applyBulk = () => {
    const days = parseDaysFromBulkText(bulkText);
    if (!days.length) {
      onError?.('没有解析到日课内容');
      return;
    }
    patch({ ...landing, days });
    setBulkOpen(false);
    onHint?.(`已导入 ${days.length} 天`);
  };

  const fillExample = () => {
    if (!hasReadingExample(templateId)) return;
    const pack = getReadingExample(templateId);
    if (
      landingHasReadableContent(landing) &&
      !window.confirm('将用示例覆盖当前主文案与日课内容，确定？')
    ) {
      return;
    }
    const next = applyReadingExample(landing, templateId);
    if (!next) return;
    patch(next);
    onHint?.(pack ? `已填入示例：${pack.blurb}` : '已填入示例');
  };

  const examplePack = hasReadingExample(templateId) ? getReadingExample(templateId) : null;

  return (
    <div className="ops-builder">
      {examplePack ? (
        <div className="ops-example-banner">
          <div>
            <strong>示例文案</strong>
            <span className="muted">{examplePack.blurb}，填入后可随意改</span>
          </div>
          <button type="button" className="btn" onClick={fillExample}>
            一键填入示例
          </button>
        </div>
      ) : null}
      <div className="ops-block-palette">
        <div className="ops-builder-palette-head">
          <p className="ops-subblock-title" style={{ margin: 0 }}>
            控件库
          </p>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            按类型添加，点击画布中的控件进行配置
          </p>
        </div>
        <div className="ops-builder-cats" role="tablist" aria-label="控件分类">
          <button
            type="button"
            className={`ops-chip${paletteCat === 'all' ? ' is-on' : ''}`}
            onClick={() => setPaletteCat('all')}
          >
            全部
          </button>
          {groups.map((g) => (
            <button
              key={g.category}
              type="button"
              className={`ops-chip${paletteCat === g.category ? ' is-on' : ''}`}
              onClick={() => setPaletteCat(g.category)}
            >
              {g.label}
            </button>
          ))}
        </div>
        {filteredGroups.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            该分类下暂无可添加控件（单例控件已在页面上）。
          </p>
        ) : (
          filteredGroups.map((g) => (
            <div key={g.category} className="ops-builder-cat-group">
              {paletteCat === 'all' ? (
                <p className="ops-builder-cat-label">{g.label}</p>
              ) : null}
              <div className="ops-block-palette-grid">
                {g.types.map((type) => {
                  const meta = BLOCK_CATALOG[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      className="ops-block-chip"
                      onClick={() => onAdd(type)}
                    >
                      <span className="ops-block-chip-icon" aria-hidden>
                        {meta.icon}
                      </span>
                      <span className="ops-block-chip-text">
                        <strong>{meta.label}</strong>
                        <span className="muted">{meta.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="ops-builder-main">
        <div className="ops-builder-canvas">
          <p className="ops-subblock-title" style={{ margin: '0 0 8px' }}>
            页面结构
          </p>
          {blocks.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              从上方控件库添加第一个控件开始搭建。
            </p>
          ) : (
            <div className="ops-block-list">
              {blocks.map((block, index) => {
                const meta = BLOCK_CATALOG[block.type];
                return (
                  <div
                    key={block.id}
                    className={`ops-block-card${selectedId === block.id ? ' is-selected' : ''}${
                      dragId === block.id ? ' is-dragging' : ''
                    }${overId === block.id && dragId !== block.id ? ' is-over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOverId(block.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) patch(reorderLandingBlocks(landing, dragId, block.id));
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                    <div className="ops-block-card-head">
                      <button
                        type="button"
                        className="ops-block-handle"
                        draggable
                        title="拖动排序"
                        aria-label={`拖动排序：${meta.label}`}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', block.id);
                          setDragId(block.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverId(null);
                        }}
                      >
                        ⋮⋮
                      </button>
                      <button
                        type="button"
                        className="ops-block-card-toggle"
                        onClick={() => setSelectedId(block.id)}
                      >
                        <span className="ops-block-chip-icon" aria-hidden>
                          {meta.icon}
                        </span>
                        <span className="ops-block-card-titles">
                          <strong>
                            {index + 1}. {meta.label}
                          </strong>
                          <span className="muted">{blockSummary(block)}</span>
                        </span>
                        <span className="muted">{selectedId === block.id ? '配置中' : '配置'}</span>
                      </button>
                      {!(block.type === 'text' && block.data?.role === 'intro') ? (
                        <button
                          type="button"
                          className="btn ops-block-remove"
                          onClick={() => {
                            patch(removeLandingBlock(landing, block.id));
                            if (selectedId === block.id) setSelectedId(null);
                          }}
                        >
                          移除
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="ops-builder-inspector">
          <p className="ops-subblock-title" style={{ margin: '0 0 8px' }}>
            {selected ? `配置 · ${BLOCK_CATALOG[selected.type].label}` : '配置面板'}
          </p>
          {!selected ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              在左侧页面结构中点击一个控件开始配置。
            </p>
          ) : (
            <div className="ops-builder-inspector-body">
              <BlockConfig
                block={selected}
                landing={landing}
                templateId={templateId}
                campaignId={campaignId}
                bulkOpen={bulkOpen}
                bulkText={bulkText}
                setBulkOpen={setBulkOpen}
                setBulkText={setBulkText}
                onAddDay={addDay}
                onApplyBulk={applyBulk}
                onUpdateDay={updateDay}
                onLanding={patch}
                onBlockData={(data) => patch(updateBlockData(landing, selected.id, data))}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockConfig({
  block,
  landing,
  templateId,
  campaignId,
  bulkOpen,
  bulkText,
  setBulkOpen,
  setBulkText,
  onAddDay,
  onApplyBulk,
  onUpdateDay,
  onLanding,
  onBlockData,
}: {
  block: OpsLandingBlock;
  landing: OpsCampaignLanding;
  templateId: string;
  campaignId: string;
  bulkOpen: boolean;
  bulkText: string;
  setBulkOpen: (v: boolean) => void;
  setBulkText: (v: string) => void;
  onAddDay: () => void;
  onApplyBulk: () => void;
  onUpdateDay: (
    idx: number,
    patch: Partial<NonNullable<OpsCampaignLanding['days']>[number]>,
  ) => void;
  onLanding: (l: OpsCampaignLanding) => void;
  onBlockData: (data: Record<string, unknown>) => void;
}) {
  const d = block.data || {};

  if (block.type === 'text') {
    const ph = getReadingPlaceholders(templateId);
    const isIntro = d.role === 'intro';
    const introEmpty = isIntro && !String(d.body || '').trim();
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {isIntro ? (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            页面主文案：同步到落地页说明，也会出现在首页卡摘要中。
            {introEmpty ? (
              <span className="ops-slot-hint"> · 建议填写</span>
            ) : null}
          </p>
        ) : null}
        <label className="ops-field">
          <span>标题</span>
          <input
            className="input"
            value={String(d.heading || '')}
            onChange={(e) => onBlockData({ heading: e.target.value })}
            placeholder="可选小标题"
          />
        </label>
        <label className={`ops-field${introEmpty ? ' is-suggested' : ''}`}>
          <span>
            正文
            {introEmpty ? <span className="ops-req-tag is-soft">建议</span> : null}
          </span>
          <textarea
            className="input"
            rows={6}
            value={String(d.body || '')}
            onChange={(e) => onBlockData({ body: e.target.value })}
            placeholder={isIntro && ph ? ph.introBody : '段落正文'}
          />
        </label>
      </div>
    );
  }

  if (block.type === 'audio') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <label className="ops-field">
          <span>标题</span>
          <input
            className="input"
            value={String(d.title || '')}
            onChange={(e) => onBlockData({ title: e.target.value })}
            placeholder="音频标题"
          />
        </label>
        <label className="ops-field">
          <span>音频地址</span>
          <input
            className="input"
            value={String(d.src || '')}
            onChange={(e) => onBlockData({ src: e.target.value })}
            placeholder="https://…/audio.mp3"
          />
        </label>
        <label className="ops-field">
          <span>说明</span>
          <input
            className="input"
            value={String(d.caption || '')}
            onChange={(e) => onBlockData({ caption: e.target.value })}
            placeholder="可选说明"
          />
        </label>
      </div>
    );
  }

  if (block.type === 'image') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <label className="ops-field">
          <span>图片 URL</span>
          <input
            className="input"
            value={String(d.url || '')}
            onChange={(e) => onBlockData({ url: e.target.value })}
            placeholder="https://…/image.jpg"
          />
        </label>
        <label className="ops-field">
          <span>说明</span>
          <input
            className="input"
            value={String(d.caption || '')}
            onChange={(e) => onBlockData({ caption: e.target.value })}
            placeholder="可选图注"
          />
        </label>
      </div>
    );
  }

  if (block.type === 'divider') {
    return (
      <div className="ops-chip-row" style={{ marginTop: 0 }}>
        {(
          [
            ['line', '线条'],
            ['space', '空白间距'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`ops-chip${(d.style || 'line') === k ? ' is-on' : ''}`}
            onClick={() => onBlockData({ style: k })}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  if (block.type === 'verse') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <label className="ops-field">
          <span>经文引用</span>
          <input
            className="input"
            value={String(d.ref || '')}
            onChange={(e) => onBlockData({ ref: e.target.value })}
            placeholder="如 诗篇 23:1"
          />
        </label>
        <label className="ops-field">
          <span>短注</span>
          <textarea
            className="input"
            rows={3}
            value={String(d.note || '')}
            onChange={(e) => onBlockData({ note: e.target.value })}
            placeholder="可选说明"
          />
        </label>
      </div>
    );
  }

  if (block.type === 'tabs') {
    const tabs = Array.isArray(d.tabs) ? [...(d.tabs as Array<Record<string, unknown>>)] : [];
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="ops-subblock-head">
          <p className="ops-subblock-title" style={{ margin: 0 }}>
            标签页
          </p>
          <button
            type="button"
            className="btn"
            onClick={() =>
              onBlockData({
                tabs: [
                  ...tabs,
                  { id: nid('tab'), label: `标签 ${tabs.length + 1}`, body: '' },
                ],
              })
            }
          >
            加标签
          </button>
        </div>
        {tabs.map((tab, idx) => (
          <div key={String(tab.id || idx)} className="ops-nested-card">
            <label className="ops-field">
              <span>标签名</span>
              <input
                className="input"
                value={String(tab.label || '')}
                onChange={(e) => {
                  const next = tabs.map((t, i) =>
                    i === idx ? { ...t, label: e.target.value } : t,
                  );
                  onBlockData({ tabs: next });
                }}
              />
            </label>
            <label className="ops-field" style={{ marginTop: 8 }}>
              <span>内容</span>
              <textarea
                className="input"
                rows={4}
                value={String(tab.body || '')}
                onChange={(e) => {
                  const next = tabs.map((t, i) =>
                    i === idx ? { ...t, body: e.target.value } : t,
                  );
                  onBlockData({ tabs: next });
                }}
              />
            </label>
            {tabs.length > 1 ? (
              <button
                type="button"
                className="btn"
                style={{ marginTop: 8 }}
                onClick={() => onBlockData({ tabs: tabs.filter((_, i) => i !== idx) })}
              >
                删除标签
              </button>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  if (block.type === 'days') {
    return (
      <DaysConfig
        landing={landing}
        templateId={templateId}
        bulkOpen={bulkOpen}
        bulkText={bulkText}
        setBulkOpen={setBulkOpen}
        setBulkText={setBulkText}
        onAddDay={onAddDay}
        onApplyBulk={onApplyBulk}
        onUpdateDay={onUpdateDay}
        onLanding={onLanding}
      />
    );
  }
  if (block.type === 'schedule') {
    return <ScheduleConfig landing={landing} onLanding={onLanding} />;
  }
  if (block.type === 'slots') {
    return <SlotsConfig landing={landing} onLanding={onLanding} />;
  }
  if (block.type === 'entries') {
    return <EntriesConfig landing={landing} onLanding={onLanding} />;
  }
  if (block.type === 'engage') {
    return <EngageConfig landing={landing} onLanding={onLanding} />;
  }
  if (block.type === 'cta') {
    return <CtaConfig templateId={templateId} campaignId={campaignId} landing={landing} />;
  }
  return <p className="muted">未知控件</p>;
}

function DaysConfig({
  landing,
  templateId,
  bulkOpen,
  bulkText,
  setBulkOpen,
  setBulkText,
  onAddDay,
  onApplyBulk,
  onUpdateDay,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  templateId: string;
  bulkOpen: boolean;
  bulkText: string;
  setBulkOpen: (v: boolean) => void;
  setBulkText: (v: string) => void;
  onAddDay: () => void;
  onApplyBulk: () => void;
  onUpdateDay: (
    idx: number,
    patch: Partial<NonNullable<OpsCampaignLanding['days']>[number]>,
  ) => void;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  const dayUnlock = landing.features?.dayUnlock || 'all';
  const ph = getReadingPlaceholders(templateId);
  const anyFilled = (landing.days || []).some(
    (d) => (d.body || '').trim() || (d.verseRef || '').trim(),
  );
  const isMemory = templateId === 'memory';
  return (
    <div className="ops-subblock" style={{ margin: 0, paddingTop: 0, borderTop: 0 }}>
      <p className="ops-subblock-title">
        {isMemory ? '清单解锁' : '日课解锁'}
        {!anyFilled ? <span className="ops-req-tag">必填</span> : null}
      </p>
      {!anyFilled ? (
        <p className="ops-slot-hint" style={{ marginTop: 0 }}>
          发布前至少填写一天的正文或经文引用
          {ph ? '；也可点上方「一键填入示例」' : ''}
        </p>
      ) : null}
      <label className="ops-check-row">
        <input
          type="radio"
          checked={dayUnlock === 'all'}
          onChange={() =>
            onLanding({
              ...landing,
              features: { ...(landing.features || {}), dayUnlock: 'all' },
            })
          }
        />
        全部可读
      </label>
      <label className="ops-check-row">
        <input
          type="radio"
          checked={dayUnlock === 'by_start'}
          onChange={() =>
            onLanding({
              ...landing,
              features: { ...(landing.features || {}), dayUnlock: 'by_start' },
            })
          }
        />
        按开始日每天解锁一天
      </label>
      <div className="ops-subblock-head" style={{ marginTop: 12 }}>
        <p className="ops-subblock-title" style={{ margin: 0 }}>
          {isMemory ? '背诵清单' : '日课内容'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setBulkOpen(!bulkOpen)}>
            批量粘贴
          </button>
          <button type="button" className="btn" onClick={onAddDay}>
            {isMemory ? '加一节' : '加一天'}
          </button>
        </div>
      </div>
      {bulkOpen ? (
        <div className="ops-nested-card" style={{ marginTop: 8 }}>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            每天一段，空行分隔；首行可作标题
          </p>
          <textarea
            className="input"
            rows={8}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={onApplyBulk}>
            导入并替换
          </button>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {(landing.days || []).map((dayItem, idx) => {
          const dayEmpty = !(dayItem.body || '').trim() && !(dayItem.verseRef || '').trim();
          return (
            <div
              key={dayItem.day || idx}
              className={`ops-nested-card${!anyFilled && dayEmpty ? ' is-slot-empty' : ''}`}
            >
              <strong>
                {isMemory ? `经文 ${dayItem.day || idx + 1}` : `第 ${dayItem.day || idx + 1} 天`}
              </strong>
              <label className="ops-field" style={{ marginTop: 8 }}>
                <span>标题</span>
                <input
                  className="input"
                  value={dayItem.title || ''}
                  onChange={(e) => onUpdateDay(idx, { title: e.target.value })}
                  placeholder={ph?.dayTitle || undefined}
                />
              </label>
              <label className={`ops-field${!anyFilled ? ' is-required' : ''}`} style={{ marginTop: 8 }}>
                <span>
                  正文
                  {!anyFilled ? <span className="ops-req-tag">必填*</span> : null}
                </span>
                <textarea
                  className="input"
                  rows={4}
                  value={dayItem.body || ''}
                  onChange={(e) => onUpdateDay(idx, { body: e.target.value })}
                  placeholder={ph?.dayBody || undefined}
                />
              </label>
              <label className={`ops-field${!anyFilled ? ' is-required' : ''}`} style={{ marginTop: 8 }}>
                <span>
                  经文引用
                  {!anyFilled ? <span className="ops-req-tag">或填此项</span> : null}
                </span>
                <input
                  className="input"
                  value={dayItem.verseRef || ''}
                  onChange={(e) => onUpdateDay(idx, { verseRef: e.target.value })}
                  placeholder={ph?.verseRef || '如 创 1:1-5'}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleConfig({
  landing,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="ops-field">
        <span>开始时间</span>
        <input
          className="input"
          type="datetime-local"
          value={toLocalInput(landing.schedule?.startsAt || '')}
          onChange={(e) =>
            onLanding({
              ...landing,
              schedule: {
                ...(landing.schedule || {}),
                startsAt: e.target.value ? fromLocalInput(e.target.value) : '',
              },
              features: { ...(landing.features || {}), countdown: true },
            })
          }
        />
      </label>
      <label className="ops-field">
        <span>地点</span>
        <input
          className="input"
          value={landing.schedule?.location || ''}
          onChange={(e) =>
            onLanding({
              ...landing,
              schedule: { ...(landing.schedule || {}), location: e.target.value },
              features: { ...(landing.features || {}), countdown: true },
            })
          }
        />
      </label>
      <label className="ops-field">
        <span>线上说明</span>
        <input
          className="input"
          value={landing.schedule?.onlineNote || ''}
          onChange={(e) =>
            onLanding({
              ...landing,
              schedule: { ...(landing.schedule || {}), onlineNote: e.target.value },
            })
          }
        />
      </label>
      <label className="ops-check-row">
        <input
          type="checkbox"
          checked={Boolean(landing.features?.rsvp)}
          onChange={(e) =>
            onLanding({
              ...landing,
              features: { ...(landing.features || {}), rsvp: e.target.checked },
            })
          }
        />
        同时收集出席（RSVP）
      </label>
    </div>
  );
}

function SlotsConfig({
  landing,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  return (
    <div>
      <div className="ops-subblock-head">
        <p className="ops-subblock-title" style={{ margin: 0 }}>
          岗位名额
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const slots = [...(landing.slots || [])];
            const n = slots.length + 1;
            slots.push({
              id: `slot_${n}_${Date.now().toString(36)}`,
              title: `岗位 ${n}`,
              limit: 5,
            });
            onLanding({
              ...landing,
              slots,
              features: { ...(landing.features || {}), signup: true, questions: true },
            });
          }}
        >
          加岗位
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {(landing.slots || []).map((s, idx) => (
          <div key={s.id} className="ops-nested-card ops-slot-row">
            <input
              className="input"
              value={s.title}
              onChange={(e) => {
                const slots = [...(landing.slots || [])];
                slots[idx] = { ...slots[idx], title: e.target.value };
                onLanding({ ...landing, slots });
              }}
              placeholder="岗位名称"
            />
            <input
              className="input"
              type="number"
              min={1}
              value={s.limit}
              onChange={(e) => {
                const slots = [...(landing.slots || [])];
                slots[idx] = {
                  ...slots[idx],
                  limit: Math.max(1, Number(e.target.value) || 1),
                };
                onLanding({ ...landing, slots });
              }}
              aria-label="名额"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EntriesConfig({
  landing,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  return (
    <div>
      <div className="ops-subblock-head">
        <p className="ops-subblock-title" style={{ margin: 0 }}>
          多入口
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const entries = [...(landing.entries || [])];
            const n = entries.length + 1;
            entries.push({
              id: `e${n}_${Date.now().toString(36)}`,
              title: `入口 ${n}`,
              sub: '',
              href: '/reader',
            });
            onLanding({ ...landing, entries });
          }}
        >
          加入口
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 8px' }}>
        至少 2 个有效入口（标题 + 链接）才能发布
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {(landing.entries || []).map((e, idx) => (
          <div key={e.id || idx} className="ops-nested-card">
            <label className="ops-field">
              <span>标题</span>
              <input
                className="input"
                value={e.title}
                onChange={(ev) => {
                  const entries = [...(landing.entries || [])];
                  entries[idx] = { ...entries[idx], title: ev.target.value };
                  onLanding({ ...landing, entries });
                }}
              />
            </label>
            <label className="ops-field" style={{ marginTop: 8 }}>
              <span>副文案</span>
              <input
                className="input"
                value={e.sub || ''}
                onChange={(ev) => {
                  const entries = [...(landing.entries || [])];
                  entries[idx] = { ...entries[idx], sub: ev.target.value };
                  onLanding({ ...landing, entries });
                }}
              />
            </label>
            <label className="ops-field" style={{ marginTop: 8 }}>
              <span>链接</span>
              <input
                className="input"
                value={e.href}
                onChange={(ev) => {
                  const entries = [...(landing.entries || [])];
                  entries[idx] = { ...entries[idx], href: ev.target.value };
                  onLanding({ ...landing, entries });
                }}
              />
            </label>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 8 }}
              onClick={() => {
                const entries = (landing.entries || []).filter((_, i) => i !== idx);
                onLanding({ ...landing, entries });
              }}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EngageConfig({
  landing,
  onLanding,
}: {
  landing: OpsCampaignLanding;
  onLanding: (l: OpsCampaignLanding) => void;
}) {
  const f = landing.features || {};
  const toggle = (key: keyof NonNullable<OpsCampaignLanding['features']>, checked: boolean) => {
    onLanding({ ...landing, features: { ...f, [key]: checked } });
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {(
        [
          ['likes', '点赞'],
          ['comments', '评论'],
          ['rsvp', 'RSVP 出席'],
          ['prayer', '代祷意向'],
          ['questions', '提问箱'],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="ops-check-row">
          <input
            type="checkbox"
            checked={Boolean(f[key])}
            onChange={(e) => toggle(key, e.target.checked)}
          />
          {label}
        </label>
      ))}
      {f.prayer ? (
        <label className="ops-check-row">
          <input
            type="checkbox"
            checked={Boolean(f.prayerPrivate)}
            onChange={(e) => toggle('prayerPrivate', e.target.checked)}
          />
          代祷仅管理可见
        </label>
      ) : null}
    </div>
  );
}

function CtaConfig({
  templateId,
  campaignId,
  landing,
}: {
  templateId: string;
  campaignId: string;
  landing: OpsCampaignLanding;
}) {
  const cta = resolvePrimaryCta(templateId, campaignId, landing.primaryCta);
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        按模板自动设置，成员打开落地页即可行动。
      </p>
      <div className="ops-auto-cta">
        <strong>{cta.label}</strong>
        <span className="muted">{cta.href}</span>
      </div>
    </div>
  );
}
