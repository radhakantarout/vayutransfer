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
    <div style="font-size:22px;font-weight:700;color:#00C6FF;margin-bottom:4px;">VayuStudio</div>
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
    Source: `${studioName} via VayuStudio <${FROM_EMAIL}>`,
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
    <div style="font-size:22px;font-weight:700;color:#00C6FF;margin-bottom:24px;">VayuStudio</div>
    <p style="color:#8BAAB8;font-size:14px;margin:0 0 24px;">Hi ${clientName}, here is your one-time code to access your gallery:</p>
    <div style="background:#0B0F1A;border:1px solid #1E2D45;border-radius:10px;padding:20px;margin-bottom:24px;">
      <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#00C6FF;font-family:monospace;">${otp}</div>
    </div>
    <p style="color:#5A7090;font-size:12px;margin:0;">Valid for 10 minutes. Do not share this with anyone.</p>
  </div>
</body>
</html>`.trim()

  await sesClient.send(new SendEmailCommand({
    Source: `VayuStudio <${FROM_EMAIL}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `${otp} is your VayuStudio verification code` },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: `Your VayuStudio OTP: ${otp}\n\nValid for 10 minutes. Do not share this with anyone.`, Charset: 'UTF-8' },
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

export async function sendEnquiryNotificationEmail(
  to: string,
  studioName: string,
  adminName: string,
  adminEmail: string,
  adminPhone: string,
  message: string,
  approveUrl: string
): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>New Studio Enquiry</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:800;color:#00C6FF;margin-bottom:4px;">Vayu<span style="color:#E0EAF8;">Studio</span></div>
    <div style="color:#5A7090;font-size:13px;margin-bottom:32px;">Platform Owner Alert</div>

    <h2 style="font-size:18px;font-weight:700;margin:0 0 20px;color:#E0EAF8;">New Studio Registration Request</h2>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      ${[
        ['Studio Name', studioName],
        ['Contact Name', adminName],
        ['Email', adminEmail],
        ['Phone', adminPhone],
        ...(message ? [['About', message]] : []),
      ].map(([label, value]) => `
      <tr>
        <td style="padding:10px 0;color:#5A7090;font-size:13px;width:120px;border-bottom:1px solid #1E2D45;">${label}</td>
        <td style="padding:10px 0;font-size:14px;font-weight:500;border-bottom:1px solid #1E2D45;">${value}</td>
      </tr>`).join('')}
    </table>

    <a href="${approveUrl}"
      style="display:inline-block;background:#0099CC;color:#fff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:16px;">
      ✓ Approve &amp; Create Studio
    </a>

    <p style="color:#5A7090;font-size:12px;margin-top:20px;">
      This link expires in 7 days. Clicking it will create the studio and email login credentials to the photographer.
    </p>
  </div>
</body>
</html>`.trim()

  await sesClient.send(
    new SendEmailCommand({
      Source: `VayuStudio <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `New studio enquiry — ${studioName}` },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: `New studio enquiry\n\nStudio: ${studioName}\nContact: ${adminName}\nEmail: ${adminEmail}\nPhone: ${adminPhone}${message ? `\nAbout: ${message}` : ''}\n\nApprove: ${approveUrl}`, Charset: 'UTF-8' },
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
<head><meta charset="utf-8"><title>Your VayuStudio is ready</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:800;color:#00C6FF;margin-bottom:4px;">Vayu<span style="color:#E0EAF8;">Studio</span></div>
    <div style="color:#5A7090;font-size:13px;margin-bottom:32px;">Your studio is ready 🎉</div>

    <p style="font-size:22px;font-weight:700;margin:0 0 8px;color:#E0EAF8;">Congratulations! 🎉🎁</p>
    <h2 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#E0EAF8;">Welcome, ${adminName}!</h2>
    <p style="color:#5A7090;font-size:14px;margin:0 0 28px;">Your studio <strong style="color:#E0EAF8;">${studioName}</strong> has been approved and is ready to use. Click the button below to set your password and sign in.</p>

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
      Source: `VayuStudio <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `Your VayuStudio is ready — ${studioName}` },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: `Welcome ${adminName}!\n\nYour studio "${studioName}" is ready.\n\nYour login email: ${email}\n\nSet your password and sign in: ${setupUrl}`, Charset: 'UTF-8' },
        },
      },
    })
  )
}
