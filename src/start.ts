import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const CRAWLABLE_DEMO_PATHS = new Set(["/demo/manager", "/demo/manager/"]);

function isCrawlableDemoRequest(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const url = new URL(request.url);
  return CRAWLABLE_DEMO_PATHS.has(url.pathname);
}

function forceHtmlAcceptForCrawlableDemo(request: Request): Request {
  if (!isCrawlableDemoRequest(request)) return request;

  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  if (accept.includes("text/html")) return request;

  const headers = new Headers(request.headers);
  headers.set("accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
  return new Request(request, { headers });
}

const crawlableDemoMiddleware = createMiddleware().server(async ({ next, request }) => {
  const appRequest = forceHtmlAcceptForCrawlableDemo(request);
  const result = await (next as (options?: { request?: Request }) => ReturnType<typeof next>)(
    appRequest === request ? undefined : { request: appRequest },
  );

  if (isCrawlableDemoRequest(appRequest) && result.response) {
    result.response.headers.set("x-robots-tag", "index, follow");
  }

  return result;
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
  requestMiddleware: [crawlableDemoMiddleware, errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
