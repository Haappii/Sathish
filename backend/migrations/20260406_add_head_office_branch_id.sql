ALTER TABLE shop_details
  ADD COLUMN IF NOT EXISTS head_office_branch_id INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_shop_details_head_office_branch'
  ) THEN
    ALTER TABLE shop_details
      ADD CONSTRAINT fk_shop_details_head_office_branch
      FOREIGN KEY (head_office_branch_id)
      REFERENCES branch(branch_id)
      ON DELETE SET NULL;
  END IF;
END $$;

WITH ranked_heads AS (
  SELECT
    s.shop_id,
    COALESCE(
      (
        SELECT b.branch_id
        FROM branch b
        WHERE b.shop_id = s.shop_id
          AND (
            LOWER(COALESCE(b.type, '')) LIKE '%head%'
            OR LOWER(COALESCE(b.branch_name, '')) LIKE '%head%'
          )
        ORDER BY b.branch_id
        LIMIT 1
      ),
      (
        SELECT b.branch_id
        FROM branch b
        WHERE b.shop_id = s.shop_id
          AND UPPER(COALESCE(b.status, 'ACTIVE')) = 'ACTIVE'
        ORDER BY b.branch_id
        LIMIT 1
      )
    ) AS resolved_branch_id
  FROM shop_details s
)
UPDATE shop_details s
SET head_office_branch_id = r.resolved_branch_id
FROM ranked_heads r
WHERE s.shop_id = r.shop_id
  AND s.head_office_branch_id IS NULL
  AND r.resolved_branch_id IS NOT NULL;
