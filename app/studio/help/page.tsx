import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Help & Support — VayuStudios',
  description: 'Get help with VayuStudios — FAQ, contact support via WhatsApp or email.',
}

const FAQS = [
  {
    category: 'Getting started',
    items: [
      { q: 'How do I get my studio set up?', a: 'Fill in the enquiry form on our home page. We\'ll set up your studio, create your admin account, and send you a password setup link within 24 hours.' },
      { q: 'Do my clients need to install an app?', a: 'No. Clients open the gallery link in any phone browser, enter their phone number, get an OTP, and are in. No app, no download, no password.' },
      { q: 'Can I try before I pay?', a: 'Yes — we give you a trial period to test with a real shoot. Contact us to get started.' },
    ],
  },
  {
    category: 'Gallery & Photos',
    items: [
      { q: 'How do I upload photos to a project?', a: 'From your dashboard, open a project and use the upload button. You can upload in bulk — watermarked previews are generated automatically.' },
      { q: 'Can clients download the original photos?', a: 'No. Clients only see watermarked previews. Original files are delivered only to your print lab via a secure, time-limited link you generate.' },
      { q: 'What file formats are supported?', a: 'JPEG, PNG, WebP, and RAW (preview is generated from RAW). We recommend uploading JPEG exports for fastest processing.' },
      { q: 'How long are gallery links active?', a: 'Gallery links are active until you close the project or revoke access. Print lab links expire after 7 days (configurable).' },
    ],
  },
  {
    category: 'Client selections',
    items: [
      { q: 'How does the client select photos?', a: 'Clients tap the heart icon on any photo to mark it as selected. They tap the 3-dot menu to leave a per-photo comment or editing note.' },
      { q: 'Where do I see client selections?', a: 'On your dashboard, open the project. You\'ll see exactly which photos are hearted, which have edit notes, and all comments in real time.' },
      { q: 'Can I see when the client last viewed the gallery?', a: 'Yes — the project status updates when the client opens the gallery, and you can see selection activity timestamps.' },
    ],
  },
  {
    category: 'AI Face Search & Guest QR',
    items: [
      { q: 'How does AI face search work?', a: 'When you upload photos, our system indexes every face. When a client (or guest) takes a selfie, it matches against that index and shows only their photos.' },
      { q: 'How do I set up a Guest QR code for an event?', a: 'From your project dashboard, click "Generate Guest QR". Download the card, print it, and place it at the venue. Guests scan to find their photos instantly.' },
      { q: 'How accurate is the face matching?', a: 'Very high accuracy for individual faces in standard lighting. Group photos and crowd shots are supported too — low-confidence results are clearly marked.' },
    ],
  },
  {
    category: 'Account & Team',
    items: [
      { q: 'How do I add a team member?', a: 'As Studio Admin, go to your dashboard settings and add a team member. You can assign Admin (full access) or Print (print delivery only) roles.' },
      { q: 'I forgot my password. What do I do?', a: 'On the login page, click "Forgot password". Enter your email, get an OTP, and set a new password. No admin involvement needed.' },
      { q: 'Can I have multiple studios under one account?', a: 'Each studio has its own admin. If you manage multiple studios, contact us — we\'ll set up your Owner account with access to all of them.' },
    ],
  },
]

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-16 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Help & Support</span>
          <h1 className="text-4xl font-extrabold text-text-primary mt-3 mb-4">How can we help?</h1>
          <p className="text-muted text-base">Find answers below or reach us directly — we respond within a few hours.</p>
          <div className="flex items-center justify-center gap-4 mt-6 flex-wrap">
            <a href="https://wa.me/918984769522" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-semibold px-5 py-2.5 rounded-xl hover:bg-[#25D366]/20 transition-colors text-sm">
              <svg className="w-4 h-4" viewBox="0 0 32 32" fill="currentColor"><path d="M16 4.5C10.201 4.5 5.5 9.201 5.5 15c0 2.21.71 4.26 1.914 5.932L5.5 27.5l6.75-1.594A11.46 11.46 0 0016 27c5.799 0 10.5-4.701 10.5-11S21.799 4.5 16 4.5z"/></svg>
              WhatsApp us
            </a>
            <a href="mailto:support@vayutransfer.com"
              className="flex items-center gap-2 bg-accent/10 border border-accent/30 text-accent font-semibold px-5 py-2.5 rounded-xl hover:bg-accent/20 transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="4" width="20" height="16" rx="3"/><path strokeLinecap="round" d="M2 7l9.293 6.293a1 1 0 001.414 0L22 7"/></svg>
              Email support
            </a>
          </div>
        </div>
      </section>

      {/* FAQ sections */}
      <section className="max-w-3xl mx-auto px-4 py-16 space-y-10">
        {FAQS.map((section) => (
          <div key={section.category}>
            <h2 className="text-sm font-bold text-accent uppercase tracking-widest mb-4">{section.category}</h2>
            <div className="space-y-3">
              {section.items.map(({ q, a }) => (
                <div key={q} className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="font-bold text-text-primary text-sm mb-1.5">{q}</h3>
                  <p className="text-muted text-sm leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Contact card */}
      <section className="max-w-2xl mx-auto px-4 pb-20">
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
          <h2 className="text-xl font-extrabold text-text-primary">Didn&apos;t find what you need?</h2>
          <p className="text-muted text-sm">We&apos;re available Mon–Sat, 9 AM–7 PM IST. Reach us via WhatsApp for the fastest response.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href="https://wa.me/918984769522" target="_blank" rel="noopener noreferrer" className="bg-[#25D366] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#25D366]/90 transition-colors text-sm">WhatsApp: +91 89847 69522</a>
            <a href="mailto:support@vayutransfer.com" className="border border-border text-muted font-semibold px-6 py-3 rounded-xl hover:border-accent/50 hover:text-accent transition-colors text-sm">support@vayutransfer.com</a>
          </div>
        </div>
      </section>
    </main>
  )
}
