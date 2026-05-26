import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ScreenId } from '../types/routine';
import { colors, spacing } from '../utils/theme';

interface NavigationTabsProps {
  activeScreen: ScreenId;
  onChange: (screen: ScreenId) => void;
}

const TAB_ITEMS: { id: ScreenId; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'night', label: 'Night' },
  { id: 'notes', label: 'Notes' },
  { id: 'stats', label: 'Stats' },
];

export function NavigationTabs({ activeScreen, onChange }: NavigationTabsProps) {
  return (
    <View style={styles.container}>
      {TAB_ITEMS.map((tab) => {
        const isActive = tab.id === activeScreen;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(tab.id)}
            style={[styles.tab, isActive && styles.activeTab]}
          >
            <Text style={[styles.label, isActive && styles.activeLabel]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tab: {
    minWidth: 78,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activeTab: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  label: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  activeLabel: {
    color: colors.primary,
  },
});
