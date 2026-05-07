import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — PoppOff" },
      { name: "description", content: "How PoppOff collects, uses, and protects your personal data." },
      { property: "og:title", content: "Privacy Policy — PoppOff" },
      { property: "og:description", content: "How PoppOff collects, uses, and protects your personal data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-16">
      <article className="mx-auto max-w-3xl prose prose-invert">
        <Link to="/" className="text-sm text-muted-foreground underline">← Back to home</Link>
        <h1 className="text-4xl font-bold mt-6 mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: May 2026</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">1. Who we are</h2>
        <p>PoppOff ("we", "us", "our") provides hospitality performance scorecards and coaching tools. PoppOff is the data controller responsible for the personal data processed through our service. If you have any questions about this notice, contact us through the support channel inside the app.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">2. Personal data we collect</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Account data:</strong> name, email address, login credentials, role (server, manager).</li>
          <li><strong>Venue & team data:</strong> venue name, team members, shift and performance data you submit.</li>
          <li><strong>Support communications:</strong> messages you send us.</li>
          <li><strong>Usage & telemetry:</strong> pages visited, features used, device identifiers, IP address, approximate location.</li>
          <li><strong>Billing data:</strong> handled by our payment provider (see below); we receive subscription status and limited transaction metadata.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-3">3. Why we use it (and legal basis)</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>To create and operate your account and provide the service — <em>contract performance</em>.</li>
          <li>To process payments and manage subscriptions — <em>contract performance</em>.</li>
          <li>To improve, secure, and prevent fraud on the service — <em>legitimate interests</em>.</li>
          <li>To respond to support requests — <em>legitimate interests / contract</em>.</li>
          <li>To send service and marketing communications — <em>legitimate interests or consent</em>, where required.</li>
          <li>To comply with legal obligations — <em>legal obligation</em>.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-3">4. Who we share data with</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Paddle.com Market Ltd</strong>, our Merchant of Record, processes all sales, subscription management, payments, tax compliance, and invoicing on our behalf.</li>
          <li>Hosting, analytics, and customer support providers acting as our processors.</li>
          <li>Professional advisers (legal, accounting) where necessary.</li>
          <li>Authorities or third parties where required by law.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-3">5. International transfers</h2>
        <p>Where we transfer personal data outside the UK or EEA, we rely on appropriate safeguards such as Standard Contractual Clauses or adequacy decisions.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">6. Retention</h2>
        <p>We keep personal data only as long as necessary to provide the service, comply with legal obligations, resolve disputes, and enforce our agreements. When no longer needed, data is deleted or anonymised.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">7. Your rights</h2>
        <p>Subject to applicable law (including UK GDPR / EU GDPR where relevant), you have the right to access, rectify, erase, restrict, port, or object to processing of your personal data, to withdraw consent, and to lodge a complaint with your supervisory authority. We respond within one month.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">8. Security</h2>
        <p>We use appropriate technical and organisational measures — including encryption in transit, access controls, and regular reviews — to protect your personal data.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">9. Cookies</h2>
        <p>We use essential cookies to operate the service and may use limited analytics cookies to understand usage. You can manage cookies through your browser settings.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">10. Changes</h2>
        <p>We may update this notice from time to time. Material changes will be communicated through the service.</p>
      </article>
    </div>
  );
}
