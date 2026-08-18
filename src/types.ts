export type Role = "employee" | "supervisor" | "manager" | "accounting" | "admin";

export type Profile = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  location: string;
  active: boolean;
};

export type PortalSection =
  | "home"
  | "uniforms"
  | "smallwares"
  | "maintenance"
  | "technology"
  | "receipts"
  | "approvals"
  | "reconciliation"
  | "catalog"
  | "team";

export type CatalogCategory = "uniform" | "smallware";

export type CatalogItem = {
  id: string;
  category: CatalogCategory;
  name: string;
  description: string;
  price: number;
  imagePath: string | null;
  imageUrl: string | null;
  sizes: string[];
  active: boolean;
};

export type CartLine = {
  item: CatalogItem;
  quantity: number;
  size?: string;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  status: "Complete" | "Pending" | "Needs attention";
  date: string;
};
