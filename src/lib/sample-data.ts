export type Status = "green" | "amber" | "red";

export const statusLabel = (s: Status) =>
  s === "green" ? "Strongest area" : s === "amber" ? "Focus area" : "Opportunity";

export const statusColor = (s: Status) =>
  s === "green" ? "var(--success)" : s === "amber" ? "var(--warning)" : "var(--opportunity)";

export const restaurant = {
  name: "The Demo Restaurant",
  week: "4 May to 10 May",
};

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
    message: "Desserts is your strongest area. Keep recommending the Chocolate Fondant before bill presentation.",
  },
  {
    key: "water",
    name: "Bottled Water",
    status: "amber",
    score: 64,
    message: "Bottled water is close to target. Offer still or sparkling at the start of every table.",
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
  { key: "coffee", name: "Coffee", status: "amber", score: 60, message: "Coffee attachment can be more consistent post-dessert." },
  { key: "digestifs", name: "Digestifs", status: "red", score: 31, message: "Digestifs is an opportunity. Suggest one digestif with coffee." },
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
  { id: "sarah", name: "Sarah", overall: "amber", wine: "red", water: "amber", cocktails: "green", desserts: "green", sides: "red", spc: "amber", weeklyFocus: "Wine", viewed: true, acknowledged: true, uplift: 140 },
  { id: "maria", name: "Maria", overall: "green", wine: "green", water: "green", cocktails: "green", desserts: "green", sides: "amber", spc: "green", weeklyFocus: "Maintain Cocktail Strength", viewed: true, acknowledged: true, uplift: 60 },
  { id: "james", name: "James", overall: "red", wine: "amber", water: "red", cocktails: "amber", desserts: "amber", sides: "red", spc: "red", weeklyFocus: "Bottled Water", viewed: false, acknowledged: false, uplift: 320 },
  { id: "ahmed", name: "Ahmed", overall: "amber", wine: "amber", water: "green", cocktails: "amber", desserts: "amber", sides: "amber", spc: "amber", weeklyFocus: "Desserts", viewed: true, acknowledged: false, uplift: 180 },
  { id: "chloe", name: "Chloe", overall: "green", wine: "green", water: "green", cocktails: "amber", desserts: "green", sides: "green", spc: "green", weeklyFocus: "Keep Water Consistency", viewed: true, acknowledged: true, uplift: 50 },
];

export const managerKpis = {
  totalCovers: 812,
  avgSpc: 58.4,
  uplift: 1420,
  viewed: "4 of 5",
  redOpportunities: 7,
  wineOpportunity: "+£420",
  dessertPerformance: "+12%",
  waterProgress: "+8%",
};

export const coachingPriorities = [
  {
    title: "Wine attachment during dinner shifts",
    insight:
      "Three servers were below their personal wine targets. Recommended action: include one wine pairing reminder in pre-shift briefing.",
  },
  {
    title: "Bottled water consistency at lunch",
    insight: "Lunch service shows the biggest opportunity. Offer still or sparkling at every table on seating.",
  },
  {
    title: "Dessert recommendation before bill presentation",
    insight: "Two servers stop offering dessert when tables ask for the bill. Coach to offer once before the bill is dropped.",
  },
];

export type MenuItem = {
  name: string;
  category: string;
  price: number;
  margin: "High" | "Medium" | "Low";
  pairing: string;
  pairingPitch: string;
  attachLift: string;
  priority: "High Priority" | "Standard";
  status: string;
};

