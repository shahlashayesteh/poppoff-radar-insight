export type Status = "green" | "amber" | "red";

export const statusLabel = (s: Status) =>
  s === "green" ? "Strongest area" : s === "amber" ? "Focus area" : "Opportunity";

export const statusColor = (s: Status) =>
  s === "green" ? "var(--success)" : s === "amber" ? "var(--warning)" : "var(--opportunity)";

export type Category = {
  key: string;
  name: string;
  status: Status;
  score: number;
  message: string;
  recommendation?: string;
};

export const sarahCategories: Category[] = [
  {
    key: "wine",
    name: "Wine",
    status: "red",
    score: 42,
    message:
      "Your wine score is below your personal target this week. Try recommending one specific pairing instead of asking generally if guests would like wine.",
    recommendation:
      "After the salmon, try: \u201CWould you like to try our Sancerre? It is one of our most popular pairings.\u201D",
  },
  {
    key: "desserts",
    name: "Desserts",
    status: "green",
    score: 88,
    message:
      "Desserts is your strongest area. Keep recommending the Chocolate Fondant before bill presentation.",
  },
  {
    key: "water",
    name: "Bottled Water",
    status: "amber",
    score: 64,
    message:
      "Bottled water is close to target. Offer still or sparkling at the start of every table.",
    recommendation:
      "At the start of the table, try: \u201CWould you prefer still or sparkling water for the table?\u201D",
  },
  {
    key: "cocktails",
    name: "Cocktails",
    status: "green",
    score: 81,
    message: "Strong cocktail attachment, especially Espresso Martini after dinner.",
  },
  {
    key: "spc",
    name: "Spend Per Cover",
    status: "amber",
    score: 67,
    message: "Spend per cover is close to your personal target.",
  },
  {
    key: "sides",
    name: "Sides",
    status: "red",
    score: 38,
    message: "Sides is an opportunity. Suggest one premium side with every main.",
    recommendation:
      "With the ribeye, try: \u201CWould you like to add truffle fries or seasonal greens with that?\u201D",
  },
  {
    key: "coffee",
    name: "Coffee",
    status: "amber",
    score: 60,
    message: "Coffee attachment can be more consistent post-dessert.",
  },
  {
    key: "digestifs",
    name: "Digestifs",
    status: "red",
    score: 31,
    message: "Digestifs is an opportunity. Suggest one digestif with coffee.",
  },
];

export type Server = {
  id: string;
  name: string;
  overall: Status;
  wine: Status;
  water: Status;
  cocktails: Status;
  desserts: Status;
  sides: Status;
  spc: Status;
  weeklyFocus: string;
  viewed: boolean;
  acknowledged: boolean;
  uplift: number;
};

export const servers: Server[] = [
  {
    id: "sarah",
    name: "Sarah",
    overall: "amber",
    wine: "red",
    water: "amber",
    cocktails: "green",
    desserts: "green",
    sides: "red",
    spc: "amber",
    weeklyFocus: "Wine",
    viewed: true,
    acknowledged: true,
    uplift: 270,
  },
  {
    id: "maria",
    name: "Maria",
    overall: "green",
    wine: "green",
    water: "green",
    cocktails: "green",
    desserts: "green",
    sides: "amber",
    spc: "green",
    weeklyFocus: "Maintain Cocktail Strength",
    viewed: true,
    acknowledged: true,
    uplift: 110,
  },
  {
    id: "james",
    name: "James",
    overall: "red",
    wine: "amber",
    water: "red",
    cocktails: "amber",
    desserts: "amber",
    sides: "red",
    spc: "red",
    weeklyFocus: "Bottled Water",
    viewed: false,
    acknowledged: false,
    uplift: 610,
  },
  {
    id: "ahmed",
    name: "Ahmed",
    overall: "amber",
    wine: "amber",
    water: "green",
    cocktails: "amber",
    desserts: "amber",
    sides: "amber",
    spc: "amber",
    weeklyFocus: "Desserts",
    viewed: true,
    acknowledged: false,
    uplift: 340,
  },
  {
    id: "chloe",
    name: "Chloe",
    overall: "green",
    wine: "green",
    water: "green",
    cocktails: "amber",
    desserts: "green",
    sides: "green",
    spc: "green",
    weeklyFocus: "Keep Water Consistency",
    viewed: true,
    acknowledged: true,
    uplift: 90,
  },
];

