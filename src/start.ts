import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const DEMO_MANAGER_PREFIX = "/demo/manager";

function isPublicManagerDemoRequest(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const { pathname } = new URL(request.url);
  return pathname === DEMO_MANAGER_PREFIX || pathname.startsWith(`${DEMO_MANAGER_PREFIX}/`);
}

function needsCrawlerHtmlFallback(request: Request) {
  const { pathname } = new URL(request.url);
  const accept = request.headers.get("accept")?.toLowerCase() ?? "*/*";
  const acceptsRouterHtml = accept.includes("text/html") || accept.includes("*/*");
  return pathname.endsWith("/") || !acceptsRouterHtml;
}

function demoManagerHtml(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, "") || DEMO_MANAGER_PREFIX;
  const sections: Record<string, { title: string; intro: string; bullets: string[] }> = {
    [DEMO_MANAGER_PREFIX]: {
      title: "Manager Dashboard",
      intro: "Public PoppOff manager demo for restaurant operators. No login or app state required.",
      bullets: ["Team Performance", "Coaching Priorities", "Total Covers 812", "Estimated Uplift £1,420", "Server Viewed Stats 4 / 5"],
    },
    [`${DEMO_MANAGER_PREFIX}/team`]: {
      title: "Team Trends",
      intro: "Readable team performance trends for the public manager demo.",
      bullets: ["Average spend per cover", "Wine score by server", "Dessert score by server", "Bottled water score by server", "Scorecard engagement by server"],
    },
    [`${DEMO_MANAGER_PREFIX}/reports`]: {
      title: "Reports",
      intro: "Week-by-week venue performance from the public manager demo.",
      bullets: ["5 May to 11 May", "Total covers 812", "Avg spend per cover £58.40", "Estimated uplift £1,420", "Stats viewed 4 of 5"],
    },
    [`${DEMO_MANAGER_PREFIX}/priorities`]: {
      title: "Weekly Win Priorities",
      intro: "Manager priorities for upsell, recommendation, and coaching focus.",
      bullets: ["Sancerre", "Truffle Fries", "Seasonal Tart", "House Rosé", "Sparkling Water"],
    },
    [`${DEMO_MANAGER_PREFIX}/menu`]: {
      title: "Menu Intelligence",
      intro: "Public demo of menu pairing and item-priority guidance.",
      bullets: ["Grilled Salmon with Sancerre", "Ribeye Steak with Malbec", "Chocolate Fondant with Espresso Martini", "Truffle Fries", "Sparkling Water"],
    },
    [`${DEMO_MANAGER_PREFIX}/coaching`]: {
      title: "Coaching",
      intro: "Manager coaching actions and talking points for the demo venue.",
      bullets: ["Wine attachment during dinner shifts", "Bottled water consistency at lunch", "Dessert recommendation before bill presentation", "Pre-shift huddles", "1:1 coaching"],
    },
    [`${DEMO_MANAGER_PREFIX}/server`]: {
      title: "Individual Server Views",
      intro: "Public list of demo server scorecards for manager review.",
      bullets: ["Sarah", "Maria", "James", "Ahmed", "Chloe"],
    },
  };

  const content = normalizedPath.startsWith(`${DEMO_MANAGER_PREFIX}/server/`)
    ? {
        title: "Server View",
        intro: "Public individual server demo for manager review.",
        bullets: ["Category breakdown", "Stats viewed", "Focus acknowledged", "AI manager talking points", "Menu-specific coaching"],
      }
    : sections[normalizedPath] ?? sections[DEMO_MANAGER_PREFIX];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="index, follow" />
    <title>${content.title} — PoppOff Manager Demo</title>
    <meta name="description" content="Public PoppOff manager demo page with readable manager dashboard content. No login required." />
    <link rel="canonical" href="https://poppoffstats.com${normalizedPath}" />
    <style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;color:#14352f;background:#fff}main{max-width:960px;margin:0 auto;padding:48px 24px}a{color:#0f6b4f}h1{font-size:44px;line-height:1.05;margin:0 0 12px}p{font-size:18px;line-height:1.55;color:#45615c}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:28px}.card{border:1px solid #dfe7e3;border-radius:12px;padding:18px;background:#f8fbf9}.nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.brand{font-weight:800;color:#f47b20}</style>
  </head>
  <body>
    <main>
      <div class="brand">PoppOff</div>
      <h1>${content.title}</h1>
      <p>${content.intro}</p>
      <section class="grid" aria-label="Demo content">${content.bullets.map((item) => `<div class="card">${item}</div>`).join("")}</section>
      <nav class="nav" aria-label="Manager demo routes">
        <a href="/demo/manager">Manager Dashboard</a>
        <a href="/demo/manager/team">Team Trends</a>
        <a href="/demo/manager/priorities">Weekly Priorities</a>
        <a href="/demo/manager/menu">Menu Intelligence</a>
        <a href="/demo/manager/coaching">Coaching</a>
        <a href="/demo/manager/reports">Reports</a>
        <a href="/demo/manager/server/sarah">Server View</a>
      </nav>
    </main>
  </body>
</html>`;
}

const publicManagerDemoMiddleware = createMiddleware().server(({ next, request }) => {
  if (!isPublicManagerDemoRequest(request) || !needsCrawlerHtmlFallback(request)) {
    return next();
  }

  const { pathname } = new URL(request.url);
  return new Response(request.method === "HEAD" ? null : demoManagerHtml(pathname), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "index, follow",
    },
  });
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [publicManagerDemoMiddleware, errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