export const menuItems: MenuItem[] = [
  { name: "Grilled Salmon", category: "Premium Main", price: 28, margin: "High", pairing: "Sancerre", pairingPitch: "A glass of Sancerre brings out the citrus in the salmon — would you like to try it?", attachLift: "+£6 / cover when paired", priority: "High Priority", status: "Promote" },
  { name: "Ribeye Steak", category: "Premium Main", price: 36, margin: "High", pairing: "Malbec", pairingPitch: "Our Malbec is the classic pour with the ribeye — shall I bring a glass?", attachLift: "+£8 / cover when paired", priority: "High Priority", status: "Promote" },
  { name: "Chocolate Fondant", category: "Dessert", price: 12, margin: "Medium", pairing: "Espresso Martini", pairingPitch: "An Espresso Martini after the fondant is a guest favourite — interested?", attachLift: "+£11 / cover when paired", priority: "Standard", status: "Promote" },
  { name: "Truffle Fries", category: "Side", price: 7, margin: "High", pairing: "Ribeye Steak", pairingPitch: "Truffle fries with the ribeye? Our most-ordered combo.", attachLift: "+£7 / cover when paired", priority: "High Priority", status: "Promote" },
  { name: "Sancerre", category: "Wine by Glass", price: 14, margin: "High", pairing: "Salmon", pairingPitch: "Start your guests with a glass of Sancerre while they look at the menu.", attachLift: "+£14 / cover when poured early", priority: "High Priority", status: "Promote" },
  { name: "Sparkling Water", category: "Bottled Water", price: 5, margin: "High", pairing: "Start of Service", pairingPitch: "Still or sparkling for the table? — ask before menus.", attachLift: "+£5 / cover when offered", priority: "Standard", status: "Promote" },
];

/* ---------- Numbers-first weekly stats ---------- */
export type WeeklyStat = {
  key: string;
  label: string;        // e.g. "Wines sold"
  unit: string;         // e.g. "wines"
  units: number;        // this week
  prevUnits: number;    // last week
  target: number;       // weekly target
  emoji: string;
};

export const weeklyStats: WeeklyStat[] = [
  { key: "wine",       label: "Wines sold",       unit: "wines",       units: 27, prevUnits: 24, target: 35, emoji: "🍷" },
  { key: "cocktails",  label: "Cocktails sold",   unit: "cocktails",   units: 41, prevUnits: 38, target: 45, emoji: "🍸" },
  { key: "desserts",   label: "Desserts sold",    unit: "desserts",    units: 9,  prevUnits: 13, target: 20, emoji: "🍫" },
  { key: "sides",      label: "Sides sold",       unit: "sides",       units: 18, prevUnits: 22, target: 40, emoji: "🍟" },
  { key: "water",      label: "Bottled waters",   unit: "bottles",     units: 31, prevUnits: 28, target: 40, emoji: "💧" },
  { key: "coffee",     label: "Coffees sold",     unit: "coffees",     units: 22, prevUnits: 21, target: 30, emoji: "☕" },
];

export function statForCategory(key: string) {
  return weeklyStats.find((s) => s.key === key);
}

export function deltaPct(units: number, prev: number) {
  if (prev === 0) return 0;
  return Math.round(((units - prev) / prev) * 100);
}

export function progressPct(units: number, target: number) {
  if (target === 0) return 0;
  return Math.min(100, Math.round((units / target) * 100));
}

export function thresholdStatus(pct: number): Status {
  if (pct < 60) return "red";
  if (pct < 80) return "amber";
  return "green";
}

/* ---------- Anonymous leaderboard ---------- */
export type LeaderRow = {
  rank: number;
  handle: string;
  score: number;          // overall weekly score 0-100
  spc: number;            // £ per cover
  covers: number;
  delta: number;          // rank delta vs last week (+ better)
  isYou?: boolean;
  perCategory: Record<string, number>; // 0-100 per category key
};

export const yourHandle = "Otter 14";

