-- Fix unique constraint on tables_master to allow same table name in different categories.
-- Previously the constraint was on (shop_id, branch_id, table_name), which prevented
-- using the same name across categories (e.g. "Table 1" in both "1st Floor" and "2nd Floor").
-- New constraint: (shop_id, branch_id, category_id, table_name).

-- Drop any existing unique constraints on tables_master that cover table_name
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE t.relname = 'tables_master'
          AND c.contype = 'u'
          AND a.attname = 'table_name'
    LOOP
        EXECUTE 'ALTER TABLE tables_master DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Add new constraint: unique name per shop + branch + category
ALTER TABLE tables_master
    ADD CONSTRAINT uq_tables_master_shop_branch_category_name
    UNIQUE (shop_id, branch_id, category_id, table_name);
