# DASH SOS KPI Bridge

This folder contains the Google Apps Script bridge used by the DASH SOS server
to read and update the approved supervisor fields in the `Goal Commitments`
worksheet.

## Google Apps Script setup

1. Open **Team Powers KPI Projections & Goals**.
2. Select **Extensions → Apps Script**.
3. Name the project `DASH SOS KPI Bridge`.
4. Replace the contents of `Code.gs` with the contents of this folder's
   `Code.gs` file and save it.
5. Open **Project Settings → Script Properties**.
6. Add a property named `DASH_SOS_BRIDGE_SECRET` with a randomly generated
   value of at least 32 characters. Save the same value as a protected Supabase
   function secret later. Never put it in the frontend or GitHub.
7. Select **Deploy → New deployment → Web app**.
8. Set **Execute as** to `Me` and **Who has access** to `Anyone`.
9. Authorize the requested spreadsheet permission and copy the `/exec` URL.

The public web-app URL is safe to expose only because all POST actions require
a timestamped HMAC signature. The frontend must call a Supabase Edge Function;
it must never call this Apps Script URL directly.

## Permitted writes

The bridge writes only these `Goal Commitments` columns:

- E — Supervisor Goal
- K — Focus Area
- L — Action Plan
- M — Owner
- P — Supervisor Labor
- W — Supervisor SPLH
- AC — Supervisor Food Variance
- AI — Supervisor Load
- AO — Supervisor ADT

All projection, actual, final-goal, variance, and status formulas remain
read-only.
