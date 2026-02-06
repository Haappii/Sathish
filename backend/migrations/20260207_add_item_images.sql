BEGIN;

-- Store item image filename (ex: "123.png"). File itself is stored on disk.
ALTER TABLE items
ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255);

COMMIT;

