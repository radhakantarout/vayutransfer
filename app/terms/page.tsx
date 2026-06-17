export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-extrabold text-text-primary mb-2">Terms of Service</h1>
      <p className="text-muted text-sm mb-10">Last updated: June 2025</p>

      <div className="prose prose-invert max-w-none space-y-8 text-text-primary">

        <section>
          <h2 className="text-xl font-bold mb-3">1. Acceptance of Terms</h2>
          <p className="text-muted leading-relaxed">
            By using VayuTransfer (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service. These terms govern your use of vayutransfer.com and all associated APIs.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">2. Prepaid Wallet &amp; Billing</h2>
          <ul className="text-muted space-y-2 list-disc list-inside leading-relaxed">
            <li>VayuTransfer operates on a prepaid wallet model. You must load credits before uploading files.</li>
            <li>Wallet credits are deducted before file upload begins. This is non-refundable once the upload completes.</li>
            <li>If an upload fails or is aborted before completion, credits are automatically refunded to your wallet.</li>
            <li>Wallet credits have no expiry date but are non-transferable and cannot be withdrawn as cash.</li>
            <li>₹50 welcome credits are granted to new registered users and cannot be transferred or withdrawn.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">3. Permitted Use</h2>
          <p className="text-muted leading-relaxed">You may only use VayuTransfer to transfer files that you own or have the legal right to share. You must not upload:</p>
          <ul className="text-muted space-y-2 list-disc list-inside mt-3 leading-relaxed">
            <li>Content that violates copyright, trademarks, or intellectual property rights</li>
            <li>Malware, ransomware, viruses, or any malicious code</li>
            <li>Child sexual abuse material (CSAM) or any illegal content</li>
            <li>Content that violates Indian law including the IT Act, 2000</li>
            <li>Personal data of third parties without their consent</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">4. File Retention &amp; Expiry</h2>
          <p className="text-muted leading-relaxed">
            Files are available for download only during the active transfer window (default: 24 hours from upload). After expiry, files are permanently deleted from our servers. We do not maintain backups of transferred files.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">5. Download Slots</h2>
          <p className="text-muted leading-relaxed">
            Each transfer link has a fixed number of download slots purchased at upload time. Once all slots are consumed, the link is deactivated. Each slot costs ₹5. Unused slots are not refunded after upload completes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">6. Service Availability</h2>
          <p className="text-muted leading-relaxed">
            We aim for high availability but do not guarantee 100% uptime. We are not liable for losses arising from service interruptions, failed transfers, or data loss. File transfers are provided on a best-effort basis.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">7. Account Termination</h2>
          <p className="text-muted leading-relaxed">
            We reserve the right to suspend or terminate accounts that violate these terms, without refund of unused wallet credits. You may close your account at any time by contacting support.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">8. Limitation of Liability</h2>
          <p className="text-muted leading-relaxed">
            VayuTransfer is not liable for any indirect, incidental, or consequential damages arising from use of the Service. Our total liability is limited to the amount of wallet credits held in your account at the time of the incident.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">9. Governing Law</h2>
          <p className="text-muted leading-relaxed">
            These terms are governed by the laws of India. Any disputes shall be resolved in courts located in Bengaluru, Karnataka, India.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">10. Contact</h2>
          <p className="text-muted leading-relaxed">
            Questions about these terms? Email <a href="mailto:support@vayutransfer.com" className="text-accent hover:underline">support@vayutransfer.com</a>.
          </p>
        </section>
      </div>
    </main>
  )
}
