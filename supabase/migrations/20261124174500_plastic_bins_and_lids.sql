alter table public.catalog_items
  add column if not exists product_key text;

alter table public.catalog_items drop constraint if exists catalog_items_product_key_check;
alter table public.catalog_items add constraint catalog_items_product_key_check
  check (product_key is null or char_length(trim(product_key)) between 3 and 100);

create unique index if not exists catalog_items_product_key_unique
  on public.catalog_items(category, product_key)
  where product_key is not null;

-- Reuse matching legacy rows so historical orders retain their original item IDs.
with replacements(old_name, product_key, name, description, price, image_path, supplier_item_number, unit_label) as (values
  ('1/3 Size 6" Deep Black Polycarbonate Food Pan (BLACK)','pan-third-6-black','1/3 Size 6-inch Deep Black Polycarbonate Food Pan','Black polycarbonate food pan. Supplier requires purchase in lots of six.',6.28,'catalog/smallwares/food-pan-247FP136BK.png','247FP136BK','Each'),
  ('1/3 Size 6" Deep Clear Polycarbonate Food Pan (Clear)','pan-third-6-clear','1/3 Size 6-inch Deep Clear Polycarbonate Food Pan','Clear polycarbonate food pan. Supplier requires purchase in lots of six.',6.45,'catalog/smallwares/food-pan-247FP136CL.png','247FP136CL','Each'),
  ('1/6 Size 6" Deep Black Polycarbonate Food Pan (BLACK)','pan-sixth-6-black','1/6 Size 6-inch Deep Black Polycarbonate Food Pan','Black polycarbonate food pan. Supplier requires purchase in lots of six.',3.66,'catalog/smallwares/food-pan-247FP166BK.png','247FP166BK','Each'),
  ('Full Size 6" Deep Black Polycarbonate Food Pan (BLACK)','pan-full-6-black','Full Size 6-inch Deep Black Polycarbonate Food Pan','Black polycarbonate food pan. Supplier requires purchase in lots of six.',14.75,'catalog/smallwares/food-pan-247FP116BK.png','247FP116BK','Each'),
  ('Full Size 6" Deep Clear Polycarbonate Food Pan (Clear)','pan-full-6-clear','Full Size 6-inch Deep Clear Polycarbonate Food Pan','Clear polycarbonate food pan. Supplier requires purchase in lots of six.',15.27,'catalog/smallwares/food-pan-247FP116CL.png','247FP116CL','Each')
)
update public.catalog_items item set
  product_key = replacement.product_key,
  name = replacement.name,
  description = replacement.description,
  price = replacement.price,
  image_path = replacement.image_path,
  supplier_item_number = replacement.supplier_item_number,
  unit_label = replacement.unit_label,
  subcategory = 'Plastic Bins and Lids',
  active = true,
  updated_at = now()
from replacements replacement
where item.category = 'smallware'
  and item.name = replacement.old_name;

-- Keep the existing clear sixth-pan choice, which has no replacement in this batch.
update public.catalog_items set
  product_key = 'pan-sixth-6-clear',
  name = '1/6 Size 6-inch Deep Clear Polycarbonate Food Pan',
  subcategory = 'Plastic Bins and Lids',
  updated_at = now()
where category = 'smallware'
  and product_key is null
  and name = '1/6 Size 6" Deep Clear Polycarbonate Food Pan (Clear)';

