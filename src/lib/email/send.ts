import { supabase } from '@/integrations/supabase/client'

interface SendTransactionalEmailParams {
  templateName: string
  recipientEmail?: string
  idempotencyKey?: string
  templateData?: Record<string, any>
}

export async function sendTransactionalEmail(params: SendTransactionalEmailParams) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/lovable/email/transactional/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      templateName: params.templateName,
      recipientEmail: params.recipientEmail ?? 'placeholder@example.com',
      idempotencyKey: params.idempotencyKey,
      templateData: params.templateData,
    }),
  })
  if (!res.ok) throw new Error(`Email send failed: ${res.status}`)
  return res.json()
}

export function notifySignup(data: {
  role: 'manager' | 'server'
  fullName: string
  email: string
  businessOrVenue: string
  userId: string
}) {
  return sendTransactionalEmail({
    templateName: 'signup-notification',
    idempotencyKey: `signup-notify-${data.userId}`,
    templateData: {
      role: data.role,
      fullName: data.fullName,
      email: data.email,
      businessOrVenue: data.businessOrVenue,
      signedUpAt: new Date().toISOString(),
    },
  }).catch((err) => {
    console.error('signup notification failed', err)
  })
}
