# ELSCO Transformers — Agent Readiness Actions for Manufacturers: Deploy Guide

Plain-English instructions for your web team. Every file is drop-in — **no backend changes**.
These files make your site readable and actionable by AI agents so an agent can correctly
represent your product in a comparison and compose a valid quote request.

## Where each file goes

| File | Where it deploys | What it does |
|---|---|---|
| `capability-manifest.jsonld` | Site-wide — paste in `<head>` of /about (or homepage) as a `<script type="application/ld+json">` block | The envelope you can quote/build |
| `product-<slug>.jsonld` | In `<head>` of the matching product/spec page | Machine-readable product record + the RFQ action |
| `.well-known/quote-request.schema.json` | Host at https://elscotransformers.com/.well-known/quote-request.schema.json | The inputs-to-quote contract an agent reads |
| `.well-known/api-catalog` | Host at https://elscotransformers.com/.well-known/api-catalog (RFC 9727, no extension) | Discovery pointer to the contract + capability |
| `.well-known/agent-quote.json` | Host at https://elscotransformers.com/.well-known/agent-quote.json | Describes the (proposed) agent RFQ endpoint; human form stays the fallback |
| `reviews.jsonld` | Testimonials page or product page `<head>` | Structured testimonials (add star ratings only once you collect them) |
| `llms.txt` | Host at https://elscotransformers.com/llms.txt | Canonical-content locator for AI crawlers |

## Before you publish — fill the top-up fields
Any value marked `PENDING_CLIENT_CONFIRMATION` (or an empty `disambiguatingDescription`) needs a real value from your team before go-live. These are the ~30%% we could not read from your existing site.

## Notes
- The agent RFQ *endpoint* is **proposed**, not live. The contract and your human form are both real; the human form stays the fallback until you wire the endpoint.
- Do not add star ratings to `reviews.jsonld` until you actually collect them (no fabricated ratings).
- Validate the JSON-LD with Google's Rich Results Test and schema.org validator after deploy.
