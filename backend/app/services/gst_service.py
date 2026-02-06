from decimal import Decimal, ROUND_HALF_UP

def calculate_gst(amount: Decimal, shop):
    if not shop or not shop.gst_enabled:
        return Decimal("0.00"), amount

    rate = Decimal(shop.gst_percent or 0) / Decimal("100")

    if shop.gst_mode == "inclusive":
        tax = amount - (amount / (Decimal("1") + rate))
        total = amount
    else:
        tax = amount * rate
        total = amount + tax

    tax = tax.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return tax, total
