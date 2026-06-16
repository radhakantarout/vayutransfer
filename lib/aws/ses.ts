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

const FROM_EMAIL = process.env.SES_FROM_EMAIL ?? 'noreply@vayutransfer.in'

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
