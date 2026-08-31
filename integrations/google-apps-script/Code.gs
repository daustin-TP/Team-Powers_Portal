/**
 * DASH SOS KPI Bridge
 *
 * Deploy this as a Google Apps Script web app that executes as the deploying
 * user. Only the DASH SOS server should call it. Browser clients must never
 * receive the bridge secret or call this endpoint directly.
 */

const DASH_SOS_CONFIG = Object.freeze({
  spreadsheetId: "1zqG0RJ_pBwom9HDgUuledLrOXyrDLygVgRjZzD0g0nk",
  commitmentsSheet: "Goal Commitments",
  databaseSheet: "KPI Database",
  headerRow: 3,
  firstDataRow: 4,
  lastColumn: 54, // BB
  databaseFirstDataRow: 2,
  databaseLastColumn: 30, // AD
  signatureWindowSeconds: 300,
});

const DASH_SOS_EDITABLE_FIELDS = Object.freeze({
  supervisor_sales_goal: { column: 5, type: "number" }, // E
  focus_area: { column: 11, type: "focus" }, // K
  action_plan: { column: 12, type: "text" }, // L
  owner: { column: 13, type: "text" }, // M
  supervisor_labor_goal: { column: 16, type: "percent" }, // P
  supervisor_splh_goal: { column: 24, type: "number" }, // X
  supervisor_food_variance_goal: { column: 31, type: "percent" }, // AE
  supervisor_load_goal: { column: 38, type: "number" }, // AL
  supervisor_adt_goal: { column: 45, type: "number" }, // AS
});

const DASH_SOS_FOCUS_AREAS = Object.freeze([
  "Sales",
  "Labor",
  "Food",
  "Service",
  "Staffing",
  "Marketing",
  "Operations",
]);

function doGet() {
  return dashSosJson_({
    ok: true,
    service: "DASH SOS KPI Bridge",
    version: 1,
  });
}

function doPost(event) {
  try {
    const envelope = dashSosParseEnvelope_(event);
    dashSosVerifySignature_(envelope);
    const request = JSON.parse(envelope.body);
    const result = dashSosHandleRequest_(request);
    return dashSosJson_({ ok: true, result: result });
  } catch (error) {
    console.error(error);
    return dashSosJson_({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function dashSosHandleRequest_(request) {
  if (!request || typeof request.action !== "string") {
    throw new Error("A valid action is required.");
  }

  switch (request.action) {
    case "health":
      return dashSosHealth_();
    case "get_commitments":
      return dashSosGetCommitments_(request);
    case "get_weekly_metrics":
      return dashSosGetWeeklyMetrics_(request);
    case "update_commitment":
      return dashSosUpdateCommitment_(request);
    default:
      throw new Error("Unsupported action.");
  }
}

function dashSosGetWeeklyMetrics_(request) {
  const weekEnd = dashSosRequireDateKey_(request.week_end);
  const allowedStores = dashSosNormalizeStores_(request.stores);
  const sheet = dashSosDatabaseSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < DASH_SOS_CONFIG.databaseFirstDataRow) return [];

  const rowCount = lastRow - DASH_SOS_CONFIG.databaseFirstDataRow + 1;
  const range = sheet.getRange(
    DASH_SOS_CONFIG.databaseFirstDataRow,
    1,
    rowCount,
    DASH_SOS_CONFIG.databaseLastColumn,
  );
  const values = range.getValues();
  const displayValues = range.getDisplayValues();
  const timeZone = dashSosSpreadsheet_().getSpreadsheetTimeZone();
  const results = [];

  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    const store = String(row[0] || "").trim();
    const rowWeekEnd = dashSosDateKey_(row[1], timeZone);
    if (!store || rowWeekEnd !== weekEnd) continue;
    if (allowedStores && !allowedStores.has(store)) continue;
    results.push(dashSosSerializeWeeklyMetrics_(row, displayValues[index], timeZone));
  }
  return results;
}

function dashSosSerializeWeeklyMetrics_(values, displayValues, timeZone) {
  return {
    store: String(values[0] || ""),
    week_end: dashSosDateKey_(values[1], timeZone),
    metrics: {
      avg_adt: displayValues[2],
      adt_under_30_percent: displayValues[3],
      extreme_order_count: displayValues[4],
      extreme_order_percent: displayValues[5],
      avg_wait: displayValues[6],
      singles_percent: displayValues[7],
      new_customers: displayValues[8],
      cheese_variance: displayValues[9],
      pepperoni_variance: displayValues[10],
      dough_variance: displayValues[11],
      average_ticket: displayValues[12],
      st_jude_net: displayValues[13],
      royalty_sales: displayValues[14],
      sales_last_year: displayValues[15],
      yoy_sales_percent: displayValues[16],
      order_count: displayValues[17],
      orders_last_year: displayValues[18],
      order_growth_percent: displayValues[19],
      labor_dollars: displayValues[20],
      labor_percent: displayValues[21],
      splh: displayValues[22],
      ot_hours: displayValues[23],
      actual_food_percent: displayValues[24],
      ideal_food_percent: displayValues[25],
      food_difference_dollars: displayValues[26],
      food_difference_percent: displayValues[27],
      cash_over_short: displayValues[28],
      avg_load: displayValues[29],
    },
  };
}

function dashSosHealth_() {
  const spreadsheet = dashSosSpreadsheet_();
  return {
    spreadsheet_title: spreadsheet.getName(),
    spreadsheet_time_zone: spreadsheet.getSpreadsheetTimeZone(),
    editable_fields: Object.keys(DASH_SOS_EDITABLE_FIELDS),
  };
}

function dashSosGetCommitments_(request) {
  const weekEnd = dashSosRequireDateKey_(request.week_end);
  const allowedStores = dashSosNormalizeStores_(request.stores);
  const sheet = dashSosCommitmentsSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < DASH_SOS_CONFIG.firstDataRow) return [];

  const rowCount = lastRow - DASH_SOS_CONFIG.firstDataRow + 1;
  const range = sheet.getRange(
    DASH_SOS_CONFIG.firstDataRow,
    1,
    rowCount,
    DASH_SOS_CONFIG.lastColumn,
  );
  const values = range.getValues();
  const displayValues = range.getDisplayValues();
  const timeZone = dashSosSpreadsheet_().getSpreadsheetTimeZone();
  const results = [];

  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    const rowWeekEnd = dashSosDateKey_(row[0], timeZone);
    const store = String(row[1] || "").trim();

    if (rowWeekEnd !== weekEnd || !store) continue;
    if (allowedStores && !allowedStores.has(store)) continue;

    results.push(
      dashSosSerializeCommitment_(
        DASH_SOS_CONFIG.firstDataRow + index,
        row,
        displayValues[index],
        timeZone,
      ),
    );
  }

  return results;
}

