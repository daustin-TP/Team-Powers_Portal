begin;

alter table public.hr_disciplinary_actions
  drop constraint hr_disciplinary_actions_policy_category_check;

alter table public.hr_disciplinary_actions
  alter column policy_category drop default,
  alter column policy_category type text[] using array[policy_category];

alter table public.hr_disciplinary_actions
  rename column policy_category to policy_categories;

alter table public.hr_disciplinary_actions
  alter column policy_categories set default array['other']::text[];

alter table public.hr_disciplinary_actions
  add constraint hr_disciplinary_actions_policy_categories_check
  check (
    cardinality(policy_categories) between 1 and 9
    and array_position(policy_categories, null) is null
    and policy_categories <@ array[
      'attendance',
      'conduct',
      'performance',
      'safety',
      'cash_handling',
      'food_safety',
      'harassment',
      'insubordination',
      'other'
    ]::text[]
  );

comment on column public.hr_disciplinary_actions.policy_categories is
  'One or more policy categories associated with the corrective action.';

commit;
