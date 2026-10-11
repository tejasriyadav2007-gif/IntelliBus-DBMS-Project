import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { pool, expireSeatHolds } from './db.js';

const app = express();
// Periodically release expired holds even when no user is refreshing the page.
const holdSweepTimer = setInterval(() => expireSeatHolds().catch(err => console.error('Seat-hold expiry sweep failed:', err.message)), 15000);
holdSweepTimer.unref();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'intellibus-dev-secret-change-before-deployment';
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req,res,next)).catch(next);
const notBlank = (v) => typeof v === 'string' && v.trim().length > 0;
const localDayStart = "(($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata')";

async function authenticate(req,res,next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    if (!token) return res.status(401).json({ error:'Sign in to continue.' });
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error:'Your session has expired. Please sign in again.' }); }
}
function adminOnly(req,res,next) {
  if (req.auth?.role !== 'admin') return res.status(403).json({ error:'Admin access required.' });
  next();
}

app.get('/api/health', asyncRoute(async (_req,res) => {
  const db = await pool.query('SELECT NOW() AS database_time');
  res.json({ ok:true, service:'IntelliBus API', database:'connected', time:db.rows[0].database_time });
}));

app.get('/api/meta/cities', asyncRoute(async (_req,res) => {
  const result = await pool.query('SELECT id,slug,name,state,popular FROM cities ORDER BY popular DESC,name ASC');
  res.json(result.rows);
}));

app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const { email, password } = req.body || {};
  if (!notBlank(email) || !notBlank(password)) return res.status(400).json({error:'Enter your email and password.'});
  const result = await pool.query('SELECT id,name,email,password_hash,role FROM users WHERE LOWER(email)=LOWER($1)',[email.trim()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:'Email or password is incorrect.'});
  const token = jwt.sign({id:user.id,name:user.name,email:user.email,role:user.role},JWT_SECRET,{expiresIn:'10h'});
  res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role}});
}));

app.post('/api/auth/register', asyncRoute(async (req,res) => {
  const { name,email,password } = req.body || {};
  if (![name,email,password].every(notBlank)) return res.status(400).json({error:'Name, email and password are required.'});
  if (password.length < 8) return res.status(400).json({error:'Use a password with at least 8 characters.'});
  try {
    const hash = await bcrypt.hash(password,10);
    const result = await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,\'passenger\') RETURNING id,name,email,role',[name.trim(),email.trim().toLowerCase(),hash]);
    const user = result.rows[0];
    const token = jwt.sign(user,JWT_SECRET,{expiresIn:'10h'});
    res.status(201).json({token,user});
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({error:'An account with this email already exists.'});
    throw error;
  }
}));

