# Catalogue - Linear-Style Performance Optimization Plan

**Status:** Proposed
**Scope:** `/designer/catalogue`, lightbox feedback, crop/reupload, search, initial load, bundle/assets, perceived-speed UX
**PR intent:** Documentation only. No runtime code, migrations, package changes, or UI changes in this PR.
**Reference:** [How is Linear so fast? A technical breakdown](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown)

---

## 1. Executive summary

The catalogue can be made to feel much faster without a full rewrite. The
current app already has good foundations: server-side pagination, ThumbHash
image placeholders, upload progress, keyboard navigation, and a working
lightbox/comment/annotation model. The main problem is that several expensive
operations are still tied directly to user-visible interactions.

The Linear-style lesson for this app is:

1. Render from local memory/cache first.
2. Revalidate data in the background.
3. Fetch heavy data only on user intent or browser idle time.
4. Keep mutations optimistic and reconcile after the UI has already moved.
5. Split heavy surfaces out of the first-load bundle.
6. Measure every improvement against interaction-level metrics, not only bundle
   size.

Recommended implementation sequence:

| Phase | Theme | User-visible outcome | Risk |
| --- | --- | --- | --- |
| P0 | Measure + baselines | We know current timings before changing architecture | Low |
| P1 | Lightbox feedback cache | Opening/arrowing screenshots no longer feels blocked by comments/annotations | Low/Medium |
| P2 | Crop optimistic apply | Crop confirmation closes quickly while persistence finishes in the background | Medium |
| P3 | First-load deferral + search index | Catalogue opens from first page/cache instead of doing full-catalog work immediately | Medium |
| P4 | Bundle/assets/images | Faster cold load and less bandwidth | Low/Medium |
| P5 | Backend query consolidation | Fewer Supabase round trips and better integrity for counts/crops | Medium/High |

The highest-value first PR should be P1 + the safe parts of P2, because those
address the exact flows where users currently feel delay.

---

## 2. Current architecture findings

### 2.1 Lightbox feedback is on the critical path

Current behavior:

- Full lightbox fetches comments and annotations every time it opens or switches
  screenshot.
- The effect depends on the whole `screenshot` object, so parent state updates
  can retrigger the fetch even when the screenshot ID is unchanged.
- The UI resets comment/annotation state before the network result arrives.
- Cancellation flags prevent stale state updates, but they do not abort the
  network requests.

Relevant files:

- `designer/src/components/CatalogueFamilyLightbox.tsx`
- `designer/src/hooks/use-catalogue-gallery-feedback.ts`
- `designer/src/components/CatalogueStackCard.tsx`
- `docs/catalogue-infinite-scroll-plan.md`

Observed problem:

```text
Open screenshot
  -> clear comments/annotations
  -> fetch screenshot_comments
  -> fetch screenshot_annotations
  -> render thread and pins

Arrow to next screenshot
  -> repeat the same work

Add/delete comment or annotation
  -> parent count update may replace screenshot object
  -> effect can refetch/reset again
```

The app has activity counts on screenshot rows, but the lightbox does not use
those counts to avoid unnecessary reads for the common empty state.

### 2.2 Stack view has the deferred N+1 problem

`docs/catalogue-infinite-scroll-plan.md` already identifies deferred milestone
M5: stack on-view comments with an IntersectionObserver and a map-scoped cache.
The current stack card still fetches annotations and comments when each card
mounts. In stack view, this can compete with lightbox/gallery requests and make
the whole page feel busier than necessary.

### 2.3 Crop waits for the full persistence chain

Current crop flow:

```text
User confirms crop
  -> set "cropping" state
  -> load image into canvas
  -> emit cropped PNG file
  -> generate ThumbHash
  -> upload new file to Supabase Storage
  -> update screenshots.storage_path/thumb_hash
  -> fetch annotations
  -> update/delete annotations one by one
  -> update local screenshot state
  -> close crop mode
  -> lightbox refetches annotations again
  -> delete old storage path in background
```

The slow part is not old-file deletion; that is already fire-and-forget. The
delay comes from waiting for upload, database update, annotation fetch, N
sequential annotation writes/deletes, and a duplicate annotation refetch before
the UI settles.

Additional issue:

- Normal uploads compress to WebP.
- Crop emits PNG directly.
- A cropped PNG can be larger than the original optimized image.

Relevant files:

- `designer/src/components/CatalogueFamilyLightbox.tsx`
- `designer/src/components/CatalogueLightboxCrop.tsx`
- `designer/src/hooks/use-catalogue-image-actions.ts`
- `designer/src/lib/screenshot-crop.ts`
- `designer/src/lib/catalogue-image.ts`

### 2.4 Full-catalogue hydration still happens on main mount

The catalogue is paginated, but the main catalogue still starts a full-scope
fetch for search/facets/admin/share-related data. That means first load is not
only "first page of screenshots"; it also starts work that pages through all
screenshots and may inspect comments/annotations.

Relevant files:

- `designer/src/components/Catalogue.tsx`
- `designer/src/hooks/use-catalogue-full-scope.ts`
- `designer/src/components/CatalogueSearchModal.tsx`
- `designer/src/lib/catalogue-search.ts`

Observed problem:

```text
Open catalogue
  -> fetch first paginated screenshots
  -> fetch flows/families/settings/etc.
  -> also start full-scope catalogue fetch
  -> search/facet/admin surfaces depend on that larger data set
```

This conflicts with the Linear-style approach: show the shell and first useful
page immediately, then hydrate secondary data when the user asks for it or when
the browser is idle.

### 2.5 Search recomputes too much per query

Search uses full-scope screenshots and rebuilds group/flow/screenshot matches on
each query. That is acceptable for a small dataset, but it becomes noticeable as
the catalogue grows.

Better model:

- Build a lightweight index once when the source data changes.
- Store lowercased haystacks up front.
- Query the precomputed index on each keystroke.
- Use `useDeferredValue` for UI typing smoothness.
- Open/jump directly to screenshot results when possible.

