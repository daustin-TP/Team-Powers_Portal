-- Canonical Wizardline store-number mapping used by KPI and labor imports.
update public.stores
set store_number = case name
  when 'Jamestown' then '1412'
  when 'Baxter' then '1443'
  when 'Fairfield Glade' then '1493'
  when 'Manchester' then '5408'
  when 'North, Cookeville' then '5430'
  when 'Algood' then '5449'
  when 'South, Cookeville' then '5452'
  when 'Smithville' then '5491'
  when 'Livingston' then '6176'
  when 'Sparta' then '6303'
  when 'Dunlap' then '6326'
  when 'Monterey' then '8702'
  else store_number
end
where name in (
  'Jamestown','Baxter','Fairfield Glade','Manchester','North, Cookeville','Algood',
  'South, Cookeville','Smithville','Livingston','Sparta','Dunlap','Monterey'
);
