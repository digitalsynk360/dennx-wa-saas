/**
 * Marketing landing page — Deenx AI.
 * Server component: no client JS needed (FAQ uses native <details>).
 */
import Link from "next/link";
import {
  ArrowRight, BarChart3, Bot, Check, CheckCheck, GitBranch,
  MessageCircle, Send, ShieldCheck, Users, Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: Bot, title: "AI Chatbot", desc: "Answer FAQs, qualify leads and book orders automatically — even at 2 AM." },
  { icon: GitBranch, title: "Visual Flow Builder", desc: "Drag-and-drop multi-step conversations with buttons, conditions and delays. No code." },
  { icon: Send, title: "Broadcast Campaigns", desc: "Send offers and updates to thousands of contacts with Meta-approved templates." },
  { icon: Users, title: "Team Inbox", desc: "One WhatsApp number, your whole team. Assign chats, add notes, never miss a lead." },
  { icon: BarChart3, title: "Analytics", desc: "Response times, delivery rates, campaign performance — all in one dashboard." },
  { icon: ShieldCheck, title: "Official API", desc: "Built on the WhatsApp Business Cloud API. Green-tick ready, no number bans." },
];

const STEPS = [
  { n: "1", title: "Connect WhatsApp", desc: "Link your WhatsApp Business number in minutes with embedded signup." },
  { n: "2", title: "Build your flows", desc: "Set keyword triggers, design reply flows, import your contacts." },
  { n: "3", title: "Grow on autopilot", desc: "Bot handles chats 24×7. Your team steps in only when needed." },
];

const PLANS = [
  { name: "Starter", price: "₹999", tagline: "For small businesses getting started", features: ["1 WhatsApp number", "1,000 contacts", "Chatbot rules", "Team inbox (2 agents)"] },
  { name: "Growth", price: "₹2,499", tagline: "For growing teams that automate", features: ["Everything in Starter", "10,000 contacts", "Visual flow builder", "Broadcast campaigns", "5 agents + analytics"], popular: true },
  { name: "Scale", price: "₹5,999", tagline: "For brands at full throttle", features: ["Everything in Growth", "Unlimited contacts", "AI auto-replies", "Priority support", "Unlimited agents"] },
];

const FAQS = [
  { q: "Can my WhatsApp number get banned?", a: "No. Deenx AI is built on the official WhatsApp Business Cloud API, fully within Meta's rules — completely different from unofficial tools." },
  { q: "Do I need to know how to code?", a: "Not at all. The flow builder is drag-and-drop, and chatbot rules are set up with a simple form." },
  { q: "Can I use my existing number?", a: "Yes — any number eligible for the WhatsApp Business API connects in minutes." },
  { q: "Is there a free trial?", a: "Yes — book a demo and our team will activate a 3-day free trial right away, no card required." },
];

function ChatMockup() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-card/10 p-3 shadow-2xl backdrop-blur">
      {/* phone header */}
      <div className="flex items-center gap-2 rounded-t-xl bg-[hsl(175,60%,18%)] px-3 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">D</div>
        <div>
          <p className="text-sm font-semibold text-white">Deenx Store</p>
          <p className="text-[10px] text-white/60">online</p>
        </div>
      </div>
      {/* messages */}
      <div className="space-y-2 rounded-b-xl bg-[hsl(90,25%,92%)] p-3">
        <div className="max-w-[80%] rounded-lg rounded-tl-none bg-card px-3 py-2 text-xs text-gray-800 shadow-sm">
          Hi! What&apos;s the price? 👋
        </div>
        <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-xs text-gray-800 shadow-sm">
          Hello! 🙏 Our plans start at ₹999/month. Which product are you looking for?
          <span className="mt-1 flex items-center justify-end gap-0.5 text-[9px] text-gray-500">
            2:14 PM <CheckCheck className="h-3 w-3 text-sky-500" />
          </span>
        </div>
        <div className="ml-auto grid max-w-[85%] gap-1">
          <div className="rounded-lg border border-primary/40 bg-card px-3 py-1.5 text-center text-xs font-medium text-primary shadow-sm">📦 View products</div>
          <div className="rounded-lg border border-primary/40 bg-card px-3 py-1.5 text-center text-xs font-medium text-primary shadow-sm">💬 Talk to an agent</div>
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Bot className="mr-1 inline h-3 w-3" />Bot replied in 0.8s
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="bg-card text-foreground">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <MessageCircle className="h-6 w-6 text-primary" />
            <span className="text-lg">Deenx AI</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/demo">Book Free Demo <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ backgroundColor: "hsl(var(--teal-deep))" }}>
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-card/10 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2">
          <div className="text-white">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-card/10 px-3 py-1 text-xs font-medium">
              <Zap className="h-3.5 w-3.5 text-primary" /> Official WhatsApp Business API
            </span>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
              Business on WhatsApp,<br />
              growth on <span className="text-primary">autopilot</span>.
            </h1>
            <p className="mt-4 max-w-lg text-white/80 sm:text-lg">
              AI chatbot, visual flow builder, broadcast campaigns and a team inbox —
              all in one platform. Set up in minutes, results from day one.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="text-base">
                <Link href="/demo">Book Free Demo <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-card/10 text-base">
                <Link href="/login">Live Demo</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/70">
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> No credit card</span>
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> 5-minute setup</span>
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> Made for India 🇮🇳</span>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ChatMockup />
          </div>
        </div>
      </section>

      {/* ── Stats band ── */}
      <section className="border-b border-border bg-muted/50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 text-center sm:px-6 md:grid-cols-4">
          {[["98%", "Open rate on WhatsApp"], ["24×7", "Bot availability"], ["<1s", "Avg bot response"], ["100%", "Official Meta API"]].map(([v, l]) => (
            <div key={l}>
              <p className="text-3xl font-extrabold text-foreground">{v}</p>
              <p className="mt-1 text-sm text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Everything you need for WhatsApp growth</h2>
          <p className="mt-3 text-muted-foreground">One subscription. The complete automation stack.</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Live in 3 steps</h2>
            <p className="mt-3 text-muted-foreground">No agency, no developer — do it yourself, today.</p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-border bg-card p-6">
                <span className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{s.n}</span>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Simple pricing, no surprises</h2>
          <p className="mt-3 text-muted-foreground">Every plan includes the official API, team inbox and unlimited flows.</p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={
                p.popular
                  ? "relative rounded-2xl border-2 border-primary bg-card p-6 shadow-lg"
                  : "rounded-2xl border border-border bg-card p-6 shadow-sm"
              }
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-4 text-4xl font-extrabold">{p.price}<span className="text-sm font-medium text-muted-foreground">/month</span></p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-6 w-full" variant={p.popular ? "default" : "outline"}>
                <Link href="/demo">Talk to Sales</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Frequently asked questions</h2>
          <div className="mt-10 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-xl border border-border bg-card p-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between font-medium">
                  {f.q}
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ backgroundColor: "hsl(var(--teal-deep))" }}>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-white sm:px-6 sm:py-20">
          <h2 className="text-3xl font-bold sm:text-4xl">Make WhatsApp your best salesperson today</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">Signing up is free. Setup takes 5 minutes. Results from day one.</p>
          <Button asChild size="lg" className="mt-8 text-base">
            <Link href="/demo">Book Free Demo <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <MessageCircle className="h-5 w-5 text-primary" /> Deenx AI
          </div>
          <p>© {new Date().getFullYear()} Deenx Consultancy. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/demo" className="hover:text-foreground">Book Demo</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}