### 2.6 Bundle and asset weight are larger than necessary

The built catalogue currently has one large primary JS bundle. Known heavy
contributors:

- Welcome modal eagerly imports Tegaki, Harfbuzz, and font assets even when the
  modal returns `null`.
- Routes and modal surfaces are imported eagerly from the app root.
- The logo SVG is very large for a header/share-page brand asset.
- `ThumbHashImage` does not expose `loading`, `decoding`, or `fetchPriority`
  controls.

Relevant files:

- `designer/src/catalogue-main.tsx`
- `designer/src/CatalogueApp.tsx`
- `designer/src/components/WelcomeModal.tsx`
- `designer/src/components/CatalogueHeader.tsx`
- `designer/src/pages/SharePage.tsx`
- `designer/src/components/ThumbHashImage.tsx`

---

## 3. Performance goals and success metrics

These are proposed targets. Before implementation, capture current baselines on
the same machine/network profile.

| Metric | Current expectation | Target | How to measure |
| --- | --- | --- | --- |
| Authenticated app shell visible | May wait for auth/session and main bundle | `<500ms` cached, `<1200ms` cold | `performance.mark`, Lighthouse, browser performance profile |
| First useful catalogue page | Competes with full-scope/background queries | `<1500ms` cold, `<250ms` cached data paint | mark from app start to first cards rendered |
| Lightbox open, cached/no feedback | Fetch resets state before content settles | `<100ms` visual open, no blocking feedback query | custom mark around open click -> lightbox ready |
| Lightbox arrow next/prev | Feedback queries repeat per screenshot | `<60ms` visual switch, `>80%` adjacent feedback cache hit | marks + cache hit counter |
| Feedback panel data | Network is visible on every new screenshot | cached immediately, stale revalidate in background | cache hit/miss telemetry |
| Crop confirm visual settle | Waits for full upload + DB + annotation chain | crop mode closes in `<250ms` after local canvas work | mark apply click -> crop UI closed |
| Crop persistence | Sequential annotation writes can stretch total time | `<2s` typical background completion for normal image | mark background mutation start/end |
| Search modal open | Depends on full-scope readiness | `<100ms` modal open with local/current-page fallback | mark keydown -> modal interactive |
| Search keystroke cost | Rebuilds broad matches per query | `<16ms` per query for 2K screenshots | browser performance profile |
| Initial JS gzip | Large single bundle | `<500-700KB` initial gzip after splitting | Vite visualizer / file sizes |
| Header logo transfer | Very large SVG | `<50KB` compressed asset | build output size |
| First-load Supabase requests | Includes secondary full-scope work | first page + essential small metadata only | network panel/request counter |

Suggested performance budgets:

```text
Interaction budgets:
- UI response to direct click/keypress: <=100ms
- Animation/visual transition: <=150ms unless decorative and skippable
- Background revalidation: invisible unless it fails
- Long task budget during typing/scrolling: 0 tasks >50ms

Network budgets:
- First load should not request all screenshots.
- Lightbox should not refetch the same screenshot feedback within a short TTL.
- Stack card feedback should only load when the card is visible or opened.
- Crop should not block UI on old-file deletion or annotation persistence.
```

---

## 4. Measurement plan

### 4.1 Add interaction marks

Sample helper:

```ts
// designer/src/lib/perf-marks.ts
export function mark(name: string) {
  if (typeof performance === 'undefined') return;
  performance.mark(name);
}

export function measure(name: string, start: string, end: string) {
  if (typeof performance === 'undefined') return;
  performance.mark(end);
  performance.measure(name, start, end);
}

export function logMeasures(prefix = 'catalogue') {
  if (typeof performance === 'undefined') return;
  for (const entry of performance.getEntriesByType('measure')) {
    if (!entry.name.startsWith(prefix)) continue;
    console.info(`[perf] ${entry.name}: ${Math.round(entry.duration)}ms`);
  }
}
```

Example lightbox usage:

```ts
mark('catalogue:lightbox-open:start');
setPreviewFamilyId(family.id);

// after lightbox shell has rendered and image/metadata are usable
measure(
  'catalogue:lightbox-open',
  'catalogue:lightbox-open:start',
  'catalogue:lightbox-open:end',
);
```

Example crop usage:

```ts
mark('catalogue:crop-apply:start');

const localResult = await prepareLocalCrop(...);
closeCropMode(localResult);

measure(
  'catalogue:crop-apply-visible',
  'catalogue:crop-apply:start',
  'catalogue:crop-apply:visible-end',
);

mark('catalogue:crop-persist:start');
await persistCrop(localResult);
measure(
  'catalogue:crop-persist',
  'catalogue:crop-persist:start',
  'catalogue:crop-persist:end',
);
```

### 4.2 Wrap Supabase calls in development

Sample local-only wrapper:

```ts
export async function timeSupabase<T>(
  label: string,
  request: PromiseLike<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await request;
  } finally {
    if (import.meta.env.DEV) {
      const elapsed = Math.round(performance.now() - start);
      console.info(`[supabase] ${label}: ${elapsed}ms`);
    }
  }
}
```

Example:

```ts
const { data, error } = await timeSupabase(
  `comments:${screenshotId}`,
  supabase
    .from('screenshot_comments')
    .select('id,screenshot_id,text,user_email,created_at')
    .eq('screenshot_id', screenshotId)
    .order('created_at', { ascending: true }),
);
```

### 4.3 Capture baseline checklist

Before each implementation PR:

```text
Device/browser:
- Chrome stable, normal profile
- Disable extensions if possible
- Test with cold cache and warm cache

Scenarios:
- open /designer/catalogue signed in
- switch grid -> stack -> gallery
- open a screenshot with zero comments
- open a screenshot with comments/annotations
- arrow through 10 screenshots
- add a comment
- crop an image with 0 annotations
- crop an image with 5+ annotations
- open search and type 3 queries
- change filters

Artifacts:
- network request count
- total transferred JS/CSS/image assets
- performance measure logs
- screenshot/video if visual wait is noticeable
```