function dashSosUpdateCommitment_(request) {
  const weekEnd = dashSosRequireDateKey_(request.week_end);
  const store = String(request.store || "").trim();
  const changes = request.changes;

  if (!store) throw new Error("A store is required.");
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new Error("A changes object is required.");
  }

  const changeKeys = Object.keys(changes);
  if (changeKeys.length === 0) throw new Error("No changes were provided.");

  changeKeys.forEach(function (key) {
    if (!DASH_SOS_EDITABLE_FIELDS[key]) {
      throw new Error("Field is not editable: " + key);
    }
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sheet = dashSosCommitmentsSheet_();
    const rowNumber = dashSosFindCommitmentRow_(sheet, weekEnd, store);

    changeKeys.forEach(function (key) {
      const field = DASH_SOS_EDITABLE_FIELDS[key];
      const value = dashSosValidateValue_(key, changes[key], field.type);
      sheet.getRange(rowNumber, field.column).setValue(value);
    });

    SpreadsheetApp.flush();

    const range = sheet.getRange(
      rowNumber,
      1,
      1,
      DASH_SOS_CONFIG.lastColumn,
    );
    const values = range.getValues()[0];
    const displayValues = range.getDisplayValues()[0];

    return dashSosSerializeCommitment_(
      rowNumber,
      values,
      displayValues,
      dashSosSpreadsheet_().getSpreadsheetTimeZone(),
    );
  } finally {
    lock.releaseLock();
  }
}

function dashSosFindCommitmentRow_(sheet, weekEnd, store) {
  const lastRow = sheet.getLastRow();
  if (lastRow < DASH_SOS_CONFIG.firstDataRow) {
    throw new Error("The commitments ledger is empty.");
  }

  const rowCount = lastRow - DASH_SOS_CONFIG.firstDataRow + 1;
  const keys = sheet
    .getRange(DASH_SOS_CONFIG.firstDataRow, 1, rowCount, 2)
    .getValues();
  const timeZone = dashSosSpreadsheet_().getSpreadsheetTimeZone();

  for (let index = 0; index < keys.length; index += 1) {
    const rowWeekEnd = dashSosDateKey_(keys[index][0], timeZone);
    const rowStore = String(keys[index][1] || "").trim();
    if (rowWeekEnd === weekEnd && rowStore === store) {
      return DASH_SOS_CONFIG.firstDataRow + index;
    }
  }

  throw new Error("No commitment row was found for that week and store.");
}

