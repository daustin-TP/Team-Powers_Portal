-- Move the already-listed pie spoodle instead of creating a second manager choice.
update public.catalog_items set
  product_key = 'spoodle-pie-4-25-red',
  name = '4.25 oz. Red Handle Pie Spoodle',
  description = '4.25-ounce custom pie spoodle with a red handle.',
  subcategory = 'Kitchen Hand Tools',
  updated_at = now()
where category = 'smallware'
  and supplier_item_number = '29854876';

with products(product_key, name, description, price, image_path, supplier_item_number) as (values
  ('cutter-food-safe-red','Red Food-Safe Utility Cutter','NSF food-zone-certified red safety cutter. Supplier requires purchase in lots of ten.',3.38,'catalog/smallwares/food-safe-cutter-616DFCNSFR.png','616DFCNSFR'),
  ('brush-silicone-blue-10-75','10 3/4-inch Blue Silicone Basting and Pastry Brush','Cool-blue silicone basting and pastry brush.',9.59,'catalog/smallwares/pastry-brush-99991534.png','99991534'),
  ('scoop-clear-plastic-12-oz','12 oz. Clear Plastic Utility Scoop','Clear plastic utility scoop. Supplier requires purchase in lots of twelve.',2.42,'catalog/smallwares/utility-scoop-176PCSCOOP12.png','176PCSCOOP12'),
  ('spoodle-pie-4-25-red','4.25 oz. Red Handle Pie Spoodle','4.25-ounce custom pie spoodle with a red handle.',21.64,'catalog/smallwares/pie-spoodle-29854876.png','29854876'),
  ('spoodle-sauce-4-7-black','4.7 oz. Black Handle Sauce Spoodle','4.7-ounce sauce spoodle with a black handle.',18.26,'catalog/smallwares/spoodle-29857608.png','29857608'),
  ('tool-aluminum-pan-gripper','Aluminum Pan Gripper and Lock-Bolt Tool','Aluminum plier-style gripper with lock-bolt tool.',15.09,'catalog/smallwares/pan-gripper-667E9214.png','667E9214'),
  ('spatula-high-heat-4-25x3','4 1/4-inch x 3-inch High-Heat Spatula','Compact high-heat spatula for production use.',16.12,'catalog/smallwares/high-heat-spatula-667E201187.png','667E201187'),
  ('scraper-sauce-bucket','Sauce Bucket Scraper','Long-handled scraper for sauce buckets.',4.55,'catalog/smallwares/sauce-bucket-scraper-690FG19050WH.png','690FG19050WH')
)
insert into public.catalog_items(
  category, name, description, price, image_path, sizes, active,
  subcategory, supplier_item_number, unit_label, product_key
)
select
  'smallware'::public.catalog_category, name, description, price, image_path,
  '{}'::text[], true, 'Kitchen Hand Tools', supplier_item_number, 'Each', product_key
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
