/** 首页横滑卡场景插画路径 */

import { clientWithBasePath } from './basePath';

export type RailSceneId =
  | 'prayer'
  | 'group'
  | 'assistant'
  | 'notes'
  | 'plan'
  | 'challenge'
  | 'discover';

export function railSceneUrl(id: RailSceneId): string {
  return clientWithBasePath(`/rail-scenes/${id}.svg`);
}
