
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const cities = [
  ['hyderabad', 'Hyderabad', 'Telangana', true],
  ['bengaluru', 'Bengaluru', 'Karnataka', true],
  ['chennai', 'Chennai', 'Tamil Nadu', true],
  ['vijayawada', 'Vijayawada', 'Andhra Pradesh', true],
  ['visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', true],
  ['pune', 'Pune', 'Maharashtra', true],
  ['mumbai', 'Mumbai', 'Maharashtra', true],
  ['goa', 'Panaji', 'Goa', true],
  ['tirupati', 'Tirupati', 'Andhra Pradesh', true],
  ['warangal', 'Warangal', 'Telangana', false],
  ['delhi', 'New Delhi', 'Delhi', true],
  ['ahmedabad', 'Ahmedabad', 'Gujarat', false],
  ['jaipur', 'Jaipur', 'Rajasthan', false],
  ['kochi', 'Kochi', 'Kerala', true],
  ['coimbatore', 'Coimbatore', 'Tamil Nadu', false],
  ['mysuru', 'Mysuru', 'Karnataka', false],
  ['nagpur', 'Nagpur', 'Maharashtra', false],
  ['indore', 'Indore', 'Madhya Pradesh', false],
  ['bhopal', 'Bhopal', 'Madhya Pradesh', false],
  ['lucknow', 'Lucknow', 'Uttar Pradesh', false],
  ['kolkata', 'Kolkata', 'West Bengal', true],
  ['surat', 'Surat', 'Gujarat', false],
  ['madurai', 'Madurai', 'Tamil Nadu', false],
  ['nellore', 'Nellore', 'Andhra Pradesh', false],
  ['rajahmundry', 'Rajahmundry', 'Andhra Pradesh', false]
];

const routePairs = [
  ['hyderabad', 'bengaluru', 575, 540, ['Kurnool']],
  ['hyderabad', 'chennai', 626, 600, ['Nellore']],
  ['hyderabad', 'vijayawada', 275, 300, ['Suryapet']],
  ['hyderabad', 'visakhapatnam', 620, 690, ['Rajahmundry']],
  ['hyderabad', 'pune', 560, 600, ['Solapur']],
  ['hyderabad', 'mumbai', 710, 720, ['Solapur']],
  ['hyderabad', 'tirupati', 555, 600, ['Kurnool']],
  ['hyderabad', 'goa', 660, 720, ['Hubballi']],
  ['hyderabad', 'delhi', 1550, 1380, ['Nagpur']],
  ['hyderabad', 'warangal', 145, 150, ['Jangaon']],
  ['bengaluru', 'chennai', 346, 360, ['Vellore']],
  ['bengaluru', 'kochi', 550, 600, ['Coimbatore']],
  ['bengaluru', 'mysuru', 145, 180, ['Mandya']],
  ['bengaluru', 'pune', 840, 840, ['Hubballi']],
  ['bengaluru', 'goa', 560, 600, ['Karwar']],
  ['chennai', 'coimbatore', 505, 480, ['Salem']],
  ['chennai', 'madurai', 462, 450, ['Trichy']],
  ['chennai', 'tirupati', 135, 180, ['Tiruttani']],
  ['vijayawada', 'visakhapatnam', 350, 360, ['Rajahmundry']],
  ['vijayawada', 'tirupati', 410, 420, ['Nellore']],
  ['vijayawada', 'rajahmundry', 185, 180, ['Eluru']],
  ['visakhapatnam', 'rajahmundry', 190, 180, ['Anakapalle']],
  ['pune', 'mumbai', 150, 210, ['Lonavala']],
  ['pune', 'goa', 450, 540, ['Kolhapur']],
  ['mumbai', 'ahmedabad', 530, 540, ['Surat']],
  ['mumbai', 'indore', 585, 600, ['Dhule']],
  ['delhi', 'jaipur', 280, 300, ['Gurugram']],
  ['delhi', 'lucknow', 550, 540, ['Agra']],
  ['delhi', 'kolkata', 1510, 1320, ['Varanasi']],
  ['jaipur', 'ahmedabad', 660, 600, ['Udaipur']],
  ['kochi', 'coimbatore', 190, 210, ['Palakkad']],
  ['kochi', 'madurai', 270, 300, ['Theni']],
  ['coimbatore', 'mysuru', 200, 240, ['Sathyamangalam']],
  ['indore', 'bhopal', 195, 210, ['Dewas']],
  ['bhopal', 'nagpur', 350, 360, ['Betul']],
  ['ahmedabad', 'surat', 265, 270, ['Vadodara']],
  ['hyderabad', 'nellore', 450, 450, ['Kurnool']],
  ['hyderabad', 'rajahmundry', 400, 390, ['Vijayawada']],
  ['bengaluru', 'visakhapatnam', 1020, 1080, ['Vijayawada']],
  ['chennai', 'hyderabad', 626, 600, ['Nellore']]
];

