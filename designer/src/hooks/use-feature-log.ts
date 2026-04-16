import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  FeatureLog,
  FeatureLogLinkType,
  FeatureLogStatus,
  FeatureLogSummary,
} from '../types';
import {
  FEATURE_LOG_PAGE_SIZE,
  groupFeatureLogsByStatus,
  normalizeFeatureLogStatus,
  sortFeatureLogSummaries,
  toFeatureLogSummary,
} from '../lib/feature-log';
import { supabase } from '../lib/supabase';

interface PaginationCursor {
  id: string;
  updated_at: string;
}

export interface FeatureLogQueryFilters {
  createdBy: string | null;
  search: string;
  status: FeatureLogStatus | 'all';
}

export interface FeatureLogCreateInput {
  description?: string | null;
  title: string;
  userId: string;
}

export interface FeatureLogUpdateInput {
  description?: string | null;
  status?: FeatureLogStatus;
  title?: string;
}

export const EMPTY_FEATURE_LOG_QUERY_FILTERS: FeatureLogQueryFilters = {
  createdBy: null,
  search: '',
  status: 'all',
};

interface UseFeatureLogArgs {
  autoLoad?: boolean;
  filters: FeatureLogQueryFilters;
}

function toFeatureLog(row: Record<string, unknown>): FeatureLog {
  return {
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    title: String(row.title || ''),
    description: row.description ? String(row.description) : null,
    status: normalizeFeatureLogStatus(row.status),
    created_at: String(row.created_at || new Date(0).toISOString()),
    updated_at: String(row.updated_at || new Date(0).toISOString()),
  };
}

function toSummaryFromFeature(feature: FeatureLog): FeatureLogSummary {
  return {
    ...feature,
    reference_count: 0,
    shipped_count: 0,
    total_count: 0,
  };
}

function isMissingRpcError(error: unknown): boolean {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message || '').toLowerCase()
    : '';
  return message.includes('could not find') || message.includes('function') && message.includes('not found');
}

