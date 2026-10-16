// @ts-nocheck
import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null
const CAMPNECT_FROM = '"Campnect" <noreply.campnect@gmail.com>'

// The CEO account's security mail is monitored in the central inbox. Other
// accounts keep receiving their own account emails.
const CAMPNECT_MAILBOX = 'darkdiamond014@gmail.com'

// Development-only test inbox. The signup flow still creates the normal
// unverified pending user when requested; this only avoids sending mail to a
// mailbox that does not exist and makes the generated OTP visible in logs.
const DEMO_SIGNUP_EMAIL = 'signup@gla.ac.in'

function securityRecipient(email: string): string {
  return email.toLowerCase().trim() === 'ceo@campnect.perinol.com'
    ? CAMPNECT_MAILBOX
    : email
}

function escapeEmailHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function sendWithGmail(to: string, subject: string, html: string) {
  const t = getTransporter()
  if (t) {
    await t.sendMail({
      from: getSmtpFrom(),
      to,
      subject,
      html,
    })
    return
  }
  console.log(`[Email Dispatch] To: ${to} | Subject: ${subject}`)
}

function getTransporter() {
  if (transporter) return transporter
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    })
  }
  return transporter
}

function getSmtpFrom(): string {
  const configuredFrom = process.env.SMTP_FROM?.trim()
  if (configuredFrom) return configuredFrom
  const smtpUser = process.env.SMTP_USER?.trim()
  return smtpUser ? `"Campnect" <${smtpUser}>` : CAMPNECT_FROM
}

export async function sendOTPEmail(email: string, otp: string, type: 'verify' | 'reset' | 'login' | 'change' = 'verify') {
  const recipient = securityRecipient(email)
  if (process.env.NODE_ENV !== 'production' && email.toLowerCase() === DEMO_SIGNUP_EMAIL && type === 'verify') {
    console.log(`[Campnect demo signup] OTP for ${DEMO_SIGNUP_EMAIL}: ${otp} (expires in 10 minutes)`)
    return
  }
  const baseSubject = type === 'verify'
    ? 'Verify your Campnect account'
    : type === 'login'
    ? 'Your Campnect login code'
    : type === 'change'
    ? 'Confirm your new Campnect email'
    : 'Reset your Campnect password'
  const subject = baseSubject

  const heading = type === 'verify'
    ? 'Verify your email'
    : type === 'login'
    ? 'Confirm your login'
    : type === 'change'
    ? 'Confirm your new email'
    : 'Reset your password'
  const instruction = type === 'verify'
    ? 'Use the verification code below to finish setting up your Campnect account.'
    : type === 'login'
    ? 'Use the code below to finish signing in to Campnect.'
    : type === 'change'
    ? 'Use the code below to confirm your new email address.'
    : 'Use the code below to reset your Campnect password.'

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light">
        <meta name="supported-color-schemes" content="light">
      </head>
      <body style="margin:0;padding:0;background-color:#f3f6fc;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          Your secure Campnect code expires in 10 minutes.
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f6fc" style="width:100%;background-color:#f3f6fc;">
          <tr><td align="center" style="padding:32px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #dfe5f0;border-radius:20px;">
              <tr>
                <td bgcolor="#2457e6" style="padding:28px 32px;background-color:#2457e6;border-radius:19px 19px 0 0;">
                  <div style="font-size:25px;line-height:30px;font-weight:800;color:#ffffff;">Campnect</div>
                  <div style="margin-top:5px;font-size:12px;line-height:18px;letter-spacing:2px;text-transform:uppercase;color:#e8efff;">CAMPUS, CONNECTED</div>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 32px 32px;">
                  <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#2457e6;">SECURITY CODE</div>
                  <h1 style="margin:10px 0 12px;font-size:30px;line-height:38px;font-weight:800;color:#111827;">
                    ${heading}
                  </h1>
                  <p style="margin:0;color:#596278;font-size:16px;line-height:25px;">
                    ${instruction}
                  </p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#edf3ff" style="margin:28px 0 16px;background-color:#edf3ff;border:1px solid #ccdcff;border-radius:14px;">
                    <tr><td align="center" style="padding:22px 12px;color:#173b9f;font-family:'Courier New',Courier,monospace;font-size:38px;line-height:44px;font-weight:700;letter-spacing:8px;">
                      ${otp}
                    </td></tr>
                  </table>
                  <p style="margin:0;color:#687188;font-size:13px;line-height:20px;text-align:center;">Expires in <strong style="color:#344054;">10 minutes</strong>.</p>
                  <div style="height:1px;background-color:#e7eaf0;margin:28px 0 20px;"></div>
                  <p style="margin:0;color:#737c90;font-size:13px;line-height:21px;">
                    If you did not request this email, you can safely ignore it. For your security, never share this code with anyone.
                  </p>
                </td>
              </tr>
              <tr>
                <td bgcolor="#f8faff" style="padding:18px 32px;background-color:#f8faff;border-radius:0 0 19px 19px;color:#7b8497;font-size:12px;line-height:18px;">
                  Sent by Campnect &nbsp;&bull;&nbsp; Your campus community
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
  `

  const t = getTransporter()
  if (t) {
    await t.sendMail({
      from: getSmtpFrom(),
      to: recipient,
      subject,
      html,
    })
  } else await sendWithGmail(recipient, subject, html)
}

export async function sendWelcomeEmail(email: string, name: string) {
  const recipient = securityRecipient(email)
  const t = getTransporter()
  const subject = 'Welcome to Campnect'
  const html = `<div style="font-family:Arial,sans-serif;color:#171a2b"><h2>Welcome to Campnect</h2><p>Hi ${name}, welcome to Campnect! Your campus social network awaits.</p></div>`
  if (t) await t.sendMail({ from: getSmtpFrom(), to: recipient, subject, html })
  else await sendWithGmail(recipient, subject, html)
}

export async function sendLoginAlert(email: string, kind: 'failed' | 'success' | 'suspicious', detail: string) {
  const recipient = securityRecipient(email)
  const subject = kind === 'suspicious' ? 'Suspicious Campnect login detected'
    : kind === 'failed' ? 'Campnect login attempt detected' : 'New Campnect login detected'
  const heading = kind === 'success' ? 'New login confirmed'
    : kind === 'suspicious' ? 'Suspicious login detected'
    : 'Login attempt detected'
  const eyebrow = kind === 'success' ? 'ACCOUNT ACTIVITY' : 'SECURITY ALERT'
  const safeDetail = escapeEmailHtml(detail)
  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light">
        <meta name="supported-color-schemes" content="light">
      </head>
      <body style="margin:0;padding:0;background-color:#f3f6fc;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${heading}. Review your recent Campnect account activity.</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f6fc" style="width:100%;background-color:#f3f6fc;">
          <tr><td align="center" style="padding:32px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #dfe5f0;border-radius:20px;">
              <tr>
                <td bgcolor="#2457e6" style="padding:28px 32px;background-color:#2457e6;border-radius:19px 19px 0 0;">
                  <div style="font-size:25px;line-height:30px;font-weight:800;color:#ffffff;">Campnect</div>
                  <div style="margin-top:5px;font-size:12px;line-height:18px;letter-spacing:2px;color:#e8efff;">CAMPUS, CONNECTED</div>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 32px 32px;">
                  <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;color:${kind === 'success' ? '#2457e6' : '#c24157'};">${eyebrow}</div>
                  <h1 style="margin:10px 0 12px;font-size:30px;line-height:38px;font-weight:800;color:#111827;">${heading}</h1>
                  <p style="margin:0;color:#596278;font-size:16px;line-height:25px;">We noticed activity on your Campnect account.</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f8fc" style="margin:26px 0;background-color:#f6f8fc;border:1px solid #e0e5ef;border-radius:14px;">
                    <tr><td style="padding:18px 20px;">
                      <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;color:#6b7280;">ACTIVITY DETAILS</div>
                      <div style="margin-top:7px;color:#253047;font-size:15px;line-height:23px;">${safeDetail}</div>
                    </td></tr>
                  </table>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${kind === 'success' ? '#edf3ff' : '#fff1f3'}" style="background-color:${kind === 'success' ? '#edf3ff' : '#fff1f3'};border-radius:12px;">
                    <tr><td style="padding:15px 17px;color:${kind === 'success' ? '#254381' : '#9f1239'};font-size:13px;line-height:20px;">
                      ${kind === 'success'
                        ? 'If this was you, no action is needed. If you do not recognize this login, change your password immediately.'
                        : 'If this was not you, change your password immediately and review your active sessions.'}
                    </td></tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td bgcolor="#f8faff" style="padding:18px 32px;background-color:#f8faff;border-radius:0 0 19px 19px;color:#7b8497;font-size:12px;line-height:18px;">
                  Sent by Campnect &nbsp;&bull;&nbsp; Your campus community
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>`
  const t = getTransporter()
  if (t) await t.sendMail({ from: getSmtpFrom(), to: recipient, subject, html })
  else await sendWithGmail(recipient, subject, html)
}

