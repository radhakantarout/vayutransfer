import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Events & Occasions — VayuStudios',
  description: 'VayuStudios covers every Indian event and occasion — weddings, pre-weddings, corporate, school, fashion and more.',
}

const SEASONS = [
  {
    months: 'Oct – Feb',
    name: 'Wedding Season',
    color: 'border-rose-500/30 bg-rose-500/5',
    accent: 'text-rose-400',
    events: [
      { name: 'Navratri & Dandiya',    desc: 'Vibrant folk dance events across Gujarat, Maharashtra, and North India.' },
      { name: 'Dussehra',              desc: 'Large processions and effigies — ideal for dramatic candid photography.' },
      { name: 'Diwali',                desc: 'Family portraits, puja ceremonies, and sparkler shoots.' },
      { name: 'Wedding Ceremonies',    desc: 'North, South, East, West — every tradition covered with our gallery tools.' },
      { name: 'Sangeet & Mehendi',     desc: 'Pre-wedding celebration events with high energy and colour.' },
      { name: 'Haldi & Aryan',         desc: 'Intimate family ceremonies — watermarked previews keep originals safe.' },
    ],
  },
  {
    months: 'Feb – Apr',
    name: 'Pre-Wedding & Spring',
    color: 'border-amber-500/30 bg-amber-500/5',
    accent: 'text-amber-400',
    events: [
      { name: 'Valentine\'s Day Shoots', desc: 'Couple sessions — most popular pre-wedding shoot season.' },
      { name: 'Basant Panchami',          desc: 'Yellow-themed portraits and outdoor couple sessions in mustard fields.' },
      { name: 'Holi',                     desc: 'Colour bursts and outdoor portraits — one of the highest demand shoot days.' },
      { name: 'Easter & Spring Portraits', desc: 'Outdoor family and couple sessions in bloom.' },
      { name: 'Pre-wedding Destination',   desc: 'Rajasthan, Kerala, Goa — destination pre-wedding shoots with full gallery delivery.' },
    ],
  },
  {
    months: 'May – Aug',
    name: 'Portfolio & Fashion',
    color: 'border-violet-500/30 bg-violet-500/5',
    accent: 'text-violet-400',
    events: [
      { name: 'Summer Portfolio Shoots', desc: 'Actor and model portfolios — high-volume shoots ideal for AI face search.' },
      { name: 'Graduation Ceremonies',   desc: 'School and college farewell and convocation photo delivery.' },
      { name: 'Monsoon Fashion',         desc: 'Editorial and lookbook shoots during monsoon season.' },
      { name: 'Corporate Events',        desc: 'Annual meets, product launches, team offsites — quick gallery turnaround.' },
      { name: 'Fashion Weeks',           desc: 'Regional fashion shows — watermarked previews for designers and brands.' },
    ],
  },
  {
    months: 'Aug – Sep',
    name: 'Festivals',
    color: 'border-teal-500/30 bg-teal-500/5',
    accent: 'text-teal-400',
    events: [
      { name: 'Ganesh Chaturthi',  desc: 'Processions, visarjan, and puja photography across Maharashtra and AP.' },
      { name: 'Onam',              desc: 'Kerala flower arrangements (Pookalam), boat races, and family shoots.' },
      { name: 'Janmashtami',       desc: 'Dahi Handi events and temple celebrations — crowd photography.' },
      { name: 'Independence Day',  desc: 'School and corporate flag-hoisting ceremonies and group photos.' },
    ],
  },
  {
    months: 'Oct – Dec',
    name: 'Year-End',
    color: 'border-blue-500/30 bg-blue-500/5',
    accent: 'text-blue-400',
    events: [
      { name: 'Corporate Year-End',  desc: 'Annual day, awards nights, and team photos before the fiscal close.' },
      { name: 'School Annual Day',   desc: 'Performances, prize distribution, and class photos with full gallery access.' },
      { name: 'Christmas Events',    desc: 'Family portraits, office parties, and Santa shoot sessions.' },
      { name: 'New Year Parties',    desc: 'Nightlife and resort events — Guest QR code at the venue for instant photo discovery.' },
    ],
  },
]

export default function EventsPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-16 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Events & Occasions</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Every Indian occasion, covered</h1>
          <p className="text-muted text-lg leading-relaxed">
            VayuStudios is built around India&apos;s rich calendar of events and celebrations — from grand weddings to intimate family ceremonies, school days to fashion weeks.
          </p>
        </div>
      </section>

      {/* Season sections */}
      <section className="max-w-5xl mx-auto px-4 py-16 space-y-10">
        {SEASONS.map((season) => (
          <div key={season.name} className={`rounded-2xl border ${season.color} p-6`}>
            <div className="flex items-center gap-3 mb-5">
              <span className={`text-xs font-bold uppercase tracking-widest ${season.accent} bg-white/5 border border-current/20 px-2.5 py-1 rounded-full opacity-80`}>{season.months}</span>
              <h2 className={`text-xl font-extrabold ${season.accent}`}>{season.name}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {season.events.map(({ name, desc }) => (
                <div key={name} className="bg-bg/60 border border-white/5 rounded-xl p-4">
                  <h3 className="font-bold text-text-primary text-sm mb-1">{name}</h3>
                  <p className="text-muted text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-4 pb-20 text-center">
        <div className="bg-accent/5 border border-accent/20 rounded-2xl p-8 space-y-4">
          <h2 className="text-xl font-extrabold text-text-primary">Shoot any of these events?</h2>
          <p className="text-muted text-sm">VayuStudios handles the gallery delivery so you can focus on the shoot.</p>
          <Link href="/studio/home#get-started" className="inline-block bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors">Set up your studio →</Link>
        </div>
      </section>
    </main>
  )
}
