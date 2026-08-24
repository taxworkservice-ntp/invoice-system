-- ============================================================
-- User-adjustable signature/stamp print sizes.
--
-- Adds scale presets (small/medium/large -> 0.75x/1x/1.25x) for the
-- signature and stamp images on document templates, mirroring the
-- existing client_profiles.logo_size preset pattern.
--
-- Run manually in the Supabase SQL editor.
-- ============================================================

alter table client_profiles
  add column if not exists signature_scale text not null default 'medium',
  add column if not exists stamp_scale text not null default 'medium';