// ─────────────────────────────────────────────────────────────────────
// Canonical demo fixture — single source of truth for /demo/* pages.
// Every demo KPI in the manager dashboard, reports and team pages MUST
// derive from values declared here. Do not hardcode KPIs in route files.
// ─────────────────────────────────────────────────────────────────────

export const demoVenue = {
  name: "The Demo Restaurant",
  weekStart: "2025-05-04",
  weekEnd: "2025-05-10",
  weekLabel: "4 May to 10 May",
  totalCovers: 812,
  totalSales: 47420,
  redOpportunities: 7,
};

// Per-category modelled opportunity (£). Sums to the headline uplift.
// Wine 620 + Dessert 410 + Water 200 + Sides 130 + Spirits 60 = 1420.
export const demoCategoryOpportunities = [
  { key: "wine", label: "Wine", uplift: 620, deltaPct: 11 },
  { key: "desserts", label: "Desserts", uplift: 410, deltaPct: 14 },
  { key: "water", label: "Bottled Water", uplift: 200, deltaPct: 9 },
  { key: "sides", label: "Sides", uplift: 130, deltaPct: 6 },
  { key: "spirits", label: "Spirits", uplift: 60, deltaPct: 3 },
] as const;

// Derived KPIs — never hardcode these in route files.
export const demoManagerKpis = {
  totalCovers: demoVenue.totalCovers,
  totalSales: demoVenue.totalSales,
  avgSpc: Math.round((demoVenue.totalSales / demoVenue.totalCovers) * 100) / 100, // 58.40
  uplift: servers.reduce((sum, s) => sum + s.uplift, 0), // 1420
  viewedCount: servers.filter((s) => s.viewed).length, // 4
  totalServers: servers.length, // 5
  ackCount: servers.filter((s) => s.acknowledged).length, // 3
  viewedRatePct: Math.round((servers.filter((s) => s.viewed).length / servers.length) * 100), // 80
  ackRatePct: Math.round((servers.filter((s) => s.acknowledged).length / servers.length) * 100), // 60
  redOpportunities: demoVenue.redOpportunities,
  wineOpportunity: demoCategoryOpportunities[0].uplift, // 620
  dessertDeltaPct: demoCategoryOpportunities[1].deltaPct, // 14
  waterDeltaPct: demoCategoryOpportunities[2].deltaPct, // 9
};

// Labour leverage preview (drives the LLS preview card in the dashboard).
// Production LLS lives behind /manager/lls — this is the demo summary only.
export const demoLabourLeveragePreview = {
  scorePct: 78,
  benchmarkPct: 72,
  monthlyOpportunity: 4860,
  topGap: { daypart: "Sat lunch", lostMargin: 1240 },
};

// Shift match preview — how well the rota matches forecasted demand.
export const demoShiftMatchPreview = {
  matchPct: 84,
  overstaffedShifts: 2,
  understaffedShifts: 1,
  recommendedReshuffles: 3,
};

// Historic weekly performance for /demo/manager/reports.
// Most-recent week mirrors the canonical demoVenue / demoManagerKpis values.
export const demoWeeklyHistory = [
  {
    week_start: "2025-05-05",
    label: "5 May to 11 May",
    servers: demoManagerKpis.totalServers,
    covers: demoManagerKpis.totalCovers,
    sales: demoManagerKpis.totalSales,
    spc: demoManagerKpis.avgSpc,
    current: true,
  },
  {
    week_start: "2025-04-28",
    label: "28 Apr to 4 May",
    servers: 5,
    covers: 786,
    sales: 44210,
    spc: 56.25,
  },
  {
    week_start: "2025-04-21",
    label: "21 Apr to 27 Apr",
    servers: 5,
    covers: 803,
    sales: 45380,
    spc: 56.51,
  },
  {
    week_start: "2025-04-14",
    label: "14 Apr to 20 Apr",
    servers: 4,
    covers: 742,
    sales: 41020,
    spc: 55.28,
  },
  {
    week_start: "2025-04-07",
    label: "7 Apr to 13 Apr",
    servers: 4,
    covers: 765,
    sales: 41890,
    spc: 54.76,
  },
  {
    week_start: "2025-03-31",
    label: "31 Mar to 6 Apr",
    servers: 4,
    covers: 728,
    sales: 39810,
    spc: 54.68,
  },
] as const;