---

## 5. P1 proposal: shared feedback cache

### 5.1 Goal

Opening a screenshot should not make the user wait for comments and annotations
unless they are seeing that screenshot for the first time and the data is not
already known. Repeat opens and adjacent navigation should feel instant.

### 5.2 Proposed behavior

```text
Open lightbox
  -> render image + metadata immediately
  -> read feedback cache synchronously
  -> if cached, show comments/annotations immediately
  -> if count is known zero, show empty immediately
  -> revalidate in background when stale
  -> prefetch previous and next screenshot feedback

Switch screenshot
  -> preserve active tab
  -> show cached feedback or known empty state
  -> no state reset flicker
  -> no refetch if screenshot object changed but id did not
```

### 5.3 Cache shape

Sample code:

```ts
type FeedbackCacheStatus = 'empty' | 'loading' | 'ready' | 'error';

type ScreenshotFeedbackCacheEntry = {
  screenshotId: string;
  comments: ScreenshotComment[];
  annotations: ScreenshotAnnotation[];
  commentsFetchedAt?: number;
  annotationsFetchedAt?: number;
  commentsStatus: FeedbackCacheStatus;
  annotationsStatus: FeedbackCacheStatus;
  error?: string;
};

const FEEDBACK_TTL_MS = 60_000;

const feedbackCache = new Map<string, ScreenshotFeedbackCacheEntry>();
const feedbackInflight = new Map<string, Promise<ScreenshotFeedbackCacheEntry>>();
```

### 5.4 Read path

Sample code:

```ts
function getCachedFeedback(
  screenshot: ScreenshotNode,
): ScreenshotFeedbackCacheEntry | null {
  const cached = feedbackCache.get(screenshot.id);
  if (cached) return cached;

  // Use known count metadata to avoid an unnecessary blocking empty-state fetch.
  if ((screenshot.comment_count ?? 0) === 0 && (screenshot.annotation_count ?? 0) === 0) {
    const emptyEntry: ScreenshotFeedbackCacheEntry = {
      screenshotId: screenshot.id,
      comments: [],
      annotations: [],
      commentsStatus: 'empty',
      annotationsStatus: 'empty',
      commentsFetchedAt: Date.now(),
      annotationsFetchedAt: Date.now(),
    };
    feedbackCache.set(screenshot.id, emptyEntry);
    return emptyEntry;
  }

  return null;
}

function isStale(timestamp?: number) {
  if (!timestamp) return true;
  return Date.now() - timestamp > FEEDBACK_TTL_MS;
}
```

### 5.5 Fetch path

Sample code:

```ts
async function fetchScreenshotFeedback(
  screenshotId: string,
): Promise<ScreenshotFeedbackCacheEntry> {
  const existing = feedbackInflight.get(screenshotId);
  if (existing) return existing;

  const request = Promise.all([
    supabase
      .from('screenshot_comments')
      .select('id,screenshot_id,text,user_email,created_at')
      .eq('screenshot_id', screenshotId)
      .order('created_at', { ascending: true }),
    fetchAnnotationsForScreenshot(screenshotId),
  ]).then(([commentsResult, annotations]) => {
    if (commentsResult.error) throw commentsResult.error;

    const entry: ScreenshotFeedbackCacheEntry = {
      screenshotId,
      comments: commentsResult.data ?? [],
      annotations,
      commentsStatus: 'ready',
      annotationsStatus: 'ready',
      commentsFetchedAt: Date.now(),
      annotationsFetchedAt: Date.now(),
    };

    feedbackCache.set(screenshotId, entry);
    return entry;
  }).finally(() => {
    feedbackInflight.delete(screenshotId);
  });

  feedbackInflight.set(screenshotId, request);
  return request;
}
```

### 5.6 Hook shape

Sample code:

```ts
type UseScreenshotFeedbackOptions = {
  screenshot: ScreenshotNode | null;
  enabled: boolean;
  prefetchIds?: string[];
};

function useScreenshotFeedback({
  screenshot,
  enabled,
  prefetchIds = [],
}: UseScreenshotFeedbackOptions) {
  const [entry, setEntry] = useState<ScreenshotFeedbackCacheEntry | null>(() => {
    return screenshot ? getCachedFeedback(screenshot) : null;
  });

  useEffect(() => {
    if (!enabled || !screenshot) return;

    let cancelled = false;
    const cached = getCachedFeedback(screenshot);
    if (cached) setEntry(cached);

    const shouldFetch =
      !cached ||
      isStale(cached.commentsFetchedAt) ||
      isStale(cached.annotationsFetchedAt);

    if (!shouldFetch) return;

    fetchScreenshotFeedback(screenshot.id)
      .then((nextEntry) => {
        if (!cancelled) setEntry(nextEntry);
      })
      .catch((error) => {
        if (cancelled) return;
        setEntry((current) => ({
          screenshotId: screenshot.id,
          comments: current?.comments ?? [],
          annotations: current?.annotations ?? [],
          commentsStatus: 'error',
          annotationsStatus: 'error',
          error: error instanceof Error ? error.message : 'Failed to load feedback',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, screenshot?.id]);

  useEffect(() => {
    if (!enabled) return;
    for (const id of prefetchIds) {
      if (!feedbackCache.has(id)) {
        void fetchScreenshotFeedback(id);
      }
    }
  }, [enabled, prefetchIds.join('|')]);

  return entry;
}
```

### 5.7 Write path: optimistic comment

Sample code:

