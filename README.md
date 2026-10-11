# IntelliBus — AI-Powered Bus Booking & Transportation Management

A fresh full-stack DBMS academic project built with React, Vite, Express and PostgreSQL. It demonstrates dynamic route search, filters, explainable demo recommendations, seat selection, **database-enforced five-minute seat holds**, booking, simulated payment, e-ticket/QR, cancellation, booking history and an operator dashboard with a transparent baseline demand estimate.

> **Important:** This is an academic demonstration. Bus schedules/inventory and payment are demo data. No real money is charged and no external bus operator is connected. The demand page uses seeded historical sample records and a simple statistical baseline; it does not claim a trained ML model.

## What is included

- 25 sample cities, 40 routes, 60 buses and schedules across the next 14 days
- PostgreSQL schema with relational constraints and indexes
- `SELECT ... FOR UPDATE` inside a database transaction for seat holds and booking completion
- Five-minute holds stored in `seat_holds` with expiry timestamps; expired holds release their seat in the database
- PNR-based reservations, passenger details and demo payment records
- QR-backed ticket display and downloadable HTML ticket (open it and choose **Print → Save as PDF**)
- Booking lookup by passenger email and cancellation with demo refund-status update
- Admin dashboard showing booking totals, booking value, route demand estimates and capacity suggestions
- Admin demo login below

## Windows setup (PowerShell)

### 1. Install prerequisites

Install **Node.js 20 or newer** and **Docker Desktop**. Start Docker Desktop and wait until it is running.

### 2. Open the project folder

Extract the ZIP, open the `intellibus` folder in VS Code, then open its terminal (PowerShell). The terminal's current folder must contain `package.json` and `docker-compose.yml`.

### 3. Create your environment file

```powershell
Copy-Item .env.example .env
```

### 4. Start PostgreSQL

```powershell
docker compose up -d
```

Wait for PostgreSQL to become healthy:

```powershell
docker compose ps
```

### 5. Install JavaScript packages

```powershell
npm install
```

### 6. Create tables and load demo data

```powershell
npm run db:setup
```

The first setup can take a few minutes because it creates sample schedules and seat rows. On success, the terminal prints the counts and demo credentials. Running it again is safe for existing seed records.

### 7. Start the website and API

```powershell
npm run dev
```

Open **http://localhost:5173** in your browser. The API runs at **http://localhost:4000**. To verify it, open **http://localhost:4000/api/health**.

## Demo accounts

- **Admin dashboard:** `admin@intellibus.demo` / `Admin@123`
- **Passenger account (available if testing the login API):** `passenger@intellibus.demo` / `Passenger@123`

Passenger checkout does not require sign-in; a booking is saved against the email entered at checkout. Use that same email in **My trips** to view or cancel it.

## Useful commands

```powershell
npm run dev          # Website + API in development mode
npm run build        # Production frontend build
npm run db:setup     # Create schema and seed demo data
npm run db:seed      # Seed records into an already-created schema
```

To stop the website, press `Ctrl+C`. To stop PostgreSQL while preserving the database volume:

```powershell
docker compose stop
```

To completely delete the demo database (this removes all bookings too):

```powershell
docker compose down -v
```

Then use `docker compose up -d` and `npm run db:setup` to rebuild it.

## Main API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | API and database health |
| GET | `/api/meta/cities` | Search dropdown options |
| GET | `/api/buses?from=hyderabad&to=bengaluru&date=YYYY-MM-DD` | Database-backed bus search and filters |
| GET | `/api/recommendations?...` | Weighted recommendations with explanations |
| GET | `/api/schedules/:id` | Trip information and current seat map |
| POST | `/api/holds` | Five-minute transaction-backed seat hold |
| DELETE | `/api/holds/:token` | Release an active hold |
| POST | `/api/bookings` | Confirm booking and save demo payment |
| GET | `/api/bookings?email=...` | Booking history for an email |
| GET | `/api/bookings/:pnr/ticket?email=...` | Re-open a saved e-ticket |
| POST | `/api/bookings/:pnr/cancel` | Cancel booking and release the seat |
| POST | `/api/assistant` | Route-aware assistant using demo schedule data |
| POST | `/api/admin/login` | Admin sign-in |
| GET | `/api/admin/overview` | Admin totals and latest bookings (Bearer token) |
| GET | `/api/admin/demand` | Historical-baseline route demand (Bearer token) |
| POST | `/api/admin/predictions/refresh` | Refresh seven-day demand estimates (Bearer token) |

## Database design

Core entities include `users`, `cities`, `operators`, `routes`, `buses`, `bus_schedules`, `seats`, `seat_holds`, `bookings`, `booking_passengers`, `payments`, `boarding_points`, `dropping_points`, `historical_bookings`, `ai_predictions` and `notifications`. Foreign keys maintain relationships. Seat status transitions are `available → held → booked`; expired or cancelled holds restore `available`.

## Notes for the expo

- Demonstrate search, choose a bus, select a seat, hold it, complete the demo checkout and show the ticket PNR + QR.
- For the database/concurrency explanation, show the `/api/holds` handler and its `SELECT ... FOR UPDATE` transaction. Open the same schedule in two browser windows and try to hold the same seat; only one active hold should succeed.
- Show **Transport dashboard** and explain that demand values come from seeded historical demo records.
- Do not describe the sample inventory as live, the payment as real, or the baseline demand estimate as a trained machine-learning model.

## Troubleshooting

- **Website says API is offline:** confirm PostgreSQL is running, then check `http://localhost:4000/api/health`.
- **Port 5432 is already in use:** stop the other PostgreSQL service or change the host port in `docker-compose.yml` and the port in `.env`'s `DATABASE_URL` to the same value.
- **Docker command not found:** install/start Docker Desktop, then reopen PowerShell.
- **Tables already exist but seed data is missing:** run `npm run db:seed` after the schema has been created.


## Netlify deployment (frontend + API)

This project can be hosted as a single Netlify site with Netlify Functions for the Express API and Neon PostgreSQL for the database. The visual UI is unchanged.

1. Push this project folder to a GitHub repository.
2. In Neon, open the project and copy the **pooled** PostgreSQL connection string. Keep it private.
3. In Netlify, **Add new site → Import an existing project** and select the repository. Build command: `npm run build`; publish directory: `dist`. `netlify.toml` already configures these values and the API rewrite.
4. In Netlify site settings → Environment variables, add:
   - `DATABASE_URL` = Neon pooled connection string (use the connection string that includes SSL, typically `sslmode=require`)
   - `JWT_SECRET` = a long random secret
   - `NETLIFY` is set by Netlify automatically; do not add it yourself.
5. Before the site can book buses, initialize the Neon database once. In this project folder, create/update `.env` with the Neon `DATABASE_URL` and run `npm install`, then `npm run db:setup`. Do not commit `.env` or paste the connection string publicly.
6. Deploy/redeploy the Netlify site. Test `https://YOUR-SITE.netlify.app/api/health`. It should return JSON with `"database":"connected"`.

Important: GitHub Pages is static hosting and cannot run this Express API. Netlify can serve both the existing frontend and the API function, but PostgreSQL still needs a hosted database such as Neon. This avoids a separate Render web service. Demo routes, seats, and payments remain academic sample data.
