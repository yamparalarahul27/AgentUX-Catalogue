import type { LabelVocabEntry } from './types';

// Returns the canonical entry for an input that matches a value or any synonym
// (case-insensitive). Lets the combobox accept "snackbar" and resolve to the
// canonical "Toast" without forcing the user to know which is the canonical term.
export function resolveSynonym(input: string, entries: LabelVocabEntry[]): LabelVocabEntry | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  for (const entry of entries) {
    if (entry.value.toLowerCase() === normalized) return entry;
    for (const synonym of entry.synonyms) {
      if (synonym.toLowerCase() === normalized) return entry;
    }
  }
  return null;
}

export function matchesQuery(entry: LabelVocabEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  if (entry.value.toLowerCase().includes(normalized)) return true;
  return entry.synonyms.some((synonym) => synonym.toLowerCase().includes(normalized));
}
