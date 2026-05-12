import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'PoppOff'

interface ContactSubmissionProps {
  name?: string
  restaurant?: string
  email?: string
  message?: string
  submittedAt?: string
}

const ContactSubmissionEmail = ({
  name = 'Unknown',
  restaurant = '—',
  email = 'unknown@example.com',
  message = '',
  submittedAt,
}: ContactSubmissionProps) => {
  const when = submittedAt
    ? new Date(submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>New contact form message from {name}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>New contact form message</Heading>
          <Text style={text}>
            Someone just reached out via the {SITE_NAME} contact page.
          </Text>
          <Section style={card}>
            <Text style={row}><strong style={k}>Name:</strong> {name}</Text>
            <Text style={row}><strong style={k}>Restaurant / group:</strong> {restaurant}</Text>
            <Text style={row}><strong style={k}>Email:</strong> {email}</Text>
            <Text style={row}><strong style={k}>When:</strong> {when}</Text>
          </Section>
          <Section style={card}>
            <Text style={{ ...row, whiteSpace: 'pre-wrap' as const }}>{message}</Text>
          </Section>
          <Text style={footer}>{SITE_NAME} contact form</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ContactSubmissionEmail,
  subject: (data: Record<string, any>) => {
    const name = data?.name || 'someone'
    return `New contact form message from ${name}`
  },
  displayName: 'Contact form submission',
  to: 'hello@poppoffstats.com',
  previewData: {
    name: 'Jane Doe',
    restaurant: 'The Sample Bistro',
    email: 'jane@example.com',
    message: 'Hi! We have 3 venues and would love to learn more about PoppOff.',
    submittedAt: new Date().toISOString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#000', margin: '0 0 12px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.5', margin: '0 0 16px' }
const card = { background: '#f6f7f9', borderRadius: '12px', padding: '16px 18px', margin: '8px 0 20px' }
const row = { fontSize: '14px', color: '#222', margin: '0 0 6px' }
const k = { color: '#666', fontWeight: 600, marginRight: '6px' }
const footer = { fontSize: '12px', color: '#999', margin: '24px 0 0' }
