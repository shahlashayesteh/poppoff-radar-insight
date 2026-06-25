// Phase 12 — Webhook idempotency + audit storage.
// We import the webhook handler indirectly via the route module's __test__ export
// and inject mocked supabase + verifyWebhook behaviours.
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake of the subset of supabase-js we use in the webhook.
function makeFakeSupabase() {
  const tables: Record<string, any[]> = {
    payment_events: [],
    subscriptions: [],
  };

  function from(table: string) {
    const rows = tables[table] ?? (tables[table] = []);
    const builder: any = {
      _filters: [] as Array<(r: any) => boolean>,
      insert(values: any) {
        const dup = rows.some((r) => r.event_id && r.event_id === values.event_id);
        if (dup) {
          return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
        }
        rows.push({ ...values });
        return Promise.resolve({ data: values, error: null });
      },
      upsert(values: any, opts?: { onConflict?: string }) {
        const key = opts?.onConflict;
        if (key) {
          const idx = rows.findIndex((r) => r[key] === values[key]);
          if (idx >= 0) rows[idx] = { ...rows[idx], ...values };
          else rows.push({ ...values });
        } else {
          rows.push({ ...values });
        }
        return Promise.resolve({ data: values, error: null });
      },
      update(patch: any) {
        const u = {
          eq(col: string, val: any) {
            builder._filters.push((r: any) => r[col] === val);
            return u;
          },
          then(resolve: any) {
            const matches = rows.filter((r) => builder._filters.every((f) => f(r)));
            for (const r of matches) Object.assign(r, patch);
            resolve({ data: matches, error: null });
          },
        };
        return u;
      },
      select(_cols?: string) {
        const s: any = {
          eq(col: string, val: any) {
            builder._filters.push((r: any) => r[col] === val);
            return s;
          },
          maybeSingle() {
            const match = rows.find((r) => builder._filters.every((f) => f(r)));
            return Promise.resolve({ data: match ?? null, error: null });
          },
        };
        return s;
      },
    };
    return builder;
  }

  return { from, _tables: tables };
}

const fakeSupabase = makeFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeSupabase,
}));

// verifyWebhook is the only thing we want controllable per test.
const verifyMock = vi.fn();
vi.mock("@/lib/stripe.server", () => ({
  verifyWebhook: (req: Request, env: any) => verifyMock(req, env),
}));

// Required env so the lazy supabase client initialisation does not throw.
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";

beforeEach(() => {
  fakeSupabase._tables.payment_events.length = 0;
  fakeSupabase._tables.subscriptions.length = 0;
  verifyMock.mockReset();
});

async function loadHandler() {
  const mod = await import("@/routes/api/public/payments/webhook");
  return mod.__test__.handleWebhook;
}

const baseEvent = {
  id: "evt_test_1",
  type: "customer.subscription.created",
  data: {
    object: {
      id: "sub_test_1",
      customer: "cus_test_1",
      status: "active",
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 3600,
      cancel_at_period_end: false,
      metadata: { userId: "user_test_1" },
      items: {
        data: [{
          price: { lookup_key: "pro_monthly", product: "prod_1" },
        }],
      },
    },
  },
};

describe("payments webhook idempotency", () => {
  it("stores payment_events row on first delivery", async () => {
    verifyMock.mockResolvedValue(baseEvent);
    const handle = await loadHandler();
    await handle(new Request("https://x/?env=sandbox", { method: "POST" }), "sandbox");
    const evts = fakeSupabase._tables.payment_events;
    expect(evts.length).toBe(1);
    expect(evts[0].event_id).toBe("evt_test_1");
    expect(evts[0].status).toBe("processed");
    expect(evts[0].raw_payload).toMatchObject({ id: "evt_test_1" });
  });

  it("does not double-process duplicate event_id", async () => {
    verifyMock.mockResolvedValue(baseEvent);
    const handle = await loadHandler();
    await handle(new Request("https://x/?env=sandbox", { method: "POST" }), "sandbox");
    // Second delivery
    const result = await handle(new Request("https://x/?env=sandbox", { method: "POST" }), "sandbox");
    expect(result).toEqual({ duplicate: true });
    expect(fakeSupabase._tables.payment_events.length).toBe(1);
    expect(fakeSupabase._tables.subscriptions.length).toBe(1);
  });

  it("creates subscription row on customer.subscription.created", async () => {
    verifyMock.mockResolvedValue(baseEvent);
    const handle = await loadHandler();
    await handle(new Request("https://x/?env=sandbox", { method: "POST" }), "sandbox");
    const subs = fakeSupabase._tables.subscriptions;
    expect(subs.length).toBe(1);
    expect(subs[0]).toMatchObject({
      user_id: "user_test_1",
      stripe_subscription_id: "sub_test_1",
      price_id: "pro_monthly",
      status: "active",
      environment: "sandbox",
    });
  });

  it("updates subscription row on customer.subscription.updated", async () => {
    verifyMock.mockResolvedValueOnce(baseEvent);
    const handle = await loadHandler();
    await handle(new Request("https://x/?env=sandbox", { method: "POST" }), "sandbox");

    const updatedEvent = {
      ...baseEvent,
      id: "evt_test_2",
      type: "customer.subscription.updated",
      data: {
        object: { ...baseEvent.data.object, status: "past_due" },
      },
    };
    verifyMock.mockResolvedValueOnce(updatedEvent);
    await handle(new Request("https://x/?env=sandbox", { method: "POST" }), "sandbox");

    const subs = fakeSupabase._tables.subscriptions;
    expect(subs.length).toBe(1);
    expect(subs[0].status).toBe("past_due");
    expect(fakeSupabase._tables.payment_events.length).toBe(2);
  });

  it("cancels subscription on customer.subscription.deleted", async () => {
    verifyMock.mockResolvedValueOnce(baseEvent);
    const handle = await loadHandler();
    await handle(new Request("https://x/?env=sandbox", { method: "POST" }), "sandbox");

    const deleteEvent = {
      ...baseEvent,
      id: "evt_test_3",
      type: "customer.subscription.deleted",
    };
    verifyMock.mockResolvedValueOnce(deleteEvent);
    await handle(new Request("https://x/?env=sandbox", { method: "POST" }), "sandbox");

    expect(fakeSupabase._tables.subscriptions[0].status).toBe("canceled");
  });

  it("records error + retry_count when dispatch throws", async () => {
    const badEvent = { ...baseEvent, id: "evt_test_bad", data: { object: { ...baseEvent.data.object, metadata: {} } } };
    // Force handleSubscriptionUpsert to throw by passing missing userId then
    // breaking upsert. Easiest: rewire fakeSupabase upsert to throw once.
    const orig = fakeSupabase.from;
    let threw = false;
    (fakeSupabase as any).from = (table: string) => {
      const b = orig(table);
      if (table === "subscriptions" && !threw) {
        threw = true;
        return { ...b, upsert: () => Promise.reject(new Error("boom")) };
      }
      return b;
    };
    verifyMock.mockResolvedValue({ ...badEvent, data: { object: { ...badEvent.data.object, metadata: { userId: "u" } } } });
    const handle = await loadHandler();
    await expect(
      handle(new Request("https://x/?env=sandbox", { method: "POST" }), "sandbox"),
    ).rejects.toThrow();
    const evt = fakeSupabase._tables.payment_events.find((e) => e.event_id === "evt_test_bad");
    expect(evt?.status).toBe("failed");
    expect(evt?.error).toMatch(/boom/);
    expect(evt?.retry_count).toBe(1);
    (fakeSupabase as any).from = orig;
  });
});
