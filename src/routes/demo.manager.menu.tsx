import { createFileRoute, Link } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { Brain, ChevronRight, Utensils, Wine, Star, Camera, FileText, Sparkles, TrendingUp, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/demo/manager/menu")({
  component: MenuIntel,
});

const uploads = [
  { icon: Utensils, label: "Upload Food Menu", sub: "PDF, Word, Excel, or Image", c: "var(--brand-green)" },
  { icon: Wine, label: "Upload Wine List", sub: "PDF, Word, Excel, or Image", c: "oklch(0.5 0.18 290)" },
  { icon: Star, label: "Upload Specials", sub: "PDF, Word, Excel, or Image", c: "var(--brand-orange)" },
  { icon: Camera, label: "Upload Menu Photo", sub: "JPG, PNG, or HEIC", c: "oklch(0.65 0.15 240)" },
  { icon: FileText, label: "Upload PDF", sub: "Full menu document", c: "var(--opportunity)" },
];

const rows = [
  { name: "Grilled Salmon", cat: "Main Course", price: "£24", margin: "High", marginC: "var(--brand-green)", pair: "Sancerre", prio: "High Priority", prioC: "orange", status: "Promote" },
  { name: "Ribeye Steak", cat: "Main Course", price: "£36", margin: "High", marginC: "var(--brand-green)", pair: "Malbec", prio: "High Priority", prioC: "orange", status: "Promote" },
  { name: "Chocolate Fondant", cat: "Dessert", price: "£12", margin: "Medium", marginC: "var(--brand-orange)", pair: "Espresso Martini", prio: "Standard", prioC: "gray", status: "Consider" },
  { name: "Truffle Fries", cat: "Side", price: "£7", margin: "High", marginC: "var(--brand-green)", pair: "Ribeye Steak", prio: "High Priority", prioC: "orange", status: "Promote" },
  { name: "Sancerre", cat: "Wine by Glass", price: "£14", margin: "High", marginC: "var(--brand-green)", pair: "Grilled Salmon", prio: "High Priority", prioC: "orange", status: "Promote" },
  { name: "Sparkling Water", cat: "Bottled Water", price: "£5", margin: "High", marginC: "var(--brand-green)", pair: "Start of Service", prio: "Standard", prioC: "gray", status: "Keep" },
];

const recs = [
  { i: TrendingUp, t: "Push High Margin Items", d: "Grilled Salmon and Ribeye Steak have strong margins and pair well with your top wines.", cta: "Coach your team to lead with these." },
  { i: Wine, t: "Pair to Impress", d: "Sancerre is an ideal match for Grilled Salmon. Train your team to suggest this pairing.", cta: "Build pairing confidence." },
  { i: Star, t: "Highlight Desserts", d: "Chocolate Fondant is a crowd favorite. Feature it in your verbal close.", cta: "Make dessert irresistible." },
  { i: FileText, t: "Don't Forget the Basics", d: "Sparkling Water is a low-effort add that boosts check averages. Start every table.", cta: "Turn basics into wins." },
];

const flagStyle = (c: string) => c === "orange"
  ? { bg: "color-mix(in oklab, var(--brand-orange) 18%, white)", fg: "var(--brand-orange)" }
  : { bg: "var(--muted)", fg: "var(--muted-foreground)" };

