from __future__ import annotations

from datetime import datetime

from fpdf import FPDF


def _money(v) -> str:
    try:
        return f"{float(v or 0):.2f}"
    except Exception:
        return "0.00"


def _fmt_date(v) -> str:
    if not v:
        return ""
    try:
        dt = datetime.fromisoformat(str(v)) if isinstance(v, str) else v
        return dt.strftime("%d-%m-%Y %I:%M %p")
    except Exception:
        return str(v)


def _header(pdf: FPDF, pw: float, data: dict) -> None:
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(pw, 8, str(data.get("shop_name") or "Invoice"), align="C", new_x="LMARGIN", new_y="NEXT")

    addr = str(data.get("branch_address") or data.get("shop_address") or "").strip()
    if addr:
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(pw, 5, addr, align="C")

    phone = str(data.get("shop_phone") or "").strip()
    if phone:
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(pw, 5, f"Ph: {phone}", align="C", new_x="LMARGIN", new_y="NEXT")

    gst = str(data.get("shop_gst") or "").strip()
    if gst:
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(pw, 5, f"GSTIN: {gst}", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(2)
    pdf.line(15, pdf.get_y(), pdf.w - 15, pdf.get_y())
    pdf.ln(2)


def generate_invoice_pdf(data: dict) -> bytes:
    """
    Expected data keys:
        shop_name, shop_address, shop_phone, shop_gst,
        branch_name, branch_address,
        invoice_number, created_time, payment_mode,
        customer_name, customer_mobile, customer_gst,
        items: [{name/item_name, qty/quantity, rate/price, tax_rate, amount}],
        subtotal, tax_amt, discounted_amt, total_amount,
        service_charge, service_charge_gst
    """
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(15, 15, 15)
    pw = pdf.w - 30

    _header(pdf, pw, data)

    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(pw, 6, "TAX INVOICE", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    half = pw / 2
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(half, 6, f"Invoice: {data.get('invoice_number') or ''}")
    pdf.cell(half, 6, f"Date: {_fmt_date(data.get('created_time'))}", align="R", new_x="LMARGIN", new_y="NEXT")

    cust = str(data.get("customer_name") or "").strip()
    mob = str(data.get("customer_mobile") or "").strip()
    cust_gst = str(data.get("customer_gst") or "").strip()
    pay_mode = str(data.get("payment_mode") or "").strip().upper()

    if cust:
        pdf.cell(half, 6, f"Customer: {cust}")
        pdf.cell(half, 6, f"Ph: {mob}", align="R", new_x="LMARGIN", new_y="NEXT")
    if cust_gst:
        pdf.cell(pw, 6, f"Cust. GSTIN: {cust_gst}", new_x="LMARGIN", new_y="NEXT")
    if pay_mode:
        pdf.cell(pw, 6, f"Payment: {pay_mode}", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(2)
    pdf.line(15, pdf.get_y(), pdf.w - 15, pdf.get_y())
    pdf.ln(2)

    # Items table
    c_name = pw * 0.44
    c_qty  = pw * 0.11
    c_rate = pw * 0.17
    c_tax  = pw * 0.11
    c_amt  = pw * 0.17

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(220, 220, 220)
    pdf.cell(c_name, 6, "Item", fill=True)
    pdf.cell(c_qty,  6, "Qty",    align="C", fill=True)
    pdf.cell(c_rate, 6, "Rate",   align="R", fill=True)
    pdf.cell(c_tax,  6, "Tax%",   align="C", fill=True)
    pdf.cell(c_amt,  6, "Amount", align="R", fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 9)
    for it in (data.get("items") or []):
        name = str(it.get("name") or it.get("item_name") or "")
        if pdf.get_string_width(name) > c_name - 2:
            name = name[:26] + "..."
        qty   = str(it.get("qty") or it.get("quantity") or "")
        rate  = _money(it.get("rate") or it.get("price") or 0)
        tax   = str(it.get("tax_rate") or it.get("gst_rate") or "")
        amt   = _money(it.get("amount") or 0)
        pdf.cell(c_name, 6, name)
        pdf.cell(c_qty,  6, qty,                    align="C")
        pdf.cell(c_rate, 6, rate,                   align="R")
        pdf.cell(c_tax,  6, f"{tax}%" if tax else "", align="C")
        pdf.cell(c_amt,  6, amt,                    align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(2)
    pdf.line(15, pdf.get_y(), pdf.w - 15, pdf.get_y())
    pdf.ln(2)

    # Totals
    lw = pw * 0.65
    vw = pw * 0.35

    def row(label: str, val, bold: bool = False) -> None:
        pdf.set_font("Helvetica", "B" if bold else "", 9 if not bold else 10)
        pdf.cell(lw, 6, label, align="R")
        pdf.cell(vw, 6, f"Rs. {_money(val)}", align="R", new_x="LMARGIN", new_y="NEXT")

    subtotal         = float(data.get("subtotal") or 0)
    tax_amt          = float(data.get("tax_amt") or 0)
    discounted_amt   = float(data.get("discounted_amt") or 0)
    service_charge   = float(data.get("service_charge") or 0)
    service_charge_gst = float(data.get("service_charge_gst") or 0)
    total_amount     = float(data.get("total_amount") or 0)

    row("Subtotal:", subtotal)
    if tax_amt > 0:
        row("Tax:", tax_amt)
    if service_charge > 0:
        row("Service Charge:", service_charge)
    if service_charge_gst > 0:
        row("SC GST:", service_charge_gst)
    if discounted_amt > 0:
        row("Discount:", -discounted_amt)
    row("TOTAL:", total_amount, bold=True)

    pdf.ln(5)
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(pw, 5, "Thank you for your business!", align="C", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())


def generate_advance_receipt_pdf(data: dict) -> bytes:
    """
    Expected data keys:
        shop_name, shop_address, shop_phone, shop_gst,
        order_id, created_at, customer_name, customer_phone,
        items: [{item_name, qty, rate, amount}],
        total_amount, advance_amount, due_amount,
        advance_payment_mode, expected_date, expected_time, notes
    """
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(15, 15, 15)
    pw = pdf.w - 30

    _header(pdf, pw, data)

    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(pw, 6, "ADVANCE ORDER RECEIPT", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    half = pw / 2
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(half, 6, f"Order #: {data.get('order_id') or ''}")
    pdf.cell(half, 6, f"Date: {_fmt_date(data.get('created_at'))}", align="R", new_x="LMARGIN", new_y="NEXT")

    cust  = str(data.get("customer_name") or "").strip()
    phone = str(data.get("customer_phone") or "").strip()
    exp_date = str(data.get("expected_date") or "").strip()
    exp_time = str(data.get("expected_time") or "").strip()
    notes = str(data.get("notes") or "").strip()
    pay_mode = str(data.get("advance_payment_mode") or "").strip().upper()

    if cust:
        pdf.cell(half, 6, f"Customer: {cust}")
        pdf.cell(half, 6, f"Ph: {phone}", align="R", new_x="LMARGIN", new_y="NEXT")
    if exp_date:
        exp_label = f"Expected: {exp_date}" + (f" {exp_time}" if exp_time else "")
        pdf.cell(pw, 6, exp_label, new_x="LMARGIN", new_y="NEXT")
    if notes:
        pdf.set_font("Helvetica", "I", 9)
        pdf.multi_cell(pw, 5, f"Notes: {notes}")
        pdf.set_font("Helvetica", "", 9)

    pdf.ln(2)
    pdf.line(15, pdf.get_y(), pdf.w - 15, pdf.get_y())
    pdf.ln(2)

    # Items
    c_name = pw * 0.50
    c_qty  = pw * 0.12
    c_rate = pw * 0.19
    c_amt  = pw * 0.19

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(220, 220, 220)
    pdf.cell(c_name, 6, "Item",   fill=True)
    pdf.cell(c_qty,  6, "Qty",    align="C", fill=True)
    pdf.cell(c_rate, 6, "Rate",   align="R", fill=True)
    pdf.cell(c_amt,  6, "Amount", align="R", fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 9)
    for it in (data.get("items") or []):
        name = str(it.get("item_name") or it.get("name") or "")
        if pdf.get_string_width(name) > c_name - 2:
            name = name[:30] + "..."
        qty  = str(it.get("qty") or it.get("quantity") or "")
        rate = _money(it.get("rate") or it.get("price") or 0)
        amt  = _money(it.get("amount") or 0)
        pdf.cell(c_name, 6, name)
        pdf.cell(c_qty,  6, qty,  align="C")
        pdf.cell(c_rate, 6, rate, align="R")
        pdf.cell(c_amt,  6, amt,  align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(2)
    pdf.line(15, pdf.get_y(), pdf.w - 15, pdf.get_y())
    pdf.ln(2)

    lw = pw * 0.65
    vw = pw * 0.35

    def row(label: str, val, bold: bool = False) -> None:
        pdf.set_font("Helvetica", "B" if bold else "", 9 if not bold else 10)
        pdf.cell(lw, 6, label, align="R")
        pdf.cell(vw, 6, f"Rs. {_money(val)}", align="R", new_x="LMARGIN", new_y="NEXT")

    total_amount   = float(data.get("total_amount") or 0)
    advance_amount = float(data.get("advance_amount") or 0)
    due_amount     = float(data.get("due_amount") or max(0.0, total_amount - advance_amount))

    row("Total Amount:", total_amount)
    row(f"Advance Paid ({pay_mode or 'CASH'}):", advance_amount, bold=False)
    row("Balance Due:", due_amount, bold=True)

    pdf.ln(5)
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(pw, 5, "Thank you! Please show this receipt when collecting your order.", align="C", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
