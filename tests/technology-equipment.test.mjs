import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const migration=read("../supabase/migrations/20261114165137_technology_equipment_and_troubleshooting.sql");
const constants=read("../src/lib/technologyEquipment.ts");
const support=read("../src/components/SupportTickets.tsx");
const equipment=read("../src/components/TechnologyEquipment.tsx");
const troubleshooting=read("../src/components/TroubleshootingLibrary.tsx");
const issueFirstMigration=read("../supabase/migrations/20261124113000_issue_first_technology_troubleshooting.sql");

test("technology equipment includes every requested device type",()=>{
  for(const type of ["Modem","Powers Router","Dominos Router","24 Port Meraki Switch","Turbo King Router","Caller ID Box","Security Cameras","Back Office Computer","Front Counter Computer","Makeline Computer","Dispatch Computer","Cut Table Tech Computer","Touchscreens","TV's","Computer Monitors (non-touchscreen)","Credit Card Machines (Customer Facing)","Credit Card Machines (Manual Entry, wired)","Credit Card Machines (Manual Entry Wireless)","Store Laptop","Office Printer","Receipt Printer (CTT)","Receipt Printer (Dispatch)","Other"]){
    assert.match(constants,new RegExp(type.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  }
});

test("technology has separate equipment and troubleshooting pages",()=>{
  assert.match(support,/Technology equipment/);
  assert.match(support,/Troubleshooting/);
  assert.match(support,/technology-equipment/);
  assert.match(support,/troubleshooting/);
  assert.match(equipment,/technology_equipment/);
  assert.match(troubleshooting,/technology_troubleshooting_guides/);
});

test("technology tickets can identify a type and registered device",()=>{
  assert.match(migration,/technology_equipment_type/);
  assert.match(migration,/technology_equipment_id/);
  assert.match(support,/Specific store equipment/);
  assert.match(support,/technology_equipment_id:/);
});

test("technology data is store scoped and protected with RLS",()=>{
  assert.match(migration,/alter table public\.technology_equipment enable row level security/i);
  assert.match(migration,/can_manage_technology_equipment/);
  assert.match(migration,/technology-equipment-images/);
  assert.match(migration,/technology_troubleshooting_guides enable row level security/i);
});

test("troubleshooting is organized around common store issues instead of equipment records",()=>{
  for(const issue of ["Internet & Network","Computers & POS","Card Payments","Printers","Phones & Caller ID","Screens & Touchscreens","Security Cameras","Software & Accounts","Other / Not Sure"]){
    assert.ok(troubleshooting.includes(issue),`${issue} should be available`);
  }
  assert.match(troubleshooting,/Start with what is happening, not the piece of equipment/);
  assert.match(troubleshooting,/issue_category/);
  assert.doesNotMatch(troubleshooting,/technologyEquipmentTypes/);
  assert.match(issueFirstMigration,/alter column equipment_type drop not null/i);
  assert.match(issueFirstMigration,/technology_troubleshooting_guide_issue_title_unique/);
});
