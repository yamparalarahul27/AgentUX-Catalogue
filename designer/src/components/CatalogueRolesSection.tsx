import { useCallback, useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';

import { callAdmin, type AdminAction, type RoleAdminRow } from '../lib/auth-passcode';
import { CAPABILITIES } from '../lib/role-capabilities';
import { ConfirmModal } from './ConfirmModal';

// Roles admin panel — PR A1.
//
// Mirrors CatalogueMembersSection's unlock + admin-passcode pattern.
// The legacy admins table still gates visibility client-side; the
// Edge Function re-validates the admin passcode on every action.
//
// Companion code:
//   - supabase/functions/auth-admin/index.ts  — server-side role CRUD
//   - supabase/migrations/20260515_roles_and_capabilities.sql
//   - designer/src/lib/role-capabilities.ts   — capability registry

type EditingDraft = {
  mode: 'create' | 'edit';
  id: string;
  name: string;
  description: string;
  capabilities: Set<string>;
};

interface CatalogueRolesSectionProps {
  // Admin passcode + rebound callback come from the shared
  // useAdminUnlock state in CatalogueTeamSection. The unlock screen
  // is rendered by the parent before this component mounts.
  adminPasscode: string;
  onUnauthorized: () => void;
}

export function CatalogueRolesSection({ adminPasscode, onUnauthorized }: CatalogueRolesSectionProps) {
  const [roles, setRoles] = useState<RoleAdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [draft, setDraft] = useState<EditingDraft | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<RoleAdminRow | null>(null);

  // Auto-clear toasts after 3s.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const refreshRoles = useCallback(async () => {
    setLoading(true);
    setListError(null);
    const result = await callAdmin<{ roles: RoleAdminRow[] }>(adminPasscode, 'list_roles');
    setLoading(false);
    if (!result.ok) {
      setListError(adminErrorMessage(result.code));
      // Stale or wrong passcode — bubble up so the shared unlock state
      // drops back to the unlock screen across both panels.
      if (result.code === 'unauthorized') onUnauthorized();
      return;
    }
    setRoles(result.data.roles);
  }, [adminPasscode, onUnauthorized]);

  // Mount: load the role list. Re-runs if the parent swaps the passcode.
  useEffect(() => {
    void refreshRoles();
  }, [refreshRoles]);

  async function runAction(action: AdminAction, payload: Record<string, unknown>, successMessage: string) {
    const result = await callAdmin<{ ok?: boolean }>(adminPasscode, action, payload);
    if (!result.ok) {
      setToast(adminErrorMessage(result.code, result.member_count));
      if (result.code === 'unauthorized') onUnauthorized();
      return { ok: false as const };
    }
    setToast(successMessage);
    await refreshRoles();
    return { ok: true as const };
  }

  function openCreate() {
    setDraft({
      mode: 'create',
      id: '',
      name: '',
      description: '',
      capabilities: new Set(),
    });
  }

  function openEdit(role: RoleAdminRow) {
    setDraft({
      mode: 'edit',
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      capabilities: new Set(role.capabilities),
    });
  }

  async function handleSaveDraft(updated: EditingDraft) {
    if (updated.mode === 'create') {
      const result = await runAction(
        'create_role',
        {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          capabilities: [...updated.capabilities],
        },
        `Role "${updated.name}" created`,
      );
      if (result.ok) setDraft(null);
    } else {
      const result = await runAction(
        'update_role',
        {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          capabilities: [...updated.capabilities],
        },
        `Role "${updated.name}" updated`,
      );
      if (result.ok) setDraft(null);
    }
  }

  async function handleDelete(role: RoleAdminRow) {
    setDeleteConfirm(null);
    await runAction('delete_role', { id: role.id }, `Role "${role.name}" deleted`);
  }

  return (
    <div className="catalogue-members">
      <div className="catalogue-members__toolbar">
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus size={14} aria-hidden="true" />
          New role
        </button>
        <span className="catalogue-members__count">
          {roles.length} role{roles.length === 1 ? '' : 's'}
        </span>
      </div>

      {listError && <p className="auth-error">{listError}</p>}
      {loading && <p className="catalogue-members__loading">Loading…</p>}

      <ul className="catalogue-roles__list" role="list">
        {roles.map((role) => (
          <li key={role.id} className="catalogue-roles__row">
            <div className="catalogue-roles__row-head">
              <div className="catalogue-roles__row-title">
                <span className="catalogue-roles__name">{role.name}</span>
                {role.is_system && (
                  <span className="catalogue-roles__system-tag">
                    <Lock size={11} aria-hidden="true" /> system
                  </span>
                )}
                <span className="catalogue-roles__count">
                  {role.member_count} member{role.member_count === 1 ? '' : 's'}
                </span>
              </div>
              <div className="catalogue-roles__row-actions">
                {role.is_system ? (
                  <span className="catalogue-roles__system-hint">cannot edit</span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="catalogue-members__icon-btn"
                      onClick={() => openEdit(role)}
                      title="Edit role"
                      aria-label="Edit role"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="catalogue-members__icon-btn catalogue-members__icon-btn--danger"
                      onClick={() => setDeleteConfirm(role)}
                      title="Delete role"
                      aria-label="Delete role"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {role.description && (
              <p className="catalogue-roles__description">{role.description}</p>
            )}
            <ul className="catalogue-roles__cap-list">
              {CAPABILITIES.map((cap) => (
                <li
                  key={cap.key}
                  className={`catalogue-roles__cap${role.capabilities.includes(cap.key) ? ' is-on' : ''}`}
                >
                  {cap.label}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {toast && <div className="catalogue-members__toast">{toast}</div>}

      {draft && (
        <RoleEditModal
          draft={draft}
          existingMemberCount={
            draft.mode === 'edit' ? roles.find((r) => r.id === draft.id)?.member_count ?? 0 : 0
          }
          onCancel={() => setDraft(null)}
          onSubmit={handleSaveDraft}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal
          title={`Delete role "${deleteConfirm.name}"?`}
          message={
            deleteConfirm.member_count > 0
              ? `${deleteConfirm.member_count} member${deleteConfirm.member_count === 1 ? '' : 's'} use this role. Reassign them first.`
              : 'This role has no members. Deleting it is safe.'
          }
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Edit/Create modal
// ────────────────────────────────────────────────────────────────────

interface RoleEditModalProps {
  draft: EditingDraft;
  existingMemberCount: number;
  onCancel: () => void;
  onSubmit: (next: EditingDraft) => void;
}

function RoleEditModal({ draft, existingMemberCount, onCancel, onSubmit }: RoleEditModalProps) {
  const [id, setId] = useState(draft.id);
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [capabilities, setCapabilities] = useState<Set<string>>(new Set(draft.capabilities));

  const isCreate = draft.mode === 'create';
  const canSubmit =
    name.trim().length > 0 && (!isCreate || /^[a-z_][a-z0-9_]{1,31}$/.test(id.trim().toLowerCase()));

  function toggleCapability(key: string) {
    setCapabilities((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      mode: draft.mode,
      id: isCreate ? id.trim().toLowerCase() : draft.id,
      name: name.trim(),
      description: description.trim(),
      capabilities,
    });
  }

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className="confirm-modal catalogue-members__modal catalogue-roles__modal"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="confirm-title">{isCreate ? 'New role' : `Edit role: ${draft.name}`}</h3>
        <form onSubmit={handleSubmit}>
          {isCreate && (
            <label className="catalogue-members__modal-label">
              ID
              <input
                className="auth-input"
                type="text"
                value={id}
                onChange={(event) => setId(event.target.value)}
                placeholder="designer, contractor, …"
                pattern="[a-z_][a-z0-9_]{1,31}"
                title="Lowercase letters, digits, underscores. 2–32 characters. No leading digit."
                required
                autoFocus
              />
              <span className="catalogue-roles__hint">
                Lowercase letters, digits, underscores. Cannot be changed later.
              </span>
            </label>
          )}
          <label className="catalogue-members__modal-label">
            Name
            <input
              className="auth-input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Designer"
              required
              autoFocus={!isCreate}
            />
          </label>
          <label className="catalogue-members__modal-label">
            Description
            <input
              className="auth-input"
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this role can do — shown in the role list."
            />
          </label>

          <fieldset className="catalogue-roles__fieldset">
            <legend>Capabilities</legend>
            <ul className="catalogue-roles__cap-edit" role="list">
              {CAPABILITIES.map((cap) => (
                <li key={cap.key}>
                  <label className="catalogue-roles__cap-row">
                    <input
                      type="checkbox"
                      checked={capabilities.has(cap.key)}
                      onChange={() => toggleCapability(cap.key)}
                    />
                    <span>{cap.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="confirm-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              {isCreate
                ? 'Create'
                : existingMemberCount > 0
                  ? `Save (affects ${existingMemberCount} member${existingMemberCount === 1 ? '' : 's'})`
                  : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────
function adminErrorMessage(code: string, memberCount?: number): string {
  switch (code) {
    case 'unauthorized':    return 'Wrong admin passcode.';
    case 'already_exists':  return 'A role with that ID already exists.';
    case 'not_found':       return 'That role does not exist.';
    case 'system_role':     return 'System roles cannot be modified.';
    case 'role_in_use':     return `${memberCount ?? 'Some'} member${memberCount === 1 ? '' : 's'} still on this role — reassign them first.`;
    case 'bad_role':        return 'That role ID is invalid.';
    case 'network':         return "Couldn't reach the server. Try again.";
    default:                return 'Something went wrong. Try again.';
  }
}
