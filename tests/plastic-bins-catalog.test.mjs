import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261124174500_plastic_bins_and_lids.sql", "utf8");
const cornmealMigration = readFileSync("supabase/migrations/20261124175500_add_cornmeal_bin.sql", "utf8");
const thermometerMigration = readFileSync("supabase/migrations/20261124180500_add_thermometers.sql", "utf8");
const handToolsMigration = readFileSync("supabase/migrations/20261124182000_add_kitchen_hand_tools.sql", "utf8");
const squeezeMigration = readFileSync("supabase/migrations/20261124183500_add_squeeze_bottles_and_caps.sql", "utf8");
const pansMigration = readFileSync("supabase/migrations/20261124185000_add_pans_discs_and_personal_domino.sql", "utf8");

test("plastic bins and lids use brand-neutral identities to prevent duplicate manager choices", () => {
  assert.match(migration, /add column if not exists product_key/);
  assert.match(migration, /catalog_items_product_key_unique/);
  assert.match(migration, /on conflict \(category, product_key\)/);
  assert.match(migration, /Plastic Bins and Lids/);
  assert.doesNotMatch(migration, /2711096730|27110773/);
});

test("the tabletop cornmeal bin is included as one brand-neutral product", () => {
  assert.match(cornmealMigration, /cornmeal-bin-tabletop/);
  assert.match(cornmealMigration, /70014CL/);
  assert.match(cornmealMigration, /Tabletop Cornmeal Bin/);
});

test("thermometers are grouped as two unique functional products", () => {
  assert.match(thermometerMigration, /Thermometers/);
  assert.match(thermometerMigration, /27324HP011/);
  assert.match(thermometerMigration, /273DFP450W08/);
  assert.match(thermometerMigration, /thermometer-oven-dial-2-inch/);
  assert.match(thermometerMigration, /thermometer-waterproof-pocket-probe/);
});

test("kitchen hand tools move the existing pie spoodle instead of duplicating it", () => {
  assert.match(handToolsMigration, /Kitchen Hand Tools/);
  assert.match(handToolsMigration, /where category = 'smallware'[\s\S]*supplier_item_number = '29854876'/);
  const productRows = handToolsMigration.match(/'29854876'/g) ?? [];
  assert.equal(productRows.length, 2);
  for (const supplierNumber of ["616DFCNSFR", "99991534", "176PCSCOOP12", "29857608", "667E9214", "667E201187", "690FG19050WH"]) {
    assert.match(handToolsMigration, new RegExp(supplierNumber));
  }
});

test("squeeze bottles and color-coded caps remain distinct operational choices", () => {
  assert.match(squeezeMigration, /Squeeze Bottles and Caps/);
  for (const supplierNumber of ["9224916J13CS", "2984924J13CS", "298491913CS", "2983300191CS", "298330002CS", "21496SKRF", "8883300PURP", "8883300GRN", "8883300BL", "8883300YL", "8883300CL", "8883300RD", "8884913CL", "8883300BR"]) {
    assert.match(squeezeMigration, new RegExp(supplierNumber));
  }
  assert.match(squeezeMigration, /298491913CS','Case',false/);
});

test("pizza disks are distinct by size and Personal Domino separates its kit from its lid", () => {
  assert.match(pansMigration, /Pans, Discs, Screens/);
  assert.match(pansMigration, /Personal Domino/);
  for (const supplierNumber of ["667E208065", "680DOMQ4010DF", "680DOMQ4016DF", "680DOMQ4014DF", "680DOMQ4012DF", "680DOM14777RND", "680KIT117003", "680RCT116911"]) {
    assert.match(pansMigration, new RegExp(supplierNumber));
  }
});

test("all unique supplied bin and lid products are included", () => {
  const expectedSupplierNumbers = [
    "247FP136BK", "247FP166BK", "247FP196BK", "247FP112CL", "247FP116BK",
    "247FP116CL", "247FP11LFCL", "247FP138BK", "247FP194CL", "247FP194BK",
    "247R12TR", "247RLID12BL", "247FP16LFCL", "70060S", "247FP19LCL",
    "70096CL", "247FP126CL", "247FP136CL", "247FP138CL", "247FP13LFCL",
  ];
  for (const supplierNumber of expectedSupplierNumbers) assert.match(migration, new RegExp(supplierNumber));
});
