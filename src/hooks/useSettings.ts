import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '@/database/repository';
import type { AppSettings } from '@/types';

function applyDocumentSettings(settings: AppSettings): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('large-text', settings.largeText);
  document.documentElement.classList.toggle('high-contrast', settings.highContrast);
  document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function useSettings() {
  const settings = useLiveQuery(() => getSettings(), []);

  useEffect(() => {
    if (!settings) return;
    applyDocumentSettings(settings);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyDocumentSettings(settings);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [settings]);

  return settings;
}
