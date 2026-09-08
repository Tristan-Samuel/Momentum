import type { ReactNode } from 'react';
import { useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { updateSettings } from '@/database/repository';
import { audioEngine } from '@/audio-engine/engine';
import { TEST_CUES } from '@/audio-engine/profiles';
import { haptics } from '@/platform/haptics';
import { requestNotificationPermission, sendTestNotification } from '@/platform/notifications';
import type { SoundProfile, ThemePreference } from '@/types';

export function SettingsScreen() {
  const settings = useSettings();
  const [cueStatus, setCueStatus] = useState<string | null>(null);
  const [notifyStatus, setNotifyStatus] = useState<string | null>(null);
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
            setNotifyStatus(
              ok
                ? 'Notifications allowed. Rest and transition will ping when time is up.'
                : 'Permission denied. Enable notifications in iPhone Settings → Momentum.',
            );
            return;
          }
          await updateSettings({ notificationsEnabled });
          setNotifyStatus(null);
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
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Raise the ringer volume. The iPhone Silent switch no longer mutes these tones. If the
          profile is Silent, the test still plays a standard cue.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {TEST_CUES.map((kind) => (
            <button
              key={kind}
              type="button"
              className="rounded-2xl border border-[var(--line)] px-4 py-4"
              onClick={() => {
                const profile = settings.soundProfile === 'silent' ? 'standard' : settings.soundProfile;
                audioEngine.configure({
                  profile,
                  volume: Math.max(settings.volume, 0.35),
                  enabled: true,
                });
                void (async () => {
                  haptics.setEnabled(true);
                  await haptics.trigger('start');
                  haptics.setEnabled(settings.hapticsEnabled);
                })();
                void audioEngine.playNow(kind).then((played) => {
                  setCueStatus(
                    played
                      ? `Played ${kind.replace('_', ' ')}`
                      : 'No tone. Check volume, then tap again.',
                  );
                });
              }}
            >
              {kind.replace('_', ' ')}
            </button>
          ))}
        </div>
        {cueStatus ? <p className="mt-3 text-sm text-[var(--muted)]">{cueStatus}</p> : null}
      </section>

      <section className="mt-8">
        <p className="text-xs tracking-[0.22em] text-[var(--muted)]">TEST NOTIFICATION</p>
        <button
          type="button"
          className="mt-4 w-full rounded-2xl border border-[var(--line)] px-4 py-4"
          onClick={async () => {
            const result = await sendTestNotification();
            if (result.ok) {
              await updateSettings({ notificationsEnabled: true });
            }
            setNotifyStatus(result.message);
          }}
        >
          Send test alert
        </button>
        {notifyStatus ? <p className="mt-3 text-sm text-[var(--muted)]">{notifyStatus}</p> : null}
      </section>

      <p className="mt-10 text-sm leading-relaxed text-[var(--muted)]">
        Keep the screen on during sets so the metronome can keep ticking. Rest and transitions can
        finish in the background; turn Notifications on if you want a ping when it is time to start
        again.
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
