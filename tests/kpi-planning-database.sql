-- Run after the migration. All test writes are rolled back.
begin;
do $$
declare s uuid; target date := date_trunc('week',now() at time zone 'America/Chicago')::date+699; blocked boolean;
begin
 select id into s from public.stores where active and store_number is not null limit 1;
 if s is null then raise exception 'An active store is required for integration tests'; end if;
 insert into public.kpi_goal_commitments(store_id,week_end,goals) values(s,target,'{"sales":100}');
 update public.kpi_goal_commitments set goals='{"sales":200}' where store_id=s and week_end=target;
 if (select goals->>'sales' from public.kpi_goal_commitments where store_id=s and week_end=target)<>'200' then raise exception 'Future update failed';end if;
 blocked:=false;
 begin insert into public.kpi_goal_commitments(store_id,week_end,goals) values(s,'2000-01-02','{}'); exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Past goal insertion was permitted';end if;
 blocked:=false;
 begin update public.kpi_goal_commitments set week_end=target+7 where store_id=s and week_end=target;exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Moving a commitment was permitted';end if;
 insert into public.kpi_weekly_results(store_id,week_end,metrics) values(s,target,'{"royalty_sales":150}');
 blocked:=false;
 begin update public.kpi_goal_commitments set goals='{"sales":150}' where store_id=s and week_end=target;exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Results did not lock the goals';end if;
 blocked:=false;
 begin delete from public.kpi_goal_commitments where store_id=s and week_end=target;exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Goal deletion was permitted';end if;
 if has_table_privilege('authenticated','public.kpi_regional_plans','select') or has_table_privilege('anon','public.kpi_automatic_goals','insert') or has_table_privilege('service_role','public.kpi_automatic_goals','update') then raise exception 'Unexpected direct table permissions';end if;
 insert into public.kpi_automatic_goals(store_id,week_end,goals) values(s,target,'{"sales":100}');
 insert into public.kpi_automatic_goals(store_id,week_end,goals) values(s,target,'{"sales":999}') on conflict(store_id,week_end) do nothing;
 if (select goals->>'sales' from public.kpi_automatic_goals where store_id=s and week_end=target)<>'100' then raise exception 'Automatic snapshot changed';end if;
end $$;
rollback;
