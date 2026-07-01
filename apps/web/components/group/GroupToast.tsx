'use client';

type Props = {
  message: string | null;
};

export function GroupToast({ message }: Props) {
  if (!message) return null;
  return (
    <div className="group-toast" role="status">
      {message}
    </div>
  );
}
