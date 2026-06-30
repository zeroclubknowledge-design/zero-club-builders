ALTER TABLE public.bootcamps
ADD COLUMN IF NOT EXISTS coupon_code TEXT,
ADD COLUMN IF NOT EXISTS coupon_discount_percent NUMERIC DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bootcamps_coupon_discount_percent_range'
  ) THEN
    ALTER TABLE public.bootcamps
    ADD CONSTRAINT bootcamps_coupon_discount_percent_range
    CHECK (
      coupon_discount_percent IS NULL
      OR (coupon_discount_percent >= 0 AND coupon_discount_percent <= 100)
    )
    NOT VALID;
  END IF;
END $$;
