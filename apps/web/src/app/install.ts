import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/**
 * Chrome, Edge and Android offer to install the app; this holds that offer so we can show
 * our own Install button. Returns null where the browser doesn't offer it (Safari, Firefox,
 * or already installed).
 */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const offer = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const installed = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  if (!event) return null;
  return async () => {
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  };
}

/**
 * iPhone or iPad, not opened from the home screen. Safari there may delete a site's saved
 * data after 7 days without a visit; apps added to the home screen are exempt.
 */
export function needsIosHomeScreen(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}
