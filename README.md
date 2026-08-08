# FreshFold

Two products and one backend, in one repository.

- **The website** (`apps/web`) — the marketing site, the client portal customers
  book and track through, and the admin dashboard.
- **The rider app** (`apps/mobile`) — the Expo companion app couriers carry:
  accept jobs, navigate, scan bags, capture proof, hand off.
- **The dispatch server** (`apps/server`) — the single source of truth both of
  them read and write.

A pickup booked on the website appears on a rider's board. The rider's progress
appears on the customer's tracking page. There is no second copy of the data and
no manual re-keying between the two.

## Layout

```
freshfold/
├── apps/
│   ├── web/        Vite + React + Tailwind — customer site, portal, admin
│   ├── mobile/     Expo + React Native + expo-router — rider console
│   └── server/     Express — REST API, Gemini chatbot, Paystack
└── packages/
    └── core/       Domain model, status mapping, geography, API client
```

npm workspaces. `packages/core` is consumed as TypeScript source by all three,
so there is no build step between editing shared domain code and seeing it
everywhere.

## Running it

```bash
npm install
```

Start the server and the website together:

```bash
npm run dev
```

- website → http://localhost:3000
- dispatch API → http://localhost:4000

Then, in a second terminal, the rider app:

```bash
npm run mobile
```

Scan the QR code with **Expo Go**, or press `a` / `i` for an emulator. The app
finds the dispatch server automatically by reusing the host of the Expo dev
server — no IP address to configure, as long as both are on the same machine.

> **Expo Go version matters.** This targets **Expo SDK 54**, and a given Expo Go
> build supports exactly one SDK.

### Seeing the link work

1. Open the website, click **Schedule Pickup**, and book something.
2. Open the rider app. The booking is in the backlog, already carrying a pickup
   pin, a bag manifest with QR codes, a priority and a distance — all derived
   server-side from the address and order value.
3. Accept it and work through the steps. The bottom sheet drives the workflow.
4. Back on the website, open the client portal for that booking. The stage
   advances as the rider moves, and the dispatch map shows the courier's real
   position reported from the phone.

Everything also works with the server down — both apps fall back to local
storage and behave exactly as they did before there was a backend.

## How the two products share one record

The website has always called a job a `Booking`; the rider app has always called
it an `Order`. Both names are kept. They are projections of one server-side
`Job`:

```
Booking (customer)  ←── jobToBooking ──  Job  ── jobToOrder ──→  Order (rider)
   6 friendly stages                   15 dispatch states        15 dispatch states
   payment, schedule                   canonical record          bags, coords, proof
```

`Job.status` is the finer of the two vocabularies, so the customer's stage is
always derivable from it:

| Rider sees | Customer sees |
| --- | --- |
| `unassigned`, `assigned` | Scheduled |
| `navigating_to_pickup` … `arrived_at_laundry` | Collecting |
| `dropped_off` | In Care |
| `processing` | Ironing & Folding |
| `ready_for_delivery`, `navigating_to_delivery`, `arrived_at_delivery` | Quality Check |
| `delivered` | Delivered |

Going the other way — an operator nudging a stage in the admin dashboard — is
lossy, so `fromBookingStatus` picks the *earliest* dispatch state in the target
stage rather than claiming work that has not happened.

The `id` is shared: `FFC-882049` is the customer's booking reference *and* the
rider's job id, so one number means one thing in a support conversation.

All of this lives in [`packages/core/src/job.ts`](packages/core/src/job.ts) and
[`packages/core/src/status.ts`](packages/core/src/status.ts).

## API

Everything is under `/api`. The website reaches it through Vite's dev proxy; the
rider app over the LAN.