app.get('/api/buses', asyncRoute(async (req,res) => {
  const { from='',to='',date='',type='',time='',maxPrice='',seatPref='',sort='recommended' } = req.query;
  if (!from || !to || !date) return res.status(400).json({error:'Choose a source, destination and travel date.'});
  if (from === to) return res.status(400).json({error:'Source and destination must be different.'});
  await expireSeatHolds();
  const params = [date,from,to];
  let where = `s.departure_at >= (${localDayStart}) AND s.departure_at < ((($1::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata')
    AND cfrom.slug=$2 AND cto.slug=$3 AND s.status='scheduled' AND s.departure_at > NOW()`;
  if (type) { params.push(type); where += ` AND b.bus_type=$${params.length}`; }
  if (maxPrice && Number.isFinite(Number(maxPrice))) { params.push(Number(maxPrice)); where += ` AND s.fare <= $${params.length}`; }
  const sql = `SELECT s.id AS schedule_id,s.fare,s.departure_at,s.arrival_at,s.status AS schedule_status,
      r.distance_km,r.duration_minutes,r.via,
      cfrom.name AS from_name,cfrom.slug AS from_slug,cto.name AS to_name,cto.slug AS to_slug,
      b.id AS bus_id,b.bus_number,b.bus_name,b.bus_type,b.total_seats,b.amenities,b.rating AS bus_rating,
      o.name AS operator_name,o.rating AS operator_rating,o.verified,
      COALESCE(ss.available_seats,0)::int AS available_seats,
      COALESCE(ss.window_seats,0)::int AS available_window_seats,
      COALESCE(ss.booked_seats,0)::int AS booked_seats
    FROM bus_schedules s
    JOIN routes r ON r.id=s.route_id
    JOIN cities cfrom ON cfrom.id=r.origin_city_id
    JOIN cities cto ON cto.id=r.destination_city_id
    JOIN buses b ON b.id=s.bus_id
    JOIN operators o ON o.id=b.operator_id
    LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE status='available') AS available_seats,
      COUNT(*) FILTER (WHERE status='available' AND seat_type='window') AS window_seats,
      COUNT(*) FILTER (WHERE status='booked') AS booked_seats FROM seats WHERE schedule_id=s.id) ss ON TRUE
    WHERE ${where}`;
  const result = await pool.query(sql,params);
  let rows = result.rows.map(r => ({...r, fare:Number(r.fare), bus_rating:Number(r.bus_rating),operator_rating:Number(r.operator_rating)}));
  if (time === 'day') rows = rows.filter(r => { const h=new Date(r.departure_at).toLocaleString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}); return Number(h)>=5 && Number(h)<18; });
  if (time === 'night') rows = rows.filter(r => { const h=Number(new Date(r.departure_at).toLocaleString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false})); return h>=18 || h<5; });
  if (seatPref === 'window') rows = rows.filter(r => r.available_window_seats>0);
  if (sort === 'price') rows.sort((a,b)=>a.fare-b.fare);
  else if (sort === 'departure') rows.sort((a,b)=>new Date(a.departure_at)-new Date(b.departure_at));
  else if (sort === 'duration') rows.sort((a,b)=>a.duration_minutes-b.duration_minutes);
  else rows.sort((a,b)=>(b.operator_rating + b.bus_rating + b.available_seats/100)-(a.operator_rating + a.bus_rating + a.available_seats/100));
  res.json({items:rows, total:rows.length, date, demoData:true});
}));

app.get('/api/recommendations', asyncRoute(async (req,res) => {
  const { from='',to='',date='',budget='',type='',time='',seatPref='' } = req.query;
  if (!from || !to || !date) return res.status(400).json({error:'Choose a route and date first.'});
  const params = [date,from,to];
  let where = `s.departure_at >= (${localDayStart}) AND s.departure_at < ((($1::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata') AND cfrom.slug=$2 AND cto.slug=$3 AND s.status='scheduled' AND s.departure_at>NOW()`;
  if (type) {params.push(type);where+=` AND b.bus_type=$${params.length}`;}
  if (budget && Number(budget)>0) {params.push(Number(budget));where+=` AND s.fare <= $${params.length}`;}
  const result = await pool.query(`SELECT s.id AS schedule_id,s.fare,s.departure_at,s.arrival_at,r.duration_minutes,r.distance_km,
      b.bus_number,b.bus_name,b.bus_type,b.amenities,b.rating AS bus_rating,o.name AS operator_name,o.rating AS operator_rating,
      cfrom.name AS from_name,cto.name AS to_name,
      COALESCE(ss.available_seats,0)::int AS available_seats,COALESCE(ss.window_seats,0)::int AS available_window_seats
    FROM bus_schedules s JOIN routes r ON r.id=s.route_id JOIN cities cfrom ON cfrom.id=r.origin_city_id JOIN cities cto ON cto.id=r.destination_city_id
    JOIN buses b ON b.id=s.bus_id JOIN operators o ON o.id=b.operator_id
    LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE status='available') AS available_seats,COUNT(*) FILTER (WHERE status='available' AND seat_type='window') AS window_seats FROM seats WHERE schedule_id=s.id) ss ON TRUE
    WHERE ${where}` ,params);
  let items=result.rows.map(x=>({...x,fare:Number(x.fare),bus_rating:Number(x.bus_rating),operator_rating:Number(x.operator_rating),score:0,reasons:[]}));
  if(time) items=items.filter(x=>{const h=Number(new Date(x.departure_at).toLocaleString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}));return time==='day'?(h>=5&&h<18):(h>=18||h<5);});
  if(seatPref==='window') items=items.filter(x=>x.available_window_seats>0);
  const maxFare=Math.max(...items.map(x=>x.fare),1),minFare=Math.min(...items.map(x=>x.fare),0);
  const maxDuration=Math.max(...items.map(x=>Number(x.duration_minutes)),1);
  items=items.map(x=>{
    let score=58; const reasons=[];
    score+=Math.min(16,Math.round(x.operator_rating*3));
    if(budget && x.fare<=Number(budget)){score+=10;reasons.push('within your budget');}
    if(type && x.bus_type===type){score+=7;reasons.push('matches your bus type');}
    if(seatPref==='window' && x.available_window_seats>0){score+=5;reasons.push('window seats are available');}
    if(time){score+=5;reasons.push(`fits your ${time} travel preference`);}
    if(x.available_seats>0){score+=Math.min(5,Math.round(x.available_seats/8));}
    if(x.duration_minutes===Math.min(...items.map(y=>Number(y.duration_minutes)))){score+=3;reasons.push('one of the faster trips');}
    return {...x,score:Math.min(99,score),reasons:reasons.length?reasons:['good operator rating and seats available']};
  }).sort((a,b)=>b.score-a.score);
  res.json({items:items.slice(0,10),total:items.length,method:'Transparent weighted preference score on the current demo schedule data'});
}));

