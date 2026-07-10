'use client';

const NAME_MAX_LEN = 6;

type Props = {
  greeting: string;
  userName: string;
};

function truncateDisplayName(name: string, maxLen = NAME_MAX_LEN): string {
  const trimmed = name.trim() || '读经伙伴';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

export function HomeGreetStreak({ greeting, userName }: Props) {
  const fullName = userName.trim() || '读经伙伴';
  const displayName = truncateDisplayName(fullName);

  return (
    <div className="home-greet-streak">
      <span className="home-greet-name" title={fullName}>
        {displayName}
      </span>
      <span className="home-greet-time">{greeting}</span>
    </div>
  );
}