```ts
async function addCommentOptimistic({
  screenshotId,
  text,
  userEmail,
}: {
  screenshotId: string;
  text: string;
  userEmail: string;
}) {
  const optimisticId = `local-${crypto.randomUUID()}`;
  const optimisticComment: ScreenshotComment = {
    id: optimisticId,
    screenshot_id: screenshotId,
    text,
    user_email: userEmail,
    created_at: new Date().toISOString(),
  };

  const previous = feedbackCache.get(screenshotId);
  feedbackCache.set(screenshotId, {
    screenshotId,
    comments: [...(previous?.comments ?? []), optimisticComment],
    annotations: previous?.annotations ?? [],
    commentsStatus: 'ready',
    annotationsStatus: previous?.annotationsStatus ?? 'empty',
    commentsFetchedAt: Date.now(),
    annotationsFetchedAt: previous?.annotationsFetchedAt,
  });

  const { data, error } = await supabase
    .from('screenshot_comments')
    .insert({ screenshot_id: screenshotId, text, user_email: userEmail })
    .select('id,screenshot_id,text,user_email,created_at')
    .single();

  if (error) {
    if (previous) feedbackCache.set(screenshotId, previous);
    else feedbackCache.delete(screenshotId);
    throw error;
  }

  const current = feedbackCache.get(screenshotId);
  if (!current) return data;

  feedbackCache.set(screenshotId, {
    ...current,
    comments: current.comments.map((comment) =>
      comment.id === optimisticId ? data : comment,
    ),
  });

  return data;
}
```

### 5.8 Expected metrics

| Scenario | Expected improvement |
| --- | --- |
| Repeat-open same screenshot | 2 feedback queries -> 0 blocking queries |
| Arrow next/previous after prefetch | visible tab/data switch `<60ms` |
| Screenshot with zero count metadata | no blocking comment/annotation read |
| Add comment | input clears immediately; row appears optimistically |
| Parent count update | no lightbox refetch/reset if ID unchanged |
| Stack view | no N+1 storm once on-view cache is applied |

---

## 6. P2 proposal: optimistic crop apply

### 6.1 Goal

Crop confirmation should feel like a local edit. The UI should close crop mode
as soon as the browser has created the cropped image preview and projected
annotation positions. Supabase upload/database/cleanup can finish in the
background.

### 6.2 Proposed behavior

```text
User confirms crop
  -> create cropped Blob/File locally
  -> create object URL
  -> project annotation geometry locally
  -> patch screenshot image_url locally
  -> patch annotation state locally
  -> close crop mode
  -> persist upload + DB + annotation changes in background
  -> show small saving state only if needed
  -> rollback or retry on failure
```

### 6.3 Split crop into local prepare and remote persist

Sample types:

```ts
type CropPrepareResult = {
  screenshotId: string;
  file: File;
  objectUrl: string;
  nextWidth: number;
  nextHeight: number;
  thumbHash: string | null;
  projectedAnnotations: ScreenshotAnnotation[];
  deletedAnnotationIds: string[];
  updatedAnnotationIds: string[];
};

type CropPersistResult = {
  storagePath: string;
  publicUrl: string;
  thumbHash: string | null;
  annotations: ScreenshotAnnotation[];
};
```

Sample local prepare:

```ts
async function prepareCrop({
  screenshot,
  cropBox,
  currentAnnotations,
}: {
  screenshot: ScreenshotNode;
  cropBox: PixelCropBox;
  currentAnnotations: ScreenshotAnnotation[];
}): Promise<CropPrepareResult> {
  const cropped = await cropImageBox({
    imageUrl: screenshot.image_url,
    fileName: screenshot.file_name,
    box: cropBox,
    outputType: 'image/webp',
    quality: 0.9,
  });

  const thumbHash = await generateThumbHash(cropped.file).catch(() => null);
  const projection = projectAnnotationsAfterCrop({
    annotations: currentAnnotations,
    originalWidth: screenshot.width,
    originalHeight: screenshot.height,
    cropBox,
    nextWidth: cropped.width,
    nextHeight: cropped.height,
  });

  return {
    screenshotId: screenshot.id,
    file: cropped.file,
    objectUrl: URL.createObjectURL(cropped.file),
    nextWidth: cropped.width,
    nextHeight: cropped.height,
    thumbHash,
    projectedAnnotations: projection.annotations,
    deletedAnnotationIds: projection.deletedIds,
    updatedAnnotationIds: projection.updatedIds,
  };
}
```

Sample UI flow:

```ts
async function handleApplyCrop(box: PixelCropBox) {
  setCropVisibleState('preparing');

  const prepared = await prepareCrop({
    screenshot,
    cropBox: box,
    currentAnnotations: annotations,
  });

  patchScreenshotLocally(screenshot.id, {
    image_url: prepared.objectUrl,
    thumb_hash: prepared.thumbHash,
  });
  setAnnotations(prepared.projectedAnnotations);
  setCropMode(false);
  setCropVisibleState('saving');

  persistCrop(prepared)
    .then((result) => {
      patchScreenshotLocally(screenshot.id, {
        image_url: result.publicUrl,
        storage_path: result.storagePath,
        thumb_hash: result.thumbHash,
      });
      setAnnotations(result.annotations);
      setCropVisibleState('saved');
    })
    .catch((error) => {
      rollbackCrop(screenshot.id);
      setCropVisibleState('error');
      showToast('Crop could not be saved. Your original screenshot was restored.');
      reportError(error);
    })
    .finally(() => {
      URL.revokeObjectURL(prepared.objectUrl);
    });
}
```

### 6.4 Batch annotation deletes and parallelize updates

Current crop writes annotations one by one. Safer first improvement:

```ts
async function persistProjectedAnnotations({
  deletedAnnotationIds,
  projectedAnnotations,
}: {
  deletedAnnotationIds: string[];
  projectedAnnotations: ScreenshotAnnotation[];
}) {
  const deletePromise = deletedAnnotationIds.length
    ? supabase
        .from('screenshot_annotations')
        .delete()
        .in('id', deletedAnnotationIds)
    : Promise.resolve({ error: null });

  const updatePromises = projectedAnnotations.map((annotation) => {
    return supabase
      .from('screenshot_annotations')
      .update({
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
        mode: annotation.mode,
      })
      .eq('id', annotation.id);
  });

  const [deleteResult, ...updateResults] = await Promise.all([
    deletePromise,
    ...updatePromises,
  ]);

  const firstError =
    deleteResult.error ??
    updateResults.find((result) => result.error)?.error;

  if (firstError) throw firstError;
}
```

