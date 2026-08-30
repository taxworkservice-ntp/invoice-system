-- Logo position on print header: 'left' (logo beside company, current default)
-- or 'above' (logo stacked left-aligned above company name). Null = left for
-- backward compatibility with existing workspaces.
alter table client_profiles
  add column if not exists logo_layout text check (logo_layout in ('left','above'));
