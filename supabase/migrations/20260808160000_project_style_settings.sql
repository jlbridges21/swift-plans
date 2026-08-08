-- Style settings on projects (render-time; not baked into geometry).
-- Safe to re-run.

alter table public.projects
  add column if not exists style_settings jsonb not null
  default '{
    "wallExteriorIn": 6,
    "wallInteriorIn": 4.5,
    "showRoomDimensions": true,
    "showRoomAreas": true,
    "showTotalArea": true,
    "showRoomFills": true,
    "showFloorTexture": true,
    "showDoorSwings": true,
    "labelSize": "md"
  }'::jsonb;

comment on column public.projects.style_settings is
  'Plan render/derive style (wall thickness, label toggles). Not stored in floor geometry.';
