export function maskMobileForPrint(mobile) {
  let digits = String(mobile || "").replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length !== 10) return String(mobile || "");
  return `${digits.slice(0, 2)}*****${digits.slice(-3)}`;
}

export function getReceiptAddressLines({ branch = {}, shop = {} } = {}) {
  const hasBranchAddress = [
    branch?.address_line1,
    branch?.address_line2,
    branch?.city,
    branch?.state,
    branch?.pincode
  ].some(v => String(v || "").trim());

  if (hasBranchAddress) {
    const lines = [];
    if (branch?.address_line1) lines.push(branch.address_line1);
    if (branch?.address_line2) lines.push(branch.address_line2);
    if (branch?.city) lines.push(branch.city);
    if (branch?.state || branch?.pincode)
      lines.push(`${branch.state || ""} ${branch.pincode || ""}`.trim());
    return lines;
  }

  const lines = [];
  if (shop?.address_line1) lines.push(shop.address_line1);
  if (shop?.address_line2) lines.push(shop.address_line2);
  if (shop?.address_line3) lines.push(shop.address_line3);
  if (shop?.city) lines.push(shop.city);
  if (shop?.state || shop?.pincode)
    lines.push(`${shop.state || ""} ${shop.pincode || ""}`.trim());
  return lines;
}