If annotation counts become large, use a small concurrency limiter:

```ts
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  const queue = [...items];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
    }
  });
  await Promise.all(workers);
}
```

### 6.5 Better crop output format

Sample update to crop helper:

```ts
type CropImageBoxOptions = {
  imageUrl: string;
  fileName: string;
  box: PixelCropBox;
  outputType?: 'image/png' | 'image/webp' | 'image/jpeg';
  quality?: number;
};

const blob = await new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(
    (nextBlob) => {
      if (!nextBlob) reject(new Error('Failed to create cropped image'));
      else resolve(nextBlob);
    },
    outputType ?? 'image/webp',
    quality ?? 0.9,
  );
});
```

Expected benefit:

- Smaller uploads.
- Faster storage write.
- Faster future image loads.
- More consistent with normal upload behavior.

### 6.6 Optional RPC for transactional crop persistence

Client-side batching improves perceived speed. A backend RPC improves integrity
and actual mutation time by reducing round trips.

Sample function sketch:

```sql
CREATE OR REPLACE FUNCTION apply_screenshot_crop(
  p_screenshot_id uuid,
  p_storage_path text,
  p_thumb_hash text,
  p_updated_annotations jsonb,
  p_deleted_annotation_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  x double precision,
  y double precision,
  width double precision,
  height double precision,
  mode text,
  text text,
  created_at timestamptz,
  user_email text
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE screenshots
  SET
    storage_path = p_storage_path,
    thumb_hash = p_thumb_hash,
    updated_at = now()
  WHERE screenshots.id = p_screenshot_id;

  DELETE FROM screenshot_annotations
  WHERE screenshot_id = p_screenshot_id
    AND id = ANY(p_deleted_annotation_ids);

  UPDATE screenshot_annotations AS target
  SET
    x = (item->>'x')::double precision,
    y = (item->>'y')::double precision,
    width = NULLIF(item->>'width', '')::double precision,
    height = NULLIF(item->>'height', '')::double precision,
    mode = item->>'mode'
  FROM jsonb_array_elements(p_updated_annotations) AS item
  WHERE target.id = (item->>'id')::uuid
    AND target.screenshot_id = p_screenshot_id;

  RETURN QUERY
  SELECT
    a.id,
    a.x,
    a.y,
    a.width,
    a.height,
    a.mode,
    a.text,
    a.created_at,
    a.user_email
  FROM screenshot_annotations a
  WHERE a.screenshot_id = p_screenshot_id
  ORDER BY a.created_at ASC;
END;
$$;
```

Note: the exact SQL must be reviewed against current table types, RLS policies,
and public-release security constraints before shipping.

### 6.7 Should crops be queued locally and sent to Supabase in batch?

Recommendation:

1. Start with optimistic UI + background persistence for one crop at a time.
2. Add batched annotation writes immediately.
3. Add a durable IndexedDB mutation queue only if users need offline crop or
   multiple rapid crops before previous saves finish.

Why not start with a full durable queue:

- It increases conflict handling complexity.
- Crops replace binary image files, so rollback/retry behavior is more complex
  than a simple comment insert.
- The UI can feel instant without durable offline queue if background
  persistence is reliable and failures are visible.

Future durable queue shape:

```ts
type PendingMutation =
  | {
      type: 'screenshot-crop';
      id: string;
      screenshotId: string;
      createdAt: string;
      localBlobKey: string;
      previousStoragePath: string;
      nextStoragePath: string;
      projectedAnnotations: ScreenshotAnnotation[];
      deletedAnnotationIds: string[];
      status: 'pending' | 'syncing' | 'failed';
      retryCount: number;
    }
  | {
      type: 'comment-create';
      id: string;
      screenshotId: string;
      text: string;
      userEmail: string;
      createdAt: string;
      status: 'pending' | 'syncing' | 'failed';
      retryCount: number;
    };
```

Expected metrics:

| Scenario | Expected improvement |
| --- | --- |
| Crop with 0 annotations | UI close after local canvas/preview, not storage/DB |
| Crop with 5 annotations | remove 5 sequential waits from visible path |
| Cropped asset upload | WebP typically smaller than PNG |
| Post-crop annotation display | no duplicate refetch needed |
| Old storage deletion | remains non-blocking |

---

## 7. P3 proposal: local-first catalogue and search

### 7.1 Goal

The main catalogue should open from the minimum useful data: shell, cached
settings, and first page of screenshots. Full-catalogue search/facets/admin data
should load only on intent or idle.

### 7.2 Split full-scope hook by purpose

Current full-scope hook tries to serve several jobs:

- search
- filters/facets
- group stats
- share/team/admin-related views
- comment/annotation activity

Proposed split:

```text
useCatalogueData
  -> paginated first-page and scroll data

useCatalogueFacets
  -> small aggregate/filter metadata
  -> can be cached locally

useCatalogueSearchIndex
  -> built only on search open or idle
  -> persisted locally

useCatalogueAdminScope
  -> full data only when admin/studio/share flows require it
```

### 7.3 IndexedDB cache shape

Use IndexedDB for larger data. LocalStorage is fine for tiny settings, but not
for thousands of screenshots/search entries.

Sample schema:

```ts
type CatalogueCacheRecord = {
  key: 'catalogue:first-page:v1';
  updatedAt: number;
  filtersHash: string;
  screenshots: ScreenshotNode[];
  families: ScreenFamily[];
};

type CatalogueSearchIndexRecord = {
  key: 'catalogue:search-index:v1';
  updatedAt: number;
  rowCount: number;
  entries: Array<{
    id: string;
    familyId: string;
    group: string;
    name: string;
    flow: string | null;
    platform: string | null;
    haystack: string;
  }>;
};
```

