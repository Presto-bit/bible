/** 读经沉浸 chrome：顶栏/底栏显隐与 body 沉浸 class。 */
'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { restoreMainTabbar } from '@/lib/reader_chrome';

type Opts = {
  paneActive: boolean;
  heavyOverlayOpen: boolean;
  overlayOpen: boolean;
  externalOverlayOpen: boolean;
  listenSheetOpen: boolean;
  listenSheetOpenRef: RefObject<boolean>;
  overlayOpenRef: RefObject<boolean>;
  closeListenSheet: () => void;
  /** tab 切换 chrome 时额外收口（如定位弹层） */
  onTabToggle?: () => void;
};

export function useReaderChrome({
  paneActive,
  heavyOverlayOpen,
  overlayOpen,
  externalOverlayOpen,
  listenSheetOpen,
  listenSheetOpenRef,
  overlayOpenRef,
  closeListenSheet,
  onTabToggle,
}: Opts) {
  const [chromeHidden, setChromeHidden] = useState(false);
  const paneWasActiveRef = useRef(false);

  const toggleChrome = useCallback(
    (source: 'content' | 'tab' = 'content') => {
      if (source === 'tab') {
        onTabToggle?.();
        if (listenSheetOpenRef.current) {
          closeListenSheet();
        }
        if (heavyOverlayOpen) return;
        setChromeHidden((hidden) => !hidden);
        return;
      }
      if (overlayOpenRef.current) return;
      if (listenSheetOpenRef.current) {
        closeListenSheet();
      }
      setChromeHidden((hidden) => !hidden);
    },
    [
      closeListenSheet,
      heavyOverlayOpen,
      listenSheetOpenRef,
      onTabToggle,
      overlayOpenRef,
    ],
  );

  useEffect(() => {
    if (!paneActive) return;
    const onToggle = () => toggleChrome('tab');
    window.addEventListener('peiai-reader-toggle-chrome', onToggle);
    return () => window.removeEventListener('peiai-reader-toggle-chrome', onToggle);
  }, [paneActive, toggleChrome]);

  useEffect(() => {
    if (paneActive && !paneWasActiveRef.current) {
      setChromeHidden(false);
    }
    paneWasActiveRef.current = paneActive;
  }, [paneActive]);

  useEffect(() => {
    if (!paneActive) {
      document.body.classList.remove('reader-immersive');
      return;
    }
    if (chromeHidden) {
      document.body.classList.add('reader-immersive');
    } else {
      document.body.classList.remove('reader-immersive');
      restoreMainTabbar();
    }
  }, [chromeHidden, paneActive]);

  useEffect(() => {
    if (!paneActive || !listenSheetOpen) {
      document.body.classList.remove('listen-sheet-open');
      if (paneActive && !listenSheetOpen && !chromeHidden) restoreMainTabbar();
      return;
    }
    setChromeHidden(false);
    document.body.classList.add('listen-sheet-open');
    return () => {
      document.body.classList.remove('listen-sheet-open');
      restoreMainTabbar();
    };
  }, [listenSheetOpen, paneActive, chromeHidden]);

  useEffect(() => {
    if (externalOverlayOpen) setChromeHidden(true);
    else if (overlayOpen) setChromeHidden(false);
  }, [externalOverlayOpen, overlayOpen]);

  return { chromeHidden, setChromeHidden, toggleChrome };
}
