ALTER TABLE innings
ADD COLUMN IF NOT EXISTS female_return_eligible_ids uuid[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS female_return_used_ids uuid[] NOT NULL DEFAULT '{}';
