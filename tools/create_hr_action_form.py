from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Team_Powers_Employee_Corrective_Action_Form.pdf"
CREST = ROOT / "public" / "team-powers-crest.png"
DASH = ROOT / "public" / "dash-sos-logo.png"

PAGE_W, PAGE_H = letter
MARGIN = 42
NAVY = HexColor("#0C1B2A")
BLUE = HexColor("#0B86D9")
RED = HexColor("#E31B23")
LIGHT_BLUE = HexColor("#EAF5FC")
LIGHT_GRAY = HexColor("#F3F5F7")
MID_GRAY = HexColor("#687785")
LINE = HexColor("#A9B3BC")


def text(c, x, y, value, size=9, bold=False, color=NAVY):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(x, y, value)


def checkbox(c, x, y, label, size=8.5):
    c.setStrokeColor(NAVY)
    c.setLineWidth(0.8)
    c.rect(x, y - 2, 9, 9, fill=0, stroke=1)
    text(c, x + 14, y, label, size=size)


def field_line(c, x, y, width, label, label_width=None):
    text(c, x, y, label.upper(), size=6.8, bold=True, color=MID_GRAY)
    start = x + (label_width or max(58, len(label) * 4.6))
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(start, y - 1, x + width, y - 1)


def ruled_box(c, x, y_top, width, height, title, prompt=None, lines=5):
    c.setFillColor(LIGHT_GRAY)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(x, y_top - height, width, height, 5, fill=1, stroke=1)
    c.setFillColor(NAVY)
    c.rect(x, y_top - 25, width, 25, fill=1, stroke=0)
    text(c, x + 10, y_top - 17, title.upper(), size=8.5, bold=True, color=white)
    if prompt:
        text(c, x + 10, y_top - 38, prompt, size=7.3, color=MID_GRAY)
    content_top = y_top - (49 if prompt else 36)
    content_bottom = y_top - height + 12
    if lines > 0:
        spacing = (content_top - content_bottom) / lines
        c.setStrokeColor(HexColor("#CDD4DA"))
        c.setLineWidth(0.45)
        for index in range(lines):
            yy = content_top - (index + 1) * spacing
            c.line(x + 10, yy, x + width - 10, yy)


