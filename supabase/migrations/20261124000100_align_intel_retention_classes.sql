-- Align the durable Intel retention constraint with the classifier's supported classes.
-- This is additive: no Intel rows are rewritten, deleted, or reclassified.
alter table public.spartan_intel_records
  drop constraint if exists spartan_intel_retention_ck;

alter table public.spartan_intel_records
  add constraint spartan_intel_retention_ck
  check (
    retention_class = any (
      array[
        'intel_24h'::text,
        'intel_48h'::text,
        'intel_7d'::text,
        'permanent'::text,
        'war_until_age_end'::text,
        'age_stats_permanent'::text,
        'system_permanent'::text
      ]
    )
  );

notify pgrst, 'reload schema';
