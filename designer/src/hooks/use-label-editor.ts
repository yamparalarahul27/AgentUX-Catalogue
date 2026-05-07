import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ScreenshotNode } from '../types';
import { createDefaultLabel } from '../lib/labeling/default-label';
import { saveLabel } from '../lib/labeling/save-label';
import type { LabelStatus, ScreenshotLabel } from '../lib/labeling/types';
import { validateForVerify } from '../lib/labeling/validate-label';

const AUTOSAVE_DEBOUNCE_MS = 800;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function readStoredLabel(metadata: Record<string, unknown> | undefined): ScreenshotLabel | null {
  if (!metadata) return null;
  const candidate = (metadata as Record<string, unknown>).label;
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate as ScreenshotLabel;
}

interface Args {
  screenshot: ScreenshotNode | null;
  userEmail: string | null;
  onLabelPersisted?: (screenshotId: string, label: ScreenshotLabel) => void;
}

// Owns the editor's working draft for one screenshot. Autosaves on blur via a
// debounced flush. Verify is explicit and gated by the 10-rule validator.
export function useLabelEditor({ screenshot, userEmail, onLabelPersisted }: Args) {
  const [draft, setDraft] = useState<ScreenshotLabel | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const screenshotIdRef = useRef<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const onLabelPersistedRef = useRef(onLabelPersisted);
  onLabelPersistedRef.current = onLabelPersisted;

  // Reset draft when the screenshot changes.
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!screenshot) {
      setDraft(null);
      screenshotIdRef.current = null;
      setSaveStatus('idle');
      setSaveError(null);
      return;
    }
    screenshotIdRef.current = screenshot.id;
    const stored = readStoredLabel(screenshot.metadata);
    setDraft(stored ?? createDefaultLabel({ userEmail, screenshot }));
    setSaveStatus('idle');
    setSaveError(null);
  }, [screenshot, userEmail]);

  const flush = useCallback(
    async (target: ScreenshotLabel) => {
      const id = screenshotIdRef.current;
      if (!id) return;
      setSaveStatus('saving');
      setSaveError(null);
      const result = await saveLabel(id, target);
      if (screenshotIdRef.current !== id) return;
      if (result.ok) {
        setSaveStatus('saved');
        onLabelPersistedRef.current?.(id, target);
      } else {
        setSaveStatus('error');
        setSaveError(result.error ?? 'Save failed');
      }
    },
    [],
  );

  const scheduleSave = useCallback(
    (target: ScreenshotLabel) => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void flush(target);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const update = useCallback(
    (mutator: (current: ScreenshotLabel) => ScreenshotLabel) => {
      setDraft((current) => {
        if (!current) return current;
        const next = mutator(current);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const setStatus = useCallback(
    (status: LabelStatus) => {
      update((current) => ({
        ...current,
        review: { ...current.review, label_status: status },
      }));
    },
    [update],
  );

  const saveDraftNow = useCallback(() => {
    if (!draft) return;
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void flush(draft);
  }, [draft, flush]);

  const validation = useMemo(
    () => (draft ? validateForVerify(draft) : null),
    [draft],
  );

  const verify = useCallback(() => {
    if (!draft || !validation || !validation.ok) return false;
    const next: ScreenshotLabel = {
      ...draft,
      review: {
        ...draft.review,
        label_status: 'verified',
        missing_fields: [],
      },
    };
    setDraft(next);
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void flush(next);
    return true;
  }, [draft, flush, validation]);

  const markNeedsReview = useCallback(() => {
    setStatus('needs_review');
  }, [setStatus]);

  return {
    draft,
    update,
    saveDraftNow,
    verify,
    markNeedsReview,
    validation,
    saveStatus,
    saveError,
  };
}
