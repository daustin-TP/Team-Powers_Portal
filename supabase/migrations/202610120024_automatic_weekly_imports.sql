-- Allow supervisor/admin weekly packet uploads to be stored before Dash-OS
-- detects the report family and store from each Wizardline workbook.
alter table public.report_import_batches
  drop constraint if exists report_import_batches_report_family_check;
alter table public.report_import_batches
  add constraint report_import_batches_report_family_check
  check (report_family in ('kpi_weekly','labor_sales','labor_oven_items','labor_deliveries','labor_baseline_bundle','auto_detect'));

drop policy if exists "store users read report_import_batches" on public.report_import_batches;
create policy "store users read report_import_batches" on public.report_import_batches
for select to authenticated using (
  public.can_access_store(store_id)
  or (store_id is null and public.current_portal_role() in ('supervisor','admin'))
);

drop policy if exists "store leaders manage report_import_batches" on public.report_import_batches;
create policy "store leaders manage report_import_batches" on public.report_import_batches
for all to authenticated using (
  (public.can_access_store(store_id) and public.current_portal_role() in ('manager','supervisor','admin'))
  or (store_id is null and public.current_portal_role() in ('supervisor','admin'))
) with check (
  (public.can_access_store(store_id) and public.current_portal_role() in ('manager','supervisor','admin'))
  or (store_id is null and public.current_portal_role() in ('supervisor','admin'))
);
