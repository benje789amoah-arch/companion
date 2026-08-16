# FreshFold

Three products and one backend, in one repository.

- **The website** (`apps/web`) — the marketing site, the client portal customers
  book and track through, and the admin dashboard.
- **The rider app** (`apps/mobile`) — the Expo companion app couriers carry:
  accept jobs, navigate, scan bags, capture proof, hand off.
- **The customer app** (`apps/client`) — the Expo app customers carry: browse,
  book, watch the courier approach, pay, sign at the door.
- **The dispatch server** (`apps/server`) — the single source of truth all of
  them read and write.

A pickup booked on the website or in the customer app appears on a rider's
board. The rider's progress appears on the customer's tracking page and in
their app. There is no second copy of the data and no manual re-keying between
any of them.

## Layout

```
freshfold/
├── apps/
│   ├── web/        Vite + React + Tailwind — customer site, portal, admin
│   ├── mobile/     Expo + React Native + expo-router — rider console
│   ├── client/     Expo + React Native + expo-router — customer app
│   └── server/     Express — REST API, Gemini chatbot, Paystack
└── packages/
    └── core/       Domain model, status mapping, geography, API client
```

npm workspaces. `packages/core` is consumed as TypeScript source by all four,
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

…and the customer app, in a third:

```bash
npm run client
```

Scan the QR code with **Expo Go**, or press `a` / `i` for an emulator. Both apps
find the dispatch server automatically by reusing the host of the Expo dev
server — no IP address to configure, as long as everything is on the same
machine. They install side by side: different bundle ids, different schemes.

> **Expo Go version matters.** Both target **Expo SDK 54**, and a given Expo Go
> build supports exactly one SDK.

### Seeing the link work

All three apps start empty, so step 1 is where the system gets its first job.

1. Book something — on the website via **Schedule Pickup**, or in the customer
   app's Book tab.
2. Open the rider app. The booking is in the backlog, already carrying a pickup
   pin, a bag manifest with QR codes, a priority and a distance — all derived
   server-side from the address and order value.
3. Accept it and work through the steps. The bottom sheet drives the workflow.
4. Watch from the other side: the customer app's Track tab, or the website's
   client portal. The stage advances as the rider moves, and the map shows the
   courier's real position reported from the phone.
   At the door the rider must check the customer's **collection code** before
   the bags move — scan the QR on the customer's screen, or type the four
   digits. See below.
5. At the door, the customer app can sign for the delivery itself — the
   signature lands as the job's delivery proof.

Everything also works with the server down — all three apps fall back to local
storage and behave exactly as they did before there was a backend.

## How the two products share one record

The website has always called a job a `Booking`; the rider app has always called
it an `Order`. Both names are kept. They are projections of one server-side
`Job`:

```
Booking (customer)  ←── jobToBooking ──  Job  ── jobToOrder ──→  Order (rider)
   7 friendly stages                   15 dispatch states        15 dispatch states
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
| `ready_for_delivery` | Quality Check |
| `navigating_to_delivery`, `arrived_at_delivery` | Delivering |
| `delivered` | Delivered |

Going the other way — an operator nudging a stage in the admin dashboard — is
lossy, so `fromBookingStatus` picks the *earliest* dispatch state in the target
stage rather than claiming work that has not happened.

`Delivering` is its own stage rather than part of Quality Check. A courier
riding to the door used to read as *Quality Check* with the bar stuck at 90%,
which is a poor thing to be told while somebody is outside with your laundry.

**The round trip.** `deliveryCoords` is the customer's own door, not the hub.
The hub leg has its own destination in the rider console, so naming the hub
here — which is what the code did — routed the final leg back to the laundry
with the customer's clean clothes still on the seat. Moving the pickup pin
moves both ends.

**All three apps speak the seven stages.** The supervisor's dashboard and the
customer's timeline always did; the rider console showed only the dispatch
vocabulary, so a stage moved from the desk changed what the customer read and
left no trace on the phone carrying the bags. Its job cards and its active
workflow now carry a *Customer sees:* pill derived through the same
`toBookingStatus` mapping, and a stage change from any surface reaches the other
two on the next poll — about a second in practice, four at worst.

**The workflow is semi-automatic.** The three points where the bags physically
change hands are confirmed by a person, and everything between them advances on
its own. A courier scans the customer's collection code at the door, types the
desk's code at the hub, and takes the customer's code back at the end; once a
leg is finished in full the next stage follows without anybody pressing
anything. Finishing the collection leg is what puts a job In Care, and from
there the customer's timeline keeps moving on the hub's own clock.

That cycle passes through every stage — `dropped_off` → `processing` →
`ready_for_delivery` — rather than jumping the middle one. Ironing & Folding was
unreachable except by a supervisor selecting it by hand, which on a laundry
service is the stage the customer is actually paying for. Reaching Quality Check
files an alert for the courier holding the job, or for the whole roster if none
is, because that is the one moment in the hub's leg somebody has to act on.

It runs in the server (`apps/server/src/hub.ts`), on a sweep, not on the
courier's phone. A `setTimeout` in the rider app made the laundry's progress a
property of one device being awake: a courier who dropped bags off and then
closed the app, lost signal or ended their shift left the job at In Care
permanently, and whichever phone got there first stamped its own `riderId` onto
stages it had not worked. `HUB_WASH_MINUTES` and `HUB_FINISH_MINUTES` set the
two dwells — a stand-in for a hub console nobody has built yet, and its fallback
once somebody does.

**Every job on the phone's board is scoped by `riderId`.** The server sends each
courier their own jobs *plus the open pool*, so the rider app has to tell the
two apart — and until `Order` carried a `riderId` it could not. Its active
workflow took the first job on the board that was not `unassigned`, which is
correct only while exactly one job is ever in flight; with two, every courier's
phone drove the same one and the hub cycle ripened whichever it found, stamping
its own id on a job nobody had accepted. In Care and Ironing & Folding could
therefore not be held by anyone: a stage set from the desk was walked to Quality
Check within eight seconds.

The other half of that is what the desk can strand. Moving a booking to a
courier leg without naming a courier leaves it in flight with nobody holding it,
and a backlog keyed on `unassigned` hid those jobs from the whole roster — the
customer read *Collecting* with nobody collecting. The backlog is anything still
running that no courier holds, and accepting one of those claims it **where it
stands** rather than resetting it to `assigned`, which would rewind a collected
job to Scheduled.

The `id` is shared: `FFC-882049` is the customer's booking reference *and* the
rider's job id, so one number means one thing in a support conversation.

All of this lives in [`packages/core/src/job.ts`](packages/core/src/job.ts) and
[`packages/core/src/status.ts`](packages/core/src/status.ts).

## The collection hand-off

A courier turning up at a door proves nothing on its own, and neither does a
customer opening it. Every job therefore carries a four-digit `pickupOtp`,
minted once when the job is created and kept for its life.

The customer's app and the website both render it as digits *and* as a QR. The
rider app will not advance a job past `arrived_at_pickup` until one of the two
checks out.

```
FFH1|FFC-780145|pickup|6056
└─┬┘ └────┬───┘ └──┬─┘ └┬─┘
version  job id   leg   code
```

The job id travels inside the QR deliberately: without it, a courier holding
two jobs on one street could have the wrong customer's code accepted against
the job they are actually on. `verifyHandoff` in
[`packages/core/src/job.ts`](packages/core/src/job.ts) rejects a payload whose
id, leg or version does not match, and accepts bare digits only as the typed
fallback — because cameras fail in the rain and a courier at a door cannot be
blocked by that.

The code is minted by `bookingToJob`, which the server re-runs whenever a
booking is upserted. `POST /api/bookings` therefore carries the existing code
over on an id collision; otherwise an offline replay would silently invalidate
the code the customer is already holding up.

Jobs created before this existed have no code, and the rider app lets those
through rather than stranding them at a gate they can never satisfy.

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
| `POST /admin/login`, `GET /admin/me`, `POST /admin/logout` | Supervisor desk sign-in |
| `POST /riders` | Provision a courier; returns a one-time PIN. Supervisor only |
| `PATCH /riders/:id/active` | Take a courier off the roster, or put them back. Supervisor only |
| `POST /riders/login`, `GET /riders/me`, `POST /riders/logout` | Courier sign-in against the roster |
| `POST /riders/change-pin` | Replace a temporary PIN. Courier only |
| `GET /riders`, `GET/PATCH /riders/:id` | Roster, presence and live telemetry — all behind a courier session; a rider may only PATCH their own record |
| `GET/POST /messages` | One conversation per job, all three surfaces |
| `GET/POST /notifications`, `POST /notifications/:id/read` | Rider alerts |
| `GET/PUT /accounts` | Customer accounts |
| `GET/POST /transactions` | Payment ledger; `?email=` scopes it to one customer |
| `GET /jobs` | Canonical records, for debugging |
| `POST /reset` | Empty the ledger back to a fresh install |
| `POST /chat` | Gemini-backed "Foldie" concierge chatbot |
| `POST /paystack/initialize`, `GET /paystack/verify/:ref` | Payments |
| `POST /paystack/webhook` | Paystack's own settlement callback. HMAC-signed with the secret key, read as raw bytes, and the only route that credits a wallet without anyone asking it to |
| `POST /accounts/wallet` | The one path that moves a balance or points. A `topup` carries a Paystack reference, never an amount — the server verifies it and credits what was collected |

### The database

Records live in Supabase Postgres. The schema is one migration —
[`supabase/migrations/20260814000000_initial_schema.sql`](supabase/migrations/20260814000000_initial_schema.sql) —
and every query that touches it is in
[`apps/server/src/store.ts`](apps/server/src/store.ts). No route builds SQL of
its own.

Setting it up on a fresh Supabase project:

1. Set `DATABASE_URL` in `apps/server/.env` to the project's connection string —
   dashboard → Project Settings → Database → Connection string → URI, with
   `[YOUR-PASSWORD]` replaced by the database password. Prefer the pooled string
   (port 6543) for anything deployed.
2. `npm run db:migrate -w @freshfold/server`. Each file in `supabase/migrations`
   runs once and is recorded in `schema_migrations`, so this is safe on every
   deploy — and `-- --dry-run` lists what is pending without touching anything.
   Pasting the SQL into the Supabase editor by hand works too.
3. `npm run server`. The three bootstrap identities below are created on first
   boot if the tables are empty.

The server refuses to open its port if the database is unreachable, and
`GET /api/health` answers 503 rather than `ok` in that state — an instance that
is up but cannot reach Supabase serves nothing but errors, and a health check
that lies about it is what keeps a broken one in the load balancer.

Nested value objects on a job — `customer`, `service`, `schedule`, `location`,
`dispatch`, `payment` — are stored as JSONB, because `applyStatus` in
`@freshfold/core` reads and rewrites them whole and nothing queries inside
them. The two fields that *are* filtered on, `rider_id` and `customer_email`,
are generated columns derived from that JSONB, so they cannot drift from it.

If you are coming from the old JSON store, `apps/server/data/db.json` still
works as an import source and is left untouched by the process:

```bash
npm run import:json -w @freshfold/server -- --replace
```

It runs as a single transaction, drops messages and notifications whose job no
longer exists, drops expired sessions, and prints what it moved.

**A fresh install has no jobs.** There is no demo data: every order in the
system is one somebody booked, so the rider's board and the supervisor's ledger
only ever show real work, and all three apps open on empty states until you
book something. Three things are created on first boot, and none of them is a
job — see [`apps/server/src/seed.ts`](apps/server/src/seed.ts). Each is seeded
only while its table is still empty, so restarting against a database that
already has a roster does nothing:

- **A courier roster** of three provisioned riders. Couriers are never
  self-registered — these are employment records carrying an id, an employee
  number, a contact number and a hashed PIN. Name, vehicle and plate are blank
  until the courier enters them, and every performance figure starts at zero.
- **One supervisor**, `supervisor@freshfold.com` / `password`. Somebody has to
  be able to sign in and put the first courier on the roster.
- **Three sign-in accounts**, so there is a door into the customer app before
  you have registered one. Identity and password only: no points, no wallet, no
  history.

| Courier | Employee ID | Phone | PIN |
| --- | --- | --- | --- |
| `FF-R-204` | `RIDER-204` | `0244567801` | `7801` |
| `FF-R-118` | `RIDER-118` | `0209114402` | `4019` |
| `FF-R-337` | `RIDER-337` | `0553370915` | `1234` |

Signing in with the phone number on the record works too.

### Phone numbers

A Ghanaian mobile number is ten digits — `0XX XXX XXXX` — so every field that
takes one holds exactly ten, and holds nothing but digits: spaces, dashes and a
`+233` prefix are dropped as they are typed and the eleventh digit never lands.
Nine digits is a typo and eleven is a typo, and both reach the wrong doorstep or
charge the wrong MoMo wallet, so the rule is enforced in the field, again on
submit, and again on the server for every route that accepts a number. The rules
themselves live in one place, `packages/core/src/phone.ts`, because a number
typed into the booking modal and the same number typed into the rider roster
have to end up identical in the database.

Numbers already stored in international form still match what somebody types
locally: comparisons run on the last nine digits, so `0244567801` and
`+233 244 567 801` are the same courier.

### Hiring a courier

A new courier does not sign up; they are hired. The **Courier Roster** tab on
the supervisor desk is where one comes into existence:

1. A supervisor enters the courier's name, phone number, and the company
   vehicle they will ride with its plate. A number already on the roster is
   refused, with the employee ID it belongs to. The vehicle is required: the
   customer is shown it and the plate at the door, and a plate nobody at
   FreshFold checked is not proof of anything. It can be reassigned later from
   the same panel — vehicles go in for repair and riders swap — and the rider
   app shows both read-only.
2. **The server assigns the employee ID** — the next free `RIDER-###` — and
   returns it with the new record. The supervisor does not type it: it is what
   the courier signs in with, so a typo is a courier locked out on their first
   morning, and two supervisors hiring the same morning would otherwise collide.
   It is fixed from then on; the rider app shows it read-only and the telemetry
   endpoint ignores any attempt to change it.