app.get('/api/schedules/:id', asyncRoute(async (req,res) => {
  await expireSeatHolds();
  const schedule = await pool.query(`SELECT s.id AS schedule_id,s.fare,s.departure_at,s.arrival_at,r.distance_km,r.duration_minutes,r.via,
      r.origin_city_id,r.destination_city_id,cf.name AS from_name,cf.slug AS from_slug,ct.name AS to_name,ct.slug AS to_slug,
      b.bus_number,b.bus_name,b.bus_type,b.total_seats,b.amenities,b.rating AS bus_rating,o.name AS operator_name,o.rating AS operator_rating,
      COALESCE(ss.available_seats,0)::int AS available_seats,COALESCE(ss.booked_seats,0)::int AS booked_seats
    FROM bus_schedules s JOIN routes r ON r.id=s.route_id JOIN cities cf ON cf.id=r.origin_city_id JOIN cities ct ON ct.id=r.destination_city_id
    JOIN buses b ON b.id=s.bus_id JOIN operators o ON o.id=b.operator_id
    LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE status='available') AS available_seats,COUNT(*) FILTER (WHERE status='booked') AS booked_seats FROM seats WHERE schedule_id=s.id) ss ON TRUE
    WHERE s.id=$1 AND s.departure_at>NOW() AND s.status='scheduled'`,[req.params.id]);
  if (!schedule.rows[0]) return res.status(404).json({error:'This bus trip is no longer available.'});
  const seats = await pool.query('SELECT id,seat_number,seat_type,row_num,col_num,status,hold_expires_at FROM seats WHERE schedule_id=$1 ORDER BY row_num,col_num',[req.params.id]);
  const boarding = await pool.query('SELECT id,name,address FROM boarding_points WHERE city_id=$1 ORDER BY name',[schedule.rows[0].origin_city_id]);
  const dropping = await pool.query('SELECT id,name,address FROM dropping_points WHERE city_id=$1 ORDER BY name',[schedule.rows[0].destination_city_id]);
  res.json({schedule:schedule.rows[0],seats:seats.rows,boardingPoints:boarding.rows,droppingPoints:dropping.rows});
}));

