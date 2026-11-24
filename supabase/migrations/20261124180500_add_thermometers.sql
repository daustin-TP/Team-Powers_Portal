with products(product_key, name, description, price, image_path, supplier_item_number) as (values
  ('thermometer-oven-dial-2-inch','2-inch Dial Oven Thermometer','Freestanding dial thermometer for monitoring oven temperature.',5.93,'catalog/smallwares/thermometer-27324HP011.png','27324HP011'),
  ('thermometer-waterproof-pocket-probe','Waterproof Digital Pocket Probe Thermometer','Waterproof digital pocket probe thermometer with protective sheath for food and dishwasher temperature checks.',28.12,'catalog/smallwares/thermometer-273DFP450W08.png','273DFP450W08')
)
insert into public.catalog_items(
  category, name, description, price, image_path, sizes, active,
  subcategory, supplier_item_number, unit_label, product_key
)
select
  'smallware'::public.catalog_category, name, description, price, image_path,
  '{}'::text[], true, 'Thermometers', supplier_item_number, 'Each', product_key
from products
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