3. **The server generates the PIN** too, and shows it once alongside the ID.
   Nobody types it — a credential the supervisor chose is one they can guess
   later, and under time pressure the choice is always `1234`. It is hashed
   immediately and cannot be read again. Both reach the courier out of band —
   in person, or by phone. The PIN expires in 48 hours if unused.
4. **First sign-in forces a replacement.** Until then `mustChangePin` is set and
   the console redirects to the change-PIN screen with no way past it: a
   provisional PIN is one a second person also knows.
5. Leaving flips `active: false`. Deactivated rather than deleted — deleting
   would orphan every job they carried — and it blocks new logins *and* live
   tokens, since the roster is checked on every request.

### Hand-off codes

Both ends of the round trip are gated by a four-digit code the customer holds,
minted per job when it is created and never regenerated.

**Collection** is a QR the customer shows and the courier scans; the code
travels to the rider app so a scan still verifies in a stairwell with no
signal.

**Delivery** is the mirror image, and deliberately asymmetric: the code goes to
the customer's screens only. The rider console never receives it, types what it
is told, and the *server* decides. Before this it was the constant `7809` for
every job in the system — the courier's app knew it, the "request OTP" button
texted it to the customer, and the error message printed it, while the
customer's own screen masked it to `••••`.

**The override** is for the real world: nobody in, the porter took it, the gate
is locked. The courier writes what happened, and it always succeeds — a courier
cannot be left holding somebody's laundry because a customer's phone is dead.
It is recorded on the job as `proof.deliveryOverrideReason`, raised to the desk
as an alert, and narrated to the customer. A refusal to complete without either
a code or a reason is a `403`; a one-word reason is a `400`.

