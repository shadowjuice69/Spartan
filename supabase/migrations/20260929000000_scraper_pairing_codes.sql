-- One-time pairing codes: a logged-in member generates a code on the site and
-- pastes it into the scraper once. The server trades it for a per-device token.
-- No shared key ships inside the extension.
create table if not exists public.spartan_scraper_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,            -- spartan_accounts.id
  code_hash text not null unique,      -- sha256 of the normalized code; plaintext is never stored
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_device_id uuid
);

create index if not exists spartan_scraper_pairing_codes_account_created_idx
  on public.spartan_scraper_pairing_codes (account_id, created_at desc);

-- Service role only: no policies, no anon/authenticated access.
alter table public.spartan_scraper_pairing_codes enable row level security;
revoke all on public.spartan_scraper_pairing_codes from anon, authenticated;
