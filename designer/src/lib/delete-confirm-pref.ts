// Per-device preference for skipping the delete-screenshot confirm
// modal. Set when the user ticks "Don't show this again" inside the
// modal; cleared via Settings (or a manual localStorage edit) when
// they want the confirm back.

const SKIP_DELETE_CONFIRM_KEY = 'agentux:skip-delete-confirm';

export function getSkipDeleteConfirm(): boolean {
  try {
    return window.localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSkipDeleteConfirm(skip: boolean): void {
  try {
    if (skip) window.localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, '1');
    else window.localStorage.removeItem(SKIP_DELETE_CONFIRM_KEY);
  } catch {
    // localStorage may be unavailable (private mode, quota). Silent
    // failure is acceptable — user just sees the confirm again next
    // time, which matches the safer-default behaviour.
  }
}
