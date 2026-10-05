-- Permit a supervisor to upload a multi-store ZIP of Wizardline labor reports.
alter table public.report_import_batches
  drop constraint if exists report_import_batches_report_family_check;
alter table public.report_import_batches
  add constraint report_import_batches_report_family_check
  check (report_family in ('kpi_weekly','labor_sales','labor_oven_items','labor_deliveries','labor_baseline_bundle'));
