type HrActionType = "coaching" | "verbal_warning" | "written_warning" | "final_warning" | "suspension" | "termination";
type HrAcknowledgment = "pending" | "acknowledged" | "declined" | "not_required";
type HrStatus = "open" | "monitoring" | "completed";

export type HrRecordPdfData = {
  id: string;
  employeeName: string;
  employeeIdentifier: string;
  storeName: string;
  incidentDate: string;
  actionType: HrActionType;
  policyCategories: string[];
  incidentSummary: string;
  actionTaken: string;
  expectations: string;
  followUpDate: string;
  witnesses: string;
  acknowledgmentStatus: HrAcknowledgment;
  status: HrStatus;
  submittedByName: string;
  hireDate?: string;
  lastDateWorked?: string;
  terminationDate?: string;
  homeAddress?: string;
  employeePosition?: string;
  separationReason?: string;
  separationClassification?: string;
  separationReasons?: string[];
  separationDescription?: string;
  managerSignature?: string;
  managerSignedAt?: string;
};

type BrandImages = { crest?: string; dash?: string };

const actionLabels: Record<HrActionType, string> = {
  coaching: "Documented coaching",
  verbal_warning: "Verbal warning",
  written_warning: "Written warning",
  final_warning: "Final warning",
  suspension: "Suspension",
  termination: "Termination",
};

const categoryLabels: Record<string, string> = {
  attendance: "Attendance",
  conduct: "Conduct",
  performance: "Performance",
  safety: "Safety",
  cash_handling: "Cash handling",
  food_safety: "Food safety",
  harassment: "Harassment",
  insubordination: "Insubordination",
  other: "Other",
};

const colors = {
  navy: [12, 27, 42] as const,
  blue: [11, 134, 217] as const,
  red: [227, 27, 35] as const,
  paleBlue: [234, 245, 252] as const,
  paleGray: [243, 245, 247] as const,
  midGray: [104, 119, 133] as const,
  line: [169, 179, 188] as const,
  white: [255, 255, 255] as const,
};

const loadImage = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

