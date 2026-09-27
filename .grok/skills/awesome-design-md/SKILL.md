---
name: awesome-design-md
description: >-
  Curated library of ~74 brand design systems as DESIGN.md documents (Vercel,
  Linear, Stripe, Apple, Nike, Notion, Tesla, Shopify, …). Use when building or
  restyling a PrintHub surface that should echo a specific brand's design
  language, or when comparing direction options before committing to one.
  Triggers on "brand design", "design system reference", "make it look like",
  "linear-style", "vercel-style", brand names.
metadata:
  short-description: "Brand design-system library (74 DESIGN.md references)"
---

# awesome-design-md — brand design library

Browse `designs/<brand>/DESIGN.md` for a complete design system: palette,
typography scale, spacing, radii, shadows, motion, component styling.

## How to use

1. **Pick deliberately.** Choose at most ONE brand to echo per surface, and
   adapt it to PrintHub's navy/paper identity — never clone verbatim, and
   never mix competing systems in one page.
2. **Read before writing CSS.** Extract concrete tokens (hex, px, easing)
   from the DESIGN.md and map them onto this app's Tailwind theme in
   `src/styles/` and component classes — do not hand-inline one-off values.
3. **Pair with the other design skills.** `taste` guards against generic
   output; `web-design-guidelines` audits accessibility/UX afterwards;
   `image-to-code` applies when matching the reference screenshots in
   `C:\PROJECT\UI-UX\1.png`–`8.png`.

## Available brands

`designs/` contains: airbnb, airtable, apple, binance, bmw, bmw-m, bugatti,
cal, claude, clay, clickhouse, cohere, coinbase, composio, cursor, dell-1996,
elevenlabs, expo, ferrari, figma, framer, hashicorp, hp, ibm, intercom,
kraken, lamborghini, linear.app, lovable, mastercard, meta, minimax, mintlify,
miro, mistral.ai, mongodb, nike, nintendo-2001, notion, nvidia, ollama,
opencode.ai, pinterest, playstation, posthog, raycast, renault, replicate,
resend, revolut, runwayml, sanity, sentry, shopify, slack, spacex, spotify,
starbucks, stripe, supabase, superhuman, tesla, theverge, together.ai, uber,
vercel, vodafone, voltagent, warp, webflow, wired, wise, x.ai, zapier.
