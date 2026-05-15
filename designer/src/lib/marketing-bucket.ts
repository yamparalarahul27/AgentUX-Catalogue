// Marketing Bucket — group-based approach (see memory:
// project_marketing_buckets_decision.md).
//
// The Marketing role's uploads are locked to this group at the client.
// Admin promotes content out of the Marketing Bucket by editing the
// `group` field via the existing lightbox dropdown — no new actions,
// no new database tables.
//
// ⚠️  TOUCHING THIS FILE?
//
// If you're adding a new content area, a new team, multiple buckets,
// or per-bucket permissions, the simple hardcoded-group model breaks
// down. STOP and read memory:parked_full_bucket_architecture.md
// before extending this. That parked design is the right answer once
// the group approach hits its limits — don't paper over them by
// stretching the hardcoded constant.
//
// Companion code:
//   - supabase/migrations/20260515_marketing_bucket.sql (schema)
//   - designer/src/hooks/use-catalogue-upload.ts (role-aware lock)
//   - designer/src/components/CatalogueFamilyLightboxInlineEditor.tsx
//     (admin sees the suggested_group hint when reviewing)

export const MARKETING_BUCKET_GROUP = 'Marketing Bucket';

export function isMarketingBucketGroup(group: string | null | undefined): boolean {
  return group === MARKETING_BUCKET_GROUP;
}
