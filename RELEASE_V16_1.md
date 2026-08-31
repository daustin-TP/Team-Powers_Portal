# Dash-OS KPI Dashboard — V16.1 Login Hotfix

This package contains the complete V16 KPI Dashboard plus a login-safety fix.

The portal now loads an active employee's core profile before requesting the
new KPI permission records. If the KPI migration has not been applied yet, or
Supabase has not refreshed its relationship cache, that optional lookup can no
longer send an otherwise active user to the "Access isn't active yet" screen.

The Supabase KPI migration and `kpi-bridge` deployment are still required for
the KPI Dashboard itself.
