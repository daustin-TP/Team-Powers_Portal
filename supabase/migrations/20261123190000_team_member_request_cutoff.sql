create or replace function public.enforce_team_member_request_cutoff()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  central_today date := (timezone('America/Chicago', now()))::date;
begin
  if new.request_kind = 'one_time'
     and exists (
       select 1
       from unnest(coalesce(new.selected_dates, array[]::date[])) as requested_date
       where (date_trunc('week', requested_date::timestamp)::date - 8) < central_today
     ) then
    raise exception using
      errcode = '22023',
      message = 'Request-off cutoff has passed. Requests close the Sunday before managers begin that schedule.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_team_member_request_cutoff on public.team_member_availability_requests;
create trigger enforce_team_member_request_cutoff
before insert on public.team_member_availability_requests
for each row execute function public.enforce_team_member_request_cutoff();

comment on function public.enforce_team_member_request_cutoff() is
  'Blocks employee one-time requests after the Sunday preceding the manager schedule-building week. Uses America/Chicago business dates.';
