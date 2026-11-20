import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database/db';
import { scheduleRoutineReminders } from '@/platform/nativeNotifications';
import { upcomingReminders } from '@/schedule/reminders';

/** Rebuilds the next week of iPhone reminders when routines change and when the app opens. */
export function useRoutineReminders(): void {
  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const programs = useLiveQuery(() => db.workoutPrograms.toArray(), []);
  const sessions = useLiveQuery(() => db.workoutSessions.toArray(), []);
  const signature = JSON.stringify({
    routines,
    programs: programs?.map((program) => ({ id: program.id, name: program.name, order: program.order })),
    sessions: sessions?.map((session) => ({
      programId: session.programId,
      startedAt: session.startedAt,
      status: session.status,
    })),
  });

  useEffect(() => {
    if (!routines || !programs || !sessions) return;
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      const alerts = upcomingReminders({
        routines,
        programs: programs.map((program) => ({
          id: program.id,
          name: program.name,
          order: program.order ?? 0,
        })),
        sessions: sessions.map((session) => ({
          programId: session.programId,
          startedAt: session.startedAt,
          status: session.status,
        })),
        now: new Date(),
      });
      void scheduleRoutineReminders(alerts);
    };
    refresh();
    let remove: () => void = () => undefined;
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) refresh();
      }).then((handle) => {
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      });
    } else {
      const onVisible = () => {
        if (document.visibilityState === 'visible') refresh();
      };
      document.addEventListener('visibilitychange', onVisible);
      remove = () => document.removeEventListener('visibilitychange', onVisible);
    }
    return () => {
      cancelled = true;
      remove();
    };
  }, [signature, routines, programs, sessions]);
}
