import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'PoppOff'

interface SignupNotificationProps {
  role?: 'manager' | 'server'
  fullName?: string
  email?: string
  businessOrVenue?: string
  signedUpAt?: string
}

const SignupNotificationEmail = ({
  role = 'manager',
  fullName = 'Unknown',
  email = 'unknown@example.com',
  businessOrVenue = '—',
  signedUpAt,
}: SignupNotificationProps) => {
  const roleLabel = role === 'server' ? 'Server' : 'Manager'
  const venueLabel = role === 'server' ? 'Venue' : 'Business'
  const when = signedUpAt
    ? new Date(signedUpAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>New {roleLabel.toLowerCase()} signup: {fullName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>New {roleLabel} signup</Heading>
          <Text style={text}>
            A new {roleLabel.toLowerCase()} just signed up on {SITE_NAME}.
          </Text>
          <Section style={card}>
            <Text style={row}><strong style={k}>Name:</strong> {fullName}</Text>
            <Text style={row}><strong style={k}>Email:</strong> {email}</Text>
            <Text style={row}><strong style={k}>Role:</strong> {roleLabel}</Text>
            <Text style={row}><strong style={k}>{venueLabel}:</strong> {businessOrVenue}</Text>
            <Text style={row}><strong style={k}>When:</strong> {when}</Text>
          </Section>
          <Text style={footer}>{SITE_NAME} signup notifications</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SignupNotificationEmail,
  subject: (data: Record<string, any>) => {
    const role = data?.role === 'server' ? 'Server' : 'Manager'
    const name = data?.fullName || 'someone'
    return `New ${role} signup: ${name}`
  },
  displayName: 'Signup notification',
  to: 'sholoola@yahoo.com',
  previewData: {
    role: 'manager',
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    businessOrVenue: 'The Sample Venue',
    signedUpAt: new Date().toISOString(),
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
