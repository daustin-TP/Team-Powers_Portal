export type Role = "employee" | "manager" | "accounting" | "admin";

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
  | "payroll"
  | "receipts"
  | "approvals"
  | "reconciliation"
  | "team";

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  status: "Complete" | "Pending" | "Needs attention";
  date: string;
};
