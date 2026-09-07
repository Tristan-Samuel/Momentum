import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { useSettings } from '@/hooks/useSettings';
import { ConfigureScreen } from '@/screens/ConfigureScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { HistoryDetailScreen } from '@/screens/HistoryDetailScreen';
import { HistoryScreen } from '@/screens/HistoryScreen';
import { ProgressScreen } from '@/screens/ProgressScreen';
import { ReviewScreen } from '@/screens/ReviewScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { WorkoutScreen } from '@/screens/WorkoutScreen';

function ThemeBoot({ children }: { children: ReactNode }) {
  useSettings();
  return children;
}

export default function App() {
  return (
    <ThemeBoot>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/history/:id" element={<HistoryDetailScreen />} />
          <Route path="/progress" element={<ProgressScreen />} />
          <Route path="/configure" element={<ConfigureScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
        <Route path="/workout" element={<WorkoutScreen />} />
        <Route path="/review/:id" element={<ReviewScreen />} />
      </Routes>
    </ThemeBoot>
  );
}
