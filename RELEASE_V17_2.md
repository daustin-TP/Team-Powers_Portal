# Dash-OS KPI Dashboard — V17.2

## KPI loading correction

- Weekly Metric Totals now loads the selected week's KPI Database results
  independently from supervisor commitments.
- Its loading message now reads `Loading weekly KPI results…`.
- The store selector in Weekly Metric Totals is generated from the available
  weekly result rows rather than the Goal Commitments worksheet.
- The Commitments endpoint is called only while the Commitments view is active.
- The Weekly Metrics endpoint is called only while Weekly Metric Totals is
  active.

This is a website-only update. The V17.1 Google Apps Script and Supabase Edge
Function remain current. No additional SQL or secret changes are required.
