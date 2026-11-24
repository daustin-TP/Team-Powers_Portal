with products(product_key, name, description, price, image_path, supplier_item_number, unit_label, active) as (values
  ('bottle-squeeze-clear-16-oz','16 oz. Clear Squeeze Bottle - 12/Case','Clear 16-ounce squeeze bottles supplied twelve per case.',22.49,'catalog/smallwares/squeeze-bottle-9224916J13CS.png','9224916J13CS','Case',true),
  ('bottle-squeeze-clear-wide-24-oz','24 oz. Clear Wide-Mouth Squeeze Bottle - 12/Case','Clear 24-ounce wide-mouth squeeze bottles supplied twelve per case.',31.49,'catalog/smallwares/squeeze-bottle-2984924J13CS.png','2984924J13CS','Case',true),
  ('cap-clear-half-cut-garlic-oil','Clear 1/2-Cut Squeeze Bottle Cap - Garlic Oil - 12/Case','Clear half-cut cap for garlic oil bottles, supplied twelve per case. Supplier currently lists this item as unavailable.',10.99,'catalog/smallwares/bottle-cap-298491913CS.png','298491913CS','Case',false),
  ('cap-green-half-cut','Green 1/2-Cut Squeeze Bottle Cap - 12/Case','Green half-cut squeeze bottle caps supplied twelve per case.',15.49,'catalog/smallwares/bottle-cap-2983300191CS.png','2983300191CS','Case',true),
  ('cap-red-tri-tip-full-cut-alfredo','Red Tri-Tip Full-Cut Squeeze Bottle Cap - Alfredo - 12/Case','Red tri-tip full-cut caps for Alfredo sauce, supplied twelve per case.',13.49,'catalog/smallwares/bottle-cap-298330002CS.png','298330002CS','Case',true),
  ('shaker-fine-ground-green-10-oz','10 oz. Fine-Ground Product Shaker with Green Lid','Clear 10-ounce shaker with green lid. Supplier requires purchase in lots of twelve.',3.58,'catalog/smallwares/shaker-21496SKRF.png','21496SKRF','Each',true),
  ('cap-purple-tri-tip-no-cut','Purple Tri-Tip No-Cut Squeeze Bottle Cap','Purple tri-tip squeeze bottle cap with uncut tips.',1.20,'catalog/smallwares/bottle-cap-8883300PURP.png','8883300PURP','Each',true),
  ('cap-green-tri-tip-no-cut-mild-buffalo','Green Tri-Tip No-Cut Squeeze Bottle Cap - Mild Buffalo','Green tri-tip squeeze bottle cap for mild Buffalo sauce.',1.20,'catalog/smallwares/bottle-cap-8883300GRN.png','8883300GRN','Each',true),
  ('cap-blue-tri-tip-no-cut-ranch','Blue Tri-Tip No-Cut Squeeze Bottle Cap - Ranch','Blue tri-tip squeeze bottle cap for ranch.',1.20,'catalog/smallwares/bottle-cap-8883300BL.png','8883300BL','Each',true),
  ('cap-yellow-tri-tip-no-cut-butter-oil','Yellow Tri-Tip No-Cut Squeeze Bottle Cap - Butter-Flavored Oil','Yellow tri-tip squeeze bottle cap for butter-flavored oil.',1.20,'catalog/smallwares/bottle-cap-8883300YL.png','8883300YL','Each',true),
  ('cap-clear-tri-tip-no-cut','Clear Tri-Tip No-Cut Squeeze Bottle Cap','Clear tri-tip squeeze bottle cap with uncut tips.',1.20,'catalog/smallwares/bottle-cap-8883300CL.png','8883300CL','Each',true),
  ('cap-red-tri-tip-no-cut-hot-buffalo','Red Tri-Tip No-Cut Squeeze Bottle Cap - Hot Buffalo','Red tri-tip squeeze bottle cap for hot Buffalo sauce.',1.20,'catalog/smallwares/bottle-cap-8883300RD.png','8883300RD','Each',true),
  ('cap-clear-single-tip-wide-no-cut','Clear Single-Tip Wide-Mouth Bottle Cap - No Cut','Clear single-tip wide-mouth squeeze bottle cap with an uncut tip.',0.57,'catalog/smallwares/bottle-cap-8884913CL.png','8884913CL','Each',true),
  ('cap-brown-tri-tip-no-cut-honey-bbq','Brown Tri-Tip No-Cut Squeeze Bottle Cap - Honey BBQ','Brown tri-tip squeeze bottle cap for honey BBQ sauce.',1.20,'catalog/smallwares/bottle-cap-8883300BR.png','8883300BR','Each',true)
)
insert into public.catalog_items(
  category, name, description, price, image_path, sizes, active,
  subcategory, supplier_item_number, unit_label, product_key
)
select
  'smallware'::public.catalog_category, name, description, price, image_path,
  '{}'::text[], active, 'Squeeze Bottles and Caps', supplier_item_number, unit_label, product_key
from products
on conflict (category, product_key) where product_key is not null do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  image_path = excluded.image_path,
  active = excluded.active,
  subcategory = excluded.subcategory,
  supplier_item_number = excluded.supplier_item_number,
  unit_label = excluded.unit_label,
  updated_at = now();
