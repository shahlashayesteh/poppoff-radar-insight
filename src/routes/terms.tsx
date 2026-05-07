import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — PoppOff" },
      { name: "description", content: "The terms governing your use of PoppOff." },
      { property: "og:title", content: "Terms & Conditions — PoppOff" },
      { property: "og:description", content: "The terms governing your use of PoppOff." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-16">
      <article className="mx-auto max-w-3xl prose prose-invert">
        <Link to="/" className="text-sm text-muted-foreground underline">← Back to home</Link>
        <h1 className="text-4xl font-bold mt-6 mb-2">Terms & Conditions</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: May 2026</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">1. Who you are contracting with</h2>
        <p>These terms form an agreement between you and <strong>PoppOff</strong> ("PoppOff", "we", "us"), the provider of the PoppOff hospitality performance platform (the "Service"). By creating an account or otherwise using the Service, you agree to these terms.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">2. The Service</h2>
        <p>PoppOff provides personal scorecards, AI coaching, menu intelligence, and team performance tools for hospitality venues, delivered as a subscription software service.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">3. Your account</h2>
        <p>You must provide accurate information, keep your credentials confidential, and are responsible for all activity under your account. If you use the Service on behalf of an organisation, you confirm you have authority to bind it.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">4. Acceptable use</h2>
        <p>You must not misuse the Service, including: using it unlawfully; engaging in fraud or spam; infringing intellectual property; uploading malware; probing, scanning, or testing security; or scraping data without permission.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">5. Intellectual property</h2>
        <p>PoppOff and its licensors retain all rights, title, and interest in the Service and its software, documentation, and branding. We grant you a limited, non-exclusive, non-transferable right to use the Service in accordance with your subscription. You may not reverse engineer, resell, or circumvent technical limits of the Service.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">6. Payments and subscriptions</h2>
        <p>Our order process is conducted by our online reseller <strong>Paddle.com</strong>. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns. Payment, billing, tax, cancellation, and refund mechanics are governed by Paddle's <a className="underline" href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noopener noreferrer">Checkout Buyer Terms</a>. Subscriptions renew automatically until cancelled.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">7. Refunds</h2>
        <p>See our <Link to="/refund" className="underline">Refund Policy</Link>.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">8. Service availability</h2>
        <p>We work to keep the Service available and reliable but do not guarantee uninterrupted or error-free performance.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">9. Suspension and termination</h2>
        <p>We may suspend or terminate access for: material breach of these terms, non-payment, security or fraud risk, or repeated or serious policy violations. You may stop using the Service and cancel your subscription at any time.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">10. Warranties and liability</h2>
        <p>To the fullest extent permitted by law, the Service is provided "as is" and we disclaim all implied warranties, including merchantability and fitness for purpose. Our aggregate liability is capped at the fees you paid in the 12 months preceding the claim. We are not liable for indirect, consequential, or special damages, including loss of profits, data, or goodwill. Nothing limits liability for fraud, death, or personal injury where prohibited by law.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">11. Your content</h2>
        <p>You retain ownership of content you submit. You grant PoppOff a limited licence to host and process it solely to provide the Service.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">12. Indemnity</h2>
        <p>You agree to indemnify PoppOff against claims arising from your content, unlawful use, or breach of these terms.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">13. Governing law</h2>
        <p>These terms are governed by the laws of England and Wales, with exclusive jurisdiction of its courts, unless mandatory local law provides otherwise.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">14. Changes</h2>
        <p>We may update these terms. Continued use of the Service after changes take effect constitutes acceptance.</p>
      </article>
    </div>
  );
}
