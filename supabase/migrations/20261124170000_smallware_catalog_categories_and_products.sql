alter table public.catalog_items
  add column if not exists subcategory text not null default 'General',
  add column if not exists supplier_item_number text,
  add column if not exists unit_label text not null default 'Each';

alter table public.catalog_items drop constraint if exists catalog_items_subcategory_check;
alter table public.catalog_items add constraint catalog_items_subcategory_check check (char_length(trim(subcategory)) between 2 and 100);
alter table public.catalog_items drop constraint if exists catalog_items_supplier_number_check;
alter table public.catalog_items add constraint catalog_items_supplier_number_check check (supplier_item_number is null or char_length(trim(supplier_item_number)) between 2 and 60);
alter table public.catalog_items drop constraint if exists catalog_items_unit_label_check;
alter table public.catalog_items add constraint catalog_items_unit_label_check check (char_length(trim(unit_label)) between 2 and 40);
create unique index if not exists catalog_items_supplier_number_unique on public.catalog_items(category, supplier_item_number) where supplier_item_number is not null;
create index if not exists catalog_items_category_subcategory_idx on public.catalog_items(category, subcategory, name) where active;

with products(name, description, price, image_path, subcategory, supplier_item_number, unit_label) as (values
  ('Ecolab 1 Gallon Chemical Delimer - 4/Pack','One-gallon chemical delimer supplied as a four-pack.',119.77,'catalog/smallwares/chemical-delimer-6181111004.png','Chemicals & Cleaning','6181111004','Pack'),
  ('Paramount 1 Gallon Machine Detergent for Domino''s - 2/Pack','One-gallon machine detergent supplied as a two-pack.',94.49,'catalog/smallwares/machine-detergent-83331111955.png','Chemicals & Cleaning','83331111955','Pack'),
  ('1 Gallon RX Dry Rinse Aid - 2/Pack','One-gallon RX Dry rinse aid supplied as a two-pack. Current unit estimate: $51.74 each.',103.49,'catalog/smallwares/rx-dry-rinse-aid-3731111941.png','Chemicals & Cleaning','3731111941','Pack'),
  ('Ecolab 4 oz. Disinfectant Cleaner - 2/Pack','Four-ounce disinfectant cleaner supplied as a two-pack.',22.51,'catalog/smallwares/disinfectant-cleaner-6182260111.png','Chemicals & Cleaning','6182260111','Pack'),
  ('Choice 15 Slot Pizza Pan Rack','Fifteen-slot pizza pan rack. Supplier requires purchase in lots of four.',25.56,'catalog/smallwares/pizza-pan-rack-407PRACK15S.png','Pizza Tools and Accessories','407PRACK15S','Each'),
  ('Vollrath 4.25 oz. 12-inch Red Handle Custom Pie Spoodle','Custom red-handle pie spoodle for Domino''s, model 54876.',21.64,'catalog/smallwares/pie-spoodle-29854876.png','Pizza Tools and Accessories','29854876','Each'),
  ('American Metalcraft PPC5 5-inch Stainless Steel Pizza Cutter','Five-inch stainless-steel pizza cutter with black handle.',9.59,'catalog/smallwares/pizza-cutter-124PPC5.png','Pizza Tools and Accessories','124PPC5','Each'),
  ('LloydPans Blade Sharpener for Pizza Rocker Knives','Blade sharpener for select LloydPans pizza rocker knives.',7.21,'catalog/smallwares/blade-sharpener-680DOMEQSHRP.png','Pizza Tools and Accessories','680DOMEQSHRP','Each'),
  ('Domino''s Plastic Dough Scraper','White plastic dough scraper.',3.15,'catalog/smallwares/dough-scraper-833DSP1.png','Pizza Tools and Accessories','833DSP1','Each'),
  ('Domino''s Clear Dough Tray / Sheet Pan Cover','Clear cover for a dough tray or sheet pan.',12.37,'catalog/smallwares/dough-tray-cover-833273226.png','Pizza Tools and Accessories','833273226','Each'),
  ('American Metalcraft 7010 Pizza Pan Separator / Lid','11 1/2-inch x 1/4-inch round standard-weight aluminum pizza pan separator and lid.',5.87,'catalog/smallwares/pizza-pan-separator-1247010S.png','Pizza Tools and Accessories','1247010S','Each'),
  ('Domino''s 12-inch Round Baking Mat - 12/Pack','Twelve-inch round baking mats supplied as a twelve-pack.',44.74,'catalog/smallwares/baking-mat-943BAKINGMAT.png','Pizza Tools and Accessories','943BAKINGMAT','Pack'),
  ('Domino''s Aluminum Pizza Peel with Bent Wings','Aluminum pizza peel with bent wings.',25.58,'catalog/smallwares/pizza-peel-833E201105.png','Pizza Tools and Accessories','833E201105','Each'),
  ('LloydPans 14-inch Aluminum Stuffed Crust Ring','14-inch x 1/2-inch aluminum stuffed-crust ring for stuffed-crust pizzas.',19.39,'catalog/smallwares/stuffed-crust-ring-680LT116620DOM.png','Parmesan Stuffed Crust','680LT116620DOM','Each'),
  ('LloydPans Aluminum Pie Press Crimper','10 7/8-inch x 1 1/8-inch aluminum pie press crimper for stuffed-crust pizzas.',12.29,'catalog/smallwares/pie-press-crimper-680LT116621DOM.png','Parmesan Stuffed Crust','680LT116621DOM','Each'),
  ('Vollrath Yellow Parmesan Shake-On Lid - 6/Case','Yellow shake-on lid for coarse-ground Parmesan product, supplied six per case.',16.50,'catalog/smallwares/parmesan-shake-on-lid-2984907LXL6PK.png','Parmesan Stuffed Crust','2984907LXL6PK','Case'),
  ('Domino''s Bilingual Pizza Grading Tool - 2/Case','8 1/2-inch x 6-inch food-grade black acrylic bilingual pizza grading tool, supplied two per case.',11.60,'catalog/smallwares/pizza-grading-tool-833E216007G3.png','Grading Tool','833E216007G3','Case')
)
insert into public.catalog_items(category, name, description, price, image_path, sizes, active, subcategory, supplier_item_number, unit_label)
select 'smallware'::public.catalog_category, name, description, price, image_path, '{}'::text[], true, subcategory, supplier_item_number, unit_label
from products
on conflict (category, supplier_item_number) where supplier_item_number is not null do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  image_path = excluded.image_path,
  active = true,
  subcategory = excluded.subcategory,
  unit_label = excluded.unit_label,
  updated_at = now();

comment on column public.catalog_items.subcategory is 'User-facing catalog grouping such as Chemicals & Cleaning or Pizza Tools and Accessories.';
comment on column public.catalog_items.supplier_item_number is 'Supplier SKU used to identify and safely update catalog products.';
comment on column public.catalog_items.unit_label is 'Unit represented by the listed price, such as Each, Pack, or Case.';
