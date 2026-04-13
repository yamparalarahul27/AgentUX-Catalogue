import type { MobileOs } from '../types';

interface RawActions {
  handleChangeFamilyGroup: (familyId: string, group: string | null) => Promise<void>;
  handleDeleteFamily: (familyId: string) => Promise<void>;
  handleRemoveReference: (screenshotId: string) => Promise<boolean>;
  handleRenameFamily: (familyId: string, name: string) => Promise<void>;
  handleReplaceImage: (screenshotId: string, file: File) => Promise<void>;
  handleSetFlowLabel: (familyId: string, flowLabel: string | null) => Promise<boolean>;
  handleSetReference: (
    screenshotId: string,
    input: { file: File | null; label: string | null },
  ) => Promise<boolean>;
  handleUpdateVariantDetails: (
    screenshotId: string,
    patch: {
      mobile_os?: MobileOs | null;
      platform?: 'mobile' | 'web' | null;
      theme?: 'light' | 'dark' | null;
      web_preset_key?: string | null;
    },
  ) => Promise<boolean>;
}

interface UseCatalogueGuestGuardsArgs extends RawActions {
  isGuest: boolean;
  onRequireAuth: () => void;
}

/**
 * Wraps the mutating catalogue actions with a guest-auth check. For guests,
 * calls `onRequireAuth()` and returns a fallback value; for signed-in users,
 * calls the raw action unchanged.
 *
 * Also exposes `guardMutation` / `guardAction` for bespoke call sites.
 */
export function useCatalogueGuestGuards({
  isGuest,
  onRequireAuth,
  handleChangeFamilyGroup,
  handleDeleteFamily,
  handleRemoveReference,
  handleRenameFamily,
  handleReplaceImage,
  handleSetFlowLabel,
  handleSetReference,
  handleUpdateVariantDetails,
}: UseCatalogueGuestGuardsArgs) {
  function requireEditAccess() {
    if (!isGuest) return true;
    onRequireAuth();
    return false;
  }

  async function guardMutation<T>(action: () => Promise<T>, fallback: T): Promise<T> {
    if (!requireEditAccess()) return fallback;
    return action();
  }

  function guardAction(action: () => void) {
    if (!requireEditAccess()) return;
    action();
  }

  return {
    guardAction,
    guardMutation,
    requireEditAccess,
    handleGuestAwareChangeFamilyGroup: (id: string, group: string | null) =>
      guardMutation(() => handleChangeFamilyGroup(id, group), undefined),
    handleGuestAwareDeleteFamily: (id: string) =>
      guardMutation(() => handleDeleteFamily(id), undefined),
    handleGuestAwareRemoveReference: (id: string) =>
      guardMutation(() => handleRemoveReference(id), false),
    handleGuestAwareRenameFamily: (id: string, name: string) =>
      guardMutation(() => handleRenameFamily(id, name), undefined),
    handleGuestAwareReplaceImage: (id: string, file: File) =>
      guardMutation(() => handleReplaceImage(id, file), undefined),
    handleGuestAwareSetFlowLabel: (id: string, label: string | null) =>
      guardMutation(() => handleSetFlowLabel(id, label), false),
    handleGuestAwareSetReference: (
      id: string,
      input: { file: File | null; label: string | null },
    ) => guardMutation(() => handleSetReference(id, input), false),
    handleGuestAwareUpdateVariantDetails: (
      id: string,
      patch: {
        mobile_os?: MobileOs | null;
        platform?: 'mobile' | 'web' | null;
        theme?: 'light' | 'dark' | null;
        web_preset_key?: string | null;
      },
    ) => guardMutation(() => handleUpdateVariantDetails(id, patch), false),
  };
}
