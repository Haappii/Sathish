from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


DOCS_DIR = Path(__file__).resolve().parent


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=24,
            textColor=colors.HexColor("#13243a"),
            spaceAfter=8,
            leading=28,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            textColor=colors.HexColor("#5f6f88"),
            spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            textColor=colors.HexColor("#10233f"),
            spaceBefore=10,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1a2d47"),
            spaceAfter=4,
        ),
    }


def _table(data):
    t = Table(data, hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaf2fb")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#203d5e")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#c8d8ec")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d6dfec")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def _build_pdf(filename: str, title: str, subtitle: str, sections: list[tuple[str, list[str]]], tables: list[list[list[str]]]):
    s = _styles()
    doc = SimpleDocTemplate(
        str(DOCS_DIR / filename),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
    )

    story = [
        Paragraph(title, s["title"]),
        Paragraph(subtitle, s["subtitle"]),
        Spacer(1, 4),
    ]

    for heading, bullets in sections:
        story.append(Paragraph(heading, s["h2"]))
        for b in bullets:
            story.append(Paragraph(f"- {b}", s["body"]))
        story.append(Spacer(1, 4))

    for tdata in tables:
        story.append(_table(tdata))
        story.append(Spacer(1, 8))

    doc.build(story)


def main():
    common_table = [
        ["Menu", "Route", "Purpose"],
        ["Home", "/home", "Dashboard and quick actions"],
        ["Billing / Take Away", "/sales/create", "New billing flow"],
        ["Billing History", "/sales/history", "Review previous invoices"],
        ["Inventory", "/inventory", "Stock tracking"],
        ["Customers", "/customers", "Profiles and dues"],
        ["Expenses", "/expenses", "Expense recording"],
        ["Reports", "/reports", "Business reports"],
        ["Admin / Setup", "/setup", "System configuration"],
    ]

    _build_pdf(
        "ShopApp_Menu_Navigation_Brochure.pdf",
        "Haappii Billing - Menu and Navigation Brochure",
        "Clear menu map for staff onboarding and daily operations.",
        [
            (
                "Quick Navigation Map",
                [
                    "Home is the central starting screen after login.",
                    "Sidebar is the primary menu for all modules.",
                    "Role and permission decide visible menu items.",
                    "Use Back and Home to return to core flow quickly.",
                ],
            ),
            (
                "Daily Flow",
                [
                    "Start day with Home and alerts review.",
                    "Use Billing / Table Billing for transactions.",
                    "Monitor inventory, dues, expenses during operations.",
                    "Close day with reports and validation.",
                ],
            ),
        ],
        [common_table],
    )

    _build_pdf(
        "ShopApp_User_Manual.pdf",
        "ShopApp User Manual",
        "Practical guide for navigation, menus, and routine workflows.",
        [
            (
                "Login and Start",
                [
                    "Login and reach Home (/home).",
                    "Navigate through left sidebar.",
                    "If a menu is missing, verify role permissions.",
                ],
            ),
            (
                "Setup Module",
                [
                    "Categories: /setup/categories",
                    "Items: /setup/items",
                    "Shop Details: /setup/shop",
                    "Users and Permissions: /setup/users, /setup/permissions",
                    "Branches and Suppliers: /setup/branches, /setup/suppliers",
                ],
            ),
            (
                "Hotel Mode Menus",
                [
                    "Table Billing: /table-billing",
                    "QR Orders: /qr-orders",
                    "Order Live and KOT: /order-live, /kot",
                    "Reservations and Delivery: /reservations, /delivery",
                ],
            ),
        ],
        [common_table],
    )

    _build_pdf(
        "ShopApp_Highend_Design_Document.pdf",
        "ShopApp High-End Design Document",
        "Premium UX and navigation strategy for scalable operations.",
        [
            (
                "Design Vision",
                [
                    "Keep billing flow fast and distraction-free.",
                    "Use strong hierarchy, clear spacing, and high readability.",
                    "Maintain role-sensitive navigation for focused operations.",
                ],
            ),
            (
                "Navigation Architecture",
                [
                    "Primary: Sidebar for major modules.",
                    "Secondary: Page-level actions for context tasks.",
                    "Utility: Header controls for global actions.",
                ],
            ),
            (
                "Quality Checklist",
                [
                    "All critical actions within one screen depth.",
                    "Clear online/offline status and save feedback.",
                    "Accessible contrast and touch targets.",
                    "Consistent card, form, and table behavior.",
                ],
            ),
        ],
        [
            [
                ["Role", "Navigation Scope", "Priority"],
                ["Cashier", "Billing-focused menus", "Speed and accuracy"],
                ["Waiter", "Order and table menus", "Fast service flow"],
                ["Manager", "Operations and analytics", "Actionable controls"],
                ["Admin", "Full configuration menus", "System governance"],
            ]
        ],
    )

    print("Generated PDFs:")
    for name in [
        "ShopApp_Menu_Navigation_Brochure.pdf",
        "ShopApp_User_Manual.pdf",
        "ShopApp_Highend_Design_Document.pdf",
    ]:
        f = DOCS_DIR / name
        print(f"- {f.name} ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
