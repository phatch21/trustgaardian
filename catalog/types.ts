// Merchant catalog listing shape. title and description are
// merchant-controlled free text — untrusted everywhere downstream of this
// module. See docs/threat-model.md T2 and docs/injection-fixtures.md.

export type SellerType = "first_party" | "third_party";

export interface CatalogItem {
  sku: string;
  merchant: string;
  category: string;
  unitPriceCents: number;
  title: string;
  description: string;
  sellerType: SellerType;
  rating: number;
}