Sample stale-while-revalidate flow:

```ts
function useCachedFirstPage(query: CatalogueQuery) {
  const [state, setState] = useState<CatalogueState>({
    screenshots: [],
    loading: true,
    source: 'empty',
  });

  useEffect(() => {
    let cancelled = false;

    readFirstPageCache(query).then((cached) => {
      if (cancelled || !cached) return;
      setState({
        screenshots: cached.screenshots,
        loading: false,
        source: 'cache',
      });
    });

    fetchFirstPage(query).then((fresh) => {
      if (cancelled) return;
      setState({
        screenshots: fresh.screenshots,
        loading: false,
        source: 'network',
      });
      void writeFirstPageCache(query, fresh);
    });

    return () => {
      cancelled = true;
    };
  }, [query.cacheKey]);

  return state;
}
```

### 7.4 Search index sample

```ts
type SearchIndex = {
  screenshotEntries: Array<{
    id: string;
    familyId: string;
    title: string;
    group: string;
    flow: string | null;
    haystack: string;
  }>;
  groupEntries: Array<{
    group: string;
    haystack: string;
    count: number;
  }>;
  flowEntries: Array<{
    flow: string;
    haystack: string;
    count: number;
  }>;
};

function buildSearchIndex(screenshots: ScreenshotNode[]): SearchIndex {
  const screenshotEntries = screenshots.map((screenshot) => ({
    id: screenshot.id,
    familyId: screenshot.screen_family_id,
    title: screenshot.name ?? screenshot.file_name,
    group: screenshot.group ?? '',
    flow: screenshot.metadata?.catalogue_flow_label ?? null,
    haystack: [
      screenshot.name,
      screenshot.file_name,
      screenshot.group,
      screenshot.platform,
      screenshot.theme,
      screenshot.metadata?.catalogue_flow_label,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }));

  return {
    screenshotEntries,
    groupEntries: buildGroupEntries(screenshotEntries),
    flowEntries: buildFlowEntries(screenshotEntries),
  };
}

function querySearchIndex(index: SearchIndex, query: string) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  return index.screenshotEntries
    .filter((entry) => tokens.every((token) => entry.haystack.includes(token)))
    .slice(0, 30);
}
```

React usage:

```ts
const deferredQuery = useDeferredValue(searchQuery);
const results = useMemo(() => {
  if (!searchIndex) return currentPageFallbackSearch(deferredQuery);
  return querySearchIndex(searchIndex, deferredQuery);
}, [searchIndex, deferredQuery]);
```

### 7.5 Search UX improvement

Current search result selection behaves more like filtering. Better behavior:

```text
User opens command search
  -> modal opens immediately
  -> current page fallback results are available
  -> full search index hydrates in background

User selects screenshot result
  -> if screenshot is loaded, open lightbox directly
  -> if not loaded, apply filters/search and show "jumping..." state
  -> when loaded, scroll/highlight or open lightbox
```

Expected metrics:

| Scenario | Expected improvement |
| --- | --- |
| Catalogue first load | avoids full-scope blocking/competition |
| Warm revisit | first page can render from cache |
| Search open | no dependency on full-scope readiness |
| Search typing | index query `<16ms` for 2K screenshots |
| Search select | direct jump/open instead of manual filtering |

---

## 8. P4 proposal: bundle, assets, and image loading

### 8.1 Lazy-load heavy surfaces

Candidate surfaces:

- `WelcomeModal` and Tegaki assets
- `CatalogueGroupDetail`
- `SharePage`
- `CatalogueNotFound`
- lightbox
- upload modal
- share modal
- search modal
- labeling studio
- videos/links sections if not first visible

Sample route-level split:

```tsx
const Catalogue = lazy(() => import('./components/Catalogue'));
const CatalogueGroupDetail = lazy(() => import('./components/CatalogueGroupDetail'));
const SharePage = lazy(() => import('./pages/SharePage'));
const CatalogueNotFound = lazy(() => import('./components/CatalogueNotFound'));
const WelcomeModal = lazy(() => import('./components/WelcomeModal'));
```

Sample render:

```tsx
<Suspense fallback={<CatalogueShell />}>
  <Routes>
    <Route path="/designer/catalogue" element={<Catalogue />} />
    <Route path="/designer/catalogue/g/:groupKey" element={<CatalogueGroupDetail />} />
    <Route path="/designer/catalogue/share/:id" element={<SharePage />} />
  </Routes>
</Suspense>
```

Sample intent-loaded modal:

```tsx
const CatalogueSearchModal = lazy(() => import('./CatalogueSearchModal'));

{isSearchOpen ? (
  <Suspense fallback={null}>
    <CatalogueSearchModal {...props} />
  </Suspense>
) : null}
```

### 8.2 Keep an app shell in the first chunk

The first chunk should contain:

- auth gate basics
- header shell
- toolbar shell
- first-page skeleton
- route boundary
- minimal CSS needed for layout stability

It should not contain:

- Tegaki/Harfbuzz/fonts for the welcome modal
- admin/studio code
- share page code
- lightbox internals before any screenshot is opened
- upload/crop internals before those actions are requested

### 8.3 Optimize the logo

The header/share logo asset should have a strict budget.

Recommended options:

| Option | Description | Recommendation |
| --- | --- | --- |
| A | Optimize existing SVG with SVGO | First attempt |
| B | Replace with simplified SVG mark for UI chrome | Best long-term if visual difference is acceptable |
| C | Use small WebP/PNG for large decorative usage only | Only if SVG cannot be simplified |

Metric target:

```text
Header logo compressed transfer: <50KB
Current known issue: asset is far larger than expected for a header logo.
```

