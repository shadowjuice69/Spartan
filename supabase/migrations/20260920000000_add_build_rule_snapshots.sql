alter table spartan_builds
  add column if not exists race_rule_snapshot jsonb,
  add column if not exists personality_rule_snapshot jsonb,
  add column if not exists rules_age_number int;
