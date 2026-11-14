import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const migration=read("../supabase/migrations/20261114161614_equipment_inventory.sql");
const equipment=read("../src/components/EquipmentInventory.tsx");
const maintenance=read("../src/components/SupportTickets.tsx");

test("maintenance equipment supports the requested categories and custom labels",()=>{
  for(const category of ["Oven","Walk-In","Makeline","Reach-In Cooler","Heat Rack","Other"]){
    assert.match(migration,new RegExp(category.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  }
  assert.match(migration,/label text not null/i);
  assert.match(migration,/make text not null/i);
  assert.match(migration,/model text not null/i);
  assert.match(migration,/serial_number text not null/i);
  assert.match(equipment,/Left Makeline/);
});

test("equipment pictures use a private store-scoped bucket",()=>{
  assert.match(migration,/values\('equipment-images','equipment-images',false/i);
  assert.match(migration,/can_manage_maintenance_equipment/);
  assert.match(equipment,/createSignedUrl\(path,1800\)/);
  assert.match(equipment,/storage\.from\("equipment-images"\)\.upload/);
});

test("each equipment item exposes its dated maintenance history immediately",()=>{
  assert.match(migration,/create table if not exists public\.maintenance_equipment_service_logs/i);
  assert.match(migration,/service_date date not null/i);
  assert.match(migration,/work_performed text not null/i);
  assert.match(equipment,/Service history/);
  assert.match(equipment,/Add maintenance entry/);
  assert.match(equipment,/maintenance_equipment_service_logs\(id,service_date,work_performed/);
});

test("the equipment registry appears only at the top of maintenance requests",()=>{
  assert.match(maintenance,/area==="maintenance"&&<EquipmentInventory/);
});
