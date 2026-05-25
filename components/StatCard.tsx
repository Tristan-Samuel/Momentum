import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../utils/theme';

interface StatCardProps {
  label: string;
  value: string;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 140,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  value: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  label: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '600',
  },
});
