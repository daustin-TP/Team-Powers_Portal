import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261124170000_smallware_catalog_categories_and_products.sql");
const storefront = read("../src/components/Uniforms.tsx");
const admin = read("../src/components/CatalogAdmin.tsx");

test("smallwares support searchable business categories and supplier details", () => {
  for (const category of ["Chemicals & Cleaning", "Pizza Tools and Accessories", "Parmesan Stuffed Crust", "Grading Tool"]) assert.match(migration, new RegExp(category.replace("&", "\\&")));
  assert.match(storefront, /catalog-category-filter/);
  assert.match(storefront, /supplierItemNumber/);
  assert.match(admin, /Smallwares category/);
  assert.match(admin, /Supplier item number/);
  assert.match(admin, /Price unit/);
});

test("all supplied products are seeded idempotently by supplier number", () => {
  for (const sku of ["6181111004", "83331111955", "3731111941", "6182260111", "407PRACK15S", "29854876", "124PPC5", "680DOMEQSHRP", "833DSP1", "833273226", "1247010S", "943BAKINGMAT", "833E201105", "680LT116620DOM", "680LT116621DOM", "2984907LXL6PK", "833E216007G3"]) assert.match(migration, new RegExp(sku));
  assert.match(migration, /on conflict \(category, supplier_item_number\)/i);
});
