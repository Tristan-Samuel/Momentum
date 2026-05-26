import { StyleSheet, Text, View } from 'react-native';

import { ExerciseChecklistItem } from '../components/ExerciseChecklistItem';
import { ProgressBar } from '../components/ProgressBar';
import { useRoutineScreenModel } from '../hooks/useRoutineScreenModel';
import { useMomentumStore } from '../store/useMomentumStore';
import type { RoutineId } from '../types/routine';
import { colors, spacing } from '../utils/theme';

interface RoutineScreenProps {
  routineId: RoutineId;
}

export function RoutineScreen({ routineId }: RoutineScreenProps) {
  const { completedExerciseIds, progressRatio, progressionWeek, routine } = useRoutineScreenModel(routineId);
  const toggleExercise = useMomentumStore((state) => state.toggleExercise);
  const completedSet = new Set(completedExerciseIds);

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.title}>{routine.title}</Text>
        <Text style={styles.description}>{routine.description}</Text>
        <Text style={styles.weekLabel}>Week {progressionWeek}</Text>
        <ProgressBar progress={progressRatio} />
        <Text style={styles.progressLabel}>{Math.round(progressRatio * 100)}% complete</Text>
      </View>

      {routine.sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.exerciseList}>
            {section.exercises.map((exercise) => (
              <ExerciseChecklistItem
                key={exercise.id}
                exercise={exercise}
                completed={completedSet.has(exercise.id)}
                onPress={() => {
                  void toggleExercise(routineId, exercise.id);
                }}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  description: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 21,
  },
  weekLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  progressLabel: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  exerciseList: {
    gap: spacing.sm,
  },
});
