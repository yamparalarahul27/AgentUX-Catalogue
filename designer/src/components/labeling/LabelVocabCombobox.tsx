import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { useLabelVocabKind } from '../../hooks/use-label-vocab';
import { matchesQuery, resolveSynonym } from '../../lib/labeling/resolve-synonym';
import type { LabelVocabEntry, LabelVocabKind } from '../../lib/labeling/types';

interface BaseProps {
  kind: LabelVocabKind;
  placeholder?: string;
  ariaLabel?: string;
  onBlur?: () => void;
}

interface SinglePickProps extends BaseProps {
  value: string | null;
  onChange: (next: string | null) => void;
}

interface MultiPickProps extends BaseProps {
  values: string[];
  onChange: (next: string[]) => void;
}

function SuggestionList({
  entries,
  onPick,
}: {
  entries: LabelVocabEntry[];
  onPick: (entry: LabelVocabEntry) => void;
}) {
  if (entries.length === 0) {
    return <div className="label-combobox__empty">No matches</div>;
  }
  return (
    <ul className="label-combobox__list" role="listbox">
      {entries.map((entry) => (
        <li
          key={entry.id}
          role="option"
          aria-selected={false}
          className="label-combobox__option"
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(entry);
          }}
        >
          <span className="label-combobox__option-value">{entry.value}</span>
          {entry.synonyms.length > 0 && (
            <span className="label-combobox__option-syns">
              {entry.synonyms.join(' · ')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function LabelVocabSinglePick({
  kind,
  value,
  onChange,
  placeholder,
  ariaLabel,
  onBlur,
}: SinglePickProps) {
  const { entries, loading } = useLabelVocabKind(kind);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => entries.filter((entry) => matchesQuery(entry, query)),
    [entries, query],
  );

  function pick(entry: LabelVocabEntry) {
    onChange(entry.value);
    setQuery('');
    setOpen(false);
    onBlur?.();
  }

  function handleInputBlur() {
    // Resolve typed text on blur — accepts a synonym (e.g. "snackbar" → "Toast").
    const resolved = resolveSynonym(query, entries);
    if (resolved) {
      onChange(resolved.value);
    }
    setQuery('');
    setOpen(false);
    onBlur?.();
  }

  function clear() {
    onChange(null);
    inputRef.current?.focus();
  }

  return (
    <div className="label-combobox label-combobox--single">
      {value ? (
        <span className="label-combobox__chip">
          {value}
          <button
            type="button"
            className="label-combobox__chip-remove"
            aria-label={`Remove ${value}`}
            onClick={clear}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ) : (
        <input
          ref={inputRef}
          type="text"
          className="label-combobox__input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleInputBlur}
          placeholder={loading ? 'Loading…' : placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
        />
      )}
      {open && !value && <SuggestionList entries={matches} onPick={pick} />}
    </div>
  );
}

export function LabelVocabMultiPick({
  kind,
  values,
  onChange,
  placeholder,
  ariaLabel,
  onBlur,
}: MultiPickProps) {
  const { entries, loading } = useLabelVocabKind(kind);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const valuesSet = useMemo(() => new Set(values), [values]);
  const matches = useMemo(
    () => entries.filter((entry) => matchesQuery(entry, query) && !valuesSet.has(entry.value)),
    [entries, query, valuesSet],
  );

  function add(value: string) {
    if (valuesSet.has(value)) return;
    onChange([...values, value]);
    setQuery('');
    inputRef.current?.focus();
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  function handleInputBlur() {
    const resolved = resolveSynonym(query, entries);
    if (resolved && !valuesSet.has(resolved.value)) {
      add(resolved.value);
    } else {
      setQuery('');
    }
    setOpen(false);
    onBlur?.();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !query && values.length > 0) {
      remove(values[values.length - 1]);
    }
  }

  return (
    <div className="label-combobox label-combobox--multi">
      <div className="label-combobox__chips">
        {values.map((value) => (
          <span key={value} className="label-combobox__chip">
            {value}
            <button
              type="button"
              className="label-combobox__chip-remove"
              aria-label={`Remove ${value}`}
              onClick={() => remove(value)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="label-combobox__input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? (loading ? 'Loading…' : placeholder) : ''}
          aria-label={ariaLabel}
          autoComplete="off"
        />
      </div>
      {open && (
        <SuggestionList
          entries={matches}
          onPick={(entry) => add(entry.value)}
        />
      )}
    </div>
  );
}
