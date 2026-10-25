# Sunny Crumb Bakery (fictional): bilingual chatbot demo

> **Demo, fictional business.** Sunny Crumb Bakery, its address, hours and prices are all made up.
> No orders are taken and nothing is sent anywhere.

A static website with an embedded customer-service chat widget for a made-up Orlando bakery.
It's a portfolio piece showing what a small-business FAQ + order-intake bot can do in **English and Spanish**.

## Features
- **Menu & prices FAQ.** Shows the full menu, or answers "how much is the tres leches?" for one item.
- **Hours & location FAQ.** Uses a fictional address; no real phone or email anywhere.
- **Extra FAQs.** Delivery/pickup, allergens/dietary, payment methods, "is this real?".
- **Custom-order intake.** A 5-step guided flow (occasion → size → date → flavor → name) with input validation
  (3-day minimum notice, understands dates like `11/14`, `Nov 14`, `14 de noviembre`, `2026-11-14`; Spanish users get day/month order),
  then a summary card with a price estimate → "a team member will follow up" + a mock reference number. **Nothing is submitted.**
- **Human handoff.** "Talk to a person" (also offered after 2 misunderstood messages) shows a mock handoff notice and a simulated agent.
- **Bilingual EN/ES.** Toggle in the header and in the chat; **auto-switches** when the user writes in Spanish (or back to English).
  Natural Latin American Spanish using *tú*. The whole page translates too.
- Quick-reply chips, typing indicator, restart, Esc to close, ARIA live region, mobile full-screen chat, XSS-safe rendering.

## Run it locally
No build step, no API key, no backend.
```bash
cd bakery-bot
python3 -m http.server 8765      # or: npx serve .
# open http://localhost:8765
```
(Opening `index.html` directly also works.) URL helpers: `?lang=es` starts in Spanish, `?fast=1` turns off the typing delay.

## Project layout
```
index.html            page markup + widget markup
css/styles.css        styles (responsive; chat goes full-screen at <=480px)
js/config.js          bot mode + settings (scripted by default)
js/content.js         ALL business facts and EN/ES copy. Edit this to reuse for another business
js/bot-engine.js      scripted engine: language detection, intent matching, order flow, handoff (no DOM)
js/ai-provider.js     OFF-by-default stub for plugging in an LLM later
js/widget.js          chat UI + page translation
tests/                unit tests (Node) + browser E2E tests (Playwright)
screenshots/          captured by the E2E run
```

## Plugging in an AI model (optional, not included)
The demo is fully scripted on purpose: it's free, predictable and can't hallucinate prices.
To add an LLM (e.g. OpenAI) for open-ended questions while keeping the order flow and handoff scripted:
1. Write a small serverless function (Vercel/Netlify/Cloudflare) at `/api/chat` that keeps `OPENAI_API_KEY`
   in a server-side environment variable, gets `{ messages, lang, facts }`, and returns `{ reply }`.
   Ground the model with `facts` (menu, hours, address from `content.js`) and tell it to answer only from them.
2. In `js/config.js`, set `mode: "openai"`.
3. In `js/ai-provider.js`, uncomment the `fetch` in `reply()`.

The engine only calls the AI for messages the script can't match, and if the AI call fails it falls back to the scripted reply.
**Never put an API key in front-end code.** Anyone can read it in the browser.

## Tests
```bash
cd tests && npm install        # installs playwright-core (uses an installed Chrome/Chromium)
node unit.test.js              # engine: language detection, intents, date parsing, flows
python3 -m http.server 8765 --directory .. &   # serve the site
node e2e.test.js               # EN + ES conversations, order flow, handoff, 390px mobile checks, screenshots
```
The E2E script uses `/usr/bin/google-chrome`. Change `executablePath` in `e2e.test.js` if your Chrome lives elsewhere.

## Hosting (free, static)
Any static host works. Upload the folder as-is (`tests/` and `screenshots/` are optional).
- **GitHub Pages**: free GitHub account, public repo, Settings → Pages → deploy from branch.
- **Netlify**: free Netlify account (sign up with email or GitHub), drag-and-drop the folder at app.netlify.com/drop.
- **Vercel**: free Hobby account (sign up with GitHub/GitLab/Bitbucket or email), import the repo, framework preset "Other".
- **Cloudflare Pages**: free Cloudflare account, upload the folder or connect a Git repo.

---
Built as a portfolio demo. AI-assisted, personally reviewed.

## Images
- `img/hero.webp` (+ `hero-720.webp` for phones), `img/custom-cake.webp`, `img/menu/*.webp` (card banners, 640×400) and `img/thumbs/*.webp` (item thumbnails, 160×160). `img/og-hero.jpg` is only the social-share preview.
- All food photos are **AI-generated illustrations** made for this fictional demo (noted in the page footer). They show no real business, brand, or person.
- `img/logo.svg` is the logo mark, also used as the favicon and the chat avatar.
