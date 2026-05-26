import { StyleSheet, View } from 'react-native';

import type { HeatmapCell as HeatmapCellType } from '../types/stats';
import { colors, spacing } from '../utils/theme';

interface HeatmapProps {
  cells: HeatmapCellType[];
}

function getHeatmapColor(ratio: number) {
  if (ratio >= 1) {
    return colors.heatmapHigh;
  }

  if (ratio >= 0.5) {
    return colors.heatmapMedium;
  }

  return colors.heatmapLow;
}

export function Heatmap({ cells }: HeatmapProps) {
  return (
    <View style={styles.grid}>
      {cells.map((cell) => (
        <View key={cell.date} style={[styles.cell, { backgroundColor: getHeatmapColor(cell.ratio) }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  cell: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
});
