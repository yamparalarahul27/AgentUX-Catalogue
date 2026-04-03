# Catalogue Video Support - Research & Decision Notes

## Problem
We want to add video support to the Catalogue. Key concern: Supabase free tier storage is limited.

---

## Supabase Free Tier Limits (Storage)

| Limit | Value |
|-------|-------|
| Total storage | 1 GB |
| Bandwidth / month | 2 GB |
| Max file upload | 50 MB |

### Impact on video

| Content type | Typical size | How many fit in 1 GB |
|-------------|-------------|----------------------|
| Screenshot (WebP, compressed) | 50-200 KB | 5,000+ |
| 15s screen recording | 5-15 MB | 50-100 |
| 1 min clip | 20-50 MB | 20-50 |

Bandwidth: 2 GB/month = roughly 40-100 video plays. Burns fast.

**Verdict:** Supabase free tier is not viable for direct video storage at any meaningful scale.

---

## Video Storage Services Evaluated

| Service | Free Tier | How it works | Fit |
|---------|-----------|-------------|-----|
| **Cloudflare R2** | 10 GB storage, zero egress fees | S3-compatible object storage, serve directly | Best self-hosted option |
| **Cloudflare Stream** | None ($5/mo for 1000 min stored) | Upload, transcode, adaptive streaming, embed player | Best UX, but paid |
| **Bunny.net** | ~$0.01/GB storage + bandwidth | CDN + storage, very affordable | Great budget option |
| **AWS S3 + CloudFront** | 5 GB free (12 months only) | Industry standard, complex setup | Overkill for now |
| **Mux** | None | Professional video API with analytics | Paid, enterprise-grade |

### Why NOT YouTube as a backend
- Re-encodes all uploads (quality loss)
- No simple "upload from my app" API without full Google Cloud OAuth setup
- Embedding restrictions, content policy risks
- Not designed as a storage backend - it's a social platform

---

## Recommended Approach: Phased

### Phase 1 - External URL (Zero cost, ship fast)
- Add a `video_url` text field to the screenshot record
- User pastes a link (Loom, Google Drive, Dropbox, direct .mp4 URL)
- Lightbox renders with `<video>` tag or `<iframe>` for embeds
- No storage cost, no bandwidth cost, no infrastructure change
- Existing image pipeline stays completely untouched

### Phase 2 - Direct Upload (When ready to scale)
- Integrate Cloudflare R2 (10 GB free, zero egress)
- Add upload flow behind the same `video_url` field
- UI doesn't change - only the upload source does
- Optional: generate a thumbnail on upload for card preview

---

## Schema Change (Phase 1)

Add to `screenshots` table:
```sql
ALTER TABLE screenshots ADD COLUMN video_url text;
```

TypeScript type update:
```typescript
// In ScreenshotNode
video_url?: string | null;
```

No changes to variant identity. Video is a property of a variant, not a new variant axis.

---

## UI Changes (Phase 1)

| Component | Change |
|-----------|--------|
| Upload Modal | Add optional "Video URL" text input |
| Family Card | Show video badge/icon when video_url exists |
| Lightbox | Add image/video toggle when video_url exists, render `<video>` or `<iframe>` |
| Inline Editor | Add video URL field |

---

## Decision Status
- [ ] Confirm Phase 1 (external URL) approach
- [ ] Decide if video is per-variant or per-family
- [ ] Define accepted URL formats (direct mp4, Loom, YouTube, etc.)
- [ ] Start implementation
