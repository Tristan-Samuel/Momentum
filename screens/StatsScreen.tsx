import { StyleSheet, Text, View } from 'react-native';

import { Heatmap } from '../components/Heatmap';
import { StatCard } from '../components/StatCard';
import { useStatsSummary } from '../hooks/useStatsSummary';
import { colors, spacing } from '../utils/theme';

export function StatsScreen() {
  const stats = useStatsSummary();

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        <StatCard label="Workouts completed" value={`${stats.totalWorkoutsCompleted}`} />
        <StatCard label="Pull-ups completed" value={`${stats.totalPullUpsCompleted}`} />
        <StatCard label="Current streak" value={`${stats.streaks.current}d`} />
        <StatCard label="Weekly completion" value={`${stats.weeklyCompletionPercentage}%`} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Calendar heatmap</Text>
        <Heatmap cells={stats.heatmap} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Completion graph</Text>
        <View style={styles.barList}>
          {stats.completionBars.map((bar) => (
            <View key={bar.date} style={styles.barRow}>
              <Text style={styles.barLabel}>{bar.label}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${bar.ratio * 100}%` }]} />
              </View>
              <Text style={styles.barPercent}>{Math.round(bar.ratio * 100)}%</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Streak history</Text>
        <Text style={styles.historyText}>Best streak: {stats.streaks.best} days</Text>
        <Text style={styles.historyText}>Current streak: {stats.streaks.current} days</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  barList: {
    gap: spacing.sm,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barLabel: {
    width: 46,
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  barPercent: {
    width: 42,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  historyText: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
});
