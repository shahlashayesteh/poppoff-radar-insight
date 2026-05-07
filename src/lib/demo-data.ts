// Sample data for the public /demo experience only.
// Do NOT import this file from authenticated pages (manager.*, server.*, settings).

export const demoVenue = {
  name: "The Demo Restaurant",
  joinCode: "484194",
};

export type DemoServer = {
  id: string;
  name: string;
  spendPerCover: string;
  covers: number;
  upliftEstimate: string;
  streak: number;
};

export const demoServers: DemoServer[] = [
  { id: "sarah",  name: "Sarah",  spendPerCover: "£58.40", covers: 812, upliftEstimate: "£1,420", streak: 7 },
  { id: "maria",  name: "Maria",  spendPerCover: "£52.10", covers: 640, upliftEstimate: "£980",   streak: 4 },
  { id: "james",  name: "James",  spendPerCover: "£49.80", covers: 588, upliftEstimate: "£820",   streak: 3 },
  { id: "ahmed",  name: "Ahmed",  spendPerCover: "£47.20", covers: 512, upliftEstimate: "£670",   streak: 2 },
  { id: "chloe",  name: "Chloe",  spendPerCover: "£44.90", covers: 430, upliftEstimate: "£540",   streak: 1 },
];

export const demoMenuItems = [
  { name: "Truffle Tagliatelle",   attachRate: "38%", trend: "+6%" },
  { name: "Wagyu Sirloin",         attachRate: "29%", trend: "+4%" },
  { name: "Aperol Spritz",         attachRate: "61%", trend: "+12%" },
  { name: "Tiramisu",              attachRate: "22%", trend: "-2%" },
  { name: "Espresso Martini",      attachRate: "44%", trend: "+8%" },
];

export const demoPriorities = [
  { title: "Push the Aperol Spritz at the door",  detail: "Highest-margin attach. Up 12% week-over-week." },
  { title: "Coach James on dessert add-ons",       detail: "Dessert attach is 9% below team average." },
  { title: "Run a wine pairing huddle Friday",     detail: "Wine attach has plateaued for three weeks." },
];
