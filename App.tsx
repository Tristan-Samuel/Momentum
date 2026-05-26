import { useEffect } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { NavigationTabs } from './components/NavigationTabs';
import { NotesScreen } from './screens/NotesScreen';
import { RoutineScreen } from './screens/RoutineScreen';
import { StatsScreen } from './screens/StatsScreen';
import { useMomentumStore } from './store/useMomentumStore';
import { getLocalDateKey } from './utils/date';
import { colors, spacing } from './utils/theme';

function ScreenContent() {
  const activeScreen = useMomentumStore((state) => state.activeScreen);

  if (activeScreen === 'notes') {
    return <NotesScreen />;
  }

  if (activeScreen === 'stats') {
    return <StatsScreen />;
  }

  return <RoutineScreen routineId={activeScreen} />;
}

export default function App() {
  const activeScreen = useMomentumStore((state) => state.activeScreen);
  const error = useMomentumStore((state) => state.error);
  const initializeApp = useMomentumStore((state) => state.initializeApp);
  const isLoading = useMomentumStore((state) => state.isLoading);
  const programStartDate = useMomentumStore((state) => state.programStartDate);
  const setActiveScreen = useMomentumStore((state) => state.setActiveScreen);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.appName}>Momentum</Text>
            <Text style={styles.dateLabel}>{getLocalDateKey()}</Text>
            <Text style={styles.subtitle}>Program started {programStartDate}. Follow the routine and remove the guesswork.</Text>
          </View>

          <NavigationTabs activeScreen={activeScreen} onChange={setActiveScreen} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingLabel}>Loading your routine...</Text>
          </View>
        ) : (
          <ScreenContent />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.lg,
  },
  headerCopy: {
    gap: spacing.xs,
  },
  appName: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '900',
  },
  dateLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 16,
    lineHeight: 22,
  },
  error: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loadingLabel: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '600',
  },
});
