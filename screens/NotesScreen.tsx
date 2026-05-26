import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { NOTE_TAGS } from '../data/routines';
import { useMomentumStore } from '../store/useMomentumStore';
import type { NoteTag } from '../types/routine';
import { getLocalDateKey } from '../utils/date';
import { colors, spacing } from '../utils/theme';

export function NotesScreen() {
  const today = getLocalDateKey();
  const entry = useMomentumStore((state) => state.entries[today]);
  const saveNote = useMomentumStore((state) => state.saveNote);
  const [text, setText] = useState(entry?.note.text ?? '');
  const [selectedTags, setSelectedTags] = useState<NoteTag[]>(entry?.note.tags ?? []);

  useEffect(() => {
    setText(entry?.note.text ?? '');
    setSelectedTags(entry?.note.tags ?? []);
  }, [entry?.note.tags, entry?.note.text]);

  const helperCopy = useMemo(
    () => (selectedTags.length ? `Today feels: ${selectedTags.join(', ')}` : 'Pick quick notes or add detail below.'),
    [selectedTags]
  );

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Notes</Text>
        <Text style={styles.description}>{helperCopy}</Text>

        <View style={styles.tagRow}>
          {NOTE_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => {
                  setSelectedTags((current) =>
                    current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
                  );
                }}
                style={[styles.tag, active && styles.activeTag]}
              >
                <Text style={[styles.tagLabel, active && styles.activeTagLabel]}>{tag}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          multiline
          placeholder="Anything to remember about today?"
          placeholderTextColor={colors.mutedText}
          style={styles.input}
          value={text}
          onChangeText={setText}
        />

        <Pressable
          onPress={() => {
            void saveNote({ tags: selectedTags, text });
          }}
          style={styles.saveButton}
        >
          <Text style={styles.saveLabel}>Save note</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  card: {
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
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
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activeTag: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  tagLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  activeTagLabel: {
    color: colors.warning,
  },
  input: {
    minHeight: 140,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  saveButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  saveLabel: {
    color: colors.card,
    fontSize: 15,
    fontWeight: '700',
  },
});