def header(c, page_number, subtitle):
    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - 94, PAGE_W, 94, fill=1, stroke=0)
    if CREST.exists():
        c.drawImage(ImageReader(CREST), MARGIN, PAGE_H - 87, width=60, height=60, preserveAspectRatio=True, mask="auto")
    text(c, 112, PAGE_H - 42, "EMPLOYEE CORRECTIVE ACTION RECORD", size=15, bold=True, color=white)
    text(c, 112, PAGE_H - 60, subtitle, size=8.5, color=HexColor("#D9E7F2"))
    if DASH.exists():
        c.drawImage(ImageReader(DASH), PAGE_W - MARGIN - 100, PAGE_H - 73, width=100, height=34, preserveAspectRatio=True, mask="auto")
    c.setFillColor(RED)
    c.rect(0, PAGE_H - 99, PAGE_W / 2, 5, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.rect(PAGE_W / 2, PAGE_H - 99, PAGE_W / 2, 5, fill=1, stroke=0)
    text(c, MARGIN, 24, "Team Powers | Confidential employee record", size=7, color=MID_GRAY)
    c.setFont("Helvetica", 7)
    c.drawRightString(PAGE_W - MARGIN, 24, f"Page {page_number} of 2")


def page_one(c):
    header(c, 1, "Complete in ink. Give the employee an opportunity to respond before signatures.")
    y = PAGE_H - 126
    c.setFillColor(LIGHT_BLUE)
    c.setStrokeColor(BLUE)
    c.roundRect(MARGIN, y - 84, PAGE_W - 2 * MARGIN, 84, 5, fill=1, stroke=1)
    field_line(c, MARGIN + 12, y - 20, 310, "Employee name")
    field_line(c, MARGIN + 334, y - 20, 148, "Employee ID", 58)
    field_line(c, MARGIN + 12, y - 46, 238, "Store")
    field_line(c, MARGIN + 262, y - 46, 122, "Incident date", 64)
    field_line(c, MARGIN + 396, y - 46, 86, "Time", 28)
    field_line(c, MARGIN + 12, y - 72, 238, "Prepared by")
    field_line(c, MARGIN + 262, y - 72, 220, "Title", 30)

    y -= 103
    text(c, MARGIN, y, "ACTION LEVEL", size=7.5, bold=True, color=MID_GRAY)
    action_labels = ["Documented coaching", "Verbal warning", "Written warning", "Final warning", "Suspension", "Termination"]
    for index, label in enumerate(action_labels):
        checkbox(c, MARGIN + (index % 3) * 174, y - 22 - (index // 3) * 22, label)

    y -= 67
    text(c, MARGIN, y, "POLICY CATEGORY", size=7.5, bold=True, color=MID_GRAY)
    categories = ["Attendance", "Conduct", "Performance", "Safety", "Cash handling", "Food safety", "Harassment", "Insubordination", "Other"]
    for index, label in enumerate(categories):
        checkbox(c, MARGIN + (index % 3) * 174, y - 22 - (index // 3) * 20, label)

    y -= 81
    ruled_box(c, MARGIN, y, PAGE_W - 2 * MARGIN, 130, "Incident summary", "State the facts, dates, observed behavior, and the policy or expectation involved.", 5)
    y -= 140
    ruled_box(c, MARGIN, y, PAGE_W - 2 * MARGIN, 95, "Action taken", "Describe the conversation and corrective action issued.", 3)
    y -= 105
    ruled_box(c, MARGIN, y, PAGE_W - 2 * MARGIN, 80, "Expected correction", "State what must change, by when, and how success will be measured.", 2)

    y -= 93
    field_line(c, MARGIN, y, 185, "Follow-up date", 72)
    field_line(c, MARGIN + 200, y, PAGE_W - 2 * MARGIN - 200, "Witnesses", 52)


def page_two(c):
    header(c, 2, "Employee response, acknowledgment, signatures, and management follow-up.")
    y = PAGE_H - 124
    ruled_box(c, MARGIN, y, PAGE_W - 2 * MARGIN, 180, "Employee comments", "The employee may explain their perspective, provide context, or note disagreement.", 7)

    y -= 192
    c.setFillColor(LIGHT_BLUE)
    c.setStrokeColor(BLUE)
    c.roundRect(MARGIN, y - 86, PAGE_W - 2 * MARGIN, 86, 5, fill=1, stroke=1)
    text(c, MARGIN + 12, y - 18, "EMPLOYEE ACKNOWLEDGMENT", size=8.5, bold=True)
    text(c, MARGIN + 12, y - 35, "My signature confirms that I received and discussed this corrective action. It does not necessarily mean that I agree.", size=7.4)
    checkbox(c, MARGIN + 12, y - 59, "Acknowledged")
    checkbox(c, MARGIN + 144, y - 59, "Employee declined to sign")
    checkbox(c, MARGIN + 344, y - 59, "Not required")

    y -= 104
    text(c, MARGIN, y, "SIGNATURES", size=7.5, bold=True, color=MID_GRAY)
    field_line(c, MARGIN, y - 30, 350, "Employee signature", 92)
    field_line(c, MARGIN + 365, y - 30, 121, "Date", 24)
    field_line(c, MARGIN, y - 63, 350, "Manager signature", 90)
    field_line(c, MARGIN + 365, y - 63, 121, "Date", 24)
    field_line(c, MARGIN, y - 96, 350, "Witness / District Manager", 122)
    field_line(c, MARGIN + 365, y - 96, 121, "Date", 24)

    y -= 112
    ruled_box(c, MARGIN, y, PAGE_W - 2 * MARGIN, 100, "Management follow-up", "Document progress, additional coaching, or completion of the corrective action.", 3)

    y -= 116
    text(c, MARGIN, y, "RECORD STATUS", size=7.5, bold=True, color=MID_GRAY)
    checkbox(c, MARGIN, y - 22, "Open")
    checkbox(c, MARGIN + 98, y - 22, "Monitoring")
    checkbox(c, MARGIN + 220, y - 22, "Completed")
    field_line(c, MARGIN + 340, y - 20, 146, "Completion date", 78)

    y -= 55
    text(c, MARGIN, y, "DISTRIBUTION", size=7.5, bold=True, color=MID_GRAY)
    checkbox(c, MARGIN, y - 22, "Employee copy")
    checkbox(c, MARGIN + 132, y - 22, "Store file")
    checkbox(c, MARGIN + 238, y - 22, "District Manager")
    checkbox(c, MARGIN + 390, y - 22, "Admin / HR")


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=letter, pageCompression=1)
    c.setTitle("Team Powers Employee Corrective Action Form")
    c.setAuthor("Team Powers - DASHos")
    page_one(c)
    c.showPage()
    page_two(c)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
