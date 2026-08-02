import '@/styles/discover.css';
import '@/styles/discover_list.css';
/** 发现子页（好友/加群/邀请/联系人）仍依赖群聊样式；列表页一并加载以保证操作可用 */
import '@/styles/group_chat.css';

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
