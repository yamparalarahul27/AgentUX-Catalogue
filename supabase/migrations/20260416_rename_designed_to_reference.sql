-- Rename 'designed' status to 'reference' and 'design' link type to 'reference'
-- Must drop constraints before updating data, then re-add with new allowed values.

-- 1. Drop old check constraints
ALTER TABLE feature_log_links
  DROP CONSTRAINT feature_log_links_type_check;

ALTER TABLE feature_log
  DROP CONSTRAINT IF EXISTS feature_log_status_check;

-- 2. Update existing rows
UPDATE feature_log_links
SET link_type = 'reference'
WHERE link_type = 'design';

UPDATE feature_log
SET status = 'reference'
WHERE status = 'designed';

-- 3. Add new check constraints
ALTER TABLE feature_log_links
  ADD CONSTRAINT feature_log_links_type_check
  CHECK (link_type IN ('reference', 'shipped'));

ALTER TABLE feature_log
  ADD CONSTRAINT feature_log_status_check
  CHECK (status IN ('planned', 'reference', 'shipped'));

-- 4. Recreate the feature_log_with_counts view
DROP VIEW IF EXISTS feature_log_with_counts;

CREATE VIEW feature_log_with_counts AS
SELECT
  fl.*,
  COALESCE(counts.reference_count, 0) AS reference_count,
  COALESCE(counts.shipped_count, 0)   AS shipped_count,
  COALESCE(counts.total_count, 0)     AS total_count
FROM feature_log fl
LEFT JOIN (
  SELECT
    feature_id,
    COUNT(*) FILTER (WHERE link_type = 'reference') AS reference_count,
    COUNT(*) FILTER (WHERE link_type = 'shipped')   AS shipped_count,
    COUNT(*)                                         AS total_count
  FROM feature_log_links
  GROUP BY feature_id
) counts ON counts.feature_id = fl.id;
