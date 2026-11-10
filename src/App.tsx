import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { useSettings } from '@/hooks/useSettings';
import { AuthCallbackScreen } from '@/screens/AuthCallbackScreen';
import { ConfigureScreen } from '@/screens/ConfigureScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { HistoryDetailScreen } from '@/screens/HistoryDetailScreen';
import { HistoryScreen } from '@/screens/HistoryScreen';
import { ProgressScreen } from '@/screens/ProgressScreen';
import { GuideScreen } from '@/screens/GuideScreen';
import { ReviewScreen } from '@/screens/ReviewScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { WorkoutScreen } from '@/screens/WorkoutScreen';
import { setSyncPaused } from '@/sync/engine';

function ThemeBoot({ children }: { children: ReactNode }) {
  useSettings();
  return children;
}

function SyncPause() {
  const { pathname } = useLocation();
  useEffect(() => {
    setSyncPaused(pathname === '/workout');
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ThemeBoot>
      <SyncPause />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/history/:id" element={<HistoryDetailScreen />} />
          <Route path="/progress" element={<ProgressScreen />} />
          <Route path="/configure" element={<ConfigureScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/guide" element={<GuideScreen />} />
          <Route path="/auth/callback" element={<AuthCallbackScreen />} />
        </Route>
        <Route path="/workout" element={<WorkoutScreen />} />
        <Route path="/review/:id" element={<ReviewScreen />} />
      </Routes>
    </ThemeBoot>
  );
}
