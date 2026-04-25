'use client';

/**
 * usePWAInstall — PWA install prompt 관리 hook (round 39).
 *
 * Browser 가 PWA 설치 가능 판단 시 'beforeinstallprompt' 이벤트 발사.
 * 우리는 이 이벤트를 가로채서 default UI 막고, 우리만의 UX 흐름에 맞춰
 * 적절한 순간에 prompt 호출.
 *
 * iOS Safari 미지원 — Apple 정책 (수동 'Add to Home Screen' 필요).
 * iOS 사용자에겐 별도 안내 가능.
 */

import { useEffect, useState, useCallback } from 'react';

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt: () => Promise<void>;
};

type State = {
  /** 브라우저가 install prompt 가능 (Android Chrome 등). */
  canInstall: boolean;
  /** 이미 설치됨 — install 시도 안 함. */
  installed: boolean;
  /** iOS Safari — beforeinstallprompt 미지원이라 별도 안내. */
  isIOS: boolean;
  /** 사용자가 dismiss 한 상태 (sessionStorage). */
  dismissed: boolean;
};

const DISMISS_KEY = 'splathub:pwa-install-dismissed';

export function usePWAInstall() {
  const [state, setState] = useState<State>({
    canInstall: false,
    installed: false,
    isIOS: false,
    dismissed: false,
  });
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 이미 설치됨 (display-mode: standalone) 검사
    const installed =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS standalone (legacy)
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    // iOS Safari 감지
    const ua = window.navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);

    // sessionStorage dismiss 체크
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* ignore */
    }

    setState({ canInstall: false, installed, isIOS, dismissed });

    if (installed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setState((s) => ({ ...s, canInstall: true }));
    };

    const installedHandler = () => {
      setState((s) => ({ ...s, canInstall: false, installed: true }));
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return 'unavailable' as const;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      // prompt 는 1회성 — Chrome 정책. 호출 후 사용 불가.
      setPromptEvent(null);
      setState((s) => ({ ...s, canInstall: false }));
      return outcome;
    } catch {
      return 'error' as const;
    }
  }, [promptEvent]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setState((s) => ({ ...s, dismissed: true }));
  }, []);

  return { ...state, install, dismiss };
}
