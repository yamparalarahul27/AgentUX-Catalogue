// Capability registry — single source of truth for what capability
// strings exist in the role system.
//
// RLS policies in supabase/migrations/20260515_*.sql reference these
// strings; the toggle UI shipping in PR A1 will render the list below.
//
// Adding a new capability:
//   1. Add it here
//   2. Seed it into `role_capabilities` for the appropriate roles via migration
//   3. Reference it in the relevant RLS policy / client gating
//
// Companion code:
//   - supabase/migrations/20260515_roles_and_capabilities.sql
//   - designer/src/hooks/use-role-capabilities.ts

export const CAPABILITIES = [
  { key: 'upload',            label: 'Upload screenshots' },
  { key: 'delete_own',        label: 'Delete own uploads' },
  { key: 'delete_any',        label: 'Delete any screenshot' },
  { key: 'edit_metadata',     label: 'Edit metadata (any)' },
  { key: 'share',             label: 'Share publicly' },
  { key: 'labeling_studio',   label: 'Labeling Studio access' },
  { key: 'manage_members',    label: 'Manage members + roles' },
  { key: 'manage_flags',      label: 'Manage feature flags' },
] as const;

export type CapabilityKey = (typeof CAPABILITIES)[number]['key'];

// Seeded roles. Matches the DB seed in 20260515_roles_and_capabilities.sql.
// PR A1 will support custom roles loaded from the DB; this static list is
// just for the typed dropdown in PR A0's Members panel.
export const KNOWN_ROLES = [
  { id: 'admin',         name: 'Admin' },
  { id: 'researcher',    name: 'Researcher' },
  { id: 'researcher_ai', name: 'ResearcherAI' },
  { id: 'marketing',     name: 'Marketing' },
  { id: 'qa',            name: 'QA' },
] as const;

export type RoleId = (typeof KNOWN_ROLES)[number]['id'];

export function roleNameFor(id: string): string {
  return KNOWN_ROLES.find((r) => r.id === id)?.name ?? id;
}