const operatorNames = [
  'GreenLine Travels',
  'OrangeWay Mobility',
  'SkyRoute Express',
  'MetroLink Coaches',
  'Saffron Transit',
  'BluePeak Travels',
  'CityHop Premium',
  'Southern Star Bus'
];

const busTypes = [
  'AC Sleeper',
  'Non-AC Sleeper',
  'AC Seater',
  'Volvo Multi-Axle',
  'Electric AC Seater'
];

const departureTimes = ['06:30', '15:00', '21:15', '23:00'];

const amenities = [
  ['Wi-Fi', 'Charging point', 'Water bottle', 'Blanket'],
  ['AC', 'Reading light', 'Live tracking'],
  ['Charging point', 'Water bottle', 'Live tracking'],
  ['Wi-Fi', 'AC', 'Blanket', 'Snacks'],
  ['USB charging', 'Air purifier', 'Live tracking']
];

function dateInIndia(daysAhead, hour, minute = 0) {
  const now = new Date();
  const indiaNow = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );

  indiaNow.setHours(0, 0, 0, 0);
  indiaNow.setDate(indiaNow.getDate() + daysAhead);

  const y = indiaNow.getFullYear();
  const m = String(indiaNow.getMonth() + 1).padStart(2, '0');
  const d = String(indiaNow.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;
}

