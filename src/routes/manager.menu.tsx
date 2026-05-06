import { createFileRoute } from "@tanstack/react-router";
import { ManagerLayout } from "@/components/manager-layout";
import { menuItems } from "@/lib/sample-data";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Image as ImageIcon, FileType } from "lucide-react";

export const Route = createFileRoute("/manager/menu")({
  component: MenuIntel,
});

const uploads = [
  { label: "Upload Food Menu", icon: FileText },
  { label: "Upload Wine List", icon: FileText },
  { label: "Upload Specials", icon: FileText },
  { label: "Upload Menu Photo", icon: ImageIcon },
  { label: "Upload PDF", icon: FileType },
];

const aiExamples = [
  { tag: "If server is weak on wine", text: "After the salmon, try: \u201CWould you like to try our Sancerre? It is one of our most popular pairings.\u201D" },
  { tag: "If server is weak on sides", text: "With the ribeye, try: \u201CWould you like to add truffle fries or seasonal greens with that?\u201D" },
  { tag: "If server is weak on bottled water", text: "At the start of the table, try: \u201CWould you prefer still or sparkling water for the table?\u201D" },
];

function MenuIntel() {
  return (
    <ManagerLayout>
      <div className="px-8 py-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Menu Intelligence</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">Turn your menu into personalised coaching.</h1>
        <p className="mt-3 text-muted-foreground max-w-3xl">
          Managers upload the menu once during setup. Popp Off reads the menu and connects server stats to specific
          recommendations, pairings, and weekly priorities.
        </p>

        {/* Upload row */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
          {uploads.map((u) => (
            <button key={u.label} className="rounded-2xl border border-dashed border-border bg-white hover:border-ink hover:bg-canvas p-5 text-left transition">
              <div className="flex items-center gap-2">
                <u.icon className="h-4 w-4 text-muted-foreground" />
                <Upload className="h-3 w-3 text-muted-foreground ml-auto" />
              </div>
              <div className="mt-3 text-sm font-medium">{u.label}</div>
              <div className="text-xs text-muted-foreground mt-1">Sample data shown</div>
            </button>
          ))}
        </div>

        {/* Menu table */}
        <div className="mt-10 rounded-2xl bg-white border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Parsed menu</h2>
            <span className="text-xs text-muted-foreground">Sample data</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3">Item</th>
                  <th className="text-left px-3 py-3">Category</th>
                  <th className="text-left px-3 py-3">Price</th>
                  <th className="text-left px-3 py-3">Margin</th>
                  <th className="text-left px-3 py-3">Pairing</th>
                  <th className="text-left px-3 py-3">Priority</th>
                  <th className="text-left px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map((m) => (
                  <tr key={m.name} className="border-t border-border">
                    <td className="px-5 py-3 font-medium">{m.name}</td>
                    <td className="px-3">{m.category}</td>
                    <td className="px-3">£{m.price}</td>
                    <td className="px-3">{m.margin}</td>
                    <td className="px-3">{m.pairing}</td>
                    <td className="px-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${m.priority === "High Priority" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                        {m.priority}
                      </span>
                    </td>
                    <td className="px-3">
                      <Button size="sm" variant="ghost" className="h-7 text-xs">{m.status}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI examples */}
        <div className="mt-10">
          <h2 className="font-display text-2xl font-semibold">AI recommendation examples</h2>
          <div className="mt-4 grid md:grid-cols-3 gap-4">
            {aiExamples.map((a) => (
              <div key={a.tag} className="rounded-2xl bg-ink text-white p-6">
                <div className="text-xs uppercase tracking-widest text-success">{a.tag}</div>
                <p className="mt-3 text-sm text-white/85">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ManagerLayout>
  );
}
