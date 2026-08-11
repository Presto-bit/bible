import '@/styles/discover.css';
import '@/styles/discover_list.css';
/** 发现子页（好友/加群/邀请/联系人）仍依赖群聊样式；列表页一并加载以保证操作可用 */
import '@/styles/group_chat.css';
/** 左滑置顶/免打扰/不显示：冷开 /discover 不经 Reader 时也须自带 */
import '@/styles/swipe_reveal.css';

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
