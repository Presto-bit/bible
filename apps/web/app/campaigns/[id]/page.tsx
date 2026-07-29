'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, type OpsCampaignDetail } from '@/lib/api';
import {
  campaignPreviewUrl,
  campaignShareUrl,
  campaignStatusLabel,
  campaignStatusTone,
  copyText,
  formatRelativeTime,
} from '@/lib/campaign_ops';
import { CampaignAdminGate } from '@/components/campaigns/CampaignAdminGate';
import { OpsPcShell } from '@/components/campaigns/OpsPcShell';

function formatWhen(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CampaignDetailPage() {
  return (
    <CampaignAdminGate>
      <CampaignDetailInner />
    </CampaignAdminGate>
  );
}

function CampaignDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');
  const [camp, setCamp] = useState<OpsCampaignDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(null), 2200);
  };

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await api.getCampaign(id, true);
      if (!res.campaign) {
        setErr(res.message || '无法加载活动');
        setCamp(null);
        return;
      }
      setCamp(res.campaign);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  const onExtend = async () => {
    setBusy(true);
    try {
      await api.extendCampaign(id, 7);
      flash('已延期 7 天');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '延期失败');
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    setBusy(true);
    try {
      const { campaign } = await api.copyCampaign(id);
      flash('已复制为新草稿');
      router.push(`/campaigns/${campaign.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '复制失败');
      setBusy(false);
    }
  };

  const onCopyPreview = async () => {
    const ok = await copyText(campaignPreviewUrl(id));
    flash(ok ? '预览链已复制' : '复制失败');
  };

  const onCopyShare = async () => {
    const ok = await copyText(campaignShareUrl(id));
    flash(ok ? '分享链接已复制' : '复制失败');
  };

  const onDelete = async () => {
    if (!window.confirm('确定删除此活动？')) return;
    setBusy(true);
    try {
      await api.deleteCampaign(id);
      router.replace('/admin?tab=ops');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '删除失败');
      setBusy(false);
    }
  };

  if (!camp && !err) {
    return (
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    );
  }

  if (!camp) {
    return (
      <OpsPcShell title="活动详情" backHref="/admin?tab=ops" backLabel="活动运营">
        <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>
          {err}
        </p>
      </OpsPcShell>
    );
  }

  const audienceLabel =
    camp.audienceMode === 'all'
      ? '全站'
      : camp.audienceMode === 'admin_preview'
        ? '仅超管预览'
        : `${(camp.groupIds || []).length} 个群`;

  const stats = camp.stats;

  return (
    <OpsPcShell
      title={camp.name}
      backHref="/admin?tab=ops"
      backLabel="活动运营"
      sub={
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`ops-status ops-status-${campaignStatusTone(camp.status)}`}>
            {campaignStatusLabel(camp.status)}
          </span>
          <span>{camp.tag || '活动'}</span>
          {camp.updatedAt ? (
            <span className="muted">更新于 {formatRelativeTime(camp.updatedAt)}</span>
          ) : null}
          {hint ? <span>· {hint}</span> : null}
        </span>
      }
      actions={
        <>
          <Link href={`/campaigns/${id}/edit`} className="btn btn-primary">
            编辑
          </Link>
          <Link href={`/campaigns/view/${id}?preview=1`} className="btn">
            预览
          </Link>
        </>
      }
    >
      {err ? (
        <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>
          {err}
        </p>
      ) : null}

      <div className="ops-detail-grid">
        <section className="settings-card ops-detail-card">
          <h2 className="settings-title">基本信息</h2>
          <dl className="ops-detail-dl">
            <div>
              <dt>副文案</dt>
              <dd>{(camp.subtitle || '').trim() || '继续阅读'}</dd>
            </div>
            <div>
              <dt>受众</dt>
              <dd>{audienceLabel}</dd>
            </div>
            <div>
              <dt>今日推荐</dt>
              <dd>
                {camp.railEnabled === false
                  ? '未挂载'
                  : `第 ${camp.railSlot || 1} 位${camp.railSlot === 1 ? ' · 主卡' : ' · 副卡'}`}
              </dd>
            </div>
            <div>
              <dt>卡片跳转</dt>
              <dd className="ops-detail-mono">
                {(camp.railHref || '').trim() || '活动落地页（默认）'}
              </dd>
            </div>
            <div>
              <dt>开始</dt>
              <dd>{formatWhen(camp.startAt)}</dd>
            </div>
            <div>
              <dt>结束</dt>
              <dd>{formatWhen(camp.endAt)}</dd>
            </div>
            <div>
              <dt>模板</dt>
              <dd>{camp.templateId || '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="settings-card ops-detail-card">
          <div className="ops-sec-toggle" style={{ cursor: 'default', marginBottom: 10 }}>
            <h2 className="settings-title" style={{ margin: 0 }}>
              数据情况
            </h2>
            <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={() => void load()}>
              刷新
            </button>
          </div>
          <div className="ops-stats-grid">
            {(
              [
                ['打开', stats?.opens ?? 0],
                ['已读', stats?.readers ?? 0],
                ['赞', stats?.likes ?? 0],
                ['RSVP', stats?.rsvps ?? 0],
                ['报名', stats?.signups ?? 0],
                ['提问', stats?.questions ?? 0],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="ops-stat">
                <strong>{n}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
            仅运营可见，成员端不会看到这些数字
          </p>
        </section>

        <section className="settings-card ops-detail-card ops-detail-actions">
          <h2 className="settings-title">快捷操作</h2>
          <div className="ops-canvas-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void onExtend()}>
              延期 7 天
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void onCopy()}>
              复制活动
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void onCopyPreview()}>
              分享预览链
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void onCopyShare()}>
              复制正式链接
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              style={{ color: 'var(--danger, #b00)' }}
              onClick={() => void onDelete()}
            >
              删除活动
            </button>
          </div>
        </section>
      </div>
    </OpsPcShell>
  );
}
