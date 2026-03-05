-- Add GST / accounting reporting helper columns

-- Items: HSN & GST rate
ALTER TABLE items
    ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(30),
    ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 0;

-- Invoices: place of supply, supply type, reverse charge
ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(20),
    ADD COLUMN IF NOT EXISTS supply_type VARCHAR(10) DEFAULT 'B2C',
    ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN DEFAULT FALSE;

-- Invoice details: per-line tax breakdown (approximate backfill)
ALTER TABLE invoice_details
    ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taxable_value NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cgst_amt NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sgst_amt NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS igst_amt NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cess_amt NUMERIC(12,2) DEFAULT 0;

-- Backfill GST rate on items from shop default when empty
UPDATE items i
SET gst_rate = COALESCE(NULLIF(i.gst_rate, 0), sd.gst_percent, 0)
FROM shop_details sd
WHERE sd.shop_id = i.shop_id;

-- Backfill invoice place_of_supply and supply_type
UPDATE invoice inv
SET place_of_supply = COALESCE(inv.place_of_supply, COALESCE(b.state, sd.state)),
    supply_type = COALESCE(inv.supply_type, CASE WHEN inv.gst_number IS NOT NULL AND inv.gst_number <> '' THEN 'B2B' ELSE 'B2C' END),
    reverse_charge = COALESCE(inv.reverse_charge, FALSE)
FROM branch b, shop_details sd
WHERE b.branch_id = inv.branch_id
  AND sd.shop_id = inv.shop_id;

-- Approximate per-line tax split based on invoice tax + amount share
WITH inv_totals AS (
    SELECT
        i.invoice_id,
        i.total_amount::NUMERIC AS total_amount,
        i.tax_amt::NUMERIC      AS tax_amt,
        i.place_of_supply,
        COALESCE(b.state, sd.state) AS branch_state,
        sd.state AS shop_state,
        COALESCE(sd.gst_percent, 0)::NUMERIC AS shop_gst_rate
    FROM invoice i
    LEFT JOIN branch b ON b.branch_id = i.branch_id
    LEFT JOIN shop_details sd ON sd.shop_id = i.shop_id
)
UPDATE invoice_details d
SET
    tax_rate = COALESCE(NULLIF(d.tax_rate, 0), it.gst_rate, itot.shop_gst_rate, 0),
    taxable_value = CASE
        WHEN itot.total_amount IS NULL OR itot.total_amount = 0 OR itot.tax_amt IS NULL THEN d.amount
        ELSE (d.amount::NUMERIC * GREATEST(itot.total_amount - itot.tax_amt, 0) / itot.total_amount)
    END,
    cgst_amt = CASE
        WHEN itot.total_amount IS NULL OR itot.total_amount = 0 THEN 0
        WHEN COALESCE(itot.place_of_supply, itot.branch_state, itot.shop_state) = itot.shop_state THEN
            (itot.tax_amt * (d.amount::NUMERIC / itot.total_amount) / 2)
        ELSE 0
    END,
    sgst_amt = CASE
        WHEN itot.total_amount IS NULL OR itot.total_amount = 0 THEN 0
        WHEN COALESCE(itot.place_of_supply, itot.branch_state, itot.shop_state) = itot.shop_state THEN
            (itot.tax_amt * (d.amount::NUMERIC / itot.total_amount) / 2)
        ELSE 0
    END,
    igst_amt = CASE
        WHEN itot.total_amount IS NULL OR itot.total_amount = 0 THEN 0
        WHEN COALESCE(itot.place_of_supply, itot.branch_state, itot.shop_state) = itot.shop_state THEN 0
        ELSE itot.tax_amt * (d.amount::NUMERIC / itot.total_amount)
    END
FROM inv_totals itot, items it
WHERE itot.invoice_id = d.invoice_id
  AND it.item_id = d.item_id;