app.post('/api/holds', asyncRoute(async (req,res) => {
  const { scheduleId,seatId } = req.body || {};
  if (!scheduleId || !seatId) return res.status(400).json({error:'Choose a seat before holding it.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await expireSeatHolds(client);
    const seatRes=await client.query('SELECT * FROM seats WHERE id=$1 AND schedule_id=$2 FOR UPDATE',[seatId,scheduleId]);
    const seat=seatRes.rows[0];
    if (!seat) {await client.query('ROLLBACK');return res.status(404).json({error:'Seat not found for this trip.'});}
    if (seat.status!=='available') {await client.query('ROLLBACK');return res.status(409).json({error:seat.status==='held'?'This seat is temporarily held by another passenger. Please choose another seat.':'This seat has already been booked.'});}
    const token=crypto.randomUUID();
    const expires=await client.query("SELECT NOW() + INTERVAL '5 minutes' AS expires_at");
    const expiresAt=expires.rows[0].expires_at;
    await client.query("INSERT INTO seat_holds(token,schedule_id,seat_id,expires_at,status) VALUES($1,$2,$3,$4,'active')",[token,scheduleId,seatId,expiresAt]);
    await client.query("UPDATE seats SET status='held',hold_expires_at=$1 WHERE id=$2",[expiresAt,seatId]);
    await client.query('COMMIT');
    res.status(201).json({token,seatId:Number(seatId),scheduleId:Number(scheduleId),expiresAt,secondsRemaining:300,message:'Seat held for 5 minutes.'});
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}));

app.delete('/api/holds/:token', asyncRoute(async (req,res) => {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const holdRes=await client.query("SELECT * FROM seat_holds WHERE token=$1 AND status='active' FOR UPDATE",[req.params.token]);
    const hold=holdRes.rows[0];
    if (hold) {
      await client.query("UPDATE seats SET status='available',hold_expires_at=NULL WHERE id=$1 AND status='held'",[hold.seat_id]);
      await client.query("UPDATE seat_holds SET status='released' WHERE id=$1",[hold.id]);
    }
    await client.query('COMMIT');
    res.json({released:Boolean(hold)});
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}));

app.post('/api/bookings', asyncRoute(async (req,res) => {
  const {holdToken,name,email,phone,age,gender,paymentMethod='UPI',boardingPoint,droppingPoint} = req.body || {};
  if (![holdToken,name,email,phone,boardingPoint,droppingPoint].every(notBlank)) return res.status(400).json({error:'Fill in all passenger, contact and boarding details.'});
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return res.status(400).json({error:'Enter a valid email address.'});
  if (!/^[0-9+\- ]{8,16}$/.test(phone.trim())) return res.status(400).json({error:'Enter a valid phone number.'});
  const passengerAge=Number(age);
  if (!Number.isInteger(passengerAge)||passengerAge<1||passengerAge>120) return res.status(400).json({error:'Enter a valid passenger age.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await expireSeatHolds(client);
    const holdRes=await client.query("SELECT * FROM seat_holds WHERE token=$1 AND status='active' FOR UPDATE",[holdToken]);
    const hold=holdRes.rows[0];
    if (!hold || new Date(hold.expires_at)<=new Date()) {await client.query('ROLLBACK');return res.status(410).json({error:'Your 5-minute seat hold has expired. Select the seat again.'});}
    const seatRes=await client.query('SELECT * FROM seats WHERE id=$1 AND schedule_id=$2 FOR UPDATE',[hold.seat_id,hold.schedule_id]);
    const seat=seatRes.rows[0];
    if (!seat || seat.status!=='held' || new Date(seat.hold_expires_at)<=new Date()) {await client.query('ROLLBACK');return res.status(409).json({error:'Seat hold is no longer active. Please choose another seat.'});}
    const infoRes=await client.query('SELECT s.fare,s.departure_at,s.arrival_at,r.distance_km,r.duration_minutes,b.bus_name,b.bus_number,b.bus_type,o.name AS operator_name,cf.name AS from_name,ct.name AS to_name FROM bus_schedules s JOIN routes r ON r.id=s.route_id JOIN buses b ON b.id=s.bus_id JOIN operators o ON o.id=b.operator_id JOIN cities cf ON cf.id=r.origin_city_id JOIN cities ct ON ct.id=r.destination_city_id WHERE s.id=$1',[hold.schedule_id]);
    const info=infoRes.rows[0];
    const pnr='IB'+crypto.randomBytes(4).toString('hex').toUpperCase();
    const userRes=await client.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)',[email.trim()]);
    const userId=userRes.rows[0]?.id || null;
    const amount=Number(info.fare);
    const bookingRes=await client.query(`INSERT INTO bookings(pnr,schedule_id,seat_id,user_id,passenger_name,passenger_email,passenger_phone,boarding_point,dropping_point,total_amount,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed') RETURNING id,pnr,schedule_id,seat_id,total_amount,status,booked_at`,[pnr,hold.schedule_id,hold.seat_id,userId,name.trim(),email.trim().toLowerCase(),phone.trim(),boardingPoint,droppingPoint,amount]);
    const booking=bookingRes.rows[0];
    await client.query('INSERT INTO booking_passengers(booking_id,full_name,age,gender,seat_id) VALUES($1,$2,$3,$4,$5)',[booking.id,name.trim(),passengerAge,gender||'Not specified',hold.seat_id]);
    const paymentRef='DEMO-'+crypto.randomBytes(5).toString('hex').toUpperCase();
    await client.query("INSERT INTO payments(booking_id,amount,method,status,transaction_ref) VALUES($1,$2,$3,'paid_demo',$4)",[booking.id,amount,paymentMethod,paymentRef]);
    await client.query("UPDATE seats SET status='booked',hold_expires_at=NULL WHERE id=$1",[hold.seat_id]);
    await client.query("UPDATE seat_holds SET status='converted' WHERE id=$1",[hold.id]);
    if(userId) await client.query("INSERT INTO notifications(user_id,kind,title,message) VALUES($1,'booking','Booking confirmed',$2)",[userId,`Your booking ${pnr} is confirmed.`]);
    await client.query('COMMIT');
    res.status(201).json({booking:{...booking,total_amount:amount,seat_number:seat.seat_number},trip:{...info,departure_at:info.departure_at,arrival_at:info.arrival_at},payment:{status:'paid_demo',method:paymentMethod,transaction_ref:paymentRef},demoPayment:true});
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}));

app.get('/api/bookings', asyncRoute(async (req,res) => {
  const email=String(req.query.email||'').trim();
  if (!email) return res.status(400).json({error:'Enter the email used for booking.'});
  const rows=await pool.query(`SELECT bk.id,bk.pnr,bk.passenger_name,bk.passenger_email,bk.total_amount,bk.status,bk.booked_at,bk.cancelled_at,
      bk.boarding_point,bk.dropping_point,se.seat_number,s.departure_at,s.arrival_at,b.bus_name,b.bus_number,b.bus_type,
      cf.name AS from_name,ct.name AS to_name,p.status AS payment_status,p.method AS payment_method,p.transaction_ref
    FROM bookings bk JOIN seats se ON se.id=bk.seat_id JOIN bus_schedules s ON s.id=bk.schedule_id JOIN routes r ON r.id=s.route_id JOIN buses b ON b.id=s.bus_id
    JOIN cities cf ON cf.id=r.origin_city_id JOIN cities ct ON ct.id=r.destination_city_id LEFT JOIN payments p ON p.booking_id=bk.id
    WHERE LOWER(bk.passenger_email)=LOWER($1) ORDER BY bk.booked_at DESC`,[email]);
  res.json({items:rows.rows.map(x=>({...x,total_amount:Number(x.total_amount)})),total:rows.rowCount});
}));

app.get('/api/bookings/:pnr/ticket', asyncRoute(async (req,res) => {
  const email=String(req.query.email||'').trim();
  if(!email) return res.status(400).json({error:'Enter the email used for booking.'});
  const result=await pool.query(`SELECT bk.id,bk.pnr,bk.passenger_name,bk.passenger_email,bk.passenger_phone,bk.boarding_point,bk.dropping_point,
      bk.total_amount,bk.status,bk.booked_at,bk.cancelled_at,se.seat_number,
      s.fare,s.departure_at,s.arrival_at,r.distance_km,r.duration_minutes,
      b.bus_name,b.bus_number,b.bus_type,o.name AS operator_name,cf.name AS from_name,ct.name AS to_name,
      p.status AS payment_status,p.method AS payment_method,p.transaction_ref
    FROM bookings bk JOIN seats se ON se.id=bk.seat_id JOIN bus_schedules s ON s.id=bk.schedule_id JOIN routes r ON r.id=s.route_id
    JOIN buses b ON b.id=s.bus_id JOIN operators o ON o.id=b.operator_id JOIN cities cf ON cf.id=r.origin_city_id JOIN cities ct ON ct.id=r.destination_city_id
    LEFT JOIN payments p ON p.booking_id=bk.id WHERE bk.pnr=$1 AND LOWER(bk.passenger_email)=LOWER($2)`,[req.params.pnr,email]);
  const row=result.rows[0];
  if(!row) return res.status(404).json({error:'Ticket not found for that PNR and email.'});
  res.json({booking:{id:row.id,pnr:row.pnr,passenger_name:row.passenger_name,passenger_email:row.passenger_email,passenger_phone:row.passenger_phone,
      boarding_point:row.boarding_point,dropping_point:row.dropping_point,total_amount:Number(row.total_amount),status:row.status,booked_at:row.booked_at,
      cancelled_at:row.cancelled_at,seat_number:row.seat_number},
    trip:{fare:Number(row.fare),departure_at:row.departure_at,arrival_at:row.arrival_at,distance_km:row.distance_km,duration_minutes:row.duration_minutes,
      bus_name:row.bus_name,bus_number:row.bus_number,bus_type:row.bus_type,operator_name:row.operator_name,from_name:row.from_name,to_name:row.to_name},
    payment:{status:row.payment_status,method:row.payment_method,transaction_ref:row.transaction_ref}});
}));

app.post('/api/bookings/:pnr/cancel', asyncRoute(async (req,res) => {
  const {email}=req.body||{};
  if(!notBlank(email)) return res.status(400).json({error:'Enter the email used for booking.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const bookingRes=await client.query('SELECT * FROM bookings WHERE pnr=$1 AND LOWER(passenger_email)=LOWER($2) FOR UPDATE',[req.params.pnr,email.trim()]);
    const booking=bookingRes.rows[0];
    if(!booking){await client.query('ROLLBACK');return res.status(404).json({error:'Booking not found for that PNR and email.'});}
    if(booking.status!=='confirmed'){await client.query('ROLLBACK');return res.status(409).json({error:'Only confirmed bookings can be cancelled.'});}
    const sch=await client.query('SELECT departure_at FROM bus_schedules WHERE id=$1',[booking.schedule_id]);
    if(new Date(sch.rows[0].departure_at)<=new Date()){await client.query('ROLLBACK');return res.status(409).json({error:'This trip has already departed and cannot be cancelled.'});}
    await client.query('SELECT id FROM seats WHERE id=$1 FOR UPDATE',[booking.seat_id]);
    await client.query("UPDATE bookings SET status='cancelled',cancelled_at=NOW() WHERE id=$1",[booking.id]);
    await client.query("UPDATE seats SET status='available',hold_expires_at=NULL WHERE id=$1",[booking.seat_id]);
    await client.query("UPDATE payments SET status='refund_initiated' WHERE booking_id=$1 AND status='paid_demo'",[booking.id]);
    await client.query('COMMIT');
    res.json({success:true,message:'Booking cancelled. Demo refund status has been updated.',pnr:booking.pnr});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));

app.post('/api/assistant', asyncRoute(async (req,res) => {
  const message=String(req.body?.message||'').trim();
  if(!message) return res.status(400).json({error:'Ask me about a route, budget or travel time.'});
  const allCities=(await pool.query('SELECT slug,name FROM cities')).rows;
  const lower=message.toLowerCase();
  const from=allCities.find(c=>lower.includes(c.name.toLowerCase())||lower.includes(c.slug.toLowerCase()));
  let to=null;
  if(from){
    const remainder=lower.replace(from.name.toLowerCase(),'').replace(from.slug.toLowerCase(),'');
    to=allCities.find(c=>c.slug!==from.slug&&(remainder.includes(c.name.toLowerCase())||remainder.includes(c.slug.toLowerCase())));
  }
  const budgetMatch=message.match(/(?:under|below|budget|less than|within)\s*(?:rs\.?|₹)?\s*(\d{3,5})/i);
  const night=/night|overnight|late/i.test(lower), day=/morning|day bus|daytime/i.test(lower);
  const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
  if(!from||!to){
    return res.json({reply:'I can recommend buses from the IntelliBus demo schedules. Please mention both cities, for example: “Hyderabad to Bengaluru, night bus under 1000”.',items:[]});
  }
  const {rows}=await pool.query(`SELECT s.id AS schedule_id,s.fare,s.departure_at,s.arrival_at,r.duration_minutes,b.bus_name,b.bus_type,o.name AS operator_name,o.rating AS operator_rating,
      COALESCE(ss.available_seats,0)::int AS available_seats FROM bus_schedules s JOIN routes r ON r.id=s.route_id JOIN cities cf ON cf.id=r.origin_city_id JOIN cities ct ON ct.id=r.destination_city_id
      JOIN buses b ON b.id=s.bus_id JOIN operators o ON o.id=b.operator_id LEFT JOIN LATERAL(SELECT COUNT(*) FILTER(WHERE status='available') AS available_seats FROM seats WHERE schedule_id=s.id)ss ON TRUE
      WHERE cf.slug=$1 AND ct.slug=$2 AND s.departure_at>=NOW() AND s.status='scheduled' ORDER BY s.departure_at LIMIT 50`,[from.slug,to.slug]);
  let list=rows.map(x=>({...x,fare:Number(x.fare),operator_rating:Number(x.operator_rating)}));
  if(budgetMatch) list=list.filter(x=>x.fare<=Number(budgetMatch[1]));
  if(night) list=list.filter(x=>{const h=Number(new Date(x.departure_at).toLocaleString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}));return h>=18||h<5;});
  if(day) list=list.filter(x=>{const h=Number(new Date(x.departure_at).toLocaleString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}));return h>=5&&h<18;});
  list.sort((a,b)=>a.fare-b.fare);
  res.json({reply:list.length?`I found ${list.length} matching option(s) in the IntelliBus demo schedule. These are sample schedules, not live operator inventory.`:'I could not find a matching scheduled bus with those preferences in the current demo data. Try removing the budget or day/night condition.',items:list.slice(0,4)});
}));

app.post('/api/admin/login', asyncRoute(async (req,res) => {
  const {email,password}=req.body||{};
  const result=await pool.query("SELECT id,name,email,password_hash,role FROM users WHERE LOWER(email)=LOWER($1) AND role='admin'",[String(email||'')]);
  const user=result.rows[0];
  if(!user || !(await bcrypt.compare(String(password||''),user.password_hash))) return res.status(401).json({error:'Admin login details are incorrect.'});
  const token=jwt.sign({id:user.id,name:user.name,email:user.email,role:user.role},JWT_SECRET,{expiresIn:'10h'});
  res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role}});
}));