function MenuIntel() {
  return (
    <ManagerLayout>
      <div className="px-8 py-7">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-display text-5xl font-extrabold tracking-tight inline-flex items-center gap-3">
              Menu Intelligence <span className="text-brand-orange text-3xl">⚡</span>
            </h1>
            <div className="mt-2 font-bold text-brand-green">Turn your menu into coaching.</div>
            <p className="mt-2 text-sm text-foreground/70 max-w-xl">
              Upload your menu, we'll do the rest. Get insights, pairings, and priority guidance to help your team sell what shines.
            </p>
          </div>
          <div className="rounded-2xl border border-border p-5 flex items-start gap-3 max-w-sm bg-white">
            <Brain className="h-7 w-7 text-brand-green shrink-0" />
            <div>
              <div className="font-bold text-brand-green">AI-Powered Analysis</div>
              <div className="text-sm text-muted-foreground mt-1">Our AI reads your menu and delivers coaching that's specific to your menu.</div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid lg:grid-cols-12 gap-5">
          {/* Upload column */}
          <div className="lg:col-span-4 rounded-2xl bg-white border border-border p-5">
            <h3 className="font-display font-bold text-lg mb-4">Upload Your Menu</h3>
            <div className="space-y-3">
              {uploads.map((u) => (
                <button key={u.label} className="w-full rounded-xl border border-border p-3 flex items-center gap-3 text-left hover:border-brand-green transition">
                  <div className="h-10 w-10 rounded-lg grid place-items-center" style={{ background: `color-mix(in oklab, ${u.c} 12%, white)` }}>
                    <u.icon className="h-5 w-5" style={{ color: u.c }} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{u.label}</div>
                    <div className="text-xs text-muted-foreground">{u.sub}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-xl px-3 py-2 text-xs flex items-center gap-2"
              style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)", color: "var(--brand-green)" }}>
              ✓ We'll parse your files and extract items, categories, prices, and more.
            </div>
          </div>

          {/* Parsed table */}
          <div className="lg:col-span-8 space-y-5">
            <div className="rounded-2xl bg-white border border-border p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-display font-bold text-lg">Parsed Menu Data</h3>
                  <span className="text-xs font-semibold px-2 py-1 rounded-md"
                    style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>24 items parsed</span>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="text-left">
                      <th className="font-medium pb-3">Item Name</th>
                      <th className="font-medium pb-3">Category</th>
                      <th className="font-medium pb-3">Price</th>
                      <th className="font-medium pb-3">Margin</th>
                      <th className="font-medium pb-3">Pairing</th>
                      <th className="font-medium pb-3">Priority</th>
                      <th className="font-medium pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const f = flagStyle(r.prioC);
                      return (
                        <tr key={r.name} className="border-t border-border">
                          <td className="py-3 font-semibold flex items-center gap-2">
                            <span className="h-6 w-6 rounded grid place-items-center text-xs" style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>●</span>
                            {r.name}
                          </td>
                          <td className="py-3">{r.cat}</td>
                          <td className="py-3 font-semibold">{r.price}</td>
                          <td className="py-3 font-semibold" style={{ color: r.marginC }}>{r.margin}</td>
                          <td className="py-3">{r.pair}</td>
                          <td className="py-3"><span className="text-xs font-semibold px-2 py-1 rounded" style={{ background: f.bg, color: f.fg }}>{r.prio}</span></td>
                          <td className="py-3"><span className="text-xs font-semibold px-2 py-1 rounded" style={{ background: "color-mix(in oklab, var(--brand-green) 14%, white)", color: "var(--brand-green)" }}>{r.status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-xs text-muted-foreground inline-flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-brand-orange" /> Items parsed and analyzed with AI. Review and adjust anytime.
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-border p-5">
              <h3 className="font-display font-bold text-brand-green">AI Recommendations – Menu-Specific Coaching</h3>
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                {recs.map((r) => (
                  <div key={r.t} className="rounded-xl border border-border p-4">
                    <r.i className="h-5 w-5 text-brand-orange" />
                    <div className="font-semibold mt-2">{r.t}</div>
                    <div className="text-xs text-muted-foreground mt-1">{r.d}</div>
                    <div className="mt-2 text-xs text-brand-green font-semibold">{r.cta}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl px-5 py-3 flex items-center justify-between"
          style={{ background: "color-mix(in oklab, var(--brand-green) 10%, white)" }}>
          <div className="text-sm inline-flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-brand-orange" /> <span className="font-semibold">Tip:</span> Review your parsed items, adjust categories or pairings, and set weekly priorities to guide your team.
          </div>
          <Link to="/manager/priorities" className="rounded-lg px-4 py-2 text-sm font-bold inline-flex items-center gap-2"
            style={{ background: "var(--brand-green)", color: "white" }}>
            Go to Weekly Priorities <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </ManagerLayout>
  );
}
