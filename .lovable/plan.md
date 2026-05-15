## Change

Remove the `hello@poppoffstats.com` email from the contact page only.

### Edit: `src/routes/contact.tsx`

1. **Remove the visible mailto button** (lines ~120-126):
   ```tsx
   <a href="mailto:hello@poppoffstats.com" ...>
     <Mail className="h-4 w-4 text-brand-orange" />
     hello@poppoffstats.com
   </a>
   ```
   Also remove the now-unused `Mail` import from `lucide-react`.

2. **Remove email references from the page's JSON-LD schema** (ContactPage script): drop the `email` field on the Organization and the entire `contactPoint` array, since both reference `hello@poppoffstats.com`.

## Not changing

- Page copy, form, styling, header/footer, layout
- Any other route, component, or site content
- `src/lib/email-templates/contact-submission.tsx` (already routes to `sholoola@yahoo.com`)
- `src/routes/terms.tsx` and other pages that mention the email