app.get('/api/admin/overview', authenticate, adminOnly, asyncRoute(async (_req,res) => {
  const totals=await pool.query(`SELECT
    (SELECT COUNT(*) FROM cities)::int AS cities,
    (SELECT COUNT(*) FROM routes)::int AS routes,
    (SELECT COUNT(*) FROM buses WHERE active=true)::int AS buses,
    (SELECT COUNT(*) FROM bookings WHERE status='confirmed')::int AS confirmed_bookings,
    (SELECT COUNT(*) FROM bookings WHERE status='cancelled')::int AS cancellations,
    (SELECT COALESCE(SUM(total_amount),0) FROM bookings WHERE status='confirmed')::numeric AS revenue,
    (SELECT COUNT(*) FROM bus_schedules WHERE departure_at>NOW())::int AS upcoming_schedules,
    (SELECT COUNT(*) FROM seats WHERE status='available')::int AS available_seats`);
  const topRoutes=await pool.query(`SELECT cf.name AS from_name,ct.name AS to_name,COUNT(h.id)::int AS history_points,
      ROUND(AVG(h.booked_seats),1) AS avg_booked,ROUND(AVG(h.search_count),1) AS avg_searches,r.id AS route_id
    FROM routes r JOIN cities cf ON cf.id=r.origin_city_id JOIN cities ct ON ct.id=r.destination_city_id
    LEFT JOIN historical_bookings h ON h.route_id=r.id AND h.travel_date>=CURRENT_DATE-60
    GROUP BY r.id,cf.name,ct.name ORDER BY AVG(h.booked_seats) DESC NULLS LAST LIMIT 8`);
  const recent=await pool.query(`SELECT bk.pnr,bk.passenger_name,bk.total_amount,bk.status,bk.booked_at,cf.name AS from_name,ct.name AS to_name
    FROM bookings bk JOIN bus_schedules s ON s.id=bk.schedule_id JOIN routes r ON r.id=s.route_id JOIN cities cf ON cf.id=r.origin_city_id JOIN cities ct ON ct.id=r.destination_city_id
    ORDER BY bk.booked_at DESC LIMIT 6`);
  res.json({totals:{...totals.rows[0],revenue:Number(totals.rows[0].revenue)},topRoutes:topRoutes.rows,recentBookings:recent.rows.map(x=>({...x,total_amount:Number(x.total_amount)}))});
}));