function dashSosSerializeCommitment_(rowNumber, values, displayValues, timeZone) {
  return {
    row_number: rowNumber,
    week_end: dashSosDateKey_(values[0], timeZone),
    store: String(values[1] || ""),
    sales: {
      model_projection: displayValues[2],
      recommended_goal: displayValues[3],
      supervisor_goal: values[4] === "" ? null : values[4],
      actual: displayValues[5],
      final_goal: displayValues[6],
      variance: displayValues[7],
      variance_percent: displayValues[8],
      status: displayValues[9],
    },
    accountability: {
      focus_area: String(values[10] || ""),
      action_plan: String(values[11] || ""),
      owner: String(values[12] || ""),
    },
    labor: dashSosMetric_(values, displayValues, 13, 14, 15, 16, 17, 20),
    splh: dashSosMetric_(values, displayValues, 21, 22, 23, 24, 25, 27),
    food_variance: dashSosMetric_(values, displayValues, 28, 29, 30, 31, 32, 34),
    load: dashSosMetric_(values, displayValues, 35, 36, 37, 38, 39, 41),
    adt: dashSosMetric_(values, displayValues, 42, 43, 44, 45, 46, 48),
    extreme_orders: {
      actual: displayValues[49],
      goal: displayValues[50],
      variance: displayValues[51],
      status: displayValues[52],
    },
    overall_status: displayValues[53],
  };
}

function dashSosMetric_(values, displayValues, trajectory, suggested, supervisor, actual, finalGoal, status) {
  return {
    trajectory: displayValues[trajectory],
    suggested_goal: displayValues[suggested],
    supervisor_goal: values[supervisor] === "" ? null : values[supervisor],
    actual: displayValues[actual],
    final_goal: displayValues[finalGoal],
    status: displayValues[status],
  };
}

function dashSosValidateValue_(key, value, type) {
  if (value === null || value === undefined || value === "") return "";

  if (type === "number" || type === "percent") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(key + " must be a number.");
    if (Math.abs(number) > 10000000) throw new Error(key + " is outside the allowed range.");
    if (type === "percent") {
      if (Math.abs(number) > 100) throw new Error(key + " must be between -100% and 100%.");
      return Math.abs(number) > 1 ? number / 100 : number;
    }
    return number;
  }

  const text = String(value).trim();
  if (type === "focus" && DASH_SOS_FOCUS_AREAS.indexOf(text) === -1) {
    throw new Error("Focus Area must match the spreadsheet dropdown.");
  }
  if (text.length > 2000) throw new Error(key + " is too long.");
  return text;
}

function dashSosNormalizeStores_(stores) {
  if (stores === undefined || stores === null) return null;
  if (!Array.isArray(stores)) throw new Error("stores must be an array.");
  return new Set(
    stores.map(function (store) {
      return String(store).trim();
    }).filter(Boolean),
  );
}

function dashSosRequireDateKey_(value) {
  const dateKey = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("week_end must use YYYY-MM-DD format.");
  }
  return dateKey;
}

function dashSosDateKey_(value, timeZone) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, timeZone, "yyyy-MM-dd");
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return "";
}

function dashSosSpreadsheet_() {
  return SpreadsheetApp.openById(DASH_SOS_CONFIG.spreadsheetId);
}

function dashSosCommitmentsSheet_() {
  const sheet = dashSosSpreadsheet_().getSheetByName(
    DASH_SOS_CONFIG.commitmentsSheet,
  );
  if (!sheet) throw new Error("Goal Commitments sheet was not found.");
  return sheet;
}

function dashSosDatabaseSheet_() {
  const sheet = dashSosSpreadsheet_().getSheetByName(DASH_SOS_CONFIG.databaseSheet);
  if (!sheet) throw new Error("KPI Database sheet was not found.");
  return sheet;
}

function dashSosParseEnvelope_(event) {
  const raw = event && event.postData ? event.postData.contents : "";
  if (!raw) throw new Error("Request body is required.");
  const envelope = JSON.parse(raw);

  if (
    !envelope ||
    typeof envelope.timestamp !== "number" ||
    typeof envelope.body !== "string" ||
    typeof envelope.signature !== "string"
  ) {
    throw new Error("Invalid signed request envelope.");
  }
  return envelope;
}

function dashSosVerifySignature_(envelope) {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - envelope.timestamp) > DASH_SOS_CONFIG.signatureWindowSeconds) {
    throw new Error("Request timestamp is outside the allowed window.");
  }

  const secret = PropertiesService.getScriptProperties().getProperty(
    "DASH_SOS_BRIDGE_SECRET",
  );
  if (!secret || secret.length < 32) {
    throw new Error("Bridge secret is not configured.");
  }

  const message = String(envelope.timestamp) + "." + envelope.body;
  const bytes = Utilities.computeHmacSha256Signature(
    message,
    secret,
    Utilities.Charset.UTF_8,
  );
  const expected = bytes
    .map(function (byte) {
      return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0");
    })
    .join("");

  if (!dashSosConstantTimeEqual_(expected, envelope.signature.toLowerCase())) {
    throw new Error("Invalid request signature.");
  }
}

function dashSosConstantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function dashSosJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
