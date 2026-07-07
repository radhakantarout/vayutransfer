import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const sesClient = new SESClient({
  region: process.env.SES_REGION ?? 'ap-south-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
})

const FROM_EMAIL = process.env.SES_FROM_EMAIL ?? 'noreply@vayutransfer.com'

export async function sendGalleryShareEmail(
  to: string,
  clientName: string,
  studioName: string,
  eventType: string,
  eventDate: string,
  shareUrl: string,
  expiryDays: number
): Promise<void> {
  const expiry = new Date(Date.now() + expiryDays * 86400_000).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  })
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:700;color:#00C6FF;margin-bottom:4px;">VayuStudios</div>
    <div style="color:#5A7090;font-size:13px;margin-bottom:28px;">${studioName}</div>
    <p style="font-size:16px;font-weight:600;color:#E0EAF8;margin:0 0 8px;">Hi ${clientName},</p>
    <p style="color:#8BAAB8;font-size:14px;line-height:1.7;margin:0 0 28px;">
      Your photos from <strong style="color:#E0EAF8;">${eventType.replace('_', ' ')}</strong> are ready!
      Click below to view and select your favourites.
    </p>
    <div style="background:#0B0F1A;border:1px solid #1E2D45;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
      <div style="color:#5A7090;font-size:12px;">Event date</div>
      <div style="font-size:14px;color:#E0EAF8;font-weight:600;margin-top:2px;">${new Date(eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div style="color:#5A7090;font-size:12px;margin-top:10px;">Gallery expires</div>
      <div style="font-size:14px;color:#E0EAF8;font-weight:600;margin-top:2px;">${expiry}</div>
    </div>
    <a href="${shareUrl}"
       style="display:block;background:#00C6FF;color:#0B0F1A;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:20px;">
      View Your Gallery →
    </a>
    <p style="color:#5A7090;font-size:12px;line-height:1.6;margin:0;">
      You'll be asked to verify your email when you open the link. This keeps your photos private and secure.
    </p>
  </div>
</body>
</html>`.trim()

  await sesClient.send(new SendEmailCommand({
    Source: `${studioName} via VayuStudios <${FROM_EMAIL}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `Your photos are ready — ${studioName}` },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: `Hi ${clientName},\n\nYour photos from ${eventType.replace('_', ' ')} are ready.\n\nView gallery: ${shareUrl}\n\nExpires: ${expiry}`, Charset: 'UTF-8' },
      },
    },
  }))
}

export async function sendClientOtpEmail(
  to: string,
  clientName: string,
  otp: string
): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:400px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#00C6FF;margin-bottom:24px;">VayuStudios</div>
    <p style="color:#8BAAB8;font-size:14px;margin:0 0 24px;">Hi ${clientName}, here is your one-time code to access your gallery:</p>
    <div style="background:#0B0F1A;border:1px solid #1E2D45;border-radius:10px;padding:20px;margin-bottom:24px;">
      <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#00C6FF;font-family:monospace;">${otp}</div>
    </div>
    <p style="color:#5A7090;font-size:12px;margin:0;">Valid for 10 minutes. Do not share this with anyone.</p>
  </div>
