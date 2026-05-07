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

export const menuItems = [
  { name: "Grilled Salmon", category: "Premium Main", price: 28, margin: "High", pairing: "Sancerre", priority: "High Priority", status: "Promote" },
  { name: "Ribeye Steak", category: "Premium Main", price: 36, margin: "High", pairing: "Malbec", priority: "High Priority", status: "Promote" },
  { name: "Chocolate Fondant", category: "Dessert", price: 12, margin: "Medium", pairing: "Espresso Martini", priority: "Standard", status: "Promote" },
  { name: "Truffle Fries", category: "Side", price: 7, margin: "High", pairing: "Ribeye Steak", priority: "High Priority", status: "Promote" },
  { name: "Sancerre", category: "Wine by Glass", price: 14, margin: "High", pairing: "Salmon", priority: "High Priority", status: "Promote" },
  { name: "Sparkling Water", category: "Bottled Water", price: 5, margin: "High", pairing: "Start of Service", priority: "Standard", status: "Promote" },
];
