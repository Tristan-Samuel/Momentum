import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import { Switch } from '@/components/ui/Switch';
import { resetAllProgress, updateSettings } from '@/database/repository';
import {
  backupFilename,
  backupSummary,
  BackupError,
  exportAll,
  importAll,
  parseBackup,
  type BackupEnvelope,
} from '@/database/backup';
import { audioEngine } from '@/audio-engine/engine';
import { TEST_CUES } from '@/audio-engine/profiles';
import { haptics } from '@/platform/haptics';
import { pickTextFile, shareTextFile } from '@/platform/files';
import { requestNotificationPermission, sendTestNotification } from '@/platform/notifications';
import type { SoundProfile, ThemePreference } from '@/types';

type Props = {
  /** Rendered at the top of Data; the account/sync card plugs in here. */
  account?: ReactNode;
  onImported?: () => void;
};

export function SettingsScreen({ account, onImported }: Props = {}) {
  const settings = useSettings();
  const [cueStatus, setCueStatus] = useState<string | null>(null);
  const [notifyStatus, setNotifyStatus] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [dataStatus, setDataStatus] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<BackupEnvelope | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  if (!settings) return <p className="text-[var(--muted)]">Loading…</p>;

  const pendingSummary = pendingImport ? backupSummary(pendingImport) : null;

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">SETTINGS</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Preferences</h1>
      <Link to="/guide" className="mt-4 inline-flex items-center gap-1 text-[var(--muted)]">
        How it works <Icon name="chevron-right" size={16} />
      </Link>

      <Group label="Training">
        <Stepper
          label="Weekly goal"
          value={settings.weeklyGoal}
          min={1}
          max={7}
          suffix={settings.weeklyGoal === 1 ? 'workout' : 'workouts'}
          onChange={(weeklyGoal) => void updateSettings({ weeklyGoal })}
        />
        <p className="mt-2 text-sm text-[var(--muted)]">
          Hit it each week (Monday to Sunday) to grow your streak on Home.
        </p>
      </Group>

      <Group label="Sound and feel">
        <Segmented<SoundProfile>
          label="Sound profile"
          value={settings.soundProfile}
          options={[
            { value: 'minimal', label: 'Minimal' },
            { value: 'standard', label: 'Standard' },
            { value: 'loud', label: 'Loud' },
            { value: 'silent', label: 'Silent' },
          ]}
          onChange={(soundProfile) => void updateSettings({ soundProfile })}
        />
        <label className="mt-5 block text-sm text-[var(--muted)]">
          <span className="flex justify-between">
            <span>Volume</span>
            <span className="tabular-nums text-[var(--fg)]">{Math.round(settings.volume * 100)}%</span>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.volume}
            onChange={(event) => void updateSettings({ volume: Number(event.target.value) })}
            className="mt-3 w-full accent-[var(--accent)]"
          />
        </label>
        <div className="mt-2 divide-y divide-[var(--line)]">
          <Switch
            label="Sounds"
            checked={settings.soundsEnabled}
            onChange={(soundsEnabled) => void updateSettings({ soundsEnabled })}
          />
          <Switch
            label="Haptics"
            checked={settings.hapticsEnabled}
            onChange={(hapticsEnabled) => void updateSettings({ hapticsEnabled })}
          />
          <Switch
            label="Keep screen awake"
            description="So the metronome keeps ticking during sets."
            checked={settings.keepAwake}
            onChange={(keepAwake) => void updateSettings({ keepAwake })}
          />
          <Switch
            label="Notifications"
            description="A ping when rest or a transition ends in the background."
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
        </div>
        {notifyStatus ? <p className="mt-2 text-sm text-[var(--muted)]">{notifyStatus}</p> : null}
      </Group>

      <Group label="Test cues">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Raise the ringer volume. The iPhone Silent switch does not mute these tones. If the profile
          is Silent, the test plays a standard cue.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {TEST_CUES.map((kind) => (
            <button
              key={kind}
              type="button"
              className="rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm capitalize active:scale-[0.98]"
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
                    played ? `Played ${kind.replace('_', ' ')}` : 'No tone. Check volume, then tap again.',
                  );
                });
              }}
            >
              {kind.replace('_', ' ')}
            </button>
          ))}
          <button
            type="button"
            className="col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm active:scale-[0.98]"
            onClick={async () => {
              const result = await sendTestNotification();
              if (result.ok) await updateSettings({ notificationsEnabled: true });
              setNotifyStatus(result.message);
            }}
          >
            Send test notification
          </button>
        </div>
        {cueStatus ? <p className="mt-3 text-sm text-[var(--muted)]">{cueStatus}</p> : null}
      </Group>

      <Group label="Appearance">
        <Segmented<ThemePreference>
          label="Theme"
          value={settings.theme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(theme) => void updateSettings({ theme })}
        />
        <div className="mt-2 divide-y divide-[var(--line)]">
          <Switch
            label="Large text"
            checked={settings.largeText}
            onChange={(largeText) => void updateSettings({ largeText })}
          />
          <Switch
            label="High contrast"
            checked={settings.highContrast}
            onChange={(highContrast) => void updateSettings({ highContrast })}
          />
          <Switch
            label="Reduce motion"
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => void updateSettings({ reducedMotion })}
          />
        </div>
      </Group>

      {account}

      <Group label="Backup">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Save everything (programs, workouts, records, settings) to a JSON file, or restore from one.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            className="flex items-center justify-center gap-2"
            onClick={async () => {
              try {
                const envelope = await exportAll();
                await shareTextFile(backupFilename(), JSON.stringify(envelope));
                setDataStatus('Backup ready.');
              } catch (err) {
                if (err instanceof Error && /cancel/i.test(err.message)) return;
                setDataStatus('Could not export.');
              }
            }}
          >
            <Icon name="upload" size={18} /> Export
          </Button>
          <Button
            variant="ghost"
            className="flex items-center justify-center gap-2"
            onClick={async () => {
              const text = await pickTextFile();
              if (text === null) return;
              try {
                setPendingImport(parseBackup(text));
                setDataStatus(null);
              } catch (err) {
                setDataStatus(err instanceof BackupError ? err.message : 'That file is not a Momentum backup.');
              }
            }}
          >
            <Icon name="download" size={18} /> Import
          </Button>
        </div>
        {dataStatus ? <p className="mt-3 text-sm text-[var(--muted)]">{dataStatus}</p> : null}
      </Group>

      <Group label="Reset">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Deletes all workouts, personal records, and lifetime totals. Today’s targets go back to the
          middle of each range. Your programs and preferences stay.
        </p>
        <Button className="mt-4 w-full" variant="danger" onClick={() => setConfirmReset(true)}>
          Reset all progress
        </Button>
      </Group>
      <div className="pb-4" />

      <ConfirmDialog
        open={confirmReset}
        eyebrow="RESET PROGRESS"
        title="Start over?"
        body="This removes every workout from History and Progress. Today’s targets return to the middle of each range. Your programs and preferences stay."
        confirmLabel="Reset all progress"
        danger
        busy={resetBusy}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setResetBusy(true);
          void resetAllProgress()
            .then(() => setDataStatus('Progress reset.'))
            .catch(() => setDataStatus('Could not reset progress.'))
            .finally(() => {
              setResetBusy(false);
              setConfirmReset(false);
            });
        }}
      />
      <ConfirmDialog
        open={pendingImport !== null}
        eyebrow="IMPORT BACKUP"
        title="Replace everything on this phone?"
        body={
          pendingSummary
            ? `The file has ${pendingSummary.workouts} workout${pendingSummary.workouts === 1 ? '' : 's'} and ${pendingSummary.programs} program${pendingSummary.programs === 1 ? '' : 's'}${pendingImport?.exportedAt ? `, saved ${new Date(pendingImport.exportedAt).toLocaleString()}` : ''}. Current data on this phone is replaced.`
            : ''
        }
        confirmLabel="Replace with backup"
        danger
        busy={importBusy}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => {
          if (!pendingImport) return;
          setImportBusy(true);
          void importAll(pendingImport)
            .then(() => {
              setDataStatus('Backup restored.');
              onImported?.();
            })
            .catch(() => setDataStatus('Could not import that backup.'))
            .finally(() => {
              setImportBusy(false);
              setPendingImport(null);
            });
        }}
      />
    </main>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <SectionLabel>{label}</SectionLabel>
      <Card className="mt-3">{children}</Card>
    </section>
  );
}