app.get('/api/admin/demand', authenticate, adminOnly, asyncRoute(async (_req,res) => {
  const result=await pool.query(`WITH hist AS (
      SELECT r.id AS route_id,cf.name AS from_name,ct.name AS to_name,
        COALESCE(AVG(h.booked_seats),0)::numeric AS avg_booked,COALESCE(AVG(h.search_count),0)::numeric AS avg_searches,
        COALESCE(MAX(h.booked_seats),0)::int AS peak_booked
      FROM routes r JOIN cities cf ON cf.id=r.origin_city_id JOIN cities ct ON ct.id=r.destination_city_id
      LEFT JOIN historical_bookings h ON h.route_id=r.id AND h.travel_date>=CURRENT_DATE-60 GROUP BY r.id,cf.name,ct.name
    ) SELECT *,CASE WHEN avg_booked>=24 OR avg_searches>=90 THEN 'High' WHEN avg_booked>=13 OR avg_searches>=45 THEN 'Medium' ELSE 'Low' END AS demand_level,
      LEAST(100,ROUND((avg_booked/36.0*100)::numeric,1)) AS predicted_occupancy FROM hist ORDER BY avg_booked DESC,avg_searches DESC LIMIT 20`);
  res.json({items:result.rows,source:'Seeded historical demo booking/search counts over the previous 60 days. This is a transparent baseline estimate, not a trained ML model.'});
}));

