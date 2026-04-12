DO $$
BEGIN
  ALTER TYPE referral_status ADD VALUE IF NOT EXISTS 'registered';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
