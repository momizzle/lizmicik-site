# Agent Readiness Actions for Manufacturers — What's in the Package

**Sample client: ELSCO Transformers | Prepared by Liz Micik | Delivered via your client portal**

---

## Read this first

You bought a diagnosis (the Audit) and a blueprint (the Roadmap). **Agent Readiness Actions** is the third step: the actual files that make your website readable and actionable by AI agents. You own them outright — there is no subscription, no platform login, nothing to renew. Your web team drops them in, and an AI agent can finally find your product, understand its real specs, and compose a valid quote request instead of hitting a wall.

Everything here is **drop-in**. No backend changes, no rebuild, no new software. Nine files, one plain-English deploy guide, and one quality report. This document explains each one in business terms — what it is, what it does for you, and who installs it.

The whole package closes two gaps the Audit found: agents could *find* ELSCO but couldn't *understand* the product in structured detail, and couldn't *act* — the quote path was a human-only form behind a reCAPTCHA. These files fix both.

---

## The files, in plain English

### 1. Your capability envelope — `capability-manifest.jsonld`
**What it is:** A machine-readable summary of everything ELSCO can build and quote — the kVA range (500–2500), the voltage options, dry-type vs. padmount, copper vs. aluminum windings, lead-time tiers from quick-ship to 180+ days, and the services you offer (new build, remanufactured, emergency replacement, retrofit, repair).

**What it does for you:** When an AI agent is comparing transformer suppliers, this is the file that lets it say "yes, ELSCO can build this" instead of skipping you because it couldn't tell. It's the difference between being in the consideration set and being invisible.

**Who deploys it:** Your web team pastes it into the `<head>` of your About or homepage as a one-line script block.

### 2. Each product, machine-readable — `product-1500kva-13800d-480y277.jsonld`
**What it is:** A structured record for one product page — the 1500 kVA 13800 Delta to 480Y/277 dry-type unit. It carries the real specs (kVA, primary/secondary voltage, connection type, transformer type, quick-ship lead time) **and** a "Request a Quote" action that points an agent at your quote contract.

**What it does for you:** Today an AI agent reading that page can reliably pull about **3 facts**. With this file in place it pulls about **15** — and it knows how to ask you for a price. This is the template; in a full engagement you get one of these per spec page you want covered.

**Who deploys it:** Pasted into the `<head>` of that specific product page.

### 3. The quote contract — `.well-known/quote-request.schema.json`
**What it is:** The single most important file in the package. It's a machine-readable list of *exactly what ELSCO needs to return an accurate quote* — kVA, voltages, connections, delivery timeframe, contact info, whether it's an emergency. We derived it straight from your existing Request-a-Quote form, so it asks for nothing you don't already ask for.

**What it does for you:** This is the "USE layer" — it turns your quote process into something an agent can actually complete. Instead of an agent giving up at a CAPTCHA, it reads this contract, fills it out correctly, and hands you a complete, valid request. Fewer junk inquiries, more quote-ready ones.

**Who deploys it:** Hosted at a fixed web address: `elscotransformers.com/.well-known/quote-request.schema.json`.

### 4. The agent quote pointer — `.well-known/api-catalog` and `.well-known/agent-quote.json`
**What it is:** Two small discovery files. The `api-catalog` is the standard signpost (RFC 9727) that tells any agent "here's where ELSCO's contract and capability live." The `agent-quote.json` describes a *proposed* agent-accessible quote endpoint.

**What it does for you:** These make the quote contract discoverable — an agent doesn't have to guess where to look. **Honesty note:** the agent endpoint is documented as *proposed, not live*. Your existing human form stays the real, working path. We are publishing the contract and the map now; wiring a live endpoint is a later, optional step. Nothing here overpromises.

**Who deploys it:** Both hosted in the `.well-known/` folder at your domain root.

### 5. Structured testimonials — `reviews.jsonld`
**What it is:** Three of your real customer testimonials (Mark, Dennis, Bill), marked up so machines can read them as trust signals.

**What it does for you:** Reinforces the "can machines trust you" layer. **Honesty note:** we did *not* invent star ratings. The file is built to accept ratings later, once you actually collect them — no fabricated numbers.

**Who deploys it:** Testimonials page or a product page `<head>`.

### 6. A map for AI crawlers — `llms.txt`
**What it is:** A plain-text guide that points AI crawlers to your most important pages — product lines and the quote path.

**What it does for you:** A lightweight "start here" sign for AI systems indexing your site. Quick to deploy, low cost, increasingly expected.

**Who deploys it:** Hosted at `elscotransformers.com/llms.txt`.

### 7. Proof it works — `before-after-1500kva-13800d-480y277.md` and `samples/sample-agent-rfq-...json`
**What it is:** A one-page before/after showing the jump from ~3 to ~15 machine-readable attributes, plus an actual sample quote request that a procurement agent composed automatically and that passed validation against your contract.

**What it does for you:** This is your evidence. It shows, concretely, that an agent can now represent your product correctly and produce a complete quote request — and it doubles as the seed of a case study.

**Who uses it:** You — for internal buy-in and marketing.

### 8. Hand it to your web team — `DEPLOY-GUIDE.md`
**What it is:** A plain-English, file-by-file install guide — where each file goes and what it does. No jargon required.

**What it does for you:** Lets your existing developer or agency deploy the whole package in an afternoon. You own the files; anyone can install them.

### 9. Our quality check — `validation-report.json`
**What it is:** The automated check we run before delivery. Every file is confirmed valid, the sample quote request is confirmed to pass your contract, and the before/after improvement is confirmed real.

**What it does for you:** Proof we tested it. Nothing ships broken, and nothing ships with placeholder gaps hidden inside it.

---

## One thing we need from you before go-live: the top-off

Reading your public site got us about 70% of the way. Seven product details are not published anywhere we could read them, so they're flagged in the files as `PENDING_ELSCO_CONFIRMATION` and must be filled before deployment:

> **Phase, Windings, Cooling Class, Enclosure (NEMA rating), Impedance, Temperature Rise, Design Standards**

These are not research questions — they're facts your engineering team knows cold. The short **Discovery Top-Off** document (delivered alongside this package) collects them in about 20–30 minutes. That's the only homework on your side, and it's the difference between a product record an agent *mostly* understands and one it understands completely.

---

## What this is not

Not a subscription. Not a platform you log into. Not an SEO retainer. Not a website rebuild. It's a finite set of files you own, install once, and keep — built on open standards (Schema.org, JSON Schema, RFC 9727), so they work with any AI system that respects them, not just one vendor's.

---

*Questions on any file? Reply in the portal or email liz@lizmicik.com.*
