alter table public.technology_troubleshooting_guides add column if not exists issue_category text;

update public.technology_troubleshooting_guides set issue_category = case
  when equipment_type::text in ('Modem','Powers Router','Dominos Router','24 Port Meraki Switch','Turbo King Router') then 'Internet & Network'
  when equipment_type::text in ('Back Office Computer','Front Counter Computer','Makeline Computer','Dispatch Computer','Cut Table Tech Computer','Store Laptop') then 'Computers & POS'
  when equipment_type::text like 'Credit Card Machines%' then 'Card Payments'
  when equipment_type::text in ('Office Printer','Receipt Printer (CTT)','Receipt Printer (Dispatch)') then 'Printers'
  when equipment_type::text = 'Caller ID Box' then 'Phones & Caller ID'
  when equipment_type::text in ('Touchscreens','TV''s','Computer Monitors (non-touchscreen)') then 'Screens & Touchscreens'
  when equipment_type::text = 'Security Cameras' then 'Security Cameras'
  else 'Other / Not Sure'
end where issue_category is null or trim(issue_category) = '';

alter table public.technology_troubleshooting_guides
  alter column issue_category set default 'Other / Not Sure',
  alter column issue_category set not null,
  alter column equipment_type drop not null;
alter table public.technology_troubleshooting_guides drop constraint if exists technology_troubleshooting_guides_issue_category_check;
alter table public.technology_troubleshooting_guides add constraint technology_troubleshooting_guides_issue_category_check check (char_length(trim(issue_category)) between 3 and 80);

drop index if exists public.technology_troubleshooting_guide_title_unique;
drop index if exists public.technology_troubleshooting_guide_type_idx;
create unique index technology_troubleshooting_guide_issue_title_unique on public.technology_troubleshooting_guides(issue_category, lower(trim(title))) where active;
create index technology_troubleshooting_guide_issue_idx on public.technology_troubleshooting_guides(issue_category, title) where active;

comment on table public.technology_troubleshooting_guides is 'Reusable issue-to-resolution guides organized around common store technology problems rather than individual equipment records.';
comment on column public.technology_troubleshooting_guides.issue_category is 'Broad store issue group used to help team members find the correct resolution guide.';
comment on column public.technology_troubleshooting_guides.equipment_type is 'Legacy optional classification retained for historical guides; new troubleshooting guides are issue-first.';
