# Before / After — Agent Comprehension (1500 kVA 13800 Delta to 480Y/277 Dry-Type Transformer)

Controlled-extraction demo: the same page content, with vs. without the Agent Readiness Actions files.
Live citation re-runs require deployment (or replication on a demo domain we control).

## BEFORE — prose-only page
An agent can reliably extract roughly **3 attributes**, and the quote path is a reCAPTCHA + human-logic challenge — effectively a dead end for an agent.

## AFTER — same page + Agent Readiness Actions files
An agent extracts a structured record of roughly **15 attributes**, and the Product carries a `potentialAction` pointing at a published `quote-request.schema.json`. The agent reads the contract, composes a request, and validates it before sending.

For context, a structured competitor (Maddox) exposes ~20 attributes; the remaining gap here is the labeled top-up list, not a structural unknown.

## The delta in one line
BEFORE: agent finds ELSCO Transformers, represents it with ~3 attributes, hits a wall at the quote. AFTER: ~15 attributes and a complete, valid, machine-composed quote request. Every gain came from drop-in files — zero backend changes.
