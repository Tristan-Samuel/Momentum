import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ResolvedExercise } from '../types/routine';
import { colors, spacing } from '../utils/theme';

interface ExerciseChecklistItemProps {
  exercise: ResolvedExercise;
  completed: boolean;
  onPress: () => void;
}

export function ExerciseChecklistItem({ exercise, completed, onPress }: ExerciseChecklistItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: completed }}
      onPress={onPress}
      style={[styles.container, completed && styles.completedContainer]}
    >
      <View style={styles.copy}>
        <Text style={styles.title}>{exercise.title}</Text>
        <Text style={styles.subtitle}>{exercise.targetLabel}</Text>
      </View>
      <View style={[styles.check, completed && styles.completedCheck]}>
        <Text style={[styles.checkLabel, completed && styles.completedCheckLabel]}>{completed ? 'Done' : 'Tap'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  completedContainer: {
    borderColor: colors.success,
    backgroundColor: colors.successSoft,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '600',
  },
  check: {
    minWidth: 72,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  completedCheck: {
    backgroundColor: colors.success,
  },
  checkLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  completedCheckLabel: {
    color: colors.card,
  },
});
