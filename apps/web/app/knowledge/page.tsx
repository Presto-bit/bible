import { redirect } from 'next/navigation';

export const revalidate = 60;

/** 探索列表迁入发现壳；旧 /knowledge 深链落到发现·探索 */
export default function KnowledgeTopicsPage() {
  redirect('/discover?pane=explore');
}
