with products(product_key, name, description, price, image_path, subcategory, supplier_item_number, unit_label) as (values
  ('screen-tri-square-13','13-inch x 13-inch Tri-Screen','Square 13-inch tri-screen for pizza production.',15.05,'catalog/smallwares/tri-screen-667E208065.png','Pans, Discs, Screens','667E208065','Each'),
  ('disc-pizza-perforated-10','10-inch Perforated Hard-Coat Aluminum Pizza Disk - 12/Case','Ten-inch perforated hard-coat anodized aluminum pizza disks, supplied twelve per case.',86.88,'catalog/smallwares/pizza-disc-680DOMQ4010DF.png','Pans, Discs, Screens','680DOMQ4010DF','Case'),
  ('disc-pizza-perforated-16','16-inch Perforated Hard-Coat Aluminum Pizza Disk - 12/Case','Sixteen-inch perforated hard-coat anodized aluminum pizza disks, supplied twelve per case.',133.06,'catalog/smallwares/pizza-disc-680DOMQ4016DF.png','Pans, Discs, Screens','680DOMQ4016DF','Case'),
  ('disc-pizza-perforated-14','14-inch Perforated Hard-Coat Aluminum Pizza Disk - 12/Case','Fourteen-inch perforated hard-coat anodized aluminum pizza disks, supplied twelve per case.',109.36,'catalog/smallwares/pizza-disc-680DOMQ4014DF.png','Pans, Discs, Screens','680DOMQ4014DF','Case'),
  ('disc-pizza-perforated-12','12-inch Perforated Hard-Coat Aluminum Pizza Disk - 12/Case','Twelve-inch perforated hard-coat anodized aluminum pizza disks, supplied twelve per case.',97.21,'catalog/smallwares/pizza-disc-680DOMQ4012DF.png','Pans, Discs, Screens','680DOMQ4012DF','Case'),
  ('pan-pizza-deep-dish-round-12','12-inch Round Deep-Dish Pizza Pan - 12/Case','Twelve-inch round deep-dish pizza pans, supplied twelve per case.',83.39,'catalog/smallwares/deep-dish-pan-680DOM14777RND.png','Pans, Discs, Screens','680DOM14777RND','Case'),
  ('personal-pan-lid-kit-11x5x2','11-inch x 5-inch x 2-inch Personal Pan and Lid Kit','Aluminum Personal Domino pan and lid kit.',88.52,'catalog/smallwares/personal-pan-kit-680KIT117003.png','Personal Domino','680KIT117003','Each'),
  ('personal-pan-lid-11x5','11 1/8-inch x 5 1/8-inch Personal Pan Lid','Replacement aluminum lid for the Personal Domino pan.',4.58,'catalog/smallwares/personal-pan-lid-680RCT116911.png','Personal Domino','680RCT116911','Each')
)
insert into public.catalog_items(
  category, name, description, price, image_path, sizes, active,
  subcategory, supplier_item_number, unit_label, product_key
)
select
  'smallware'::public.catalog_category, name, description, price, image_path,
  '{}'::text[], true, subcategory, supplier_item_number, unit_label, product_key
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
