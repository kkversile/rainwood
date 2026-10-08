-- RACK is the canonical public RateDay source. Existing A-E values remain unchanged.
ALTER TYPE "AgentRateCategory" ADD VALUE IF NOT EXISTS 'RACK' BEFORE 'A';