export async function buildHrRecordPdf(data: HrRecordPdfData, images: BrandImages = {}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  pdf.setProperties({
    title: `${data.employeeName} - Corrective Action Record`,
    subject: "Team Powers employee corrective action record",
    author: "Team Powers - DASHos",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const contentWidth = pageWidth - margin * 2;

  const fill = (color: readonly [number, number, number]) => pdf.setFillColor(color[0], color[1], color[2]);
  const stroke = (color: readonly [number, number, number]) => pdf.setDrawColor(color[0], color[1], color[2]);
  const ink = (color: readonly [number, number, number]) => pdf.setTextColor(color[0], color[1], color[2]);

  const header = (subtitle: string) => {
    fill(colors.navy); pdf.rect(0, 0, pageWidth, 92, "F");
    if (images.crest) pdf.addImage(images.crest, "PNG", margin, 17, 58, 58, undefined, "FAST");
    else { ink(colors.white); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.text("TEAM", margin + 10, 42); pdf.text("POWERS", margin + 2, 55); }
    ink(colors.white); pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.text("EMPLOYEE CORRECTIVE ACTION RECORD", 108, 38);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); ink([217, 231, 242]); pdf.text(subtitle, 108, 57);
    if (images.dash) pdf.addImage(images.dash, "PNG", pageWidth - margin - 100, 27, 100, 34, undefined, "FAST");
    else { pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); ink(colors.white); pdf.text("DASHos", pageWidth - margin - 64, 49); }
    fill(colors.red); pdf.rect(0, 92, pageWidth / 2, 5, "F"); fill(colors.blue); pdf.rect(pageWidth / 2, 92, pageWidth / 2, 5, "F");
  };

  const footer = (page: number, total = 2) => {
    stroke([212, 219, 224]); pdf.setLineWidth(.6); pdf.line(margin, pageHeight - 26, pageWidth - margin, pageHeight - 26);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.8); ink(colors.midGray);
    pdf.text(`Team Powers | Confidential employee record | Record ${data.id.slice(0, 8).toUpperCase()}`, margin, pageHeight - 14);
    pdf.text(`Page ${page} of ${total}`, pageWidth - margin, pageHeight - 14, { align: "right" });
  };

  const choice = (x: number, y: number, checked: boolean, label: string) => {
    stroke(colors.navy); pdf.setLineWidth(.8); pdf.rect(x, y - 8, 9, 9);
    if (checked) {
      stroke(colors.blue); pdf.setLineWidth(1.5); pdf.line(x + 2, y - 3, x + 4, y - 1); pdf.line(x + 4, y - 1, x + 8, y - 7);
    }
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.8); ink(colors.navy); pdf.text(label, x + 14, y);
  };

  const optionGroup = (title: string, options: Array<{ label: string; checked: boolean }>, y: number, rowGap = 19) => {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.2); ink(colors.midGray); pdf.text(title.toUpperCase(), margin, y);
    options.forEach((option, index) => choice(margin + (index % 3) * 176, y + 19 + Math.floor(index / 3) * rowGap, option.checked, option.label));
    return y + 30 + Math.ceil(options.length / 3) * rowGap;
  };

  const fitLines = (value: string, width: number, height: number, initialSize = 8.5) => {
    let size = initialSize;
    pdf.setFontSize(size);
    let lines = pdf.splitTextToSize(value || "Not documented.", width) as string[];
    while (size > 6.2 && lines.length * size * 1.32 > height) {
      size -= .25;
      pdf.setFontSize(size);
      lines = pdf.splitTextToSize(value || "Not documented.", width) as string[];
    }
    const maximumLines = Math.max(1, Math.floor(height / (size * 1.32)));
    if (lines.length > maximumLines) {
      lines = lines.slice(0, maximumLines);
      const note = " ... [Full narrative remains in DASH-OS]";
      lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\s+$/, "")}${note}`;
    }
    return { size, lines };
  };

  const textBox = (title: string, value: string, y: number, height: number) => {
    fill(colors.paleGray); stroke(colors.line); pdf.setLineWidth(.7); pdf.roundedRect(margin, y, contentWidth, height, 5, 5, "FD");
    fill(colors.navy); pdf.rect(margin, y, contentWidth, 23, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); ink(colors.white); pdf.text(title.toUpperCase(), margin + 10, y + 15);
    pdf.setFont("helvetica", "normal");
    const fitted = fitLines(value, contentWidth - 20, height - 36);
    pdf.setFontSize(fitted.size); ink(colors.navy); pdf.text(fitted.lines, margin + 10, y + 36, { lineHeightFactor: 1.32 });
  };

  const writingBox = (title: string, prompt: string, y: number, height: number) => {
    fill(colors.paleGray); stroke(colors.line); pdf.setLineWidth(.7); pdf.roundedRect(margin, y, contentWidth, height, 5, 5, "FD");
    fill(colors.navy); pdf.rect(margin, y, contentWidth, 23, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); ink(colors.white); pdf.text(title.toUpperCase(), margin + 10, y + 15);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.2); ink(colors.midGray); pdf.text(prompt, margin + 10, y + 36);
    stroke([205, 212, 218]); pdf.setLineWidth(.4);
    for (let lineY = y + 56; lineY < y + height - 8; lineY += 20) pdf.line(margin + 10, lineY, pageWidth - margin - 10, lineY);
  };

  if (data.actionType === "termination") {
    pdf.setProperties({ title: `${data.employeeName} - Employee Separation Record`, subject: "Team Powers employee separation record" });
    header("Permanent employee separation record prepared from DASH-OS.");
    let separationY = 112;
    fill(colors.paleBlue); stroke(colors.blue); pdf.setLineWidth(.8); pdf.roundedRect(margin, separationY, contentWidth, 126, 5, 5, "FD");
    const separationIdentity = [
      ["Employee name", data.employeeName], ["Employee position", data.employeePosition || "-"],
      ["Hire date", data.hireDate || "-"], ["Last date worked", data.lastDateWorked || "-"],
      ["Date terminated", data.terminationDate || data.incidentDate], ["Store location", data.storeName],
      ["Home address", data.homeAddress || "-"], ["Prepared by", data.submittedByName],
    ];
    separationIdentity.forEach(([label, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + 12 + column * 274;
      const rowY = separationY + 18 + row * 27;
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.3); ink(colors.midGray); pdf.text(label.toUpperCase(), x, rowY);
      pdf.setFontSize(7.8); ink(colors.navy); pdf.text(String(value), x, rowY + 11, { maxWidth: 250 });
    });
    separationY += 140;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.2); ink(colors.midGray); pdf.text("CLASSIFICATION OF SEPARATION", margin, separationY);
    ["Discharge", "Layoff", "Resignation", "Other"].forEach((label, index) => choice(margin + index * 132, separationY + 20, data.separationClassification?.toLowerCase() === label.toLowerCase(), label));
    separationY += 42;
    if ((data.separationClassification || "").toLowerCase() === "discharge") {
      separationY = optionGroup("Reason for discharge", ["Conduct", "Attendance", "Performance", "Medical", "No Call/No Show"].map((label) => ({ label, checked: (data.separationReasons ?? []).includes(label) })), separationY, 18);
    } else if ((data.separationClassification || "").toLowerCase() === "resignation") {
      separationY = optionGroup("Reason for resignation", ["Relocation", "New Job", "Personal Reasons", "Retirement", "Medical", "School", "Family"].map((label) => ({ label, checked: (data.separationReasons ?? []).includes(label) })), separationY, 18);
    }
    textBox("Reason for separation", data.separationReason || data.incidentSummary, separationY, 82); separationY += 92;
    textBox("Description of circumstances of separation", data.separationDescription || "Not documented.", separationY, 174); separationY += 186;
    fill(colors.paleGray); stroke(colors.line); pdf.roundedRect(margin, separationY, contentWidth, 70, 5, 5, "FD");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); ink(colors.midGray); pdf.text("MANAGER ELECTRONIC SIGNATURE", margin + 12, separationY + 17);
    pdf.setFontSize(10); ink(colors.navy); pdf.text(data.managerSignature || "-", margin + 12, separationY + 37);
    pdf.setFontSize(7); ink(colors.midGray); pdf.text("DATE CAPTURED", margin + 330, separationY + 17);
    pdf.setFontSize(9); ink(colors.navy); pdf.text(data.managerSignedAt || "-", margin + 330, separationY + 37);
    footer(1, 1);
    return pdf;
  }

  header("Prepared from the permanent DASH-OS record for employee review and signature.");
  let y = 110;
  fill(colors.paleBlue); stroke(colors.blue); pdf.setLineWidth(.8); pdf.roundedRect(margin, y, contentWidth, 60, 5, 5, "FD");
  const identity = [
    ["Employee name", data.employeeName, margin + 12, 300], ["Employee ID", data.employeeIdentifier || "-", margin + 330, 194],
    ["Store", data.storeName, margin + 12, 300], ["Incident date", data.incidentDate, margin + 330, 194],
    ["Prepared by", data.submittedByName, margin + 12, 300], ["Record status", data.status, margin + 330, 194],
  ] as const;
  identity.forEach(([label, value, x, width], index) => {
    const rowY = y + 17 + Math.floor(index / 2) * 18;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.5); ink(colors.midGray); pdf.text(label.toUpperCase(), x, rowY);
    stroke(colors.line); pdf.setLineWidth(.5); pdf.line(x + 72, rowY + 1, x + width, rowY + 1);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.6); ink(colors.navy); pdf.text(String(value), x + 75, rowY - 2, { maxWidth: width - 76 });
  });
  y += 72;
  y = optionGroup("Action level", Object.entries(actionLabels).map(([value, label]) => ({ label, checked: data.actionType === value })), y, 18);
  y = optionGroup("Policy categories", Object.entries(categoryLabels).map(([value, label]) => ({ label, checked: data.policyCategories.includes(value) })), y, 17);
  textBox("Incident summary", data.incidentSummary, y, 130); y += 138;
  textBox("Action taken", data.actionTaken, y, 100); y += 108;
  textBox("Expected correction", data.expectations || "No additional expectations documented.", y, 80); y += 93;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.6); ink(colors.midGray); pdf.text("FOLLOW-UP DATE", margin, y); pdf.text("WITNESSES", margin + 205, y);
  stroke(colors.line); pdf.line(margin + 72, y + 1, margin + 188, y + 1); pdf.line(margin + 260, y + 1, pageWidth - margin, y + 1);
  pdf.setFontSize(7.5); ink(colors.navy); pdf.text(data.followUpDate || "-", margin + 76, y - 2); pdf.text(data.witnesses || "-", margin + 264, y - 2, { maxWidth: contentWidth - 264 });
  footer(1);

  pdf.addPage("letter", "portrait");
  header("Employee response, acknowledgment, signatures, and management follow-up.");
  writingBox("Employee comments", "The employee may explain their perspective, provide context, or note disagreement.", 110, 180);
  y = 304;
  fill(colors.paleBlue); stroke(colors.blue); pdf.roundedRect(margin, y, contentWidth, 82, 5, 5, "FD");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); ink(colors.navy); pdf.text("EMPLOYEE ACKNOWLEDGMENT", margin + 12, y + 18);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.2); pdf.text("My signature confirms that I received and discussed this corrective action. It does not necessarily mean that I agree.", margin + 12, y + 35);
  choice(margin + 12, y + 63, data.acknowledgmentStatus === "acknowledged", "Acknowledged");
  choice(margin + 190, y + 63, data.acknowledgmentStatus === "declined", "Employee declined to sign");
  choice(margin + 404, y + 63, data.acknowledgmentStatus === "not_required", "Not required");
  y += 100;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.2); ink(colors.midGray); pdf.text("SIGNATURES", margin, y);
  const signatureRows = ["Employee signature", "Manager signature", "Witness / District Manager"];
  signatureRows.forEach((label, index) => {
    const rowY = y + 27 + index * 31;
    pdf.setFontSize(6.5); pdf.text(label.toUpperCase(), margin, rowY);
    stroke(colors.line); pdf.line(margin + 122, rowY + 1, margin + 355, rowY + 1);
    pdf.text("DATE", margin + 374, rowY); pdf.line(margin + 403, rowY + 1, pageWidth - margin, rowY + 1);
  });
  y += 120;
  writingBox("Management follow-up", "Document progress, additional coaching, or completion of the corrective action.", y, 115);
  y += 130;
  y = optionGroup("Record status", [
    { label: "Open", checked: data.status === "open" },
    { label: "Monitoring", checked: data.status === "monitoring" },
    { label: "Completed", checked: data.status === "completed" },
  ], y, 18);
  footer(2);
  return pdf;
}

export async function openHrRecordPdf(data: HrRecordPdfData) {
  const previewWindow = window.open("", "_blank");
  if (previewWindow) {
    previewWindow.document.title = "Preparing HR record PDF";
    previewWindow.document.body.innerHTML = `<p style="font:600 16px Arial;padding:24px">Preparing the ${data.actionType === "termination" ? "employee separation" : "two-page portrait HR"} record...</p>`;
  }
  try {
    const [crest, dash] = await Promise.all([
      loadImage("/team-powers-crest.png").catch(() => undefined),
      loadImage("/dash-sos-logo.png").catch(() => undefined),
    ]);
    const pdf = await buildHrRecordPdf(data, { crest, dash });
    const url = URL.createObjectURL(pdf.output("blob"));
    if (previewWindow) {
      previewWindow.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 120000);
    } else {
      pdf.save(`${data.employeeName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${data.actionType === "termination" ? "employee-separation" : "corrective-action"}.pdf`);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    previewWindow?.close();
    throw error;
  }
}
