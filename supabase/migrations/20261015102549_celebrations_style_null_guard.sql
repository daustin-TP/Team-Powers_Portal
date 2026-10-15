-- CHECK must reject SQL NULL as well as false (for JSON null font/color/alignment values).
alter table public.celebrations add constraint celebrations_caption_style_is_valid check (celebrations_private.valid_style(caption_style) is true);
