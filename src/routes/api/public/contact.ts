import * as React from 'react'
import { render } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'poppoff-radar-insight'
const SENDER_DOMAIN = 'notify.poppoffstats.com'
const FROM_DOMAIN = 'poppoffstats.com'

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  restaurant: z.string().trim().max(150).optional().default(''),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(1).max(4000),
  // Phase 1: optional revenue-gap-audit intake fields.
  role: z.string().trim().max(100).optional().default(''),
  venueCount: z.string().trim().max(50).optional().default(''),
  monthlyRevenueBand: z.string().trim().max(50).optional().default(''),
  currentPos: z.string().trim().max(100).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  auditGoal: z.string().trim().max(2000).optional().default(''),
  source: z.string().trim().max(60).optional().default(''),
  // Spam protection.
  // `website` is a honeypot — real users never see it, bots fill every field.
  // `elapsedMs` is the time the form was visible before submit; sub-second
  // submits are almost always automated.
  website: z.string().max(200).optional().default(''),
  elapsedMs: z.number().int().nonnegative().optional().default(0),
})

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const Route = createFileRoute('/api/public/contact')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: 'Server not configured' }, { status: 500 })
        }

        let parsed
        try {
          const body = await request.json()
          parsed = contactSchema.parse(body)
        } catch (err: any) {
          return Response.json({ error: 'Invalid input', details: err?.message }, { status: 400 })
        }

        // Honeypot: silently accept but discard if the trap field is filled
        // or the form was submitted suspiciously fast (< 1.2s).
        if (parsed.website.trim().length > 0 || (parsed.elapsedMs > 0 && parsed.elapsedMs < 1200)) {
          return Response.json({ success: true })
        }

        const supabase = createClient(supabaseUrl, serviceKey)

        const { data: inserted, error: insertError } = await supabase
          .from('contact_submissions')
          .insert({
            name: parsed.name,
            restaurant: parsed.restaurant || null,
            email: parsed.email,
            message: parsed.message,
            role: parsed.role || null,
            venue_count: parsed.venueCount || null,
            monthly_revenue_band: parsed.monthlyRevenueBand || null,
            current_pos: parsed.currentPos || null,
            phone: parsed.phone || null,
            audit_goal: parsed.auditGoal || null,
            source: parsed.source || 'contact',
          })
          .select('id, created_at')
          .single()

        if (insertError || !inserted) {
          console.error('contact_submissions insert failed', insertError)
          return Response.json({ error: 'Failed to save submission' }, { status: 500 })
        }

        // Best-effort: enqueue notification email to hello@poppoffstats.com.
        try {
          const template = TEMPLATES['contact-submission']
          const recipient = template.to!
          const messageId = crypto.randomUUID()

          // Ensure unsubscribe token (required by queue payload).
          const normalizedEmail = recipient.toLowerCase()
          let unsubscribeToken: string
          const { data: existingToken } = await supabase
            .from('email_unsubscribe_tokens')
            .select('token, used_at')
            .eq('email', normalizedEmail)
            .maybeSingle()
          if (existingToken && !existingToken.used_at) {
            unsubscribeToken = existingToken.token
          } else {
            unsubscribeToken = generateToken()
            await supabase
              .from('email_unsubscribe_tokens')
              .upsert(
                { token: unsubscribeToken, email: normalizedEmail },
                { onConflict: 'email', ignoreDuplicates: true },
              )
            const { data: stored } = await supabase
              .from('email_unsubscribe_tokens')
              .select('token')
              .eq('email', normalizedEmail)
              .maybeSingle()
            if (stored?.token) unsubscribeToken = stored.token
          }

          const templateData = {
            name: parsed.name,
            restaurant: parsed.restaurant || '—',
            email: parsed.email,
            message: parsed.message,
            submittedAt: inserted.created_at,
          }
          const element = React.createElement(template.component, templateData)
          const html = await render(element)
          const plainText = await render(element, { plainText: true })
          const subject = typeof template.subject === 'function'
            ? template.subject(templateData)
            : template.subject

          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'contact-submission',
            recipient_email: recipient,
            status: 'pending',
          })

          await supabase.rpc('enqueue_email', {
            queue_name: 'transactional_emails',
            payload: {
              message_id: messageId,
              to: recipient,
              from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
              sender_domain: SENDER_DOMAIN,
              subject,
              html,
              text: plainText,
              purpose: 'transactional',
              label: 'contact-submission',
              idempotency_key: `contact-${inserted.id}`,
              unsubscribe_token: unsubscribeToken,
              queued_at: new Date().toISOString(),
            },
          })
        } catch (err) {
          console.error('contact email enqueue failed (submission still saved)', err)
        }

        return Response.json({ success: true })
      },
    },
  },
})