### Road routes

Every map used to draw the courier's path as a straight line between two
points — across the botanical gardens, through Unity Hall, over whatever was in
the way. On the hub-to-Ayeduase run that line is 3.3 km where the road is
5.3 km, so it was not only wrong to look at: every ETA derived from it was 60%
short on distance.

`GET /api/directions?fromLat=&fromLng=&toLat=&toLng=` asks Google's Routes API
for the geometry a scooter would actually ride and returns it decoded, with the
distance and a traffic-aware duration. It lives on the server for three
reasons: the key stays out of all three client bundles, one answer is shared by
the courier's console, the customer's tracking map and the supervisor's
dashboard, and repeats are cached — coordinates round to about eleven metres,
so a courier polling every four seconds does not bill a request every four
seconds.

It degrades rather than fails. No key configured, quota gone, Google
unreachable: the response is the straight line with `source: 'straight'`, and
the maps draw it dashed rather than pretending it is a route. Set
`GOOGLE_MAPS_PLATFORM_KEY` in `apps/server/.env` (Routes API enabled) to turn
real routing on.

Re-routing is deliberately lazy — a new route only when the destination changes
or the courier has strayed 80 m from the road they were given, at most once
every 20 seconds. That is roughly four to six billed calls per job.

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
| `EXPO_PUBLIC_API_URL` | mobile, client | Only if the server isn't on the dev machine |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | mobile, client | Standalone Android builds only |

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

