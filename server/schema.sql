CREATE TABLE IF NOT EXISTS cities (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  popular BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'passenger' CHECK (role IN ('passenger','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operators (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  rating NUMERIC(2,1) NOT NULL DEFAULT 4.5,
  verified BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS routes (
  id SERIAL PRIMARY KEY,
  origin_city_id INTEGER NOT NULL REFERENCES cities(id),
  destination_city_id INTEGER NOT NULL REFERENCES cities(id),
  distance_km INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  via TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE(origin_city_id, destination_city_id),
  CHECK (origin_city_id <> destination_city_id)
);

CREATE TABLE IF NOT EXISTS buses (
  id SERIAL PRIMARY KEY,
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  bus_number TEXT NOT NULL UNIQUE,
  bus_name TEXT NOT NULL,
  bus_type TEXT NOT NULL CHECK (bus_type IN ('AC Sleeper','Non-AC Sleeper','AC Seater','Volvo Multi-Axle','Electric AC Seater')),
  total_seats INTEGER NOT NULL DEFAULT 36,
  amenities TEXT[] NOT NULL DEFAULT '{}',
  rating NUMERIC(2,1) NOT NULL DEFAULT 4.4,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS bus_schedules (
  id BIGSERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  bus_id INTEGER NOT NULL REFERENCES buses(id),
  departure_at TIMESTAMPTZ NOT NULL,
  arrival_at TIMESTAMPTZ NOT NULL,
  fare NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  UNIQUE(route_id, bus_id, departure_at),
  CHECK (arrival_at > departure_at)
);
CREATE INDEX IF NOT EXISTS idx_schedules_departure ON bus_schedules(departure_at);
CREATE INDEX IF NOT EXISTS idx_schedules_route_departure ON bus_schedules(route_id, departure_at);

CREATE TABLE IF NOT EXISTS seats (
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT NOT NULL REFERENCES bus_schedules(id) ON DELETE CASCADE,
  seat_number TEXT NOT NULL,
  seat_type TEXT NOT NULL CHECK (seat_type IN ('window','aisle','middle','lower','upper')),
  row_num INTEGER NOT NULL,
  col_num INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','booked')),
  hold_expires_at TIMESTAMPTZ,
  UNIQUE(schedule_id, seat_number)
);
CREATE INDEX IF NOT EXISTS idx_seats_schedule_status ON seats(schedule_id, status);

CREATE TABLE IF NOT EXISTS seat_holds (
  id BIGSERIAL PRIMARY KEY,
  token UUID NOT NULL UNIQUE,
  schedule_id BIGINT NOT NULL REFERENCES bus_schedules(id) ON DELETE CASCADE,
  seat_id BIGINT NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','expired','released'))
);
CREATE INDEX IF NOT EXISTS idx_holds_active ON seat_holds(status, expires_at);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  pnr TEXT NOT NULL UNIQUE,
  schedule_id BIGINT NOT NULL REFERENCES bus_schedules(id),
  seat_id BIGINT NOT NULL REFERENCES seats(id),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  passenger_name TEXT NOT NULL,
  passenger_email TEXT NOT NULL,
  passenger_phone TEXT NOT NULL,
  boarding_point TEXT NOT NULL,
  dropping_point TEXT NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','completed')),
  booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(LOWER(passenger_email));
CREATE INDEX IF NOT EXISTS idx_bookings_schedule ON bookings(schedule_id);

CREATE TABLE IF NOT EXISTS booking_passengers (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age BETWEEN 1 AND 120),
  gender TEXT NOT NULL,
  seat_id BIGINT NOT NULL REFERENCES seats(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid_demo','refund_initiated','failed')),
  transaction_ref TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boarding_points (
  id SERIAL PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  UNIQUE(city_id, name)
);

CREATE TABLE IF NOT EXISTS dropping_points (
  id SERIAL PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  UNIQUE(city_id, name)
);

CREATE TABLE IF NOT EXISTS historical_bookings (
  id BIGSERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  travel_date DATE NOT NULL,
  departure_hour INTEGER NOT NULL CHECK (departure_hour BETWEEN 0 AND 23),
  booked_seats INTEGER NOT NULL DEFAULT 0,
  search_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(route_id, travel_date, departure_hour)
);
CREATE INDEX IF NOT EXISTS idx_history_route_date ON historical_bookings(route_id, travel_date);

CREATE TABLE IF NOT EXISTS ai_predictions (
  id BIGSERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  predicted_for DATE NOT NULL,
  demand_level TEXT NOT NULL CHECK (demand_level IN ('Low','Medium','High')),
  predicted_seats INTEGER NOT NULL,
  capacity_pct NUMERIC(5,2) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(route_id, predicted_for)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