### 8.4 Add image loading controls

Sample component API:

```tsx
type ThumbHashImageProps = {
  src: string;
  alt: string;
  thumbHash?: string | null;
  loading?: 'eager' | 'lazy';
  decoding?: 'sync' | 'async' | 'auto';
  fetchPriority?: 'high' | 'low' | 'auto';
};

function ThumbHashImage({
  src,
  alt,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority = 'auto',
  thumbHash,
}: ThumbHashImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
    />
  );
}
```

Usage rule:

```text
Grid first row: eager + high/auto fetch priority
Grid below fold: lazy + async
Stack cards: lazy until visible
Gallery main image: eager
Gallery strip thumbnails: lazy/windowed
Share page hero/current image: eager
Share page list images: lazy
```

### 8.5 Static asset caching

The app already has fingerprinted build assets. Vercel should cache those
aggressively.

Sample `vercel.json` header sketch:

```json
{
  "headers": [
    {
      "source": "/designer/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

Service worker recommendation:

- Do not start with a service worker unless offline/revisit speed is a product
  goal for this app.
- If added, keep it conservative: app shell and static assets only.
- Avoid caching Supabase mutation responses.
- Include a kill switch/version bump plan.

Expected metrics:

| Scenario | Expected improvement |
| --- | --- |
| Cold load | lower JS/image/font transfer |
| Warm revisit | assets served from browser cache |
| Welcome modal hidden | Tegaki/Harfbuzz not in initial path |
| Scrolling grid | fewer eager image decodes |
| Mobile load | lower bandwidth and fewer main-thread parse tasks |

---

## 9. P5 proposal: backend query consolidation

### 9.1 Page activity summary

Current page hydration fetches screenshots, then separate versions/comments/
annotation activity. A backend view/RPC can return the page with counts and
latest activity timestamps in one call.

Sample view shape:

```sql
CREATE OR REPLACE VIEW catalogue_screenshot_activity AS
SELECT
  s.id,
  s.screen_family_id,
  s.name,
  s.file_name,
  s.storage_path,
  s.thumb_hash,
  s.created_at,
  s.updated_at,
  s.platform,
  s.theme,
  s.metadata,
  COALESCE(c.comment_count, 0) AS comment_count,
  c.last_comment_at,
  COALESCE(a.annotation_count, 0) AS annotation_count,
  a.last_annotation_at,
  COALESCE(v.version_count, 0) AS version_count
