export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-extrabold text-text-primary mb-2">Privacy Policy</h1>
      <p className="text-muted text-sm mb-10">Last updated: June 2025</p>

      <div className="prose prose-invert max-w-none space-y-8 text-text-primary">

        <section>
          <h2 className="text-xl font-bold mb-3">1. Information We Collect</h2>
          <p className="text-muted leading-relaxed">
            When you sign in with Google, we receive your name, email address, and profile photo from Google OAuth. We store this to associate your wallet and transfer history with your account.
          </p>
          <p className="text-muted leading-relaxed mt-3">
            When you upload a file, we store metadata about the transfer (file name, size, expiry time, number of download slots) but we do not read or analyse your file contents.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">2. How We Use Your Information</h2>
          <ul className="text-muted space-y-2 list-disc list-inside leading-relaxed">
            <li>To create and manage your prepaid wallet</li>
            <li>To process file transfers and generate shareable links</li>
            <li>To send download notification emails to your recipients (only if you provide their email)</li>
            <li>To maintain an audit log for security and fraud prevention</li>
            <li>To credit your ₹50 welcome bonus on first sign-in</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">3. Data Storage</h2>
          <p className="text-muted leading-relaxed">
            Files are stored on Amazon S3 (ap-south-1 — Mumbai region) with server-side encryption. User records and wallet data are stored on Amazon DynamoDB. All data is hosted within India.
          </p>
          <p className="text-muted leading-relaxed mt-3">
            Files are automatically deleted when their transfer link expires (default: 24 hours). We do not retain file contents after expiry.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">4. Data Sharing</h2>
          <p className="text-muted leading-relaxed">
            We do not sell, rent, or share your personal data with third parties for marketing purposes. We use the following services to operate the platform:
          </p>
          <ul className="text-muted space-y-2 list-disc list-inside mt-3 leading-relaxed">
            <li>Amazon Web Services (S3, DynamoDB, SES) — file storage and email delivery</li>
            <li>Google OAuth — authentication only</li>
            <li>Razorpay — payment processing (when you top up your wallet)</li>
            <li>Vercel — web hosting</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">5. Download Recipient Privacy</h2>
          <p className="text-muted leading-relaxed">
            When a file is downloaded, we log an anonymised IP hash (SHA-256, never the raw IP) and browser user agent for security purposes. We do not link download events to any personal identity unless the downloader is a registered user.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">6. Your Rights</h2>
          <p className="text-muted leading-relaxed">
            You may request deletion of your account and all associated data by emailing <a href="mailto:support@vayutransfer.com" className="text-accent hover:underline">support@vayutransfer.com</a>. Note that wallet transactions are retained for financial compliance purposes for up to 7 years.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">7. Cookies</h2>
          <p className="text-muted leading-relaxed">
            We use a single secure HTTP-only session cookie to maintain your wallet session (for anonymous users) or your login state (for signed-in users). We do not use tracking or advertising cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">8. Contact</h2>
          <p className="text-muted leading-relaxed">
            For privacy-related questions, email <a href="mailto:support@vayutransfer.com" className="text-accent hover:underline">support@vayutransfer.com</a>.
          </p>
        </section>
      </div>
    </main>
  )
}
