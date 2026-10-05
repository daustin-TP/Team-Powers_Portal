-- Store contact details and operating hours from the Wizardline/Quality
-- Management Store Profile Summary supplied on 2026-10-05.

alter table public.stores add column if not exists address_line1 text;
alter table public.stores add column if not exists address_line2 text;
alter table public.stores add column if not exists city text;
alter table public.stores add column if not exists state_code text;
alter table public.stores add column if not exists postal_code text;
alter table public.stores add column if not exists country_code text not null default 'US';
alter table public.stores add column if not exists mailing_address_line1 text;
alter table public.stores add column if not exists mailing_address_line2 text;
alter table public.stores add column if not exists mailing_city text;
alter table public.stores add column if not exists mailing_state_code text;
alter table public.stores add column if not exists mailing_postal_code text;
alter table public.stores add column if not exists order_phone text;
alter table public.stores add column if not exists pos_system text;
alter table public.stores add column if not exists time_zone text not null default 'America/Chicago';

with profile(
  store_number, address_line1, address_line2, city, state_code, postal_code,
  mailing_address_line1, mailing_address_line2, mailing_city,
  mailing_state_code, mailing_postal_code, order_phone, pos_system
) as (values
  ('1412','446 N. Main St.',null,'Jamestown','TN','38556-3239','446 N. Main St.',null,'Jamestown','TN','38556-3239','9318793052','PUL 3.9'),
  ('1443','135 Fast Ln',null,'Baxter','TN','38544-5197','135 Fast Ln',null,'Baxter','TN','38544-5197','9134009112','PUL 3.9'),
  ('1493','4929 Peavine Rd','Ste 103','Crossville','TN','38571-7995','4929 Peavine Rd','Ste 103','Crossville','TN','38571-7995','9319211212','PUL 3.9'),
  ('5408','1415 Hillsboro Blvd','Ste 102','Manchester','TN','37355','1415 Hillsboro Blvd','Ste 102','Manchester','TN','37355','9314501515','PUL 5.0'),
  ('5430','512 N Willow Ave',null,'Cookeville','TN','38501-1759','512 N Willow Ave',null,'Cookeville','TN','38501-1759','9315203333','PUL 3.9'),
  ('5449','402 W Main St',null,'Algood','TN','38506-5319','402 W Main St',null,'Algood','TN','38506-5319','9316505555','PUL 3.9'),
  ('5452','1683 South Jefferson Ave.','Suite A&B','Cookeville','TN','38506','1683 S Jefferson Ave',null,'Cookeville-South','TN','38506','9318541099','PUL 3.9'),
  ('5491','400 E Broad St',null,'Smithville','TN','37166','400 E Broad St',null,'Smithville','TN','37166','6155970001','PUL 3.9'),
  ('6176','1539 W. Main St',null,'Livingston','TN','38570','1539 W. Main St',null,'Livingston','TN','38570','9318237777','PUL 3.9'),
  -- The supplied store address is 402 N Spring St; the user directed Dash-OS
  -- to use the report's 486 N Spring St mailing address for Sparta instead.
  ('6303','486 N Spring St',null,'Sparta','TN','38583-1324','486 N Spring St',null,'Sparta','TN','38583-1324','9318379999','PUL 5.0'),
  ('6326','7393 State Route 28',null,'Dunlap','TN','37327-3564','7393 State Route 28',null,'Dunlap','TN','37327-3564','4239495656','PUL 3.9'),
  ('8702','124 E Commercial Ave',null,'Monterey','TN','38574-1412','124 E Commercial Ave',null,'Monterey','TN','38574-1412','9313222112','PUL 5.0')
)
update public.stores s
set address_line1 = p.address_line1,
    address_line2 = p.address_line2,
    city = p.city,
    state_code = p.state_code,
    postal_code = p.postal_code,
    country_code = 'US',
    mailing_address_line1 = p.mailing_address_line1,
    mailing_address_line2 = p.mailing_address_line2,
    mailing_city = p.mailing_city,
    mailing_state_code = p.mailing_state_code,
    mailing_postal_code = p.mailing_postal_code,
    order_phone = p.order_phone,
    pos_system = p.pos_system,
    time_zone = 'America/Chicago',
    updated_at = now()
from profile p
where s.store_number = p.store_number;

with hours(store_number, day_of_week, open_time, close_time) as (
  select s.store_number, d.day_of_week, time '10:00',
    case
      when s.store_number = '1493' and d.day_of_week in (0,1,2,3,6) then time '22:00'
      when s.store_number = '1493' then time '23:00'
      when s.store_number = '5408' then time '00:00'
      when s.store_number = '5430' then time '01:00'
      when d.day_of_week in (4,5) then time '00:00'
      else time '23:00'
    end
  from public.stores s
  cross join (values (0),(1),(2),(3),(4),(5),(6)) d(day_of_week)
  where s.store_number in ('1412','1443','1493','5408','5430','5449','5452','5491','6176','6303','6326','8702')
)
insert into public.labor_store_hours(store_id, day_of_week, open_time, close_time)
select s.id, h.day_of_week, h.open_time, h.close_time
from hours h
join public.stores s on s.store_number = h.store_number
on conflict(store_id, day_of_week) do update
set open_time = excluded.open_time,
    close_time = excluded.close_time;