</body>
</html>`.trim()

  await sesClient.send(new SendEmailCommand({
    Source: `VayuStudios <${FROM_EMAIL}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `${otp} is your VayuStudios verification code` },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: `Your VayuStudios OTP: ${otp}\n\nValid for 10 minutes. Do not share this with anyone.`, Charset: 'UTF-8' },
      },
    },
  }))
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`
}

export async function sendTransferLinkEmail(
  recipient: string,
  fileName: string,
  downloadUrl: string,
  expiryTime: string,
  downloadsAllowed: number
): Promise<void> {
  const expiry = new Date(expiryTime).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>File Ready to Download</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:24px;font-weight:700;color:#00C6FF;margin-bottom:8px;">VayuTransfer</div>
    <div style="color:#5A7090;font-size:14px;margin-bottom:32px;">Secure file transfer. Prepaid. No surprises.</div>

    <h2 style="font-size:20px;font-weight:600;margin:0 0 16px;">A file is ready for you</h2>

    <div style="background:#0B0F1A;border-radius:8px;padding:16px;margin-bottom:24px;border:1px solid #1E2D45;">
      <div style="font-weight:600;margin-bottom:4px;">${fileName}</div>
      <div style="color:#5A7090;font-size:14px;">${downloadsAllowed} download${downloadsAllowed !== 1 ? 's' : ''} allowed · Expires ${expiry} IST</div>
    </div>

    <a href="${downloadUrl}"
       style="display:block;background:#00C6FF;color:#0B0F1A;text-align:center;padding:14px;border-radius:8px;font-weight:700;font-size:16px;text-decoration:none;margin-bottom:24px;">
      Download File
    </a>

    <div style="color:#5A7090;font-size:12px;line-height:1.6;">
      This link expires on ${expiry} IST or after ${downloadsAllowed} download${downloadsAllowed !== 1 ? 's' : ''}, whichever comes first.
      Do not share this link with others unless intended.
    </div>
  </div>
</body>
</html>
  `.trim()

  await sesClient.send(
    new SendEmailCommand({
      Source: `VayuTransfer <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [recipient] },
      Message: {
        Subject: { Data: `Your file "${fileName}" is ready to download` },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: {
            Data: `Your file "${fileName}" is ready.\n\nDownload here: ${downloadUrl}\n\nExpires: ${expiry} IST | Downloads allowed: ${downloadsAllowed}`,
            Charset: 'UTF-8',
          },
        },
      },
    })
  )
}

export async function sendWalletCreditedEmail(
  email: string,
  amountPaise: number,
  bonusPaise: number,
  newBalancePaise: number
): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Wallet Credited</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:24px;font-weight:700;color:#00C6FF;margin-bottom:8px;">VayuTransfer</div>
    <div style="color:#5A7090;font-size:14px;margin-bottom:32px;">Secure file transfer. Prepaid. No surprises.</div>

    <h2 style="font-size:20px;font-weight:600;margin:0 0 16px;color:#00E5A0;">Wallet Credited!</h2>

    <div style="background:#0B0F1A;border-radius:8px;padding:16px;margin-bottom:24px;border:1px solid #1E2D45;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:#5A7090;">Amount paid</span>
        <span>${formatPaise(amountPaise)}</span>
      </div>
      ${bonusPaise > 0 ? `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:#5A7090;">Bonus credits</span>
        <span style="color:#00E5A0;">+ ${formatPaise(bonusPaise)}</span>
      </div>` : ''}
      <div style="border-top:1px solid #1E2D45;margin:8px 0;padding-top:8px;display:flex;justify-content:space-between;font-weight:700;">
        <span>New balance</span>
        <span style="color:#00C6FF;">${formatPaise(newBalancePaise)}</span>
      </div>
    </div>

    <div style="color:#5A7090;font-size:12px;">
      Credits never expire. Use them anytime to upload and share files.
    </div>
  </div>
</body>
</html>
  `.trim()

  await sesClient.send(
    new SendEmailCommand({
      Source: `VayuTransfer <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: `Wallet credited — ${formatPaise(amountPaise + bonusPaise)} added` },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: {
            Data: `Wallet credited.\n\nAmount paid: ${formatPaise(amountPaise)}${bonusPaise > 0 ? `\nBonus: ${formatPaise(bonusPaise)}` : ''}\nNew balance: ${formatPaise(newBalancePaise)}`,
            Charset: 'UTF-8',
          },
        },
      },
    })
  )
}

export async function sendStudioCredentialsEmail(
  to: string,
  adminName: string,
  studioName: string,
  email: string,
  setupUrl: string
): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your VayuStudios is ready</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:800;color:#00C6FF;margin-bottom:4px;">Vayu<span style="color:#E0EAF8;">Studio</span></div>
    <div style="color:#5A7090;font-size:13px;margin-bottom:32px;">Your studio is ready 🎉</div>

    <p style="font-size:22px;font-weight:700;margin:0 0 8px;color:#E0EAF8;">Congratulations! 🎉🎁</p>
    <h2 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#E0EAF8;">Welcome, ${adminName}!</h2>
    <p style="color:#5A7090;font-size:14px;margin:0 0 28px;">Your studio <strong style="color:#E0EAF8;">${studioName}</strong> is ready. Click the button below to set your password and access your dashboard.</p>

    <div style="background:#0B0F1A;border-radius:10px;padding:20px;margin-bottom:28px;border:1px solid #1E2D45;">
      <div style="color:#5A7090;font-size:12px;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">Your login email</div>
      <div style="font-size:15px;font-weight:600;">${email}</div>
    </div>

    <a href="${setupUrl}"
      style="display:inline-block;background:#0099CC;color:#fff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:20px;">
      Set your password &amp; sign in →
    </a>

    <p style="color:#5A7090;font-size:12px;">The link above takes you directly to the password setup screen. If you have any questions, reply to this email.</p>
  </div>
</body>
</html>`.trim()

  await sesClient.send(
    new SendEmailCommand({
      Source: `VayuStudios <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `Your VayuStudios is ready — ${studioName}` },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: `Welcome ${adminName}!\n\nYour studio "${studioName}" is ready.\n\nYour login email: ${email}\n\nSign in here: ${setupUrl}`, Charset: 'UTF-8' },
        },
      },
    })
  )
}

export async function sendSelectionSubmittedEmail(
  to: string,
  clientName: string,
  eventType: string,
  selectedCount: number,
  editingCount: number,
  commentCount: number,
  dashboardUrl: string
): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Selection Submitted</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:800;color:#00C6FF;margin-bottom:4px;">Vayu<span style="color:#E0EAF8;">Studio</span></div>
    <div style="color:#5A7090;font-size:13px;margin-bottom:28px;">Client selection submitted</div>

    <h2 style="font-size:18px;font-weight:700;margin:0 0 20px;color:#E0EAF8;">${clientName} has submitted their photo selection</h2>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      ${[
        ['Event type',       eventType.replace('_', ' ')],
        ['Photos selected',  String(selectedCount)],
        ['Editing requested', String(editingCount)],
        ['Comments left',    String(commentCount)],
      ].map(([label, value]) => `
      <tr>
        <td style="padding:10px 0;color:#5A7090;font-size:13px;width:150px;border-bottom:1px solid #1E2D45;">${label}</td>
        <td style="padding:10px 0;font-size:14px;font-weight:500;border-bottom:1px solid #1E2D45;">${value}</td>
      </tr>`).join('')}
    </table>

    <a href="${dashboardUrl}"
      style="display:inline-block;background:#0099CC;color:#fff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">
      View Selection →
    </a>
  </div>
</body>
</html>`.trim()

  await sesClient.send(
    new SendEmailCommand({
      Source: `VayuStudios <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `${clientName} submitted their selection — ${selectedCount} photo${selectedCount !== 1 ? 's' : ''}` },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: `${clientName} has submitted their photo selection\n\nEvent type: ${eventType.replace('_', ' ')}\nPhotos selected: ${selectedCount}\nEditing requested: ${editingCount}\nComments left: ${commentCount}\n\nView: ${dashboardUrl}`, Charset: 'UTF-8' },
        },
      },
    })
  )
}

export async function sendOwnerStudioCreatedEmail(
  to: string,
  studioName: string,
  adminName: string,
  adminEmail: string,
  message?: string
): Promise<void> {
  const now = new Date().toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Studio Created</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:800;color:#00C6FF;margin-bottom:4px;">Vayu<span style="color:#E0EAF8;">Studio</span></div>
    <div style="color:#5A7090;font-size:13px;margin-bottom:32px;">Platform Owner — Studio Created</div>

    <h2 style="font-size:18px;font-weight:700;margin:0 0 20px;color:#E0EAF8;">Studio successfully created ✓</h2>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      ${[
        ['Studio Name', studioName],
        ['Admin Name',  adminName],
        ['Admin Email', adminEmail],
        ['Created At',  now],
        ...(message ? [['About', message]] : []),
      ].map(([label, value]) => `
      <tr>
        <td style="padding:10px 0;color:#5A7090;font-size:13px;width:120px;border-bottom:1px solid #1E2D45;vertical-align:top;">${label}</td>
        <td style="padding:10px 0;font-size:14px;font-weight:500;border-bottom:1px solid #1E2D45;">${value}</td>
      </tr>`).join('')}
    </table>

    <p style="color:#5A7090;font-size:13px;margin:0;">
      The studio admin has been sent their welcome email with a login link.
      Their account is active and ready to use.
    </p>
  </div>
</body>
</html>`.trim()

  await sesClient.send(
    new SendEmailCommand({
      Source: `VayuStudios <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `Studio created — ${studioName} (${adminEmail})` },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: `Studio created\n\nStudio: ${studioName}\nAdmin: ${adminName}\nEmail: ${adminEmail}\nCreated: ${now}${message ? `\nAbout: ${message}` : ''}`, Charset: 'UTF-8' },
        },
      },
    })
  )
}

export async function sendBookingNotificationEmail(
  to: string,
  studioName: string,
  booking: { name: string; email: string; phone?: string; eventType?: string; eventDate?: string; message?: string }
): Promise<void> {
  const html = `
<html><body style="font-family:sans-serif;max-width:520px;margin:40px auto;color:#1a1a1a">
  <h2 style="color:#6366f1">New Booking Enquiry — ${studioName}</h2>
  <table style="width:100%;border-collapse:collapse;margin:20px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#666;width:130px">Name</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600">${booking.name}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#666">Email</td><td style="padding:8px 0;border-bottom:1px solid #eee">${booking.email}</td></tr>
    ${booking.phone ? `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#666">Phone</td><td style="padding:8px 0;border-bottom:1px solid #eee">${booking.phone}</td></tr>` : ''}
    ${booking.eventType ? `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#666">Event type</td><td style="padding:8px 0;border-bottom:1px solid #eee">${booking.eventType}</td></tr>` : ''}
    ${booking.eventDate ? `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#666">Event date</td><td style="padding:8px 0;border-bottom:1px solid #eee">${booking.eventDate}</td></tr>` : ''}
    ${booking.message ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top">Message</td><td style="padding:8px 0">${booking.message}</td></tr>` : ''}
  </table>
  <p style="color:#888;font-size:12px">Reply directly to this email to respond to the client. View all bookings in your VayuStudios dashboard.</p>
</body></html>`.trim()

  await sesClient.send(
    new SendEmailCommand({
      Source: `VayuStudios <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: [booking.email],
      Message: {
        Subject: { Data: `New booking enquiry from ${booking.name} — ${studioName}` },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: `New enquiry\n\nFrom: ${booking.name} (${booking.email})\nPhone: ${booking.phone ?? '-'}\nEvent: ${booking.eventType ?? '-'} on ${booking.eventDate ?? '-'}\n\n${booking.message ?? ''}`, Charset: 'UTF-8' },
        },
      },
    })
  )
}

function statusEmailShell(title: string, accentColor: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:800;color:${accentColor};margin-bottom:4px;">Vayu<span style="color:#E0EAF8;">Studio</span></div>
    ${bodyHtml}
  </div>
</body>
</html>`.trim()
}

export async function sendStudioSuspendedEmail(
  to: string,
  studioName: string,
  reason?: string
): Promise<void> {
  const html = statusEmailShell('Account Suspended', '#F87171', `
    <h2 style="font-size:18px;font-weight:700;margin:24px 0 12px;color:#E0EAF8;">Your studio account has been suspended</h2>
    <p style="color:#8BAAB8;font-size:14px;line-height:1.7;margin:0 0 20px;">
      <strong style="color:#E0EAF8;">${studioName}</strong> has been temporarily suspended by the VayuStudios team.
      Your galleries and dashboard are inaccessible until it's reactivated.
    </p>
    ${reason ? `
    <div style="background:#0B0F1A;border:1px solid #1E2D45;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="color:#5A7090;font-size:12px;margin-bottom:4px;">Reason</div>
      <div style="font-size:14px;color:#E0EAF8;">${reason}</div>
    </div>` : ''}
    <p style="color:#5A7090;font-size:13px;line-height:1.6;margin:0;">
      This is usually reversible. Reply to this email or contact support@vayutransfer.com if you have questions.
    </p>
  `)

  await sesClient.send(new SendEmailCommand({
    Source: `VayuStudios <${FROM_EMAIL}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `Your studio account has been suspended — ${studioName}` },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: `Your studio "${studioName}" has been suspended.${reason ? `\n\nReason: ${reason}` : ''}\n\nContact support@vayutransfer.com if you have questions.`, Charset: 'UTF-8' },
      },
    },
  }))
}

export async function sendStudioReactivatedEmail(
  to: string,
  studioName: string
): Promise<void> {
  const html = statusEmailShell('Account Reactivated', '#00E5A0', `
    <h2 style="font-size:18px;font-weight:700;margin:24px 0 12px;color:#E0EAF8;">Welcome back! 🎉</h2>
    <p style="color:#8BAAB8;font-size:14px;line-height:1.7;margin:0 0 20px;">
      <strong style="color:#E0EAF8;">${studioName}</strong> has been reactivated. Your dashboard, galleries, and
      client links are working again.
    </p>
  `)

  await sesClient.send(new SendEmailCommand({
    Source: `VayuStudios <${FROM_EMAIL}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `Your studio account is active again — ${studioName}` },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: `Good news — "${studioName}" has been reactivated and is accessible again.`, Charset: 'UTF-8' },
      },
    },
  }))
}

export async function sendStudioDeletedEmail(
  to: string,
  studioName: string,
  reason?: string
): Promise<void> {
  const html = statusEmailShell('Account Deleted', '#F87171', `
    <h2 style="font-size:18px;font-weight:700;margin:24px 0 12px;color:#E0EAF8;">Your studio account has been deleted</h2>
    <p style="color:#8BAAB8;font-size:14px;line-height:1.7;margin:0 0 20px;">
      <strong style="color:#E0EAF8;">${studioName}</strong> and all its projects, photos, and client data have been
      permanently removed from VayuStudios by the platform team.
    </p>
    ${reason ? `
    <div style="background:#0B0F1A;border:1px solid #1E2D45;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="color:#5A7090;font-size:12px;margin-bottom:4px;">Reason</div>
      <div style="font-size:14px;color:#E0EAF8;">${reason}</div>
    </div>` : ''}
    <p style="color:#5A7090;font-size:13px;line-height:1.6;margin:0;">
      If you believe this was a mistake, contact support@vayutransfer.com as soon as possible.
    </p>
  `)

  await sesClient.send(new SendEmailCommand({
    Source: `VayuStudios <${FROM_EMAIL}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `Your studio account has been deleted — ${studioName}` },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: `Your studio "${studioName}" and all its data have been permanently deleted.${reason ? `\n\nReason: ${reason}` : ''}\n\nContact support@vayutransfer.com if you believe this was a mistake.`, Charset: 'UTF-8' },
      },
    },
  }))
}
