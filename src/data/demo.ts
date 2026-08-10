import type { ActivityItem, Profile } from "../types";

export const demoProfile: Profile = {
  id: "demo-admin",
  email: "daustin@powerspizza.com",
  fullName: "Delaney Austin",
  role: "admin",
  location: "Operations",
  active: true,
};

export const recentActivity: ActivityItem[] = [
  {
    id: "1",
    title: "Uniform order submitted",
    detail: "2 shirts · Operations",
    status: "Pending",
    date: "Today",
  },
  {
    id: "2",
    title: "Corporate card receipt",
    detail: "Restaurant Depot · $184.62",
    status: "Needs attention",
    date: "Yesterday",
  },
  {
    id: "3",
    title: "Payroll authorization",
    detail: "Uniform deduction authorization",
    status: "Complete",
    date: "Jul 21",
  },
];

export const teamMembers: Profile[] = [
  demoProfile,
  {
    id: "2",
    email: "manager@powerspizza.com",
    fullName: "Jordan Manager",
    role: "manager",
    location: "Powers Pizza",
    active: true,
  },
  {
    id: "3",
    email: "employee@powerspizza.com",
    fullName: "Taylor Employee",
    role: "employee",
    location: "Powers Pizza",
    active: true,
  },
];
