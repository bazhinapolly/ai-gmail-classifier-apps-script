"""Build polished portfolio PDFs for the Gmail classifier project."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
NAVY = colors.HexColor("#14213D")
BLUE = colors.HexColor("#2563EB")
CYAN = colors.HexColor("#0E7490")
MUTED = colors.HexColor("#617187")
LINE = colors.HexColor("#D9E3EF")
PALE = colors.HexColor("#EFF6FF")
PALE_CYAN = colors.HexColor("#ECFEFF")


base = getSampleStyleSheet()
STYLES = {
    "eyebrow": ParagraphStyle("eyebrow", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=CYAN, spaceAfter=7),
    "title": ParagraphStyle("title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=26, leading=29, textColor=NAVY, spaceAfter=9),
    "subtitle": ParagraphStyle("subtitle", parent=base["BodyText"], fontSize=10.7, leading=15, textColor=MUTED, spaceAfter=12),
    "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13.5, leading=17, textColor=NAVY, spaceBefore=8, spaceAfter=5),
    "h3": ParagraphStyle("h3", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=10, leading=12, textColor=CYAN, spaceAfter=3),
    "body": ParagraphStyle("body", parent=base["BodyText"], fontSize=9, leading=12.7, textColor=NAVY, spaceAfter=5),
    "small": ParagraphStyle("small", parent=base["BodyText"], fontSize=7.7, leading=10.2, textColor=MUTED),
    "bullet": ParagraphStyle("bullet", parent=base["BodyText"], fontSize=8.6, leading=11.8, leftIndent=11, firstLineIndent=-7, textColor=NAVY, spaceAfter=3),
    "table": ParagraphStyle("table", parent=base["BodyText"], fontSize=7.7, leading=10, textColor=NAVY),
    "head": ParagraphStyle("head", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=colors.white),
    "code": ParagraphStyle("code", parent=base["BodyText"], fontName="Courier", fontSize=7.2, leading=9, textColor=colors.white),
}


def p(text, style="body"):
    return Paragraph(text, STYLES[style])


def bullet(text):
    return p(f"- {text}", "bullet")


def frame(canvas, document):
    canvas.saveState()
    width, height = LETTER
    canvas.setFillColor(CYAN)
    canvas.rect(0, height - 0.12 * inch, width, 0.12 * inch, fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.line(0.62 * inch, 0.48 * inch, width - 0.62 * inch, 0.48 * inch)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.62 * inch, 0.28 * inch, "AI Gmail Message Classifier | Polina Bazhina | 2026")
    canvas.drawRightString(width - 0.62 * inch, 0.28 * inch, f"Page {document.page}")
    canvas.restoreState()


def document(path, title):
    return SimpleDocTemplate(str(path), pagesize=LETTER, title=title, author="Polina Bazhina", leftMargin=0.62 * inch, rightMargin=0.62 * inch, topMargin=0.5 * inch, bottomMargin=0.62 * inch)


def invariant_canvas(*args, **kwargs):
    kwargs["invariant"] = 1
    return Canvas(*args, **kwargs)


def strip():
    data = [
        [p("PLATFORM", "small"), p("AI CONTRACT", "small"), p("PRIVACY", "small"), p("QUALITY", "small")],
        [p("Google Apps Script", "h3"), p("Strict Structured Outputs", "h3"), p("Minimized and redacted input", "h3"), p("22 tests + multi-version CI", "h3")],
    ]
    return Table(data, colWidths=[1.675 * inch] * 4, style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE_CYAN), ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("PADDING", (0, 0), (-1, -1), 7)]))


def build_case_study():
    story = [
        p("PORTFOLIO PROJECT", "eyebrow"),
        p("Privacy-Aware AI Gmail Message Classifier", "title"),
        p("A production-oriented inbox workflow that classifies individual unread messages with OpenAI while preserving user state, minimizing transmitted data, and keeping failures reviewable.", "subtitle"),
        strip(),
        p("Business challenge", "h2"),
        p("Business inboxes mix invoices, orders, complaints, quote requests, promotions, and internal communication. Manual triage is repetitive, while careless automation can skip new replies, duplicate work, expose sensitive content, or create unbounded provider cost."),
        p("Implemented workflow", "h2"),
        p("The classifier processes each eligible unread message, builds a minimized and redacted input, requests a schema-constrained category from the OpenAI Responses API, validates the result locally, and applies namespaced Gmail labels without marking the message as read."),
        p("Message-level data flow", "h2"),
        Table([
            [p("1. SELECT", "head"), p("2. MINIMIZE", "head"), p("3. CLASSIFY", "head"), p("4. APPLY", "head")],
            [p("Query unread inbox messages and exclude managed completion or review labels.", "table"), p("Use sender domain, redacted subject, and Gmail snippet. Skip bodies and attachments.", "table"), p("Responses API with store: false, strict schema, local enums, and confidence threshold.", "table"), p("Add AI category and AI/Processed atomically; route permanent failures to AI/Needs Review.", "table")],
        ], colWidths=[1.675 * inch] * 4, style=TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("BACKGROUND", (0, 1), (-1, 1), PALE), ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 8)])),
        p("Why message-level processing matters", "h2"),
        p("A newly received reply remains eligible even when an earlier message in the same conversation was already classified. This avoids a common thread-level automation bug and preserves the user's unread workflow."),
        PageBreak(),
        p("RELIABILITY, PRIVACY, OPERATIONS", "eyebrow"),
        p("Designed for controlled automation", "title"),
        p("The implementation combines bounded provider behavior with explicit Gmail ownership rules and operational recovery paths.", "subtitle"),
        Table([
            [p("Reliability controls", "h3"), p("Privacy and security", "h3")],
            [[bullet("LockService prevents overlapping trigger runs"), bullet("Run deadline leaves remaining work for the next trigger"), bullet("Bounded exponential backoff for transient failures"), bullet("Idempotent setup and trigger creation")], [bullet("API key stays in Script Properties"), bullet("Best-effort PII redaction before provider call"), bullet("Metadata-only, formula-safe error logs"), bullet("Explicit OAuth scope allowlist")]],
        ], colWidths=[3.35 * inch] * 2, style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE_CYAN), ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 9)])),
        p("Operational visibility", "h2"),
        bullet("AI/Processed records successful completion without changing unrelated labels."),
        bullet("AI/Needs Review creates a visible queue for permanent message-level failures."),
        bullet("Safe status helpers expose configuration readiness without returning secrets."),
        bullet("Client and provider request IDs support correlation without logging message content."),
        bullet("Configurable 90-day default retention automatically removes expired error rows."),
        p("Verification evidence", "h2"),
        p("22 deterministic tests cover minimized input, PII redaction, strict output validation, full message orchestration, repeat runs, fatal recovery, idempotent setup, retention, label updates, and spreadsheet safety. CI also validates a category-balanced evaluation set with prompt-injection cases on Node.js 20, 22, and 24."),
        p("Deployment path", "h2"),
        p("Install with clasp or the Apps Script editor, add a restricted OpenAI project key in Script Properties, review the manifest scopes, run idempotent setup, execute the controlled smoke test, and validate with a dedicated Gmail account before enabling the five-minute trigger."),
        p("Business value", "h2"),
        p("The workflow reduces repetitive inbox triage, keeps ambiguous cases visible, preserves the user's normal email state, and provides a controlled foundation for account-specific categories and policies."),
    ]
    document(OUT / "AI-Gmail-Classifier-Case-Study.pdf", "AI Gmail Classifier - Case Study").build(story, onFirstPage=frame, onLaterPages=frame, canvasmaker=invariant_canvas)


def build_technical():
    story = [
        p("TECHNICAL SUMMARY", "eyebrow"),
        p("AI Gmail Message Classifier", "title"),
        p("Google Apps Script | Gmail API | OpenAI Responses API | Strict Structured Outputs | Node.js verification", "subtitle"),
        strip(),
        p("Architecture", "h2"),
        Table([
            [p("INTAKE", "head"), p("MINIMIZATION", "head"), p("AI ADAPTER", "head"), p("GMAIL STATE", "head")],
            [p("Individual unread inbox messages with bounded batch and run time.", "table"), p("Sender domain, redacted subject, generated snippet; no full body or attachment.", "table"), p("Pinned model, store: false, strict JSON schema, request IDs, bounded retries.", "table"), p("Namespaced category plus completion or review label; unrelated state remains intact.", "table")],
        ], colWidths=[1.675 * inch] * 4, style=TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("BACKGROUND", (0, 1), (-1, 1), PALE), ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 8)])),
        p("Managed state", "h2"),
        Table([
            [p("LABEL", "head"), p("PURPOSE", "head")],
            [p("AI/Processed", "table"), p("Successful message-level classification", "table")],
            [p("AI/Needs Review", "table"), p("Permanent provider or validation failure requiring review", "table")],
            [p("AI/Invoice, AI/Order, ...", "table"), p("Allowlisted business category selected by validated output", "table")],
            [p("AI/Other", "table"), p("Fallback for unknown or low-confidence classifications", "table")],
        ], colWidths=[2 * inch, 4.7 * inch], style=TableStyle([("BACKGROUND", (0, 0), (-1, 0), CYAN), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE_CYAN]), ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE), ("PADDING", (0, 0), (-1, -1), 6)])),
        p("Safety controls", "h2"),
        Table([[[bullet("Untrusted email delimiters and prompt instructions"), bullet("Strict local schema and finite confidence"), bullet("No secret-bearing status output"), bullet("Explicit OAuth scope allowlist")], [bullet("Lock and runtime deadline"), bullet("Bounded retry and Retry-After support"), bullet("Formula-safe spreadsheet values"), bullet("Content-free operational logging")]]], colWidths=[3.35 * inch] * 2, style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 8)])),
        p("Verification", "h2"),
        p("22 tests plus repository and evaluation-fixture checks run on Node.js 20, 22, and 24. A dedicated Apps Script smoke-test function exercises one controlled provider request before trigger activation."),
        p("Run locally", "h2"),
        Table([[p("npm install", "code"), p("npm run check", "code"), p("npm run clasp:status", "code")]], colWidths=[2.1 * inch, 2.2 * inch, 2.4 * inch], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("BOX", (0, 0), (-1, -1), 0.7, NAVY), ("PADDING", (0, 0), (-1, -1), 8)])),
        Spacer(1, 0.05 * inch),
        p("Production rollout includes scope approval, restricted credentials, provider budget controls, representative evaluation, and a dedicated Gmail smoke test.", "small"),
    ]
    document(OUT / "AI-Gmail-Classifier-Technical-Summary.pdf", "AI Gmail Classifier - Technical Summary").build(story, onFirstPage=frame, onLaterPages=frame, canvasmaker=invariant_canvas)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    build_case_study()
    build_technical()
    for path in sorted(OUT.glob("*.pdf")):
        print(f"Built {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
