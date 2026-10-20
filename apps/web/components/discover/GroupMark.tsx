/** 群书页标：和人脸头像区分开。 */
export function GroupMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="group-mark"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" fill="none">
        <path
          d="M5 4.5h5.2A2.8 2.8 0 0 1 13 7.3V19.5a2.2 2.2 0 0 0-2.2-2.2H5V4.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M19 4.5h-5.2A2.8 2.8 0 0 0 11 7.3V19.5a2.2 2.2 0 0 1 2.2-2.2H19V4.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