async function runSeed() {
  console.log('SEED STARTED');

  const client = await pool.connect();
  console.log('DATABASE CLIENT CONNECTED');

  try {
    await client.query('BEGIN');
    console.log('TRANSACTION STARTED');

    // 1. Insert cities
    console.log('Inserting cities...');

    for (const [slug, name, state, popular] of cities) {
      await client.query(
        `INSERT INTO cities (slug, name, state, popular)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             state = EXCLUDED.state,
             popular = EXCLUDED.popular`,
        [slug, name, state, popular]
      );
    }

    console.log('Cities inserted. Inserting operators...');

    // 2. Insert operators
    for (const name of operatorNames) {
      await client.query(
        `INSERT INTO operators (name, rating, verified)
         VALUES ($1, $2, true)
         ON CONFLICT (name) DO NOTHING`,
        [name, (4.2 + Math.random() * 0.7).toFixed(1)]
      );
    }

    const cityRes = await client.query('SELECT id, slug FROM cities');
    const cityId = Object.fromEntries(
      cityRes.rows.map(r => [r.slug, r.id])
    );

    console.log('Operators inserted. Inserting routes...');

    // 3. Insert routes
    for (const [from, to, distance, duration, via] of routePairs) {
      await client.query(
        `INSERT INTO routes
           (origin_city_id, destination_city_id, distance_km,
            duration_minutes, via)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (origin_city_id, destination_city_id)
         DO UPDATE SET
           distance_km = EXCLUDED.distance_km,
           duration_minutes = EXCLUDED.duration_minutes,
           via = EXCLUDED.via`,
        [cityId[from], cityId[to], distance, duration, via]
      );
    }

    const opRes = await client.query(
      'SELECT id, name FROM operators ORDER BY id'
    );
    const operatorIds = opRes.rows.map(r => r.id);
    const createdBusIds = [];

    console.log('Routes inserted. Inserting buses...');

    // 4. Insert buses
    for (let i = 1; i <= 60; i++) {
      const busType = busTypes[
        (i * 3 + Math.floor(i / 4)) % busTypes.length
      ];

      const typeLabel =
        busType === 'Volvo Multi-Axle'
          ? 'Volvo B11R'
          : busType === 'Electric AC Seater'
            ? 'Electric Intercity'
            : busType;

      const busRes = await client.query(
        `INSERT INTO buses
           (operator_id, bus_number, bus_name, bus_type,
            total_seats, amenities, rating, active)
         VALUES ($1, $2, $3, $4, 36, $5, $6, true)
         ON CONFLICT (bus_number) DO UPDATE SET
           bus_name = EXCLUDED.bus_name,
           bus_type = EXCLUDED.bus_type,
           amenities = EXCLUDED.amenities
         RETURNING id`,
        [
          operatorIds[(i - 1) % operatorIds.length],
          `IB-${String(i).padStart(3, '0')}`,
          `${typeLabel} ${String.fromCharCode(65 + (i % 8))}`,
          busType,
          amenities[i % amenities.length],
          (4.1 + (i % 9) * 0.1).toFixed(1)
        ]
      );

      createdBusIds.push(busRes.rows[0].id);
    }

    console.log('Buses inserted. Creating schedules and seats...');

    // 5. Insert schedules and seats
    const routeRes = await client.query(
      `SELECT id, origin_city_id, destination_city_id,
              distance_km, duration_minutes
       FROM routes
       ORDER BY id`
    );

    const routeRows = routeRes.rows;
    let scheduleCount = 0;

    for (let r = 0; r < routeRows.length; r++) {
      const route = routeRows[r];

      for (let day = 0; day < 14; day++) {
        for (let slot = 0; slot < 4; slot++) {
          const busId =
            createdBusIds[(r * 3 + slot * 7) % createdBusIds.length];

          const [hours, mins] = departureTimes[slot]
            .split(':')
            .map(Number);

          const departureAt = dateInIndia(day, hours, mins);
          const departureDate = new Date(departureAt);

          const arrivalAt = new Date(
            departureDate.getTime() +
              route.duration_minutes * 60000
          ).toISOString();

          const fareFactor = [0.88, 0.98, 1.12, 1.22][slot];
          const fare = Math.max(
            349,
            Math.round(route.distance_km * 0.82 * fareFactor / 10) * 10
          );

          const scheduleRes = await client.query(
            `INSERT INTO bus_schedules
               (route_id, bus_id, departure_at, arrival_at, fare, status)
             VALUES ($1, $2, $3, $4, $5, 'scheduled')
             ON CONFLICT (route_id, bus_id, departure_at)
             DO UPDATE SET fare = EXCLUDED.fare
             RETURNING id`,
            [route.id, busId, departureAt, arrivalAt, fare]
          );

          const scheduleId = scheduleRes.rows[0].id;

          // Build all 36 seats in one query. No extra COUNT query.
          const values = [];
          const placeholders = [];

          for (let n = 1; n <= 36; n++) {
            const row = Math.ceil(n / 4);
            const col = ((n - 1) % 4) + 1;
            const type = col === 1 || col === 4
              ? 'window'
              : 'aisle';

            const base = values.length;

            values.push(
              scheduleId,
              String(n).padStart(2, '0'),
              type,
              row,
              col
            );

            placeholders.push(
              `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 'available')`
            );
          }

          await client.query(
            `INSERT INTO seats
               (schedule_id, seat_number, seat_type, row_num, col_num, status)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT DO NOTHING`,
            values
          );

          scheduleCount++;

          if (scheduleCount % 100 === 0) {
            console.log(`Schedules processed: ${scheduleCount}`);
          }
        }
      }
    }

    console.log('Schedules and seats inserted. Adding boarding points...');

    // 6. Boarding and dropping points
    const boarding = [
      ['Hyderabad', 'MGBS Bus Station', 'Mahathma Gandhi Bus Station'],
      ['Hyderabad', 'Kukatpally JNTU', 'JNTU Metro, Kukatpally'],
      ['Hyderabad', 'Gachibowli Circle', 'Gachibowli main road'],
      ['Bengaluru', 'Majestic Bus Stand', 'Kempegowda Bus Station'],
      ['Bengaluru', 'Silk Board', 'Silk Board junction'],
      ['Bengaluru', 'Electronic City', 'Hosur Road, Electronic City'],
      ['Chennai', 'Koyambedu', 'CMBT, Koyambedu'],
      ['Chennai', 'Guindy', 'Guindy metro station'],
      ['Vijayawada', 'Benz Circle', 'Benz Circle junction'],
      ['Visakhapatnam', 'Maddilapalem', 'Maddilapalem junction'],
      ['Pune', 'Swargate', 'Swargate bus terminal'],
      ['Mumbai', 'Dadar East', 'Dadar TT circle']
    ];

    for (const [cityName, name, address] of boarding) {
      const match = cityName === 'Hyderabad'
        ? 'hyderabad'
        : cityName === 'Bengaluru'
          ? 'bengaluru'
          : cityName === 'Chennai'
            ? 'chennai'
            : cityName === 'Vijayawada'
              ? 'vijayawada'
              : cityName === 'Visakhapatnam'
                ? 'visakhapatnam'
                : cityName.toLowerCase();

      if (cityId[match]) {
        await client.query(
          `INSERT INTO boarding_points (city_id, name, address)
           VALUES ($1, $2, $3)
           ON CONFLICT (city_id, name) DO NOTHING`,
          [cityId[match], name, address]
        );

        await client.query(
          `INSERT INTO dropping_points (city_id, name, address)
           VALUES ($1, $2, $3)
           ON CONFLICT (city_id, name) DO NOTHING`,
          [cityId[match], name, address]
        );
      }
    }

    console.log('Boarding points inserted. Adding booking history...');

    // 7. Historical data for demand-prediction dashboard
    const histRouteIds = routeRows.map(r => r.id);

    for (
      let chunkStart = 0;
      chunkStart < histRouteIds.length;
      chunkStart += 10
    ) {
      const vals = [];
      const ph = [];

      for (const routeId of histRouteIds.slice(
        chunkStart,
        chunkStart + 10
      )) {
        for (let day = 1; day <= 180; day += 3) {
          const d = new Date();
          d.setDate(d.getDate() - day);
          const iso = d.toISOString().slice(0, 10);

          for (const hour of [6, 15, 21]) {
            const base = vals.length;

            const booked = Math.max(
              0,
              Math.round(
                8 +
                Math.sin(day / 9) * 6 +
                (hour === 21 ? 8 : hour === 6 ? 2 : 0) +
                ((routeId * day) % 13) - 5
              )
            );

            const searches = booked * 3 + ((routeId + day) % 30);

            vals.push(routeId, iso, hour, booked, searches);

            ph.push(
              `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5})`
            );
          }
        }
      }

      if (ph.length) {
        await client.query(
          `INSERT INTO historical_bookings
             (route_id, travel_date, departure_hour, booked_seats, search_count)
           VALUES ${ph.join(', ')}
           ON CONFLICT (route_id, travel_date, departure_hour)
           DO NOTHING`,
          vals
        );
      }

      console.log(
        `Historical data processed: ${Math.min(chunkStart + 10, histRouteIds.length)} / ${histRouteIds.length} routes`
      );
    }

    // 8. Demo users
    console.log('Creating demo users...');

    const adminHash = await bcrypt.hash('Admin@123', 10);
    const passengerHash = await bcrypt.hash('Passenger@123', 10);

    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('IntelliBus Admin', 'admin@intellibus.demo', $1, 'admin')
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'admin'`,
      [adminHash]
    );

    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Demo Passenger', 'passenger@intellibus.demo', $1, 'passenger')
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash`,
      [passengerHash]
    );

    await client.query('COMMIT');

    console.log('SEED COMPLETED SUCCESSFULLY');

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM cities)::int AS cities,
        (SELECT COUNT(*) FROM routes)::int AS routes,
        (SELECT COUNT(*) FROM buses)::int AS buses,
        (SELECT COUNT(*) FROM bus_schedules
          WHERE departure_at > NOW())::int AS schedules,
        (SELECT COUNT(*) FROM seats)::int AS seats,
        (SELECT COUNT(*) FROM historical_bookings)::int AS history
    `);

    console.log('Seed data ready:', counts.rows[0]);
    console.log('Demo admin: admin@intellibus.demo / Admin@123');
    console.log('Demo passenger: passenger@intellibus.demo / Passenger@123');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

try {
  await runSeed();
} catch (error) {
  console.error('Seed process failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