app.get('/api/admin/buses', authenticate, adminOnly, asyncRoute(async (_req,res) => {
  const result=await pool.query(`SELECT b.id,b.bus_number,b.bus_name,b.bus_type,b.total_seats,b.rating,b.active,o.name AS operator_name FROM buses b JOIN operators o ON o.id=b.operator_id ORDER BY b.id`);
  res.json({items:result.rows});
}));

app.post('/api/admin/buses', authenticate, adminOnly, asyncRoute(async (req,res) => {
  const {busNumber,busName,busType,operatorName='IntelliBus Partner',totalSeats=36}=req.body||{};
  if(![busNumber,busName,busType].every(notBlank)) return res.status(400).json({error:'Bus number, name and bus type are required.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const op=await client.query('INSERT INTO operators(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[operatorName]);
    const bus=await client.query('INSERT INTO buses(operator_id,bus_number,bus_name,bus_type,total_seats,amenities,rating,active) VALUES($1,$2,$3,$4,$5,$6,4.4,true) RETURNING *',[op.rows[0].id,busNumber,busName,busType,Math.min(60,Math.max(8,Number(totalSeats)||36)),['Charging point','Live tracking']]);
    await client.query('COMMIT');res.status(201).json({item:bus.rows[0]});
  }catch(error){await client.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'That bus number already exists.'});throw error;}finally{client.release();}
}));