| Route | Purpose |
| --- | --- |
| `GET /health` | Reachability probe both apps use to decide online/offline |
| `POST /auth/register`, `/auth/login` | Sign-up and sign-in; returns a bearer token |
| `POST /auth/logout`, `GET /auth/me` | Revoke a token, validate one |
| `POST /auth/status` | Whether a contact has a login yet — booleans only |
| `GET/POST /bookings`, `GET/PATCH/DELETE /bookings/:id` | Customer view |
| `GET/POST /orders` | Dispatch view |
| `POST /orders/:id/accept`, `/decline` | Claiming a job (409 if already taken) |
| `PATCH /orders/:id/status` | Workflow transitions, proof photos, signatures |
| `GET /riders`, `GET/PATCH /riders/:id` | Presence and live telemetry |
| `GET/POST /messages` | One conversation per job, all three surfaces |
| `GET/POST /notifications`, `POST /notifications/:id/read` | Rider alerts |
| `GET/PUT /accounts` | Customer accounts |
| `GET/POST /transactions` | Payment ledger |
| `GET /jobs` | Canonical records, for debugging |
| `POST /reset` | Wipe back to seed data |
| `POST /chat` | Gemini-backed "Foldie" concierge chatbot |
| `POST /paystack/initialize`, `GET /paystack/verify/:ref` | Payments |

Data is stored as JSON at `apps/server/data/db.json`, seeded on first run.
Swapping in a real database means reimplementing `read`/`mutate` in
[`apps/server/src/store.ts`](apps/server/src/store.ts) and nothing else — no
route touches the filesystem directly.

## Configuration

Each app has a committed `.env.example`. Copy it to `.env` and fill in what you
need; nothing is required to run the demo locally.

| Variable | App | Needed for |
| --- | --- | --- |
| `GEMINI_API_KEY` | server | The concierge chatbot |
| `GEMINI_MODEL` | server | Overriding the chatbot model (default `gemini-3.5-flash`) |
| `PAYSTACK_SECRET_KEY` | server | Real MoMo / card payments |
| `APP_URL` | server | Paystack callback URLs |
| `CORS_ORIGINS` | server | Locking the API to known origins in production |
| `VITE_GOOGLE_MAPS_PLATFORM_KEY` | web | The live dispatch map |
| `EXPO_PUBLIC_API_URL` | mobile | Only if the server isn't on the dev machine |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | mobile | Standalone Android builds only |

## Building for production

```bash
npm run build
npm start
```

`build` compiles the website to `apps/web/dist` and bundles the server to
`apps/server/dist/server.cjs`. `start` runs the server, which serves the website
itself — one process, one port.

## Credentials

Passwords are hashed with scrypt and never leave the server. A sign-in posts
the attempt to `/api/auth/login`, which compares it server-side and returns a
bearer token; the browser stores the token and a profile, never a credential.
`GET /api/accounts` returns profile fields only, and `PUT /api/accounts` writes
through an allow-list, so a password cannot be set by including one in the body.

Demo accounts all use the password `password`.

## Known limitations

- **Only customers authenticate.** The admin dashboard is reachable by anyone
  who knows the `#admin` URL fragment, and the rider app's `7801` access PIN is
  a demo prop, not a login. Booking endpoints are open by design — the
  marketing site takes bookings from visitors who are not signed in. Before this
  goes anywhere public, the admin surface needs a real login and the write
  routes need authorization, not just authentication.
- **Sessions are bearer tokens in `localStorage`**, which is XSS-readable. A
  same-site HTTP-only cookie would be the stronger choice.
- **No rate limiting** on `/api/auth/login`, so nothing slows down an
  online password-guessing attempt.
- **CORS defaults to permissive in development** so a phone on the LAN can
  reach the API. Set `CORS_ORIGINS` in production; leaving it unset there blocks
  cross-origin requests and logs a warning.
- **The rider's GPS is simulated.** Position is interpolated toward the
  navigation target rather than read from the device, which is what makes the
  demo work indoors. It is published to the server the same way a real fix would
  be, so replacing the simulation is a change in one file.
- **Sync is polling**, every 4–5 seconds. Fine at this scale; websockets or SSE
  would be the upgrade.
