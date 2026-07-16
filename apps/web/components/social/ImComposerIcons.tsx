/** 输入栏加号面板统一线图标 */

type IconProps = { className?: string };

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconImage({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" {...stroke} />
      <circle cx="9" cy="10" r="1.6" {...stroke} />
      <path d="M5.5 16.5 10 12l3 3 2.5-2.5 3 4" {...stroke} />
    </svg>
  );
}

export function IconFile({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M8 3.5h6l5 5V20a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V5A1.5 1.5 0 0 1 8 3.5z" {...stroke} />
      <path d="M14 3.5V9h5.5" {...stroke} />
      <path d="M9 13h6M9 16.5h4" {...stroke} />
    </svg>
  );
}

export function IconMention({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <circle cx="12" cy="12" r="7.5" {...stroke} />
      <path d="M16.2 12v1.2a2.4 2.4 0 0 0 4.3 1.2" {...stroke} />
      <circle cx="12" cy="12" r="3.2" {...stroke} />
    </svg>
  );
}

export function IconCheckin({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="m8.2 12.2 2.6 2.6 5-5.2" {...stroke} />
    </svg>
  );
}

export function IconTask({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="5" y="4" width="14" height="16" rx="2" {...stroke} />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" {...stroke} />
    </svg>
  );
}

export function IconPlan({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="2" {...stroke} />
      <path d="M8 3.5v3M16 3.5v3M4 9.5h16" {...stroke} />
      <path d="m9 14 2 2 4-4" {...stroke} />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M12 6v12M6 12h12" {...stroke} />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M7 7l10 10M17 7 7 17" {...stroke} />
    </svg>
  );
}

export function IconMic({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" {...stroke} />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...stroke} />
    </svg>
  );
}

export function IconKeyboard({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <rect x="3" y="8" width="18" height="11" rx="2" {...stroke} />
      <path d="M7 11h0M11 11h0M15 11h0M7 15h10" {...stroke} />
    </svg>
  );
}
