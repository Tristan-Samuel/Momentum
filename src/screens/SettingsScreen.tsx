import type { ReactNode } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { updateSettings } from '@/database/repository';
import { audioEngine } from '@/audio-engine/engine';
import { TEST_CUES } from '@/audio-engine/profiles';
import { requestNotificationPermission } from '@/platform/notifications';
import type { SoundProfile, ThemePreference } from '@/types';

export function SettingsScreen() {
  const settings = useSettings();
  if (!settings) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">SETTINGS</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Preferences</h1>

      <Field label="Theme">
        <select
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-[var(--fg)]"
          value={settings.theme}
          onChange={(event) => void updateSettings({ theme: event.target.value as ThemePreference })}
        >
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </Field>

      <Field label="Sound profile">
        <select
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-[var(--fg)]"
          value={settings.soundProfile}
          onChange={(event) =>
            void updateSettings({ soundProfile: event.target.value as SoundProfile })
          }
        >
          <option value="minimal">Minimal</option>
          <option value="standard">Standard</option>
          <option value="loud">Loud</option>
          <option value="silent">Silent</option>
        </select>
      </Field>

      <Field label={`Volume ${Math.round(settings.volume * 100)}%`}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.volume}
          onChange={(event) => void updateSettings({ volume: Number(event.target.value) })}
          className="w-full"
        />
      </Field>

      <Toggle
        label="Sounds"
        checked={settings.soundsEnabled}
        onChange={(soundsEnabled) => void updateSettings({ soundsEnabled })}
      />
      <Toggle
        label="Haptics"
        checked={settings.hapticsEnabled}
        onChange={(hapticsEnabled) => void updateSettings({ hapticsEnabled })}
      />
      <Toggle
        label="Keep screen awake"
        checked={settings.keepAwake}
        onChange={(keepAwake) => void updateSettings({ keepAwake })}
      />
      <Toggle
        label="Notifications"
        checked={settings.notificationsEnabled}
        onChange={async (notificationsEnabled) => {
          if (notificationsEnabled) {
            const ok = await requestNotificationPermission();
            await updateSettings({ notificationsEnabled: ok });
            return;
          }
          await updateSettings({ notificationsEnabled });
        }}
      />
      <Toggle
        label="Large text"
        checked={settings.largeText}
        onChange={(largeText) => void updateSettings({ largeText })}
      />
      <Toggle
        label="High contrast"
        checked={settings.highContrast}
        onChange={(highContrast) => void updateSettings({ highContrast })}
      />
      <Toggle
        label="Reduce motion"
        checked={settings.reducedMotion}
        onChange={(reducedMotion) => void updateSettings({ reducedMotion })}
      />

      <section className="mt-10">
        <p className="text-xs tracking-[0.22em] text-[var(--muted)]">TEST CUES</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {TEST_CUES.map((kind) => (
            <button
              key={kind}
              type="button"
              className="rounded-2xl border border-[var(--line)] px-4 py-4"
              onClick={async () => {
                audioEngine.configure({
                  profile: settings.soundProfile,
                  volume: settings.volume,
                  enabled: true,
                });
                await audioEngine.playNow(kind);
              }}
            >
              {kind.replace('_', ' ')}
            </button>
          ))}
        </div>
      </section>

      <p className="mt-10 text-sm leading-relaxed text-[var(--muted)]">
        Browser workout mode cannot guarantee metronome playback if the screen is locked or the
        app is backgrounded. Keep the screen on during sets. Native background audio is planned
        through Capacitor.
      </p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-6 block text-sm text-[var(--muted)]">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="mt-5 flex items-center justify-between gap-4">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}
