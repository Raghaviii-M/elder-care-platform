# CareCircle: Elderly Care & Medication Management Platform

A shared, passcode-secured space where an elderly person, their caretakers and their family manage medicines, appointments and wellbeing together. The elder stays at the centre of every decision.

**Live app:** https://elder-care-platform-bl3k.onrender.com
**Built for:** PromptWars x Catalyst (Google for Developers, Build with AI)

> Free hosting note: the first request after a long idle period can take up to a minute while the server wakes up.

## Try it now (demo circle)

Circle ID: `demo`

| Role      | Passcode      |
| --------- | ------------- |
| Elder     | `ELDER-2026`  |
| Caretaker | `CARER-2026`  |
| Family    | `FAMILY-2026` |

The sign-in page also has one-click demo buttons.

## The problem

Elderly people often juggle many medicines and appointments while family members live elsewhere. Most reminder apps notify only the elder, and nobody else hears when a dose is missed. Other apps let relatives change a schedule without the elder ever knowing.

## What CareCircle does

| Requirement                                  | How it is solved                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Secure, passcode-based shared access         | Each Care Circle has three separate passcodes (elder, caretaker, family), stored as bcrypt hashes, with role-based permissions |
| View, add, edit, manage medication schedules | Caretaker CRUD with strict validation                                                                                          |
| Track adherence                              | Per-medicine percentages, a 7-day chart, and a "today" progress ring                                                           |
| Monitor upcoming appointments                | Shared appointment list, added by caretaker or family                                                                          |
| Proactive email reminders                    | A scheduled job emails upcoming doses, missed doses and appointments within 24 hours                                           |
| Go beyond reminders                          | See "Beyond reminders" below                                                                                                   |
| Elder at the centre                          | Every change made by someone else appears in the elder's feed to **confirm or challenge**                                      |

### Beyond reminders

- **Elder confirmation loop.** Medicine and appointment changes ask the elder to confirm. A challenge emails the family.
- **One-tap SOS** and a **daily mood check-in**. "Unwell" alerts the circle by email.
- **Shared care feed** with doses taken, changes, notes and check-ins.
- **Gemini AI smart-add.** Describe a medicine in plain words and the schedule fills in for review. A rule-based parser takes over if the AI is unavailable.
- **Plain-language medicine explainer** and a **weekly AI care insight**, always labelled as not medical advice.
- **Read-aloud** of the day's medicines, using the browser speech API.

## Accessibility

- Semantic landmarks, a skip link, labelled inputs and ARIA live regions for toasts
- "Larger text" and "High contrast" modes, both remembered between visits
- Touch targets of at least 44px, visible focus outlines, `prefers-reduced-motion` respected
- Full keyboard operation, including native `<dialog>` for confirmations
- Lighthouse accessibility score: **<YOUR SCORE>**

## Architecture

```
 Browser (HTML/CSS/JS, no framework, no inline scripts)
        |  HTTPS + httpOnly JWT cookie
        v
 Express app (Render)
   helmet | rate limiting | zod validation | role guard
   routes/  auth, medications, doses, appointments, activity, ai, internal
   services/ scheduleUtils (pure functions), reminderService,
             emailService (Brevo API), aiService (Gemini API)
        |
        v
 Repository interface -- FirestoreRepo (production)
                      -- MemoryRepo    (tests and local dev)

 cron-job.org --every 5 min, POST + secret header--> /api/internal/reminders
```

Design decisions:

- **Repository pattern.** Business logic never touches the database directly, so tests run fast against an in-memory store.
- **Subcollections per circle.** All data lives under `circles/{id}/...`, so a cross-circle read is structurally impossible.
- **Pure scheduling functions.** Slot detection is separate from I/O and tested across midnight edge cases in IST.
- **External scheduler.** The host sleeps when idle, so an in-process timer would be unreliable. A cron service calls a protected endpoint instead.
- **Idempotent reminders.** Every email has a deterministic key, so a double trigger never sends a duplicate. A failed send is not recorded, so it retries on the next run.

## Security

| Area                | Measure                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Passcodes           | bcrypt-hashed, shown once at creation, generated with a CSPRNG, no look-alike characters                          |
| Sessions            | JWT in an `httpOnly`, `sameSite=strict`, `secure` cookie, 8-hour expiry                                           |
| Authorisation       | Role middleware on every route. Every query is scoped by the circle in the token, never an ID from the client     |
| Brute force         | Login rate-limited to 10 attempts per 15 minutes, with SOS and AI limits as well                                  |
| Account enumeration | Identical error for unknown circle and wrong passcode                                                             |
| Input               | zod schemas on every body, unknown fields stripped, ID params validated, 10 KB body limit                         |
| XSS                 | The UI builds the DOM with `textContent`, never `innerHTML`. Email content is HTML-escaped. Strict CSP via helmet |
| Scheduler endpoint  | Secret header, compared in constant time                                                                          |
| AI safety           | Input length-capped, prompt told to treat user text as data, output schema-validated, graceful fallback           |
| Secrets             | Environment variables only. `.env` and service-account keys are git-ignored                                       |
| Config              | The server refuses to start in production without its secrets                                                     |

## Tech stack

Node.js 20, Express, Firestore, Brevo (email API), Gemini API, Jest and Supertest, ESLint and Prettier, GitHub Actions, Render, cron-job.org.

## Run locally

```bash
git clone https://github.com/Raghaviii-M/elder-care-platform
cd elder-care-platform
npm ci
cp .env.example .env     # on Windows PowerShell: Copy-Item .env.example .env
npm run dev              # http://localhost:8080
```

Local mode uses the in-memory store and seeds the demo circle when `SEED_DEMO=true`.

### Environment variables

| Variable                     | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `JWT_SECRET`, `CRON_SECRET`  | Required in production                                    |
| `FIREBASE_SERVICE_ACCOUNT`   | Service-account JSON for Firestore (production)           |
| `BREVO_API_KEY`, `MAIL_FROM` | Email delivery. Without them, emails are logged, not sent |
| `GEMINI_API_KEY`             | Optional. Without it the rule-based fallback is used      |
| `SEED_DEMO`                  | `true` creates the demo circle                            |

## Tests

```bash
npm test      # Jest with coverage
npm run lint
```

Tests cover authentication and rate limiting, role permissions, circle isolation (IDOR), validation, dose logging, adherence maths, slot detection across midnight, reminder idempotency and retry, email escaping, the cron endpoint, the care feed, SOS, check-ins, and the AI service including failure fallbacks. Latest result: **<N tests passing, X% coverage>**. CI runs lint and tests on every push.

## Future work

- Push and WhatsApp notifications
- Multiple elders per caretaker
- Refill tracking and pharmacy reminders
- Vitals logging with trend alerts
- Multi-language UI and voice input

## Disclaimer

CareCircle provides reminders and summaries, not medical advice. Always follow your doctor's instructions.
