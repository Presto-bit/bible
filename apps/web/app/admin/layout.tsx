import '@/styles/admin_rag.css';
import '@/styles/campaign_ops.css';

/** 管理台专用样式：从 globals 拆出，避免进主壳首屏 CSS。 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