FROM screenshots s
LEFT JOIN (
  SELECT
    screenshot_id,
    count(*) AS comment_count,
    max(created_at) AS last_comment_at
  FROM screenshot_comments
  GROUP BY screenshot_id
) c ON c.screenshot_id = s.id
LEFT JOIN (
  SELECT
    screenshot_id,
    count(*) AS annotation_count,
    max(created_at) AS last_annotation_at
  FROM screenshot_annotations
  GROUP BY screenshot_id
) a ON a.screenshot_id = s.id
LEFT JOIN (
  SELECT
    screenshot_id,
    count(*) AS version_count
  FROM screenshot_versions
  GROUP BY screenshot_id
) v ON v.screenshot_id = s.id
WHERE s.deleted_at IS NULL;
```

For larger datasets, a trigger-maintained summary table may outperform a view:

```sql
CREATE TABLE screenshot_activity_summary (
  screenshot_id uuid PRIMARY KEY REFERENCES screenshots(id) ON DELETE CASCADE,
  comment_count integer NOT NULL DEFAULT 0,
  annotation_count integer NOT NULL DEFAULT 0,
  version_count integer NOT NULL DEFAULT 0,
  last_comment_at timestamptz,
  last_annotation_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Tradeoff:

| Approach | Pros | Cons |
| --- | --- | --- |
| View | No duplicated state, simpler migration | Can still do aggregate work per query |
| RPC | One API surface, easier pagination/filter control | More SQL to maintain |
| Summary table | Fastest reads | Triggers and backfill required |

Recommendation: start with RPC/view if counts are not huge; move to summary
table only if measured query time requires it.

### 9.2 Projectless indexes

Older index notes may assume `project_id`. Current schema needs projectless
indexes after project scoping was removed.

Sample index candidates:

```sql
CREATE INDEX IF NOT EXISTS idx_screenshots_live_created
  ON screenshots (created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_screenshots_live_family
  ON screenshots (screen_family_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_screenshots_live_platform_theme
  ON screenshots (platform, theme, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_screenshots_live_metadata_gin
  ON screenshots USING GIN (metadata)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_screenshot_comments_screenshot_created
  ON screenshot_comments (screenshot_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_screenshot_annotations_screenshot_created
  ON screenshot_annotations (screenshot_id, created_at ASC);
```

Exact index set should be confirmed with `EXPLAIN ANALYZE` on real Supabase data.

---

## 10. Perceived-speed UX improvements

### 10.1 Preserve previous results during filter refresh

Current behavior can replace the catalogue area with skeletons during query
changes. Skeletons are useful for first load, but repeated full-area skeletons
make the app feel slower.

Proposed behavior:

```text
First load:
  show skeletons

Filter/sort/search refresh:
  keep previous results visible
  dim toolbar/progress subtly
  show small "Updating..." indicator
  replace results when fresh data arrives
```

Sample state distinction:

```ts
type CatalogueLoadingState =
  | 'initial'
  | 'refreshing'
  | 'loading-more'
  | 'idle'
  | 'error';
```

### 10.2 Preserve feedback tab across screenshot navigation

If a reviewer is on annotations and arrows to the next screenshot, keep them on
annotations. Resetting to comments interrupts the review flow.

Rule:

```text
Active tab persists across screenshot changes.
Exception: if user enters a mode-specific flow such as crop or labeling, that
mode can own the panel while active.
```

### 10.3 Make command search feel like command search

Search result selection should jump or open, not only filter.

```text
Screenshot result loaded:
  select -> open lightbox

Screenshot result not loaded:
  select -> apply query/filter -> load page -> open or highlight once present

Group result:
  select -> filter group

Flow result:
  select -> filter flow
```

### 10.4 Add saving states where writes are currently silent

Candidates:

- lightbox comment submit
- bulk group update
- bulk flow update
- crop background persistence
- reupload

Sample optimistic/saving UI states:

```ts
type MutationStatus = 'idle' | 'saving' | 'saved' | 'failed';
```

### 10.5 Reduced motion and animation budget

Animation rule:

```text
Interaction feedback: <=150ms
Panel/modal entrance: <=180ms
Decorative loops: respect prefers-reduced-motion
No layout-heavy animation on scroll/typing paths
Prefer opacity and transform
```

CSS sample:

```scss
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

## 11. Suggested PR breakdown

### PR 1: Measurement docs + dev-only marks

Scope:

- Add performance marks for app load, lightbox open, lightbox arrow, crop apply,
  search open, and filter refresh.
- Add no product behavior changes.

Success:

- Baseline numbers captured in PR description.
- No runtime UX changes.

### PR 2: Lightbox feedback cache

Scope:

- Shared feedback cache/hook.
- Dependency by `screenshot.id`.
- Cached empty states from known counts.
- Adjacent screenshot prefetch.
- Preserve active feedback tab.
- Optional optimistic comment insert.

Success:

- Repeat open same screenshot has no blocking feedback query.
- Arrow next/prev uses prefetched data where available.
- Add comment does not refetch the whole thread unless revalidation is needed.

### PR 3: Crop optimistic apply

Scope:

- Split local crop prepare from remote persistence.
- Close crop UI after local preview/projection.
- Batch annotation deletes and parallelize/concurrency-limit updates.
- Remove duplicate annotation refetch.
- Crop output WebP by default.

Success:

- Crop visual settle measured separately from background persistence.
- Cropped assets are not unexpectedly larger due to PNG output.
- Failure path restores previous image and annotations.

### PR 4: Search/local-first split

Scope:

- Build precomputed search index.
- Hydrate search index on intent/idle.
- Use current-page fallback before full index is ready.
- Make screenshot results open/jump directly.

Success:

- Search modal opens immediately.
- Typing stays under one frame for 2K screenshots.
- First catalogue load no longer depends on full search data.

### PR 5: Initial-load and bundle split

Scope:

- Lazy-load heavy routes/modals.
- Lazy-load WelcomeModal/Tegaki.
- Optimize logo.
- Add image loading controls.
- Defer labeling totals/secondary queries until intent/idle.

Success:

- Initial JS gzip drops materially.
- Welcome/Tegaki assets are not requested unless needed.
- Logo transfer is below budget.

### PR 6: Backend query consolidation

Scope:

- RPC/view for page rows with activity counts.
- Projectless indexes.
- Optional crop RPC after client behavior is proven.

Success:

- First page uses fewer Supabase requests.
- Count hydration no longer pulls raw rows for every page.
- Crop annotation mutation can become one transaction.

---

## 12. Risk register

| Risk | Where | Mitigation |
| --- | --- | --- |
| Cache shows stale comments | Feedback cache | Short TTL, background revalidation, update cache on local writes |
| Optimistic crop fails after UI closes | Crop | Rollback previous image/annotations, toast failure, keep original storage until success |
| Object URLs leak | Crop preview | Revoke object URLs after success/failure/unmount |
| Conflicting rapid crops | Crop | Disable second crop while one is persisting, or queue explicitly |
| IndexedDB schema drift | Local cache | Version cache keys and clear old versions |
| Service worker caches stale app | PWA | Avoid at first, or ship kill switch/versioned cache |
| RPC bypasses RLS accidentally | Backend | Use `SECURITY INVOKER` where possible and review policies before deploy |
| Bundle splitting worsens UX with blank fallbacks | Lazy loading | Keep shell in first chunk and prefetch on hover/intent |
| Search index memory grows | Search | Store compact fields, cap result size, fall back to server search if needed |

---

## 13. Implementation decision points

These require explicit approval before coding:

1. **Feedback cache scope**
   - Option A: in-memory only.
   - Option B: in-memory + IndexedDB.
   - Recommendation: start with A, then persist later if measured value is high.

2. **Crop persistence model**
   - Option A: optimistic UI + background single mutation chain.
   - Option B: durable IndexedDB queue.
   - Option C: Edge Function/server job.
   - Recommendation: start with A; add B only if offline/rapid-crop support is
     a real workflow.

3. **Backend consolidation**
   - Option A: view/RPC for read counts.
   - Option B: trigger-maintained summary table.
   - Recommendation: start with A and use `EXPLAIN ANALYZE`; move to B only if
     aggregates are measured as slow.

4. **Bundle splitting**
   - Option A: route/modals only.
   - Option B: route/modals + CSS split.
   - Recommendation: start with route/modals; CSS split only if CSS becomes a
     measured blocker.

5. **Service worker**
   - Option A: no service worker, cache headers only.
   - Option B: conservative app-shell service worker.
   - Recommendation: start with A; service worker later because stale-cache
     failure modes are easy to underestimate.

---

## 14. Definition of done for the performance program

The program should be considered successful when:

```text
- First useful catalogue paint is measured and improved.
- Opening a repeated screenshot does not block on comments/annotations.
- Arrowing through screenshots feels immediate and has adjacent prefetch hits.
- Crop confirmation visually settles before Supabase persistence finishes.
- Search opens immediately and typing does not create long tasks.
- First load no longer starts full-catalogue hydration unless needed.
- Heavy welcome/admin/share/lightbox assets are split out of the initial chunk.
- Header logo asset is below the agreed size budget.
- All changes have before/after numbers in their PR descriptions.
```

The key product test is simple: the user should feel that the app responds to
their action first, then quietly syncs. That is the practical version of the
Linear-style speed model for this catalogue.
