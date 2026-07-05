import type { Metadata } from 'next'
import { LegalHero, LegalToc, LegalSection, TrustBadge, Icons } from '@/components/legal/LegalShell'

export const metadata: Metadata = {
  title: 'Terms of Service — VayuTransfer & VayuStudios',
  description: 'The terms governing your use of VayuTransfer (file transfer) and VayuStudios (photo gallery delivery).',
}

const TOC = [
  { id: 'acceptance', label: 'Acceptance' },
  { id: 'wallet',      label: 'Wallet & Billing' },
  { id: 'studio-plans', label: 'Studio Plans' },
  { id: 'admin-duty',  label: 'Studio Admin Duties' },
  { id: 'permitted',   label: 'Permitted Use' },
  { id: 'selections',  label: 'Client Selections' },
  { id: 'retention',   label: 'File Retention' },
  { id: 'bookings',    label: 'Booking Enquiries' },
  { id: 'availability', label: 'Availability' },
  { id: 'suspension',  label: 'Suspension & Deletion' },
  { id: 'liability',   label: 'Liability' },
  { id: 'law',         label: 'Governing Law' },
  { id: 'changes',     label: 'Changes' },
  { id: 'contact',     label: 'Contact' },
]

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-bg">
      <LegalHero
        eyebrow="Terms of Service"
        title="The fine print, in plain language"
        tagline="These terms cover VayuTransfer (prepaid file transfer) and VayuStudios (photo gallery delivery for photographers) — one company, one set of rules, both built to be predictable and fair."
        updated="July 2026"
      />

      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <TrustBadge icon={<Icons.Wallet />} label="Refund on failure" sub="Failed/aborted uploads are auto-refunded" />
          <TrustBadge icon={<Icons.Ban />}     label="No illegal content" sub="Malware, CSAM, and IP violations are banned" />
          <TrustBadge icon={<Icons.Alert />}   label="Transparent suspension" sub="You're emailed a reason if it happens" />
          <TrustBadge icon={<Icons.Scale />}   label="Indian law"        sub="Governed by Indian courts & the IT Act" />
          <TrustBadge icon={<Icons.Camera />}  label="Consent required"  sub="Studios must have client consent for face search" />
          <TrustBadge icon={<Icons.Clock />}   label="Clear expiry"      sub="Every link states its own retention window" />
        </div>

        <LegalToc items={TOC} />

        <LegalSection id="acceptance" icon={<Icons.Doc />} title="1. Acceptance of Terms">
          <p>
            By using VayuTransfer (vayutransfer.com) or VayuStudios (vayustudios.com and any studio subdomain, e.g.
            yourstudio.vayustudios.com), you agree to be bound by these Terms of Service. If you do not agree, you
            may not use either service. These terms govern both products and their APIs.
          </p>
        </LegalSection>

        <LegalSection id="wallet" icon={<Icons.Wallet />} title="2. Prepaid Wallet & Billing (VayuTransfer)">
          <ul>
            <li>VayuTransfer runs on a prepaid wallet model — load credits before uploading files</li>
            <li>Wallet credits are deducted before upload begins; this is non-refundable once the upload completes</li>
            <li>If an upload fails or is aborted before completion, credits are automatically refunded</li>
            <li>Credits have no expiry, are non-transferable, and cannot be withdrawn as cash</li>
            <li>The ₹50 welcome credit for new registered users cannot be transferred or withdrawn</li>
          </ul>
        </LegalSection>

        <LegalSection id="studio-plans" icon={<Icons.Card />} title="3. Studio Plans & Billing (VayuStudios)">
          <p>
            VayuStudios is offered on Starter, Pro, Studio, and Enterprise plans, each with different feature limits
            (storage, video support, AI face recognition, and more). Current pricing is listed at{' '}
            <a href="/studio/pricing">vayustudios.com/pricing</a>. Plan changes and billing questions are handled by
            our team via WhatsApp or email — we do not auto-charge without your confirmation.
          </p>
        </LegalSection>

        <LegalSection id="admin-duty" icon={<Icons.Camera />} title="4. Studio Admin Responsibilities">
          <ul>
            <li>You may only upload photos you own or have the legal right to deliver on behalf of your clients</li>
            <li>You are responsible for obtaining consent from clients and event guests before enabling AI Face
              Recognition (Selfie Search) for an event</li>
            <li>You are responsible for obtaining parental/guardian consent when photographing minors</li>
            <li>Client contact details (name, email, phone) you enter must be accurate and provided with the
              client's knowledge, since we use them to grant gallery access</li>
          </ul>
        </LegalSection>

        <LegalSection id="permitted" icon={<Icons.Ban />} title="5. Permitted Use">
          <p>You may only upload or transfer content you own or have the legal right to share. You must not upload:</p>
          <ul>
            <li>Content that violates copyright, trademarks, or intellectual property rights</li>
            <li>Malware, ransomware, viruses, or any malicious code</li>
            <li>Child sexual abuse material (CSAM) or any illegal content</li>
            <li>Content that violates Indian law, including the IT Act, 2000</li>
            <li>Personal data of third parties without their consent</li>
          </ul>
        </LegalSection>

        <LegalSection id="selections" icon={<Icons.Shield />} title="6. Client Selections (VayuStudios)">
          <p>
            Clients may mark photos as favourites or for editing within their private gallery. Selections are
            visible to the studio admin in real time. Studio admins retain full control over final delivery,
            editing, and printing — VayuStudios only facilitates the communication of client preferences.
          </p>
        </LegalSection>

        <LegalSection id="retention" icon={<Icons.Clock />} title="7. File & Photo Retention">
          <p>
            VayuTransfer files are available only during the active transfer window (default: 24 hours) and are
            permanently deleted after expiry — we keep no backups of transferred files. VayuStudios galleries remain
            available until the studio admin closes the project, and print-portal links expire after 7 days.
          </p>
        </LegalSection>

        <LegalSection id="bookings" icon={<Icons.Mail />} title="8. Booking Enquiries (VayuStudios)">
          <p>
            The booking form on a studio's website simply forwards an enquiry from a prospective client to the
            studio admin. VayuStudios does not review, guarantee, or take responsibility for the services, pricing,
            or availability offered by any individual studio — that arrangement is solely between the studio and
            its client.
          </p>
        </LegalSection>

        <LegalSection id="availability" icon={<Icons.Server />} title="9. Service Availability">
          <p>
            We aim for high availability but do not guarantee 100% uptime. We are not liable for losses arising from
            service interruptions, failed transfers, or data loss. Both services are provided on a best-effort
            basis.
          </p>
        </LegalSection>

        <LegalSection id="suspension" icon={<Icons.Alert />} title="10. Account Suspension & Termination">
          <p>
            We reserve the right to suspend or delete accounts that violate these terms. When this happens to a
            VayuStudios studio account, the admin is notified by email explaining the change and, where applicable,
            the reason. Deleting an account permanently removes its projects, photos, and face-index data — this
            cannot be undone. VayuTransfer wallet credits are not refunded on termination for a violation.
          </p>
        </LegalSection>

        <LegalSection id="liability" icon={<Icons.Scale />} title="11. Limitation of Liability">
          <p>
            Neither VayuTransfer nor VayuStudios is liable for indirect, incidental, or consequential damages
            arising from use of the services. Our total liability for VayuTransfer is limited to the wallet credits
            held in your account at the time of the incident.
          </p>
        </LegalSection>

        <LegalSection id="law" icon={<Icons.Scale />} title="12. Governing Law">
          <p>
            These terms are governed by the laws of India. Any disputes shall be resolved in courts located in
            Bengaluru, Karnataka, India.
          </p>
        </LegalSection>

        <LegalSection id="changes" icon={<Icons.Doc />} title="13. Changes to These Terms">
          <p>
            We may update these terms as the products evolve. Material changes will be reflected by updating the
            "Last updated" date at the top of this page — continued use after a change means you accept the revised
            terms.
          </p>
        </LegalSection>

        <LegalSection id="contact" icon={<Icons.Mail />} title="14. Contact">
          <p>
            Questions about these terms? Email{' '}
            <a href="mailto:support@vayutransfer.com">support@vayutransfer.com</a> or reach us on{' '}
            <a href="https://wa.me/918984769522" target="_blank" rel="noopener noreferrer">WhatsApp</a>.
          </p>
        </LegalSection>
      </div>
    </main>
  )
}