with products(product_key, name, description, price, image_path, supplier_item_number, unit_label) as (values
  ('pan-third-6-black','1/3 Size 6-inch Deep Black Polycarbonate Food Pan','Black polycarbonate food pan. Supplier requires purchase in lots of six.',6.28,'catalog/smallwares/food-pan-247FP136BK.png','247FP136BK','Each'),
  ('pan-sixth-6-black','1/6 Size 6-inch Deep Black Polycarbonate Food Pan','Black polycarbonate food pan. Supplier requires purchase in lots of six.',3.66,'catalog/smallwares/food-pan-247FP166BK.png','247FP166BK','Each'),
  ('pan-ninth-6-black','1/9 Size 6-inch Deep Black Polycarbonate Food Pan','Black polycarbonate food pan. Supplier requires purchase in lots of six.',2.90,'catalog/smallwares/food-pan-247FP196BK.png','247FP196BK','Each'),
  ('pan-full-2-5-clear','Full Size 2 1/2-inch Deep Clear Polycarbonate Food Pan','Clear polycarbonate food pan. Supplier requires purchase in lots of six.',9.16,'catalog/smallwares/food-pan-247FP112CL.png','247FP112CL','Each'),
  ('pan-full-6-black','Full Size 6-inch Deep Black Polycarbonate Food Pan','Black polycarbonate food pan. Supplier requires purchase in lots of six.',14.75,'catalog/smallwares/food-pan-247FP116BK.png','247FP116BK','Each'),
  ('pan-full-6-clear','Full Size 6-inch Deep Clear Polycarbonate Food Pan','Clear polycarbonate food pan. Supplier requires purchase in lots of six.',15.27,'catalog/smallwares/food-pan-247FP116CL.png','247FP116CL','Each'),
  ('lid-full-flat-clear','Full Size Clear Polycarbonate Flat Food Pan Lid','Clear flat lid for a full-size polycarbonate food pan.',8.72,'catalog/smallwares/lid-247FP11LFCL.png','247FP11LFCL','Each'),
  ('pan-third-8-black','1/3 Size 8-inch Deep Black Polycarbonate Food Pan','Black polycarbonate food pan. Supplier requires purchase in lots of six.',8.20,'catalog/smallwares/food-pan-247FP138BK.png','247FP138BK','Each'),
  ('pan-ninth-4-clear','1/9 Size 4-inch Deep Clear Polycarbonate Food Pan','Clear polycarbonate food pan. Supplier requires purchase in lots of six.',2.61,'catalog/smallwares/food-pan-247FP194CL.png','247FP194CL','Each'),
  ('pan-ninth-4-black','1/9 Size 4-inch Deep Black Polycarbonate Food Pan','Black polycarbonate food pan. Supplier requires purchase in lots of six.',1.74,'catalog/smallwares/food-pan-247FP194BK.png','247FP194BK','Each'),
  ('round-container-12-translucent','12 Qt. Translucent Round Food Storage Container','Translucent round food storage container. Supplier requires purchase in lots of six.',7.82,'catalog/smallwares/round-container-247R12TR.png','247R12TR','Each'),
  ('round-lid-12-18-22-blue','12, 18, and 22 Qt. Blue Round Food Storage Container Lid','Blue lid fitting 12-, 18-, and 22-quart round food storage containers.',3.87,'catalog/smallwares/round-lid-247RLID12BL.png','247RLID12BL','Each'),
  ('lid-sixth-flat-clear','1/6 Size Clear Polycarbonate Flat Food Pan Lid - 6/Case','Clear flat lids for 1/6-size polycarbonate food pans, supplied six per case. Current unit estimate: $1.94 each.',11.63,'catalog/smallwares/lid-247FP16LFCL.png','247FP16LFCL','Case'),
  ('lid-sixth-soft-blue','1/6 Size Blue Soft Food Pan Cover','Blue soft cover for a 1/6-size food pan.',2.42,'catalog/smallwares/lid-70060S.png','70060S','Each'),
  ('lid-ninth-flat-clear','1/9 Size Clear Polycarbonate Flat Food Pan Lid - 6/Case','Clear flat lids for 1/9-size polycarbonate food pans, supplied six per case. Current unit estimate: $1.78 each.',10.66,'catalog/smallwares/lid-247FP19LCL.png','247FP19LCL','Case'),
  ('pan-ninth-6-clear','1/9 Size 6-inch Deep Clear Polycarbonate Food Pan','Clear polycarbonate food pan. Supplier requires purchase in lots of six.',5.66,'catalog/smallwares/food-pan-70096CL.png','70096CL','Each'),
  ('pan-half-6-clear','1/2 Size 6-inch Deep Clear Polycarbonate Food Pan','Clear polycarbonate food pan. Supplier requires purchase in lots of six.',8.55,'catalog/smallwares/food-pan-247FP126CL.png','247FP126CL','Each'),
  ('pan-third-6-clear','1/3 Size 6-inch Deep Clear Polycarbonate Food Pan','Clear polycarbonate food pan. Supplier requires purchase in lots of six.',6.45,'catalog/smallwares/food-pan-247FP136CL.png','247FP136CL','Each'),
  ('pan-third-8-clear','1/3 Size 8-inch Deep Clear Polycarbonate Food Pan','Clear polycarbonate food pan. Supplier requires purchase in lots of six.',7.85,'catalog/smallwares/food-pan-247FP138CL.png','247FP138CL','Each'),
  ('lid-third-flat-clear','1/3 Size Clear Polycarbonate Flat Food Pan Lid','Clear flat lid for a 1/3-size polycarbonate food pan.',3.19,'catalog/smallwares/lid-247FP13LFCL.png','247FP13LFCL','Each')
)
insert into public.catalog_items(category, name, description, price, image_path, sizes, active, subcategory, supplier_item_number, unit_label, product_key)
select 'smallware'::public.catalog_category, name, description, price, image_path, '{}'::text[], true, 'Plastic Bins and Lids', supplier_item_number, unit_label, product_key
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

comment on column public.catalog_items.product_key is 'Brand-neutral product identity used to replace equivalent supplier products without creating manager-facing duplicates.';
