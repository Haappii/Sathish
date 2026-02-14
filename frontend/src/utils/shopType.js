export const normalizeShopType = (shop) =>
  String(shop?.shop_type || shop?.billing_type || "")
    .trim()
    .toLowerCase();

export const isHotelShop = (shop) => normalizeShopType(shop) === "hotel";