app.post('/api/admin/predictions/refresh', authenticate, adminOnly, asyncRoute(async (_req,res) => {
  await pool.query(`INSERT INTO ai_predictions(route_id,predicted_for,demand_level,predicted_seats,capacity_pct)
    SELECT r.id,CURRENT_DATE+day_offset,
      CASE WHEN AVG(h.booked_seats)>=24 THEN 'High' WHEN AVG(h.booked_seats)>=13 THEN 'Medium' ELSE 'Low' END,
      ROUND(AVG(h.booked_seats))::int,LEAST(100,ROUND(AVG(h.booked_seats)/36.0*100,2))
    FROM routes r CROSS JOIN generate_series(1,7) AS gs(day_offset)
    LEFT JOIN historical_bookings h ON h.route_id=r.id AND h.travel_date>=CURRENT_DATE-60
    GROUP BY r.id,day_offset
    ON CONFLICT(route_id,predicted_for) DO UPDATE SET demand_level=EXCLUDED.demand_level,predicted_seats=EXCLUDED.predicted_seats,capacity_pct=EXCLUDED.capacity_pct,generated_at=NOW()`);
  res.json({success:true,message:'Seven-day demo demand estimates refreshed from seeded historical booking data.'});
}));

const distPath = path.resolve('dist');
if (fs.existsSync(path.join(distPath,'index.html'))) {
  app.use(express.static(distPath));
  app.get('*', (req,res,next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath,'index.html'));
  });
}

app.use((err,_req,res,_next) => {
  console.error(err);
  if(res.headersSent) return;
  res.status(500).json({error:'Something went wrong on the server. Check that PostgreSQL is running and review the terminal log.'});
});

// Netlify Functions imports the Express app; local development still starts a server.
export default app;
if (!process.env.NETLIFY) {
  app.listen(PORT, () => console.log(`🚌 IntelliBus API listening at http://localhost:${PORT}`));
}