export async function sendVerificationDecisionEmail(email: string, name: string, approved: boolean, reason = '') {
  const recipient = securityRecipient(email)
  const subject = approved ? 'Your Campnect verification was approved' : 'Your Campnect verification needs attention'
  const html = `<div style="font-family:Arial,sans-serif;color:#222">
    <h2>${approved ? 'Verification approved' : 'Verification not approved'}</h2>
    <p>Hi ${name},</p>
    <p>${approved ? 'Your student verification has been approved. Your verified status is now active on Campnect.' : 'We could not approve your student verification at this time.'}</p>
    ${!approved ? `<p><strong>Reason from the review team:</strong> ${reason || 'Please submit clearer or more complete documents.'}</p><p>You may submit a new verification request after correcting the issue.</p>` : ''}
    <p>— Campnect</p>
  </div>`
  const t = getTransporter()
  if (t) await t.sendMail({ from: getSmtpFrom(), to: recipient, subject, html })
  else await sendWithGmail(recipient, subject, html)
}

export async function sendSuspensionEmail(email: string, name: string, reason: string) {
  const recipient = securityRecipient(email)
  const subject = 'Your Campnect account has been suspended'
  const html = `<div style="font-family:Arial,sans-serif;color:#222">
    <h2>Your account has been suspended</h2>
    <p>Hi ${name}, your Campnect account is temporarily unavailable while this suspension is active.</p>
    <p><strong>Reason:</strong> ${reason || 'A violation of Campnect rules was reported.'}</p>
    <p>If you believe this is a mistake, contact Campnect support to appeal.</p>
  </div>`
  const t = getTransporter()
  if (t) await t.sendMail({ from: getSmtpFrom(), to: recipient, subject, html })
  else await sendWithGmail(recipient, subject, html)
}