// Weekly SPC trend for /demo/manager/team — last point pulls from KPIs.
export const demoSpcTrend = [
  { week: "W1", spc: 52 },
  { week: "W2", spc: 54 },
  { week: "W3", spc: 56 },
  { week: "W4", spc: demoManagerKpis.avgSpc },
];

// Sarah-scoped server demo stats. Used by /demo/server/stats so manager
// and server demo views do not drift for the same demo server.
export const sarahDemoStats = [
  { label: "Wine", conversion: 42, target: 65, items: 18, prevItems: 24 },
  { label: "Cocktails", conversion: 81, target: 70, items: 32, prevItems: 27 },
  { label: "Desserts", conversion: 88, target: 75, items: 41, prevItems: 36 },
  { label: "Sides", conversion: 38, target: 60, items: 22, prevItems: 28 },
  { label: "Spirits", conversion: 58, target: 55, items: 14, prevItems: 12 },
  { label: "Sparkling", conversion: 64, target: 70, items: 19, prevItems: 17 },
] as const;

// Back-compat: kept so any older imports of `restaurant` / `managerKpis`
// still resolve. Always derived from the canonical fixture above.
export const restaurant = {
  name: demoVenue.name,
  week: demoVenue.weekLabel,
};

export const managerKpis = {
  totalCovers: demoManagerKpis.totalCovers,
  avgSpc: demoManagerKpis.avgSpc,
  uplift: demoManagerKpis.uplift,
  viewed: `${demoManagerKpis.viewedCount} of ${demoManagerKpis.totalServers}`,
  redOpportunities: demoManagerKpis.redOpportunities,
  wineOpportunity: `+£${demoManagerKpis.wineOpportunity}`,
  dessertPerformance: `+${demoManagerKpis.dessertDeltaPct}%`,
  waterProgress: `+${demoManagerKpis.waterDeltaPct}%`,
};

export const coachingPriorities = [
  {
    title: "Wine attachment during dinner shifts",
    insight:
      "Three servers were below their personal wine targets. Recommended action: include one wine pairing reminder in pre-shift briefing.",
  },
  {
    title: "Bottled water consistency at lunch",
    insight:
      "Lunch service shows the biggest opportunity. Offer still or sparkling at every table on seating.",
  },
  {
    title: "Dessert recommendation before bill presentation",
    insight:
      "Two servers stop offering dessert when tables ask for the bill. Coach to offer once before the bill is dropped.",
  },
];

export const menuItems = [
  {
    name: "Grilled Salmon",
    category: "Premium Main",
    price: 28,
    margin: "High",
    pairing: "Sancerre",
    priority: "High Priority",
    status: "Promote",
  },
  {
    name: "Ribeye Steak",
    category: "Premium Main",
    price: 36,
    margin: "High",
    pairing: "Malbec",
    priority: "High Priority",
    status: "Promote",
  },
  {
    name: "Chocolate Fondant",
    category: "Dessert",
    price: 12,
    margin: "Medium",
    pairing: "Espresso Martini",
    priority: "Standard",
    status: "Promote",
  },
  {
    name: "Truffle Fries",
    category: "Side",
    price: 7,
    margin: "High",
    pairing: "Ribeye Steak",
    priority: "High Priority",
    status: "Promote",
  },
  {
    name: "Sancerre",
    category: "Wine by Glass",
    price: 14,
    margin: "High",
    pairing: "Salmon",
    priority: "High Priority",
    status: "Promote",
  },
  {
    name: "Sparkling Water",
    category: "Bottled Water",
    price: 5,
    margin: "High",
    pairing: "Start of Service",
    priority: "Standard",
    status: "Promote",
  },
];
