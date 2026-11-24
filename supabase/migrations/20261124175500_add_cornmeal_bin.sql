insert into public.catalog_items(
  category, name, description, price, image_path, sizes, active,
  subcategory, supplier_item_number, unit_label, product_key
)
values (
  'smallware'::public.catalog_category,
  'Tabletop Cornmeal Bin',
  'Clear tabletop bin for holding cornmeal at the production line.',
  13.05,
  'catalog/smallwares/cornmeal-bin-70014CL.png',
  '{}'::text[],
  true,
  'Plastic Bins and Lids',
  '70014CL',
  'Each',
  'cornmeal-bin-tabletop'
)
on conflict (category, product_key) where product_key is not null do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  image_path = excluded.image_path,
  active = true,
  subcategory = excluded.subcategory,
  supplier_item_number = excluded.supplier_item_number,
  unit_label = excluded.unit_label,
  updated_at = now();
