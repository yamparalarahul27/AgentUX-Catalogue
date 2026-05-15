import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Lock, MoreHorizontal, Power, RotateCw, Trash2 } from 'lucide-react';

import { callAdmin, type AdminAction, type MemberRow } from '../lib/auth-passcode';
import { KNOWN_ROLES, roleNameFor, type RoleId } from '../lib/role-capabilities';
import { ConfirmModal } from './ConfirmModal';

// Members admin panel.
//
// All writes go through the auth-admin Edge Function, which validates
// the admin passcode server-side (constant-time compare against
// INVITE_ADMIN_PASSCODE). The client never trusts itself — the panel
// only renders for users in the `admins` table (see useIsAdmin in
// lib/auth-passcode.ts), but the server is what actually authorises.
//
// Companion code:
//   - supabase/functions/auth-admin/index.ts  — server side
//   - lib/auth-passcode.ts                    — callAdmin + types
//   - docs/security-auth-passcode-and-members.md  (§9)

interface CatalogueMembersSectionProps {
  currentUserEmail: string;
}

interface RevealedPasscode {
  email: string;
  passcode: string;
  reason: 'mint' | 'rotate';
}

export function CatalogueMembersSection({ currentUserEmail }: CatalogueMembersSectionProps) {
  // Admin passcode held in React state only — never localStorage. Refresh
  // = re-enter. The Edge Function re-validates on every action so this
  // is purely a UX cache, not a security boundary.
  const [adminPasscode, setAdminPasscode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [revealed, setRevealed] = useState<RevealedPasscode | null>(null);
  const [rotateConfirm, setRotateConfirm] = useState<MemberRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MemberRow | null>(null);
  const [openKebab, setOpenKebab] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Close kebab on outside click.
  const kebabRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openKebab) return;
    function onPointer(event: MouseEvent) {
      if (kebabRef.current && !kebabRef.current.contains(event.target as Node)) {
        setOpenKebab(null);
      }
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [openKebab]);

  // Auto-clear toast.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function refreshList(passcode: string) {
    setLoadingList(true);
    setListError(null);
    const result = await callAdmin<{ members: MemberRow[] }>(passcode, 'list');
    setLoadingList(false);
    if (!result.ok) {
      setListError(adminErrorMessage(result.code));
      if (result.code === 'unauthorized') {
        // Bad passcode — drop back to unlock.
        setUnlocked(false);
        setUnlockError('Wrong admin passcode.');
      }
      return;
    }
    setMembers(result.data.members);
  }

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault();
    if (!adminPasscode.trim()) return;
    setUnlocking(true);
    setUnlockError(null);
    const result = await callAdmin<{ members: MemberRow[] }>(adminPasscode, 'list');
    setUnlocking(false);
    if (!result.ok) {
      setUnlockError(adminErrorMessage(result.code));
      return;
    }
    setUnlocked(true);
    setMembers(result.data.members);
  }

  async function runAction(
    action: AdminAction,
    payload: Record<string, unknown>,
    successMessage: string,
  ): Promise<{ ok: true; passcode?: string } | { ok: false }> {
    const result = await callAdmin<{ passcode?: string }>(adminPasscode, action, payload);
    if (!result.ok) {
      setToast(adminErrorMessage(result.code));
      return { ok: false };
    }
    setToast(successMessage);
    await refreshList(adminPasscode);
    return { ok: true, passcode: result.data?.passcode };
  }

  async function handleAdd(email: string, role: RoleId) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    const result = await runAction(
      'mint',
      { email: trimmed, role },
      `Passcode created for ${trimmed}`,
    );
    setShowAdd(false);
    if (result.ok && result.passcode) {
      setRevealed({ email: trimmed, passcode: result.passcode, reason: 'mint' });
    }
  }

  async function handleRotate(member: MemberRow) {
    setRotateConfirm(null);
    const result = await runAction(
      'rotate',
      { email: member.email },
      `Passcode rotated for ${member.email}`,
    );
    if (result.ok && result.passcode) {
      setRevealed({ email: member.email, passcode: result.passcode, reason: 'rotate' });
    }
  }

  async function handleToggle(member: MemberRow) {
    await runAction(
      'toggle',
      { email: member.email, enabled: !member.enabled },
      member.enabled ? `${member.email} disabled` : `${member.email} enabled`,
    );
  }

  async function handleDelete(member: MemberRow) {
    setDeleteConfirm(null);
    await runAction('delete', { email: member.email }, `${member.email} removed`);
  }

  async function handleForceLogout(member: MemberRow) {
    setOpenKebab(null);
    await runAction('force_logout', { email: member.email }, `${member.email} signed out everywhere`);
  }

  async function handleResetLockout(member: MemberRow) {
    setOpenKebab(null);
    await runAction('reset_lockout', { email: member.email }, `Lockout cleared for ${member.email}`);
  }

  async function handleSetRole(member: MemberRow, role: RoleId) {
    if (member.role === role) return;
    await runAction(
      'set_member_role',
      { email: member.email, role },
      `${member.email} → ${roleNameFor(role)}`,
    );
  }

  // ──────────────────────────────────────────────────────────
  // Unlock state
  // ──────────────────────────────────────────────────────────

  if (!unlocked) {
    return (
      <div className="catalogue-members">
        <div className="catalogue-members__unlock">
          <h3>Members</h3>
          <p>Enter the admin passcode to manage members.</p>
          <form onSubmit={handleUnlock} className="catalogue-members__unlock-form">
            <input
              className="auth-input"
              type="password"
              placeholder="Admin passcode"
              value={adminPasscode}
              onChange={(event) => setAdminPasscode(event.target.value)}
              autoFocus
              disabled={unlocking}
            />
            {unlockError && <p className="auth-error">{unlockError}</p>}
            <button className="auth-btn auth-btn-primary" type="submit" disabled={unlocking}>
              {unlocking ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // Unlocked — table
  // ──────────────────────────────────────────────────────────

  return (
    <div className="catalogue-members">
      <div className="catalogue-members__toolbar">
        <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add member
        </button>
        <span className="catalogue-members__count">
          {members.length} member{members.length === 1 ? '' : 's'}
        </span>
      </div>

      {listError && <p className="auth-error">{listError}</p>}
      {loadingList && <p className="catalogue-members__loading">Loading…</p>}

      <div className="catalogue-members__table-wrap">
        <table className="catalogue-members__table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last seen</th>
              <th className="catalogue-members__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isSelf = member.email === currentUserEmail.toLowerCase();
              return (
                <tr key={member.email}>
                  <td>
                    <span className="catalogue-members__email">{member.email}</span>
                  </td>
                  <td>
                    <RoleDropdown member={member} onChange={(role) => handleSetRole(member, role)} />
                  </td>
                  <td>
                    <StatusPill member={member} />
                  </td>
                  <td className="catalogue-members__last-seen">
                    {formatLastSeen(member.last_login_at)}
                  </td>
                  <td className="catalogue-members__actions">
                    <button
                      type="button"
                      className="catalogue-members__icon-btn"
                      onClick={() => setRotateConfirm(member)}
                      title="Rotate passcode"
                      aria-label="Rotate passcode"
                    >
                      <RotateCw size={16} aria-hidden="true" />
                    </button>
                    {!isSelf && (
                      <button
                        type="button"
                        className={`catalogue-members__icon-btn ${member.enabled ? '' : 'is-off'}`}
                        onClick={() => handleToggle(member)}
                        title={member.enabled ? 'Disable' : 'Enable'}
                        aria-label={member.enabled ? 'Disable' : 'Enable'}
                      >
                        <Power size={16} aria-hidden="true" />
                      </button>
                    )}
                    {!isSelf && (
                      <button
                        type="button"
                        className="catalogue-members__icon-btn catalogue-members__icon-btn--danger"
                        onClick={() => setDeleteConfirm(member)}
                        title="Remove member"
                        aria-label="Remove member"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                    <div className="catalogue-members__kebab" ref={openKebab === member.email ? kebabRef : null}>
                      <button
                        type="button"
                        className="catalogue-members__icon-btn"
                        onClick={() => setOpenKebab((current) => current === member.email ? null : member.email)}
                        title="More actions"
                        aria-label="More actions"
                        aria-haspopup="menu"
                        aria-expanded={openKebab === member.email}
                      >
                        <MoreHorizontal size={16} aria-hidden="true" />
                      </button>
                      {openKebab === member.email && (
                        <div className="catalogue-members__kebab-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => handleForceLogout(member)}>
                            Force log out everywhere
                          </button>
                          <button type="button" role="menuitem" onClick={() => handleResetLockout(member)}>
                            Reset lockout counter
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <ul className="catalogue-members__cards" role="list">
        {members.map((member) => {
          const isSelf = member.email === currentUserEmail.toLowerCase();
          return (
            <li key={member.email} className="catalogue-members__card">
              <div className="catalogue-members__card-head">
                <span className="catalogue-members__email">{member.email}</span>
              </div>
              <div className="catalogue-members__card-meta">
                <RoleDropdown member={member} onChange={(role) => handleSetRole(member, role)} />
                <span className="catalogue-members__card-dot">·</span>
                <StatusPill member={member} />
                <span className="catalogue-members__card-dot">·</span>
                <span>Last seen {formatLastSeen(member.last_login_at)}</span>
              </div>
              <div className="catalogue-members__card-actions">
                <button type="button" className="catalogue-members__card-btn" onClick={() => setRotateConfirm(member)}>
                  <RotateCw size={14} aria-hidden="true" /> Rotate
                </button>
                {!isSelf && (
                  <button type="button" className="catalogue-members__card-btn" onClick={() => handleToggle(member)}>
                    <Power size={14} aria-hidden="true" /> {member.enabled ? 'Disable' : 'Enable'}
                  </button>
                )}
                {!isSelf && (
                  <button
                    type="button"
                    className="catalogue-members__card-btn catalogue-members__card-btn--danger"
                    onClick={() => setDeleteConfirm(member)}
                  >
                    <Trash2 size={14} aria-hidden="true" /> Remove
                  </button>
                )}
                <button type="button" className="catalogue-members__card-btn" onClick={() => handleForceLogout(member)}>
                  Force log out
                </button>
                <button type="button" className="catalogue-members__card-btn" onClick={() => handleResetLockout(member)}>
                  Reset lockout
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {toast && <div className="catalogue-members__toast">{toast}</div>}

      {showAdd && <AddMemberModal onCancel={() => setShowAdd(false)} onSubmit={handleAdd} />}
      {revealed && <RevealPasscodeModal data={revealed} onClose={() => setRevealed(null)} />}

      {rotateConfirm && (
        <ConfirmModal
          title={`Rotate ${rotateConfirm.email}?`}
          message="Existing passcode will stop working immediately. A new one will be generated."
          confirmLabel="Rotate"
          danger={false}
          onConfirm={() => handleRotate(rotateConfirm)}
          onCancel={() => setRotateConfirm(null)}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal
          title={`Remove ${deleteConfirm.email}?`}
          message="Their passcode will be deleted and all active sessions will be invalidated."
          confirmLabel="Remove"
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function StatusPill({ member }: { member: MemberRow }) {
  if (member.locked_until && new Date(member.locked_until) > new Date()) {
    return (
      <span className="catalogue-members__pill catalogue-members__pill--locked">
        <Lock size={11} aria-hidden="true" /> Locked
      </span>
    );
  }
  if (!member.enabled) {
    return <span className="catalogue-members__pill catalogue-members__pill--disabled">Disabled</span>;
  }
  return <span className="catalogue-members__pill catalogue-members__pill--active">Active</span>;
}

interface AddMemberModalProps {
  onCancel: () => void;
  onSubmit: (email: string, role: RoleId) => void;
}

function AddMemberModal({ onCancel, onSubmit }: AddMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleId>('researcher');
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal catalogue-members__modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="confirm-title">Add a member</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(email, role);
          }}
        >
          <label className="catalogue-members__modal-label">
            Email
            <input
              className="auth-input"
              type="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@team.com"
              required
            />
          </label>
          <label className="catalogue-members__modal-label">
            Role
            <select
              className="auth-input"
              value={role}
              onChange={(event) => setRole(event.target.value as RoleId)}
            >
              {KNOWN_ROLES.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          <div className="confirm-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary">Generate</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RevealPasscodeModalProps {
  data: RevealedPasscode;
  onClose: () => void;
}

function RevealPasscodeModal({ data, onClose }: RevealPasscodeModalProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(data.passcode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers / locked clipboard — silently ignore; user can
      // select+copy manually from the displayed value.
    }
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-modal catalogue-members__modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="confirm-title">Passcode {data.reason === 'mint' ? 'created' : 'rotated'}</h3>
        <p className="confirm-message">{data.email}</p>
        <div className="catalogue-members__reveal-row">
          <code className="catalogue-members__reveal-code">{data.passcode}</code>
          <button type="button" className="catalogue-members__copy-btn" onClick={handleCopy} aria-label="Copy passcode">
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="catalogue-members__reveal-warning">
          This is the only time you'll see this code. Share it via a secure channel.
        </p>
        <div className="confirm-actions">
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────

function RoleDropdown({
  member,
  onChange,
}: {
  member: MemberRow;
  onChange: (role: RoleId) => void;
}) {
  return (
    <select
      className="catalogue-members__role-select"
      value={member.role}
      onChange={(event) => onChange(event.target.value as RoleId)}
      aria-label={`Role for ${member.email}`}
    >
      {KNOWN_ROLES.map((option) => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  );
}

function adminErrorMessage(code: string): string {
  switch (code) {
    case 'unauthorized':    return 'Wrong admin passcode.';
    case 'already_exists':  return 'A member with that email already exists.';
    case 'bad_role':        return 'That role does not exist.';
    case 'not_found':       return 'That member does not exist.';
    case 'last_admin':      return 'Cannot demote the last admin — promote another member to admin first.';
    case 'network':         return "Couldn't reach the server. Try again.";
    default:                return 'Something went wrong. Try again.';
  }
}

function formatLastSeen(lastLoginAt: string | null): string {
  if (!lastLoginAt) return '—';
  const diffMs = Date.now() - new Date(lastLoginAt).getTime();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(lastLoginAt).toLocaleDateString();
}
