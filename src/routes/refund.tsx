import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — PoppOff" },
      { name: "description", content: "Our 30-day money-back guarantee and how to request a refund." },
      { property: "og:title", content: "Refund Policy — PoppOff" },
      { property: "og:description", content: "Our 30-day money-back guarantee and how to request a refund." },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-16">
      <article className="mx-auto max-w-3xl prose prose-invert">
        <Link to="/" className="text-sm text-muted-foreground underline">← Back to home</Link>
        <h1 className="text-4xl font-bold mt-6 mb-2">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: May 2026</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">30-day money-back guarantee</h2>
        <p>PoppOff offers a <strong>30-day money-back guarantee</strong>. If you're not satisfied with your purchase, you can request a full refund within 30 days of your order date.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">How to request a refund</h2>
        <p>Refunds are processed by our payment provider and Merchant of Record, <strong>Paddle</strong>. To request a refund:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Visit <a className="underline" href="https://paddle.net" target="_blank" rel="noopener noreferrer">paddle.net</a> and look up your order using the email used at checkout, or</li>
          <li>Contact us through the support channel inside the app and we'll help you raise the request with Paddle.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-3">Paddle as Merchant of Record</h2>
        <p>Paddle.com is the Merchant of Record for all PoppOff orders. Paddle handles billing, payments, tax, and processes refunds and returns on our behalf in accordance with their <a className="underline" href="https://www.paddle.com/legal/refund-policy" target="_blank" rel="noopener noreferrer">Refund Policy</a>.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">After 30 days</h2>
        <p>After the 30-day window, refunds are at our discretion and may be granted in cases of duplicate charges, billing errors, or where required by applicable law. You can cancel your subscription at any time to stop future renewals.</p>
      </article>
    </div>
  );
}