The three sign-in accounts created on first run all use the password
`password`: `ama.serwaah@st.knust.edu.gh`, `kofi.mensah@gmail.com` and
`adwoa.osei@outlook.com`. They start empty — no orders, no points, no wallet.

## Known limitations

- **The booking write routes are still open.** All three roles authenticate now,
  but `POST/PATCH/DELETE /bookings` and `PATCH /orders/:id/status` do not check
  who is calling. The supervisor desk needs a login to *open*, and its roster
  actions are authorised — but the ledger edits it makes travel over routes that
  would accept them from anyone. Requiring the desk token on those writes is the
  remaining half of this work.
- **A courier's PIN is four digits.** That is the right shape for someone
  wearing gloves at a doorstep and the wrong shape for resisting a guessing
  attack: 10,000 possibilities and no rate limit on `POST /riders/login`. The
  handful of failed attempts a real thief needs would go unnoticed. Locking an
  account after a few misses is the smallest fix; the login already returns one
  message for "wrong PIN" and "no such courier", so it leaks nothing about who
  is on the roster.
- **Collection codes are only as private as `GET /api/bookings`.** That route
  is unauthenticated, and the booking projection now carries `pickupOtp`, so
  anyone who can reach the API can read every customer's code and walk up to a
  door with it. The code raises the bar against an opportunist, not against
  someone who has found the API. Scoping that route to the signed-in customer
  is the fix, and it is the same work as authorizing the write routes below.
- **`PATCH /orders/:id/status` is unauthenticated**, and the customer app uses
  it to sign for its own delivery. That is the correct actor for that
  transition, but nothing on the server proves the caller owns the job — the
  handover code is checked on the device, not at the API. Authorizing the write
  routes closes this along with the point above.
- **Sessions are bearer tokens in `localStorage`**, which is XSS-readable. A
  same-site HTTP-only cookie would be the stronger choice.
- **No rate limiting** on `/api/auth/login`, so nothing slows down an
  online password-guessing attempt.
- **CORS defaults to permissive in development** so a phone on the LAN can
  reach the API. Set `CORS_ORIGINS` in production; leaving it unset there blocks
  cross-origin requests and logs a warning.
- **The rider's position is the device's real fix**, watched through
  `expo-location` while the courier is online. A fix outside the Kumasi service
  area is replaced by the hub, because every distance and ETA in the system is
  computed against Kumasi addresses and a phone in another city would otherwise
  report a courier 200 km from a pickup. That means the courier does not appear
  to move unless the phone does — there is no longer anything driving the map
  on its own.
- **Sync is polling**, every 4–5 seconds. Fine at this scale; websockets or SSE
  would be the upgrade.
