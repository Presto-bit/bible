'use client';

import Link from 'next/link';
import { openCampaignHref, toInternalAppPath } from '@/lib/campaign_nav';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

export type DmNoticePayload = {
  title?: string;
  actions?: { label: string; href: string }[];
};

function parseNoticeRef(ref?: string | null): DmNoticePayload | null {
  if (!ref) return null;
  try {
    return JSON.parse(ref) as DmNoticePayload;
  } catch {
    return null;
  }
}

export function DmNoticeCard({
  body,
  ref: refRaw,
}: {
  body?: string | null;
  ref?: string | null;
}) {
  const meta = parseNoticeRef(refRaw);
  const title = meta?.title;

  return (
    <div className="dm-notice-card">
      {title ? <p className="dm-notice-title">{title}</p> : null}
      {body ? <p className="dm-notice-body">{body}</p> : null}
      {meta?.actions?.length ? (
        <div className="dm-notice-actions">
          {meta.actions.map((a) => {
            const internal = toInternalAppPath(a.href) || a.href;
            const isInternal = Boolean(toInternalAppPath(a.href));
            if (isInternal && internal.startsWith('/')) {
              return (
                <Link
                  key={`${a.label}-${a.href}`}
                  href={internal}
                  className="btn btn-secondary dm-notice-btn"
                  onClick={() => markRouteNavigation()}
                >
                  {a.label}
                </Link>
              );
            }
            return (
              <button
                key={`${a.label}-${a.href}`}
                type="button"
                className="btn btn-secondary dm-notice-btn"
                onClick={() => openCampaignHref(a.href)}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
