'use client';

import { useEffect, useState } from 'react';
import {
  currentIosAddToHomeGuide,
  IOS_ADD_TO_HOME_FALLBACK,
  type IosAddToHomeGuide,
} from '@/lib/ios_home_screen_guide';

/** 跟随横竖屏切换步骤。首帧在服务端用 iOS 26 紧凑路径，避免和浏览器首屏不一致。 */
export function useIosAddToHomeGuide(): IosAddToHomeGuide {
  const [guide, setGuide] = useState(() =>
    typeof window === 'undefined' ? IOS_ADD_TO_HOME_FALLBACK : currentIosAddToHomeGuide(),
  );
  useEffect(() => {
    const update = () => setGuide(currentIosAddToHomeGuide());
    update();
    const mq = window.matchMedia('(orientation: landscape)');
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return guide;
}