export function useFeatureLog({ autoLoad = true, filters }: UseFeatureLogArgs) {
  const [features, setFeatures] = useState<FeatureLogSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const cursorRef = useRef<PaginationCursor | null>(null);
  const loadVersionRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(async (cursor: PaginationCursor | null): Promise<FeatureLogSummary[]> => {
    let query = supabase
      .from('feature_log_with_counts')
      .select('*');

    if (filters.createdBy) {
      query = query.eq('user_id', filters.createdBy);
    }

    if (filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const trimmedSearch = filters.search.trim();
    if (trimmedSearch) {
      const safe = trimmedSearch.replace(/[,%]/g, ' ');
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    query = query
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(FEATURE_LOG_PAGE_SIZE);

    if (cursor) {
      query = query.or(
        `updated_at.lt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.lt.${cursor.id})`,
      );
    }

    const { data, error: fetchError } = await query;
    if (fetchError) {
      throw fetchError;
    }

    return (data ?? []).map((row) => toFeatureLogSummary(row as Record<string, unknown>));
  }, [filters.createdBy, filters.search, filters.status]);

  const loadInitial = useCallback(async () => {
    const loadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = loadVersion;
    cursorRef.current = null;
    loadingMoreRef.current = false;
    setLoading(true);
    setLoadingMore(false);
    setError(null);

    try {
      const firstPage = await fetchPage(null);
      if (loadVersionRef.current !== loadVersion) return;

      setFeatures(sortFeatureLogSummaries(firstPage));
      setHasMore(firstPage.length === FEATURE_LOG_PAGE_SIZE);

      if (firstPage.length > 0) {
        const last = firstPage[firstPage.length - 1];
        cursorRef.current = {
          id: last.id,
          updated_at: last.updated_at,
        };
      }
    } catch (loadError) {
      if (loadVersionRef.current !== loadVersion) return;
      const message = loadError instanceof Error ? loadError.message : 'Unable to load feature logs.';
      setFeatures([]);
      setHasMore(false);
      setError(message);
    } finally {
      if (loadVersionRef.current === loadVersion) {
        setLoading(false);
      }
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || !cursorRef.current) return;

    const loadVersion = loadVersionRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);

    try {
      const nextPage = await fetchPage(cursorRef.current);
      if (loadVersionRef.current !== loadVersion) return;

      if (nextPage.length === 0) {
        setHasMore(false);
        return;
      }

      setFeatures((previous) => {
        const seen = new Set(previous.map((feature) => feature.id));
        const merged = [
          ...previous,
          ...nextPage.filter((feature) => !seen.has(feature.id)),
        ];
        return sortFeatureLogSummaries(merged);
      });

      setHasMore(nextPage.length === FEATURE_LOG_PAGE_SIZE);
      const last = nextPage[nextPage.length - 1];
      cursorRef.current = {
        id: last.id,
        updated_at: last.updated_at,
      };
    } catch (loadError) {
      if (loadVersionRef.current !== loadVersion) return;
      const message = loadError instanceof Error ? loadError.message : 'Unable to load more feature logs.';
      setError(message);
    } finally {
      if (loadVersionRef.current === loadVersion) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [fetchPage, hasMore]);

  const refreshFeatureById = useCallback(async (featureId: string) => {
    const { data, error: fetchError } = await supabase
      .from('feature_log_with_counts')
      .select('*')
      .eq('id', featureId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!data) {
      setFeatures((previous) => previous.filter((feature) => feature.id !== featureId));
      return;
    }

    const summary = toFeatureLogSummary(data as Record<string, unknown>);
    setFeatures((previous) => {
      const index = previous.findIndex((feature) => feature.id === featureId);
      if (index === -1) {
        return sortFeatureLogSummaries([summary, ...previous]);
      }
      const next = [...previous];
      next[index] = summary;
      return sortFeatureLogSummaries(next);
    });
  }, []);

  const syncStatusFromLinksFallback = useCallback(async (featureId: string) => {
    const { data: links, error: linksError } = await supabase
      .from('feature_log_links')
      .select('link_type')
      .eq('feature_id', featureId);

    if (linksError) throw linksError;

    const hasShipped = (links ?? []).some((row) => row.link_type === 'shipped');
    const hasReference = (links ?? []).some((row) => row.link_type === 'reference');
    const nextStatus: FeatureLogStatus = hasShipped
      ? 'shipped'
      : hasReference
        ? 'reference'
        : 'planned';

    const { error: updateError } = await supabase
      .from('feature_log')
      .update({ status: nextStatus })
      .eq('id', featureId);

    if (updateError) throw updateError;
  }, []);

  const createFeature = useCallback(async (input: FeatureLogCreateInput) => {
    const title = input.title.trim();
    if (!title) {
      throw new Error('Title is required.');
    }

    setSaving(true);
    setError(null);

    try {
      const { data, error: createError } = await supabase
        .from('feature_log')
        .insert({
          description: input.description?.trim() || null,
          title,
          user_id: input.userId,
        })
        .select('*')
        .single();

      if (createError || !data) {
        throw createError ?? new Error('Unable to create feature log item.');
      }

      const createdFeature = toSummaryFromFeature(toFeatureLog(data as Record<string, unknown>));
      setFeatures((previous) => sortFeatureLogSummaries([createdFeature, ...previous]));
      return createdFeature;
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : 'Unable to create feature log item.';
      setError(message);
      throw mutationError;
    } finally {
      setSaving(false);
    }
  }, []);

  const updateFeature = useCallback(async (featureId: string, patch: FeatureLogUpdateInput) => {
    const nextPatch: Record<string, unknown> = {};
    if (typeof patch.title === 'string') {
      const title = patch.title.trim();
      if (!title) throw new Error('Title is required.');
      nextPatch.title = title;
    }
    if (patch.description !== undefined) {
      nextPatch.description = patch.description?.trim() || null;
    }
    if (patch.status !== undefined) {
      nextPatch.status = patch.status;
    }

    if (Object.keys(nextPatch).length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('feature_log')
        .update(nextPatch)
        .eq('id', featureId);

      if (updateError) {
        throw updateError;
      }

      await refreshFeatureById(featureId);
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : 'Unable to update feature log item.';
      setError(message);
      throw mutationError;
    } finally {
      setSaving(false);
    }
  }, [refreshFeatureById]);

  const deleteFeature = useCallback(async (featureId: string) => {
    setSaving(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('feature_log')
        .delete()
        .eq('id', featureId);

      if (deleteError) {
        throw deleteError;
      }

      setFeatures((previous) => previous.filter((feature) => feature.id !== featureId));
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : 'Unable to delete feature log item.';
      setError(message);
      throw mutationError;
    } finally {
      setSaving(false);
    }
  }, []);

  const linkScreenshots = useCallback(async (
    featureId: string,
    screenshotIds: string[],
    linkType: FeatureLogLinkType,
  ) => {
    if (screenshotIds.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('feature_log_link_screenshots', {
        p_feature_id: featureId,
        p_link_type: linkType,
        p_screenshot_ids: screenshotIds,
      });

      if (rpcError) {
        if (!isMissingRpcError(rpcError)) {
          throw rpcError;
        }

        const { data: existingScreenshots, error: screenshotError } = await supabase
          .from('screenshots')
          .select('id')
          .in('id', screenshotIds);
        if (screenshotError) throw screenshotError;

        const existingIds = new Set((existingScreenshots ?? []).map((row) => row.id));
        if (existingIds.size !== new Set(screenshotIds).size) {
          throw new Error('One or more screenshots do not exist for linking.');
        }

        const payload = [...new Set(screenshotIds)].map((screenshotId) => ({
          feature_id: featureId,
          link_type: linkType,
          screenshot_id: screenshotId,
        }));

        const { error: insertError } = await supabase
          .from('feature_log_links')
          .upsert(payload, { ignoreDuplicates: true, onConflict: 'feature_id,screenshot_id' });
        if (insertError) throw insertError;

        await syncStatusFromLinksFallback(featureId);
      }

      await refreshFeatureById(featureId);
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : 'Unable to link screenshots.';
      setError(message);
      throw mutationError;
    } finally {
      setSaving(false);
    }
  }, [refreshFeatureById, syncStatusFromLinksFallback]);

  const unlinkScreenshot = useCallback(async (featureId: string, screenshotId: string) => {
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('feature_log_unlink_screenshot', {
        p_feature_id: featureId,
        p_screenshot_id: screenshotId,
      });

      if (rpcError) {
        if (!isMissingRpcError(rpcError)) {
          throw rpcError;
        }

        const { error: deleteError } = await supabase
          .from('feature_log_links')
          .delete()
          .eq('feature_id', featureId)
          .eq('screenshot_id', screenshotId);
        if (deleteError) throw deleteError;

        await syncStatusFromLinksFallback(featureId);
      }

      await refreshFeatureById(featureId);
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : 'Unable to unlink screenshot.';
      setError(message);
      throw mutationError;
    } finally {
      setSaving(false);
    }
  }, [refreshFeatureById, syncStatusFromLinksFallback]);

  const markShipped = useCallback(async (featureId: string) => {
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('feature_log_mark_shipped', {
        p_feature_id: featureId,
      });

      if (rpcError) {
        if (!isMissingRpcError(rpcError)) {
          throw rpcError;
        }

        const { count: shippedCount, error: shippedCountError } = await supabase
          .from('feature_log_links')
          .select('id', { count: 'exact', head: true })
          .eq('feature_id', featureId)
          .eq('link_type', 'shipped');

        if (shippedCountError) throw shippedCountError;
        if (!shippedCount) throw new Error('Cannot mark shipped without at least one shipped screenshot link.');

        const { error: updateError } = await supabase
          .from('feature_log')
          .update({ status: 'shipped' })
          .eq('id', featureId);
        if (updateError) throw updateError;
      }

      await refreshFeatureById(featureId);
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : 'Unable to mark feature as shipped.';
      setError(message);
      throw mutationError;
    } finally {
      setSaving(false);
    }
  }, [refreshFeatureById]);

  const reopenFeature = useCallback(async (featureId: string) => {
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('feature_log_reopen', {
        p_feature_id: featureId,
      });

      if (rpcError) {
        if (!isMissingRpcError(rpcError)) {
          throw rpcError;
        }

        const { count: referenceCount, error: referenceCountError } = await supabase
          .from('feature_log_links')
          .select('id', { count: 'exact', head: true })
          .eq('feature_id', featureId)
          .eq('link_type', 'reference');

        if (referenceCountError) throw referenceCountError;

        const nextStatus: FeatureLogStatus = referenceCount ? 'reference' : 'planned';
        const { error: updateError } = await supabase
          .from('feature_log')
          .update({ status: nextStatus })
          .eq('id', featureId);
        if (updateError) throw updateError;
      }

      await refreshFeatureById(featureId);
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : 'Unable to reopen feature.';
      setError(message);
      throw mutationError;
    } finally {
      setSaving(false);
    }
  }, [refreshFeatureById]);

  useEffect(() => {
    if (!autoLoad) return;
    void loadInitial();
  }, [autoLoad, loadInitial]);

  const groupedFeatures = useMemo(
    () => groupFeatureLogsByStatus(features),
    [features],
  );

  return {
    createFeature,
    deleteFeature,
    error,
    features,
    groupedFeatures,
    hasMore,
    linkScreenshots,
    loadInitial,
    loadMore,
    loading,
    loadingMore,
    markShipped,
    reopenFeature,
    refreshFeature: refreshFeatureById,
    saving,
    unlinkScreenshot,
    updateFeature,
  };
}