export const leaderboard: LeaderRow[] = [
  { rank: 1, handle: "Fox 22",     score: 94, spc: 71, covers: 96, delta: 0,  perCategory: { wine: 92, cocktails: 88, desserts: 90, sides: 85, water: 95 } },
  { rank: 2, handle: "Hawk 09",    score: 89, spc: 68, covers: 88, delta: 1,  perCategory: { wine: 86, cocktails: 84, desserts: 78, sides: 80, water: 90 } },
  { rank: 3, handle: yourHandle,   score: 82, spc: 64, covers: 84, delta: 2,  isYou: true, perCategory: { wine: 58, cocktails: 81, desserts: 88, sides: 38, water: 64 } },
  { rank: 4, handle: "Lynx 31",    score: 80, spc: 62, covers: 79, delta: -1, perCategory: { wine: 75, cocktails: 70, desserts: 82, sides: 60, water: 72 } },
  { rank: 5, handle: "Heron 18",   score: 76, spc: 60, covers: 81, delta: 0,  perCategory: { wine: 70, cocktails: 72, desserts: 74, sides: 65, water: 70 } },
  { rank: 6, handle: "Wren 05",    score: 71, spc: 57, covers: 73, delta: -2, perCategory: { wine: 60, cocktails: 70, desserts: 68, sides: 55, water: 66 } },
  { rank: 7, handle: "Stoat 27",   score: 67, spc: 55, covers: 70, delta: 1,  perCategory: { wine: 55, cocktails: 64, desserts: 62, sides: 50, water: 60 } },
  { rank: 8, handle: "Badger 12",  score: 62, spc: 52, covers: 68, delta: -1, perCategory: { wine: 50, cocktails: 60, desserts: 58, sides: 48, water: 56 } },
  { rank: 9, handle: "Otter 03",   score: 55, spc: 48, covers: 64, delta: 0,  perCategory: { wine: 42, cocktails: 55, desserts: 50, sides: 40, water: 52 } },
];

export const leaderboardCategories = [
  { key: "wine", label: "Wine" },
  { key: "cocktails", label: "Cocktails" },
  { key: "desserts", label: "Desserts" },
  { key: "sides", label: "Sides" },
  { key: "water", label: "Water" },
];

/* ---------- Coaching scripts per category ---------- */
export type CoachingCard = {
  key: string;
  title: string;
  why: string;
  scripts: string[];
  dos: string[];
  donts: string[];
  pairedItem?: string;
};

export const coachingCards: CoachingCard[] = [
  {
    key: "wine",
    title: "Wine is your biggest opportunity",
    why: "You're at 27 glasses this week vs a 35 target — that's 0.4 glasses/cover vs the team average of 0.9.",
    scripts: [
      "\"Can I start you with a glass of Sancerre while you look at the menu?\"",
      "\"The salmon goes really well with our Sancerre — shall I bring a glass?\"",
      "\"We've got a great Malbec by the glass — perfect with the ribeye.\"",
    ],
    dos: [
      "Offer a specific wine by name, not 'any wine?'",
      "Recommend before menus are open.",
      "Pair to a dish, not to the guest.",
    ],
    donts: [
      "Don't ask 'are you drinking tonight?'",
      "Don't wait until food arrives.",
    ],
    pairedItem: "Sancerre",
  },
  {
    key: "sides",
    title: "Sides — easy attach you're missing",
    why: "18 sides on 84 covers. One premium side per main would lift SPC by ~£4.",
    scripts: [
      "\"Would you like to add truffle fries or seasonal greens with that?\"",
      "\"Our truffle fries are the most-ordered side with the ribeye.\"",
    ],
    dos: ["Suggest one premium side with every main.", "Name the side — don't ask 'any sides?'"],
    donts: ["Don't list the whole sides menu."],
    pairedItem: "Truffle Fries",
  },
  {
    key: "water",
    title: "Bottled water at the start",
    why: "31 of 40 target. Asking 'still or sparkling?' before menus closes the gap.",
    scripts: [
      "\"Would you prefer still or sparkling water for the table?\"",
      "\"Shall I bring a large bottle of sparkling to start?\"",
    ],
    dos: ["Ask before menus.", "Default to a large bottle for 4+ guests."],
    donts: ["Don't ask 'tap or bottled?' — it kills attach."],
    pairedItem: "Sparkling Water",
  },
];
