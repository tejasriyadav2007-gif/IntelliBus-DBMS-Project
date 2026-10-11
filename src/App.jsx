import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowDownUp, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote, Bus, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, CreditCard, Download,
  Filter, Heart, Home, Info, LayoutDashboard, Lightbulb, LockKeyhole, MapPin, Menu, Moon,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, Star, Ticket, TrainFront, Users, Wallet,
  Wifi, Wind, Zap, X, Armchair, Coffee, PlugZap, Droplets, Luggage, RefreshCw, TrendingUp,
  AlertTriangle, Plus, Eye, EyeOff, LogOut, History, PanelTop, CalendarCheck, Navigation
} from 'lucide-react';

const API = '/api';
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const tomorrowLocal = () => { const d=new Date(); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const money = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const dateLabel = (value, options={weekday:'short',day:'2-digit',month:'short'}) => value ? new Date(value).toLocaleDateString('en-IN',options) : '—';
const timeLabel = (value) => value ? new Date(value).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';
const durationLabel = (mins) => `${Math.floor(Number(mins||0)/60)}h ${Number(mins||0)%60}m`;

async function request(path, options={}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {'Content-Type':'application/json', ...(options.headers||{})},
  });
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

const popularPairs = [
  {from:'hyderabad',to:'bengaluru',label:'Hyderabad → Bengaluru',duration:'9h 00m',fromName:'Hyderabad',toName:'Bengaluru'},
  {from:'hyderabad',to:'chennai',label:'Hyderabad → Chennai',duration:'10h 00m',fromName:'Hyderabad',toName:'Chennai'},
  {from:'hyderabad',to:'vijayawada',label:'Hyderabad → Vijayawada',duration:'5h 00m',fromName:'Hyderabad',toName:'Vijayawada'},
  {from:'bengaluru',to:'chennai',label:'Bengaluru → Chennai',duration:'6h 00m',fromName:'Bengaluru',toName:'Chennai'},
];

function Logo({onClick}) {
  return <button className="brand" onClick={onClick} aria-label="IntelliBus home"><span className="brand-mark"><Bus size={23} strokeWidth={2.4}/><span /></span><span className="brand-word">intelli<span>bus</span><i>•</i></span></button>;
}
function Button({children, kind='primary', className='', block=false, ...props}) {
  return <button className={`btn btn-${kind} ${block?'btn-block':''} ${className}`} {...props}>{children}</button>;
}
function Pill({children, className=''}) { return <span className={`pill ${className}`}>{children}</span>; }
function SeatIcon({size=18}) { return <Armchair size={size}/>; }

export default function App() {
  const [page,setPage] = useState('home');
  const [cities,setCities] = useState([]);
  const [apiOnline,setApiOnline] = useState(false);
  const [loading,setLoading] = useState(false);
  const [toast,setToast] = useState(null);
  const [search,setSearch] = useState({from:'hyderabad',to:'bengaluru',date:tomorrowLocal()});
  const [filters,setFilters] = useState({type:'',time:'',maxPrice:'',seatPref:'',sort:'recommended'});
  const [results,setResults] = useState([]);
  const [resultMeta,setResultMeta] = useState({total:0,demoData:true});
  const [aiMode,setAiMode] = useState(false);
  const [selectedTrip,setSelectedTrip] = useState(null);
  const [tripDetails,setTripDetails] = useState(null);
  const [selectedSeat,setSelectedSeat] = useState(null);
  const [hold,setHold] = useState(null);
  const [secondsLeft,setSecondsLeft] = useState(0);
  const [passenger,setPassenger] = useState({name:'',email:'',phone:'',age:'21',gender:'Not specified',paymentMethod:'UPI',boardingPoint:'',droppingPoint:''});
  const [booking,setBooking] = useState(null);
  const [qrData,setQrData] = useState('');
  const [tripEmail,setTripEmail] = useState('');
  const [myBookings,setMyBookings] = useState([]);
  const [adminToken,setAdminToken] = useState('');
  const [adminEmail,setAdminEmail] = useState('admin@intellibus.demo');
  const [adminPassword,setAdminPassword] = useState('Admin@123');
  const [adminData,setAdminData] = useState(null);
  const [demandData,setDemandData] = useState([]);
  const [showPassword,setShowPassword] = useState(false);
  const [assistantText,setAssistantText] = useState('');
  const [assistantResult,setAssistantResult] = useState(null);
  const [mobileMenu,setMobileMenu] = useState(false);

  const notify = useCallback((message,type='success') => {
    setToast({message,type});
    window.setTimeout(()=>setToast(null),3600);
  },[]);

  useEffect(()=>{
    request('/meta/cities').then(setCities).catch(()=>setCities([]));
    request('/health').then(()=>setApiOnline(true)).catch(()=>setApiOnline(false));
  },[]);

  useEffect(()=>{
    if(!hold?.expiresAt){setSecondsLeft(0);return;}
    const update=()=>{
      const seconds=Math.max(0,Math.floor((new Date(hold.expiresAt).getTime()-Date.now())/1000));
      setSecondsLeft(seconds);
      if(seconds===0 && hold.token){
        setHold(null);setSelectedSeat(null);
        if(page==='checkout') { setPage('seats'); notify('Your five-minute seat hold expired. Please choose and hold a seat again.','error'); }
        if(selectedTrip) request(`/schedules/${selectedTrip.schedule_id}`).then(setTripDetails).catch(()=>{});
      }
    };
    update(); const interval=window.setInterval(update,1000);
    return ()=>window.clearInterval(interval);
  },[hold?.expiresAt,hold?.token,selectedTrip,page,notify]);

  useEffect(()=>{
    if(!booking?.booking?.pnr) return;
    QRCode.toDataURL(`INTELLIBUS|PNR:${booking.booking.pnr}|NAME:${booking.booking.passenger_name||passenger.name}|SEAT:${booking.booking.seat_number}|EMAIL:${booking.booking.passenger_email||passenger.email}`,{width:180,margin:1,color:{dark:'#153a36',light:'#ffffff'}})
      .then(setQrData).catch(()=>setQrData(''));
  },[booking,passenger.name,passenger.email]);

  const cityName = useCallback((slug) => cities.find(c=>c.slug===slug)?.name || slug, [cities]);
  const openHome = () => { setPage('home'); setMobileMenu(false); };
  const setRoute = (from,to) => setSearch(s=>({...s,from,to}));

  const runSearch = async (overrides={}) => {
    const nextSearch={...search,...(overrides.search||{})};
    const nextFilters={...filters,...(overrides.filters||{})};
    if(!nextSearch.from||!nextSearch.to||!nextSearch.date){notify('Select source, destination and travel date.','error');return;}
    if(nextSearch.from===nextSearch.to){notify('Source and destination must be different.','error');return;}
    setSearch(nextSearch);setFilters(nextFilters);setPage('results');setLoading(true);setAiMode(Boolean(overrides.ai));
    try {
      const qs=new URLSearchParams({from:nextSearch.from,to:nextSearch.to,date:nextSearch.date,...Object.fromEntries(Object.entries(nextFilters).filter(([k,v])=>v!==''))});
      const data=overrides.ai
        ? await request(`/recommendations?${new URLSearchParams({from:nextSearch.from,to:nextSearch.to,date:nextSearch.date,budget:nextFilters.maxPrice,type:nextFilters.type,time:nextFilters.time,seatPref:nextFilters.seatPref})}`)
        : await request(`/buses?${qs}`);
      setResults(data.items||[]);setResultMeta(data);setAiMode(Boolean(overrides.ai));
    } catch(error) {setResults([]);notify(error.message,'error');}
    finally {setLoading(false);window.scrollTo({top:0,behavior:'smooth'});}
  };

  const openTrip = async (trip) => {
    setSelectedTrip(trip);setSelectedSeat(null);setHold(null);setTripDetails(null);setPage('seats');setLoading(true);
    try { const details=await request(`/schedules/${trip.schedule_id}`); setTripDetails(details); setSelectedTrip({...trip,...details.schedule}); }
    catch(error){notify(error.message,'error');setPage('results');}
    finally {setLoading(false);window.scrollTo({top:0,behavior:'smooth'});}
  };

  const holdSelectedSeat = async () => {
    if(!selectedTrip||!selectedSeat)return;
    setLoading(true);
    try {
      const data=await request('/holds',{method:'POST',body:JSON.stringify({scheduleId:selectedTrip.schedule_id,seatId:selectedSeat.id})});
      setHold(data);setSecondsLeft(300);setTripDetails(await request(`/schedules/${selectedTrip.schedule_id}`));notify(`Seat ${selectedSeat.seat_number} held for 5 minutes.`);
    } catch(error) {
      notify(error.message,'error');
      try{setTripDetails(await request(`/schedules/${selectedTrip.schedule_id}`));}catch{}
    } finally {setLoading(false);}
  };

  const continueToCheckout = () => {
    if(!hold?.token){notify('Hold a seat before continuing.','error');return;}
    const boarding=tripDetails?.boardingPoints||[];const dropping=tripDetails?.droppingPoints||[];
    setPassenger(p=>({...p,boardingPoint:p.boardingPoint||boarding[0]?.name||`${selectedTrip?.from_name||'Main'} Bus Station`,droppingPoint:p.droppingPoint||dropping[0]?.name||`${selectedTrip?.to_name||'City'} Bus Station`}));
    setPage('checkout');window.scrollTo({top:0,behavior:'smooth'});
  };

  const completeBooking = async (event) => {
    event.preventDefault();
    if(!hold?.token){notify('Your seat hold expired. Please select the seat again.','error');setPage('seats');return;}
    setLoading(true);
    try {
      const data=await request('/bookings',{method:'POST',body:JSON.stringify({...passenger,holdToken:hold.token})});
      setBooking({...data,booking:{...data.booking,passenger_name:passenger.name,passenger_email:passenger.email,seat_number:selectedSeat?.seat_number||data.booking.seat_number}});
      setHold(null);setSelectedSeat(null);setPage('ticket');notify('Booking confirmed! Your demo e-ticket is ready.');window.scrollTo({top:0,behavior:'smooth'});
    } catch(error) {notify(error.message,'error');if(error.message.toLowerCase().includes('expired'))setPage('seats');}
    finally {setLoading(false);}
  };

  const findBookings = async (event) => {
    event?.preventDefault();
    if(!tripEmail.trim()){notify('Enter your booking email.','error');return;}
    setLoading(true);
    try{const data=await request(`/bookings?email=${encodeURIComponent(tripEmail.trim())}`);setMyBookings(data.items||[]);}
    catch(error){setMyBookings([]);notify(error.message,'error');}
    finally{setLoading(false);}
  };

  const cancelBooking = async (item) => {
    if(!window.confirm(`Cancel booking ${item.pnr}? Demo refund status will be updated.`)) return;
    setLoading(true);
    try{const data=await request(`/bookings/${item.pnr}/cancel`,{method:'POST',body:JSON.stringify({email:tripEmail.trim()})});notify(data.message);await findBookings();}
    catch(error){notify(error.message,'error');}
    finally{setLoading(false);}
  };

  const reopenTicket = async (item) => {
    setLoading(true);
    try {
      const data=await request(`/bookings/${item.pnr}/ticket?email=${encodeURIComponent(tripEmail.trim())}`);
      setBooking(data);
      setPassenger(p=>({...p,name:data.booking.passenger_name,email:data.booking.passenger_email,phone:data.booking.passenger_phone,boardingPoint:data.booking.boarding_point,droppingPoint:data.booking.dropping_point,paymentMethod:data.payment.method||'UPI'}));
      setPage('ticket'); window.scrollTo({top:0,behavior:'smooth'});
    } catch(error) { notify(error.message,'error'); }
    finally { setLoading(false); }
  };

  const loginAdmin = async (event) => {
    event?.preventDefault();setLoading(true);
    try{
      const result=await request('/admin/login',{method:'POST',body:JSON.stringify({email:adminEmail,password:adminPassword})});
      setAdminToken(result.token);setPage('admin');
      const header={Authorization:`Bearer ${result.token}`};
      const [overview,demand]=await Promise.all([request('/admin/overview',{headers:header}),request('/admin/demand',{headers:header})]);
      setAdminData(overview);setDemandData(demand.items||[]);notify('Welcome to the transport dashboard.');
    }catch(error){notify(error.message,'error');setPage('adminLogin');}
    finally{setLoading(false);}
  };

  const refreshAdmin = async () => {
    setLoading(true);
    try{
      const headers={Authorization:`Bearer ${adminToken}`};
      await request('/admin/predictions/refresh',{method:'POST',headers,body:JSON.stringify({})});
      const [overview,demand]=await Promise.all([request('/admin/overview',{headers}),request('/admin/demand',{headers})]);
      setAdminData(overview);setDemandData(demand.items||[]);notify('Demand estimates refreshed from demo history.');
    }catch(error){notify(error.message,'error');if(error.message.includes('Admin')){setAdminToken('');setPage('adminLogin');}}
    finally{setLoading(false);}
  };

  const askAssistant = async (event) => {
    event?.preventDefault();if(!assistantText.trim())return;setLoading(true);
    try{setAssistantResult(await request('/assistant',{method:'POST',body:JSON.stringify({message:assistantText})}));}
    catch(error){notify(error.message,'error');}
    finally{setLoading(false);}
  };

  const downloadTicket = () => {
    if(!booking)return;
    const b=booking.booking,t=booking.trip,p=booking.payment;
    const qr=qrData?`<img src="${qrData}" width="150" height="150" alt="Ticket QR code"/>`:'<p>QR code generation unavailable in this browser.</p>';
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>IntelliBus e-ticket ${b.pnr}</title><style>body{font-family:Arial,sans-serif;background:#f0f5f3;padding:32px;color:#183b37}.ticket{max-width:760px;margin:auto;background:#fff;border:1px solid #d9e5e1;border-radius:20px;overflow:hidden}.top{background:#173b36;color:white;padding:24px}.body{padding:28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.cell{border-bottom:1px solid #e3ece8;padding:9px 0}.label{color:#6a817c;font-size:11px;text-transform:uppercase;letter-spacing:1px}.value{font-size:15px;font-weight:700;margin-top:5px}.qr{text-align:center;float:right}small{color:#6a817c}@media print{body{padding:0;background:white}}</style></head><body><article class="ticket"><header class="top"><h2>✦ IntelliBus</h2><p>Digital travel pass · DEMO TICKET</p><h1>${b.pnr}</h1></header><div class="body"><div class="qr">${qr}<p>Scan for booking reference</p></div><h2>${t.from_name} → ${t.to_name}</h2><p>${dateLabel(t.departure_at,{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</p><div class="grid">${[['Passenger',b.passenger_name||passenger.name],['Seat',b.seat_number],['Bus',`${t.bus_name} · ${t.bus_number}`],['Bus type',t.bus_type],['Departure',timeLabel(t.departure_at)],['Arrival',timeLabel(t.arrival_at)],['Boarding',passenger.boardingPoint],['Dropping',passenger.droppingPoint],['Amount',money(b.total_amount)],['Payment',`Demo ${p.method} · ${p.status}`]].map(x=>`<div class="cell"><div class="label">${x[0]}</div><div class="value">${x[1]||'—'}</div></div>`).join('')}</div><p><small>Payment and bus inventory are for academic demonstration only. Keep your PNR for reference.</small></p><button onclick="window.print()">Print / Save as PDF</button></div></article></body></html>`;
    const blob=new Blob([html],{type:'text/html'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`IntelliBus-Ticket-${b.pnr}.html`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);notify('Ticket file downloaded. Open it and choose Print → Save as PDF.');
  };

  const navTo = (target) => { setPage(target);setMobileMenu(false);window.scrollTo({top:0,behavior:'smooth'}); };

  return <div className="app-shell">
    <div className="announcement"><span className="announce-dot"/> Your next journey, intelligently planned <span className="announcement-tag"><Sparkles size={13}/> Smarter travel starts here</span></div>
    <header className="site-header">
      <div className="header-inner"><Logo onClick={openHome}/>
        <nav className={`main-nav ${mobileMenu?'nav-open':''}`}>
          <button className={page==='home'?'nav-active':''} onClick={openHome}>Home</button>
          <button className={page==='results'?'nav-active':''} onClick={()=>navTo('results')}>Find buses</button>
          <button className={page==='bookings'?'nav-active':''} onClick={()=>navTo('bookings')}>My trips</button>
          <button className={['admin','adminLogin'].includes(page)?'nav-active':''} onClick={()=>navTo(adminToken?'admin':'adminLogin')}>Transport dashboard <span className="new-tag">ADMIN</span></button>
        </nav>
        <div className="header-actions"><button className="help-link" onClick={()=>{setAssistantResult(null);navTo('assistant')}}><CircleHelp size={17}/> Travel assistant</button><button className="avatar-button" onClick={()=>navTo('bookings')}>TS</button><button className="mobile-menu" onClick={()=>setMobileMenu(v=>!v)} aria-label="Toggle menu">{mobileMenu?<X/>:<Menu/>}</button></div>
      </div>
    </header>

    {!apiOnline && <div className="offline-banner"><AlertTriangle size={15}/> API is not connected yet. Start PostgreSQL and run the setup commands in README to enable booking features.</div>}

    <main>
      {page==='home' && <HomePage cities={cities} search={search} setSearch={setSearch} runSearch={runSearch} loading={loading} setRoute={setRoute} cityName={cityName} navTo={navTo} assistantText={assistantText} setAssistantText={setAssistantText} askAssistant={askAssistant} assistantResult={assistantResult} setAssistantResult={setAssistantResult} openTrip={openTrip}/>}
      {page==='results' && <ResultsPage cities={cities} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} results={results} loading={loading} runSearch={runSearch} openTrip={openTrip} aiMode={aiMode} setAiMode={setAiMode} resultMeta={resultMeta} />}
      {page==='seats' && <SeatPage tripDetails={tripDetails} loading={loading} selectedSeat={selectedSeat} setSelectedSeat={setSelectedSeat} hold={hold} secondsLeft={secondsLeft} holdSelectedSeat={holdSelectedSeat} continueToCheckout={continueToCheckout} goBack={()=>navTo('results')} refreshSeats={async()=>{if(selectedTrip)setTripDetails(await request(`/schedules/${selectedTrip.schedule_id}`));}}/>}
      {page==='checkout' && <CheckoutPage passenger={passenger} setPassenger={setPassenger} selectedTrip={selectedTrip} selectedSeat={selectedSeat} hold={hold} secondsLeft={secondsLeft} loading={loading} completeBooking={completeBooking} goBack={()=>navTo('seats')}/ >}
      {page==='ticket' && <TicketPage booking={booking} qrData={qrData} passenger={passenger} downloadTicket={downloadTicket} goBookings={()=>{setTripEmail(passenger.email);navTo('bookings');}} goHome={openHome}/ >}
      {page==='bookings' && <BookingsPage email={tripEmail} setEmail={setTripEmail} items={myBookings} loading={loading} findBookings={findBookings} cancelBooking={cancelBooking} openTicket={reopenTicket} />}
      {page==='adminLogin' && <AdminLoginPage email={adminEmail} setEmail={setAdminEmail} password={adminPassword} setPassword={setAdminPassword} showPassword={showPassword} setShowPassword={setShowPassword} loading={loading} loginAdmin={loginAdmin}/ >}
      {page==='admin' && <AdminPage data={adminData} demand={demandData} loading={loading} refresh={refreshAdmin} logout={()=>{setAdminToken('');setAdminData(null);setPage('adminLogin');}}/ >}
      {page==='assistant' && <AssistantPage message={assistantText} setMessage={setAssistantText} ask={askAssistant} result={assistantResult} loading={loading} openTrip={openTrip}/ >}
    </main>

    <Footer navTo={navTo}/>
    {toast && <div className={`toast toast-${toast.type}`}><span className="toast-icon">{toast.type==='error'?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}</span><span>{toast.message}</span><button onClick={()=>setToast(null)} aria-label="Dismiss"><X size={16}/></button></div>}
  </div>;
}

function HomePage({cities,search,setSearch,runSearch,loading,setRoute,cityName,navTo,assistantText,setAssistantText,askAssistant,assistantResult,setAssistantResult,openTrip}) {
  const [showCities,setShowCities]=useState('');
  const dateMin=todayLocal();
  const popular=cities.filter(c=>c.popular).slice(0,8);
  return <>
    <section className="hero-wrap">
      <div className="hero container">
        <div className="hero-copy"><Pill className="hero-pill"><Sparkles size={14}/> AI-POWERED TRAVEL</Pill>
          <h1>Every journey.<br/><span>Smarter by design.</span></h1>
          <p className="hero-subtitle">Find the right bus, the right seat, and the right fare — all with a little intelligence on your side.</p>
          <div className="hero-proof"><div className="proof-avatars"><span>R</span><span>A</span><span>S</span><span>+</span></div><div><strong>Made for better journeys</strong><small>Smart picks, clear prices, calmer travel.</small></div><div className="proof-stars"><Star size={14} fill="currentColor"/> 4.8 <small>demo rating</small></div></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="art-glow"/><div className="art-circle circle-one"/><div className="art-circle circle-two"/><div className="art-route route-one"/><div className="art-route route-two"/><div className="art-pin pin-a"><MapPin size={17}/></div><div className="art-pin pin-b"><MapPin size={17}/></div><div className="art-bus"><div className="bus-window-row"><span/><span/><span/><span/></div><div className="bus-front"><span/></div><div className="bus-wheel wheel-left"/><div className="bus-wheel wheel-right"/><div className="bus-lines"/></div><div className="float-card float-card-top"><span className="float-icon green"><Sparkles size={15}/></span><div><strong>Your AI pick</strong><small>Best fit for your trip</small></div><Pill>96%</Pill></div><div className="float-card float-card-bottom"><span className="float-icon amber"><Armchair size={16}/></span><div><strong>Window seat found</strong><small>Just the way you like it</small></div><CheckCircle2 className="float-check" size={17}/></div><div className="art-label label-a">HYD <span>→</span> BLR</div><div className="art-label label-b">Your route, reimagined</div></div>
        <div className="hero-bottom-note"><span className="note-icon"><ShieldCheck size={18}/></span><span><strong>Thoughtful by design</strong><small>Secure seat holds · Clear booking details</small></span></div>
      </div>
    </section>

    <section className="search-section container">
      <div className="search-card"><div className="search-heading"><div><span className="eyebrow">START YOUR JOURNEY</span><h2>Where are we going?</h2></div><Pill className="live-pill"><span/> Demo schedules</Pill></div>
        <form onSubmit={e=>{e.preventDefault();runSearch();}} className="search-grid">
          <div className="field-group"><label><MapPin size={15}/> FROM</label><div className="input-with-icon"><select value={search.from} onChange={e=>setSearch(s=>({...s,from:e.target.value}))}><option value="">Choose city</option>{cities.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select><span className="field-city-icon"><Navigation size={17}/></span></div></div>
          <button type="button" className="swap-button" title="Swap cities" onClick={()=>setSearch(s=>({...s,from:s.to,to:s.from}))}><ArrowDownUp size={17}/></button>
          <div className="field-group"><label><MapPin size={15}/> TO</label><div className="input-with-icon"><select value={search.to} onChange={e=>setSearch(s=>({...s,to:e.target.value}))}><option value="">Choose city</option>{cities.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select><span className="field-city-icon destination"><MapPin size={17}/></span></div></div>
          <div className="field-group date-field"><label><CalendarDays size={15}/> DEPARTURE DATE</label><div className="date-input"><input type="date" min={dateMin} value={search.date} onChange={e=>setSearch(s=>({...s,date:e.target.value}))}/><span className="date-caption">{search.date===todayLocal()?'Today':search.date===tomorrowLocal()?'Tomorrow':dateLabel(search.date,{weekday:'short',day:'2-digit',month:'short'})}</span></div></div>
          <Button type="submit" className="search-submit" disabled={loading}><Search size={19}/>{loading?'Finding buses…':'Find buses'}<ArrowRight size={17}/></Button>
        </form>
        <div className="search-card-footer"><span><ShieldCheck size={14}/> Secure booking</span><span><Clock3 size={14}/> 5-minute seat hold</span><span><Sparkles size={14}/> AI-powered matching</span><button type="button" onClick={()=>navTo('assistant')}>Need help choosing? <ArrowUpRight size={13}/></button></div>
      </div>
    </section>

    <section className="container section-space"><div className="section-heading"><div><span className="eyebrow">THE INTELLIBUS DIFFERENCE</span><h2>Not just a bus ticket.<br/><span>A better way to travel.</span></h2></div><p>Little details that make the whole journey feel easier.</p></div>
      <div className="feature-grid"><FeatureCard icon={<Sparkles/>} number="01" title="Recommendations that get you" text="Find trips based on your budget, preferred timing, and seat choices — with a reason behind every pick." tone="sage"/><FeatureCard icon={<LockKeyhole/>} number="02" title="Your seat, held securely" text="A database-backed 5-minute hold gives you time to finish booking while other travellers see the right availability." tone="peach"/><FeatureCard icon={<TrendingUp/>} number="03" title="Smarter transport planning" text="Operators get demand insights based on historical demo bookings to help plan capacity for busy routes." tone="lavender"/></div>
    </section>

    <section className="popular-section"><div className="container"><div className="section-heading"><div><span className="eyebrow">A FEW GOOD PLACES TO START</span><h2>Popular routes</h2></div><button className="text-link" onClick={()=>navTo('results')}>Explore all routes <ArrowRight size={16}/></button></div><div className="route-grid">{popularPairs.map((r,i)=><button className="route-card" key={r.label} onClick={()=>{setRoute(r.from,r.to);runSearch({search:{from:r.from,to:r.to}});}}><div className={`route-visual route-visual-${i+1}`}><span className="route-sky"/><span className="route-hill hill-one"/><span className="route-hill hill-two"/><span className="route-sun"/><span className="route-num">0{i+1}</span><div className="route-ticket-icon"><Bus size={23}/></div></div><div className="route-card-copy"><div><strong>{r.fromName}</strong><span>{r.toName}</span></div><ArrowRight size={17}/></div><div className="route-card-foot"><span><Clock3 size={13}/>{r.duration}</span><span className="browse-route">Browse buses <ChevronRight size={14}/></span></div></button>)}</div></div></section>

    <section className="container section-space smart-assistant-banner"><div className="assistant-banner-art"><div className="assistant-orbit orbit-1"/><div className="assistant-orbit orbit-2"/><div className="assistant-orbit orbit-3"/><div className="assistant-core"><Sparkles size={29}/></div><span className="mini-star star-1">✳</span><span className="mini-star star-2">✦</span><span className="mini-star star-3">✧</span></div><div className="assistant-banner-copy"><Pill className="assistant-pill"><Sparkles size={13}/> YOUR TRAVEL COMPANION</Pill><h2>“Find me a comfy night bus under ₹1,000.”</h2><p>Tell us what matters to you. Our travel assistant looks at IntelliBus demo schedules and finds relevant options — no made-up availability.</p><form className="assistant-quick-form" onSubmit={e=>{e.preventDefault();navTo('assistant');askAssistant();}}><input value={assistantText} onChange={e=>setAssistantText(e.target.value)} placeholder="Try: Hyderabad to Bengaluru night bus under 1000"/><Button type="submit" kind="dark" disabled={!assistantText.trim()||loading}><Sparkles size={16}/> Ask Intelli</Button></form><button className="text-link" onClick={()=>navTo('assistant')}>Meet your travel assistant <ArrowRight size={15}/></button></div></section>

    <section className="stats-strip"><div className="container stats-inner"><Stat value="25" label="Demo cities" icon={<MapPin/>}/><Stat value="40+" label="Sample routes" icon={<Navigation/>}/><Stat value="60" label="Demo buses" icon={<Bus/>}/><Stat value="5 min" label="Secure seat hold" icon={<LockKeyhole/>}/></div><p className="demo-disclaimer">IntelliBus is an academic demo. Routes and availability are sample data, not live operator inventory.</p></section>
  </>;
}

function FeatureCard({icon,number,title,text,tone}) { return <div className={`feature-card feature-${tone}`}><div className="feature-top"><span className="feature-icon">{icon}</span><span className="feature-number">{number}</span></div><h3>{title}</h3><p>{text}</p><div className="feature-underline"/></div>; }
function Stat({value,label,icon}) { return <div className="stat"><div className="stat-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>; }

function SearchStrip({cities,search,setSearch,runSearch,loading}) {
  return <form className="compact-search" onSubmit={e=>{e.preventDefault();runSearch();}}><div className="compact-location"><MapPin size={16}/><div><small>FROM</small><select value={search.from} onChange={e=>setSearch(s=>({...s,from:e.target.value}))}>{cities.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select></div></div><button className="compact-swap" type="button" onClick={()=>setSearch(s=>({...s,from:s.to,to:s.from}))}><ArrowDownUp size={16}/></button><div className="compact-location"><Navigation size={16}/><div><small>TO</small><select value={search.to} onChange={e=>setSearch(s=>({...s,to:e.target.value}))}>{cities.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select></div></div><div className="compact-date"><CalendarDays size={16}/><div><small>DATE</small><input type="date" min={todayLocal()} value={search.date} onChange={e=>setSearch(s=>({...s,date:e.target.value}))}/></div></div><Button type="submit" disabled={loading}><Search size={16}/>{loading?'Searching':'Search'}</Button></form>;
}

function ResultsPage({cities,search,setSearch,filters,setFilters,results,loading,runSearch,openTrip,aiMode,setAiMode,resultMeta}) {
  const [mobileFilters,setMobileFilters]=useState(false);
  const types=['AC Sleeper','Non-AC Sleeper','AC Seater','Volvo Multi-Axle','Electric AC Seater'];
  return <div className="page-wrap results-page"><div className="page-top container"><div className="breadcrumb"><button onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}>Home</button><ChevronRight size={13}/><span>Bus search</span></div><SearchStrip cities={cities} search={search} setSearch={setSearch} runSearch={runSearch} loading={loading}/><div className="results-title-row"><div><h1>{cityNameFrom(results,search.from)} <span>to</span> {cityNameFromTo(results,search.to)}</h1><p>{dateLabel(`${search.date}T12:00:00`)} <span className="dot-sep"/> {resultMeta.total??results.length} bus options <span className="dot-sep"/> Demo schedules</p></div><div className="sort-group"><span>Sort by</span><select value={filters.sort} onChange={e=>{setFilters(f=>({...f,sort:e.target.value}));runSearch({filters:{sort:e.target.value}});}}><option value="recommended">Recommended</option><option value="price">Lowest price</option><option value="departure">Departure time</option><option value="duration">Shortest journey</option></select></div></div></div>
    <div className="container results-layout"><aside className={`filters-panel ${mobileFilters?'filters-open':''}`}><div className="filters-title"><div><SlidersHorizontal size={18}/><strong>Filters</strong></div><button onClick={()=>{const clear={type:'',time:'',maxPrice:'',seatPref:'',sort:'recommended'};setFilters(clear);runSearch({filters:clear});}}>Reset all</button><button className="filter-close" onClick={()=>setMobileFilters(false)}><X/></button></div><div className="filter-section"><span className="filter-label">BUS TYPE</span>{types.map(t=><label className="check-row" key={t}><input type="checkbox" checked={filters.type===t} onChange={()=>{const type=filters.type===t?'':t;setFilters(f=>({...f,type}));runSearch({filters:{type}});}}/><span className="custom-check"><Check size={12}/></span>{t}</label>)}</div><div className="filter-section"><span className="filter-label">DEPARTURE TIME</span>{[['day','☀','Daytime · 5 AM – 6 PM'],['night','☾','Night · 6 PM – 5 AM']].map(([v,icon,label])=><label className={`time-filter ${filters.time===v?'time-selected':''}`} key={v}><input type="radio" name="time" checked={filters.time===v} onChange={()=>{setFilters(f=>({...f,time:v}));runSearch({filters:{time:v}});}}/><span className="time-icon">{icon}</span>{label}</label>)}</div><div className="filter-section"><div className="filter-label-row"><span className="filter-label">MAXIMUM PRICE</span><strong>{filters.maxPrice?money(filters.maxPrice):'Any'}</strong></div><input className="price-range" aria-label="Maximum price" type="range" min="300" max="2500" step="100" value={filters.maxPrice||2500} onChange={e=>setFilters(f=>({...f,maxPrice:e.target.value==='2500'?'':e.target.value}))} onMouseUp={()=>runSearch()} onTouchEnd={()=>runSearch()}/><div className="range-labels"><span>₹300</span><span>₹2,500+</span></div><Button kind="outline" className="apply-price" onClick={()=>runSearch()}>Apply price</Button></div><div className="filter-section"><span className="filter-label">SEAT PREFERENCE</span><label className="check-row"><input type="checkbox" checked={filters.seatPref==='window'} onChange={()=>{const seatPref=filters.seatPref==='window'?'':'window';setFilters(f=>({...f,seatPref}));runSearch({filters:{seatPref}});}}/><span className="custom-check"><Check size={12}/></span><Armchair size={15}/> Window seat available</label></div><div className="filter-tip"><Lightbulb size={18}/><div><strong>Smart tip</strong><p>Try AI picks to find a bus that balances price, operator rating and your preferences.</p></div></div></aside>
      <section className="results-content"><div className="results-actions"><div className="results-counter"><span className="counter-dot"/><strong>{loading?'Finding trips…':`${results.length} buses found`}</strong><span>for your route</span></div><div className="results-action-buttons"><button className={`ai-toggle ${aiMode?'ai-on':''}`} onClick={()=>{const next=!aiMode;setAiMode(next);runSearch({ai:next});}}><Sparkles size={16}/>{aiMode?'AI picks on':'Find my AI match'}</button><button className="mobile-filter-toggle" onClick={()=>setMobileFilters(v=>!v)}><Filter size={16}/> Filters</button></div></div>
        {aiMode&&<div className="ai-results-note"><span><Sparkles size={17}/></span><div><strong>Your matches, explained.</strong><p>Scores use transparent weighted rules on budget, departure preference, operator rating and current seat availability — not a trained ML model.</p></div></div>}
        {loading ? <LoadingCards/> : results.length ? <div className="bus-list">{results.map((trip,index)=><BusResultCard key={trip.schedule_id} trip={trip} index={index} aiMode={aiMode} openTrip={openTrip}/>)}</div> : <EmptyResults onRetry={()=>runSearch()} />}
        <p className="tiny-disclaimer"><Info size={13}/> Sample demonstration inventory. Availability is calculated from the local IntelliBus database, not external bus operators.</p>
      </section></div></div>;
}
function cityNameFrom(results,slug){return results[0]?.from_name||slug.split('-').map(x=>x[0]?.toUpperCase()+x.slice(1)).join(' ')}
function cityNameFromTo(results,slug){return results[0]?.to_name||slug.split('-').map(x=>x[0]?.toUpperCase()+x.slice(1)).join(' ')}
function LoadingCards(){return <div className="bus-list">{[1,2,3].map(i=><div className="bus-skeleton" key={i}><div/><div/><div/></div>)}</div>}
function EmptyResults({onRetry}) {return <div className="empty-state"><span><Bus size={27}/></span><h3>No buses found for these filters</h3><p>Try another travel date or clear a filter to see more demo schedules.</p><Button onClick={onRetry}><RefreshCw size={15}/> Try again</Button></div>}
function BusResultCard({trip,index,aiMode,openTrip}) {
  const departureHour=Number(new Date(trip.departure_at).toLocaleString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}));
  const amenities=(trip.amenities||[]).slice(0,3);
  return <article className={`bus-result-card ${index===0&&aiMode?'recommended-card':''}`}><div className="bus-card-main"><div className="operator-avatar"><Bus size={22}/><span>{trip.operator_name?.split(' ').map(x=>x[0]).slice(0,2).join('')}</span></div><div className="bus-identity"><div className="operator-title-row"><h3>{trip.bus_name}</h3>{trip.verified&&<BadgeCheck size={16} className="verified-icon"/>}{index===0&&aiMode&&<Pill className="match-pill"><Sparkles size={12}/>{trip.score}% match</Pill>}</div><p>{trip.operator_name} <span>•</span> {trip.bus_number}</p><div className="bus-type-tags"><Pill>{trip.bus_type}</Pill><span><Star size={13} fill="currentColor"/>{Number(trip.operator_rating||trip.bus_rating||4.4).toFixed(1)}</span></div><div className="amenity-row">{amenities.map((a,i)=><span key={a}>{a==='Wi-Fi'?<Wifi size={13}/>:a.toLowerCase().includes('charge')||a.toLowerCase().includes('usb')?<PlugZap size={13}/>:a.toLowerCase().includes('water')?<Droplets size={13}/>:<Wind size={13}/>} {a}</span>)}</div>{aiMode&&trip.reasons&&<p className="ai-reason"><Sparkles size={13}/> {trip.reasons.join(' · ')}</p>}</div><div className="bus-timing"><div className="time-block"><strong>{timeLabel(trip.departure_at)}</strong><span>{trip.from_name}</span></div><div className="journey-duration"><span>{durationLabel(trip.duration_minutes)}</span><div className="journey-line"><i/><i/><i/></div><small>{trip.distance_km} km</small></div><div className="time-block"><strong>{timeLabel(trip.arrival_at)}</strong><span>{trip.to_name}</span></div></div><div className="bus-price"><small>Starting from</small><strong>{money(trip.fare)}</strong><span className="seats-left">{trip.available_seats} seats left</span><Button onClick={()=>openTrip(trip)} disabled={trip.available_seats===0}>Select seat <ArrowRight size={15}/></Button><small className="price-foot">Inclusive of demo taxes</small></div></div>{index===0&&!aiMode&&trip.available_seats<12&&<div className="scarcity-note"><Zap size={13}/> Limited seats on this departure</div>}</article>;
}

function SeatPage({tripDetails,loading,selectedSeat,setSelectedSeat,hold,secondsLeft,holdSelectedSeat,continueToCheckout,goBack,refreshSeats}) {
  if(!tripDetails)return <div className="container loading-page"><div className="spinner"/><h3>{loading?'Loading seat map…':'Getting trip details…'}</h3></div>;
  const trip=tripDetails.schedule;const seats=tripDetails.seats||[];
  const seatRows=Array.from({length:9},(_,row)=>seats.filter(s=>s.row_num===row+1).sort((a,b)=>a.col_num-b.col_num));
  return <div className="page-wrap"><div className="container subpage-container"><button className="back-link" onClick={goBack}><ArrowLeft size={16}/> Back to search results</button><div className="subpage-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h1>Choose your seat</h1><p>Good journeys start with a seat that feels right.</p></div><Pill className="secure-pill"><ShieldCheck size={14}/> Secure seat hold</Pill></div>
    <div className="seat-layout"><section className="seat-main-panel"><div className="selected-trip-strip"><div className="operator-avatar"><Bus size={22}/></div><div className="trip-strip-title"><strong>{trip.bus_name}</strong><span>{trip.operator_name} · {trip.bus_type}</span></div><div className="trip-strip-route"><strong>{timeLabel(trip.departure_at)} <ArrowRight size={14}/> {timeLabel(trip.arrival_at)}</strong><span>{trip.from_name} to {trip.to_name} · {durationLabel(trip.duration_minutes)}</span></div><div className="trip-strip-fare"><small>Fare / seat</small><strong>{money(trip.fare)}</strong></div></div>
      <div className="seat-map-heading"><div><h3>Seat map</h3><p>Select an available seat to continue</p></div><button className="refresh-icon-button" title="Refresh seat availability" onClick={refreshSeats}><RefreshCw size={16}/></button></div><div className="seat-legend"><span><i className="legend-seat available"/> Available</span><span><i className="legend-seat selected"/> Selected</span><span><i className="legend-seat held"/> Held</span><span><i className="legend-seat booked"/> Booked</span></div>
      <div className="bus-seat-shell"><div className="driver-cabin"><span><span className="steering-wheel"/> Driver</span><span className="front-label">FRONT OF BUS</span></div><div className="seat-columns-label"><span>WINDOW</span><span> AISLE </span><span> AISLE </span><span>WINDOW</span></div><div className="seat-grid">{seatRows.map((row,i)=><React.Fragment key={i}><span className="row-index">{String(i+1).padStart(2,'0')}</span>{row.map(seat=><button type="button" key={seat.id} disabled={seat.status!=='available'||Boolean(hold)} className={`seat ${seat.status==='available'?'seat-available':seat.status==='held'?'seat-held':'seat-booked'} ${selectedSeat?.id===seat.id?'seat-selected':''}`} onClick={()=>setSelectedSeat(seat)} aria-label={`Seat ${seat.seat_number}, ${seat.status}`}><SeatIcon size={18}/><span>{seat.seat_number}</span>{seat.seat_type==='window'&&<i className="window-dot"/>}</button>)}</React.Fragment>)}</div><div className="map-caption"><span><span className="window-dot inline-dot"/> Window seat</span><span>Choose any available seat</span></div></div>
      <div className="seat-notice"><Info size={17}/><p><strong>Your seat is not reserved yet.</strong> Select a seat and hold it securely for 5 minutes. Seat availability is enforced by the database, not just this screen.</p></div>
    </section><aside className="seat-summary"><div className="summary-heading"><h3>Your trip</h3><span className="summary-icon"><Ticket size={17}/></span></div><div className="summary-route"><span className="summary-date">{dateLabel(trip.departure_at,{weekday:'long',day:'2-digit',month:'long'})}</span><div className="summary-route-points"><div><i className="route-dot from-dot"/><div><strong>{trip.from_name}</strong><small>{timeLabel(trip.departure_at)} · Departure</small></div></div><span className="route-vertical-line"/><div><i className="route-dot to-dot"/><div><strong>{trip.to_name}</strong><small>{timeLabel(trip.arrival_at)} · Arrival</small></div></div></div></div><div className="summary-divider"/><div className="summary-pair"><span>Bus type</span><strong>{trip.bus_type}</strong></div><div className="summary-pair"><span>Journey time</span><strong>{durationLabel(trip.duration_minutes)}</strong></div><div className="summary-pair"><span>Selected seat</span><strong>{selectedSeat?selectedSeat.seat_number:'Not selected'}</strong></div><div className="summary-divider"/>{hold?<div className="hold-active"><span className="hold-check"><Check size={15}/></span><div><strong>Seat held securely</strong><small>Complete booking before timer ends</small></div><span className="hold-timer">{String(Math.floor(secondsLeft/60)).padStart(2,'0')}:{String(secondsLeft%60).padStart(2,'0')}</span></div>:<div className="summary-pair"><span>Seat status</span><strong className={selectedSeat?'text-green':''}>{selectedSeat?'Ready to hold':'Choose a seat'}</strong></div>}<div className="summary-total"><span>Seat fare</span><strong>{money(trip.fare)}</strong></div>{hold?<Button block onClick={continueToCheckout} disabled={secondsLeft===0}>Continue to details <ArrowRight size={16}/></Button>:<Button block onClick={holdSelectedSeat} disabled={!selectedSeat||loading}>{loading?'Securing seat…':<><LockKeyhole size={16}/> Hold seat for 5 minutes</>}</Button>}<p className="secure-caption"><LockKeyhole size={12}/> Protected by PostgreSQL row-level locking</p></aside></div></div></div>;
}

function CheckoutPage({passenger,setPassenger,selectedTrip,selectedSeat,hold,secondsLeft,loading,completeBooking,goBack}) {
  const trip=selectedTrip||{};const remaining=`${String(Math.floor(secondsLeft/60)).padStart(2,'0')}:${String(secondsLeft%60).padStart(2,'0')}`;
  return <div className="page-wrap"><div className="container subpage-container"><button className="back-link" onClick={goBack}><ArrowLeft size={16}/> Back to seat selection</button><div className="subpage-heading"><div><span className="eyebrow">ALMOST THERE</span><h1>Passenger details</h1><p>Double-check everything. Your ticket is one step away.</p></div><div className={`hold-pill ${secondsLeft<60?'hold-warning':''}`}><Clock3 size={16}/> Seat hold expires in <strong>{remaining}</strong></div></div>
    <div className="checkout-layout"><form className="checkout-form-panel" onSubmit={completeBooking}><div className="form-section-title"><span className="step-num">01</span><div><h3>Who's travelling?</h3><p>Use the passenger's details for the e-ticket.</p></div></div><div className="form-grid"><label className="form-field span-2"><span>Full name <b>*</b></span><input required value={passenger.name} onChange={e=>setPassenger(p=>({...p,name:e.target.value}))} placeholder="Name as on a valid ID" autoComplete="name"/></label><label className="form-field"><span>Email address <b>*</b></span><input type="email" required value={passenger.email} onChange={e=>setPassenger(p=>({...p,email:e.target.value}))} placeholder="you@example.com" autoComplete="email"/></label><label className="form-field"><span>Mobile number <b>*</b></span><input required minLength={8} maxLength={16} value={passenger.phone} onChange={e=>setPassenger(p=>({...p,phone:e.target.value}))} placeholder="10-digit mobile number" autoComplete="tel"/></label><label className="form-field"><span>Age <b>*</b></span><input required type="number" min="1" max="120" value={passenger.age} onChange={e=>setPassenger(p=>({...p,age:e.target.value}))}/></label><label className="form-field"><span>Gender</span><select value={passenger.gender} onChange={e=>setPassenger(p=>({...p,gender:e.target.value}))}><option>Not specified</option><option>Female</option><option>Male</option><option>Prefer not to say</option></select></label></div><div className="form-section-title second-form-section"><span className="step-num">02</span><div><h3>Boarding & drop-off</h3><p>Choose convenient pickup and drop points.</p></div></div><div className="form-grid"><label className="form-field"><span>Boarding point <b>*</b></span><select required value={passenger.boardingPoint} onChange={e=>setPassenger(p=>({...p,boardingPoint:e.target.value}))}><option value="">Select boarding point</option>{(tripDetailsPointOptions(trip,'board')).map(x=><option key={x} value={x}>{x}</option>)}{passenger.boardingPoint&&!tripDetailsPointOptions(trip,'board').includes(passenger.boardingPoint)&&<option>{passenger.boardingPoint}</option>}</select></label><label className="form-field"><span>Dropping point <b>*</b></span><select required value={passenger.droppingPoint} onChange={e=>setPassenger(p=>({...p,droppingPoint:e.target.value}))}><option value="">Select drop-off point</option>{tripDetailsPointOptions(trip,'drop').map(x=><option key={x} value={x}>{x}</option>)}{passenger.droppingPoint&&!tripDetailsPointOptions(trip,'drop').includes(passenger.droppingPoint)&&<option>{passenger.droppingPoint}</option>}</select></label></div><div className="form-section-title second-form-section"><span className="step-num">03</span><div><h3>Choose demo payment</h3><p>No real money is charged in this academic prototype.</p></div></div><div className="payment-options">{[['UPI',<Zap size={19}/>,'UPI / QR'],['Card',<CreditCard size={19}/>,'Debit / credit card'],['Net banking',<Banknote size={19}/>,'Net banking']].map(([value,icon,label])=><button type="button" key={value} className={`payment-option ${passenger.paymentMethod===value?'payment-selected':''}`} onClick={()=>setPassenger(p=>({...p,paymentMethod:value}))}><span>{icon}</span><strong>{label}</strong>{passenger.paymentMethod===value&&<i><Check size={12}/></i>}</button>)}</div><div className="demo-payment-note"><ShieldCheck size={17}/><p><strong>Demo checkout only.</strong> Completing this step marks a simulated payment as successful for project demonstration. Do not enter real card details.</p></div><Button type="submit" block disabled={loading||secondsLeft===0||!hold?.token}>{loading?'Confirming booking…':<>Confirm & pay {money(trip.fare)} <ArrowRight size={17}/></>}</Button><p className="checkout-footnote"><LockKeyhole size={12}/> Your seat is held for {remaining}. If the timer expires, select it again.</p></form>
    <aside className="checkout-summary"><div className="summary-heading"><h3>Booking summary</h3><Pill>1 passenger</Pill></div><div className="checkout-route-illustration"><div className="route-snapshot"><span><strong>{timeLabel(trip.departure_at)}</strong><small>{trip.from_name}</small></span><div><i/><span>{durationLabel(trip.duration_minutes)}</span><i/></div><span><strong>{timeLabel(trip.arrival_at)}</strong><small>{trip.to_name}</small></span></div><div className="snapshot-date"><CalendarDays size={14}/>{dateLabel(trip.departure_at,{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</div></div><div className="bus-summary-line"><div className="operator-avatar small"><Bus size={18}/></div><div><strong>{trip.bus_name}</strong><span>{trip.bus_type} · {trip.bus_number}</span></div></div><div className="summary-divider"/><div className="summary-pair"><span>Passenger</span><strong>{passenger.name||'Not entered'}</strong></div><div className="summary-pair"><span>Selected seat</span><strong className="seat-chip">{selectedSeat?.seat_number||'—'}</strong></div><div className="summary-pair"><span>Base fare</span><strong>{money(trip.fare)}</strong></div><div className="summary-pair"><span>Convenience fee</span><strong>{money(0)}</strong></div><div className="summary-pair"><span>Taxes</span><strong>Included</strong></div><div className="summary-divider"/><div className="summary-total"><span>Total amount</span><strong>{money(trip.fare)}</strong></div><p className="refund-note"><Info size={14}/> Demo cancellation updates the booking and refund status in the database. It does not move real funds.</p></aside></div></div></div>;
}
function tripDetailsPointOptions(trip,kind) { const city=kind==='board'?trip.from_name:trip.to_name; const defaults={Hyderabad:['MGBS Bus Station','Kukatpally JNTU','Gachibowli Circle'],Bengaluru:['Majestic Bus Stand','Silk Board','Electronic City'],Chennai:['Koyambedu','Guindy'],Vijayawada:['Benz Circle'],Visakhapatnam:['Maddilapalem'],Pune:['Swargate'],Mumbai:['Dadar East']};return defaults[city]||[`${city||'Main'} Bus Station`,`${city||'City'} Central Point`]; }

function TicketPage({booking,qrData,passenger,downloadTicket,goBookings,goHome}) {
  if(!booking)return <div className="container loading-page"><Ticket/><h3>No ticket to display yet</h3><Button onClick={goHome}>Find a bus</Button></div>;
  const b=booking.booking,t=booking.trip,p=booking.payment;
  return <div className="page-wrap ticket-page"><div className="container ticket-container"><div className="confirmation-heading"><div className="confirmation-mark"><Check size={30}/></div><Pill className="confirmed-pill"><CheckCircle2 size={13}/> BOOKING CONFIRMED</Pill><h1>Your next adventure is booked.</h1><p>Your seat is yours. We've created your digital travel pass below.</p></div>
    <article className="digital-ticket"><div className="ticket-header"><div className="ticket-brand"><span className="brand-mark"><Bus size={20}/></span><span>intelli<span>bus</span></span></div><div className={`ticket-status ${b.status==='cancelled'?'ticket-cancelled':''}`}><CheckCircle2 size={14}/> {String(b.status||'confirmed').toUpperCase()}</div></div><div className="ticket-main"><div className="ticket-route-heading"><div><span className="ticket-eyebrow">YOUR JOURNEY</span><h2>{t.from_name} <ArrowRight size={23}/> {t.to_name}</h2><p>{dateLabel(t.departure_at,{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</p></div><div className="pnr-block"><span>BOOKING PNR</span><strong>{b.pnr}</strong><button onClick={()=>navigator.clipboard?.writeText(b.pnr).then(()=>{})}><PanelTop size={13}/> Copy PNR</button></div></div><div className="ticket-route-timeline"><div className="ticket-stop"><strong>{timeLabel(t.departure_at)}</strong><span className="ticket-stop-dot start-dot"/><div><b>{t.from_name}</b><small>{passenger.boardingPoint}</small></div></div><div className="ticket-middle"><span>{durationLabel(t.duration_minutes)}</span><div/><span>{t.distance_km} km</span></div><div className="ticket-stop arrival-stop"><strong>{timeLabel(t.arrival_at)}</strong><span className="ticket-stop-dot end-dot"/><div><b>{t.to_name}</b><small>{passenger.droppingPoint}</small></div></div></div><div className="ticket-perforation"><span/><div/></div><div className="ticket-details-grid"><div><span>PASSENGER</span><strong>{b.passenger_name||passenger.name}</strong></div><div><span>SEAT NUMBER</span><strong className="ticket-seat-no">{b.seat_number||'—'}</strong></div><div><span>BUS / OPERATOR</span><strong>{t.bus_name} · {t.bus_number}</strong></div><div><span>BUS TYPE</span><strong>{t.bus_type}</strong></div><div><span>EMAIL</span><strong>{b.passenger_email||passenger.email}</strong></div><div><span>PAYMENT</span><strong>Demo {p.method} · {p.status==='paid_demo'?'Successful':'Pending'}</strong></div></div></div><div className="ticket-qr-panel"><div className="ticket-qr-copy"><h3>Ready when you are.</h3><p>Keep your PNR handy and show your e-ticket at boarding. The QR code contains your demo booking reference.</p><Pill className="demo-payment-pill"><CheckCircle2 size={13}/> Demo payment complete</Pill></div><div className="ticket-qr">{qrData?<img src={qrData} alt="Ticket booking QR code"/>:<div className="qr-placeholder"><Sparkles/></div>}<span>SCAN TO VERIFY</span></div></div><div className="ticket-footer"><span><ShieldCheck size={14}/> Digital ticket · Keep for your records</span><span>IntelliBus · Smarter travel</span></div></article>
    <div className="ticket-actions"><Button onClick={downloadTicket}><Download size={16}/> Download e-ticket</Button><Button kind="outline" onClick={goBookings}><Ticket size={16}/> View my trips</Button><Button kind="ghost" onClick={goHome}>Back to home <ArrowRight size={15}/></Button></div><p className="ticket-demo-note"><Info size={14}/> This is a demonstration ticket. Payment is simulated and the bus inventory is local demo data.</p></div></div>;
}

function BookingsPage({email,setEmail,items,loading,findBookings,cancelBooking}) {
  return <div className="page-wrap"><div className="container subpage-container bookings-container"><div className="subpage-heading"><div><span className="eyebrow">YOUR TRAVEL FILE</span><h1>My trips, all in one place.</h1><p>Find upcoming rides, revisit tickets, or manage a cancellation.</p></div><div className="bookings-heading-icon"><Ticket size={25}/></div></div><div className="booking-lookup-card"><div className="lookup-icon"><History size={21}/></div><div className="lookup-copy"><h3>Find your bookings</h3><p>Enter the email address you used during checkout.</p></div><form onSubmit={findBookings}><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><Button type="submit" disabled={loading}>{loading?'Searching…':'Find my trips'} <ArrowRight size={15}/></Button></form></div>{items.length>0?<div className="booking-history"><div className="history-header"><div><h2>Your bookings</h2><p>{items.length} record{items.length===1?'':'s'} found</p></div><Pill>{items.filter(x=>x.status==='confirmed').length} active</Pill></div>{items.map(item=><article className="history-card" key={item.pnr}><div className="history-card-top"><div className="history-pnr"><span>PNR</span><strong>{item.pnr}</strong></div><Pill className={`booking-status status-${item.status}`}>{item.status}</Pill></div><div className="history-route"><div><strong>{timeLabel(item.departure_at)}</strong><span>{item.from_name}</span></div><div className="history-route-line"><span>{dateLabel(item.departure_at)}</span><i/><span>{item.bus_type}</span></div><div><strong>{timeLabel(item.arrival_at)}</strong><span>{item.to_name}</span></div></div><div className="history-card-bottom"><div className="history-meta"><span><Users size={14}/>{item.passenger_name}</span><span><Armchair size={14}/>Seat {item.seat_number}</span><span><Bus size={14}/>{item.bus_name}</span></div><div className="history-price"><strong>{money(item.total_amount)}</strong><div className="history-actions"><Button kind="ghost" className="view-ticket-button" onClick={()=>openTicket(item)} disabled={loading}>View ticket <ArrowRight size={13}/></Button>{item.status==='confirmed'?<Button kind="outline" className="cancel-button" onClick={()=>cancelBooking(item)} disabled={loading}>Cancel trip</Button>:<span className="refund-status">{item.payment_status==='refund_initiated'?'Demo refund initiated':item.payment_status==='paid_demo'?'Demo payment':'—'}</span>}</div></div></div></article>)}</div>:<div className="history-empty"><span><Ticket size={26}/></span><h3>Your next journey starts here.</h3><p>After booking a trip, enter the same email above and your ticket history will appear here.</p><div className="history-empty-pills"><Pill><CheckCircle2 size={13}/> Upcoming trips</Pill><Pill><History size={13}/> Past bookings</Pill><Pill><RefreshCw size={13}/> Cancellation updates</Pill></div></div>}</div></div>;
}

function AdminLoginPage({email,setEmail,password,setPassword,showPassword,setShowPassword,loading,loginAdmin}) {
  return <div className="page-wrap admin-login-page">
    <div className="admin-login-card">
      <div className="admin-login-left">
        <div className="admin-login-icon"><LayoutDashboard size={28}/></div>
        <Pill className="admin-label"><ShieldCheck size={13}/> OPERATOR CONSOLE</Pill>
        <h1>Welcome back,<br/><span>transport partner.</span></h1>
        <p>Sign in to manage fleet schedules, understand route demand, and plan smarter capacity.</p>
        <form onSubmit={loginAdmin}>
          <label className="form-field"><span>Admin email</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <label className="form-field password-field"><span>Password</span><input required type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label="Show password">{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></label>
          <Button block type="submit" disabled={loading}>{loading?'Signing in…':'Open dashboard'} <ArrowRight size={16}/></Button>
        </form>
        <div className="demo-login-note"><Info size={15}/><div><strong>Expo demo account</strong><span>admin@intellibus.demo / Admin@123</span></div><button onClick={()=>{setEmail('admin@intellibus.demo');setPassword('Admin@123');}}>Use demo login</button></div>
        <small className="admin-login-foot">AI demand insights are calculated from seeded demonstration history.</small>
      </div>
      <div className="admin-login-side">
        <div className="dashboard-preview"><div className="preview-top"><span/><span/><span/></div><div className="preview-title-line"/><div className="preview-kpi-row"><i/><i/><i/></div><div className="preview-chart"><span/><span/><span/><span/><span/><span/><span/></div><div className="preview-bottom"><i/><i/></div></div>
        <div className="admin-side-copy"><Sparkles size={20}/><h2>See the bigger picture.</h2><p>From route demand to seating capacity, bring more clarity to every decision.</p><div className="admin-side-points"><span><CheckCircle2 size={15}/> Route-level insights</span><span><CheckCircle2 size={15}/> Historical demand trends</span><span><CheckCircle2 size={15}/> Fleet visibility</span></div></div>
      </div>
    </div>
  </div>;
}
function AdminPage({data,demand,loading,refresh,logout}) {
  const stats=data?.totals;
  return <div className="page-wrap admin-page"><div className="container admin-container"><div className="admin-page-heading"><div><span className="eyebrow">INTELLIBUS OPERATIONS</span><h1>Good decisions move every journey.</h1><p>Your demo fleet at a glance. Insights are based on the local IntelliBus database and seeded historical sample data.</p></div><div className="admin-heading-actions"><Pill className="admin-connected"><span/> Demo data connected</Pill><Button kind="outline" onClick={refresh} disabled={loading}><RefreshCw size={15}/> Refresh insights</Button><Button kind="ghost" onClick={logout}><LogOut size={15}/> Sign out</Button></div></div>{!data?<div className="loading-page"><div className="spinner"/><p>Loading dashboard data…</p></div>:<><div className="admin-kpi-grid"><AdminKpi icon={<Bus/>} label="Active buses" value={stats.buses} sub={`${stats.routes} demo routes`} tone="sage"/><AdminKpi icon={<Ticket/>} label="Confirmed bookings" value={stats.confirmed_bookings} sub={`${stats.cancellations} cancellations`} tone="blue"/><AdminKpi icon={<Wallet/>} label="Booking value" value={money(stats.revenue)} sub="Confirmed demo bookings" tone="gold"/><AdminKpi icon={<Armchair/>} label="Available seats" value={Number(stats.available_seats).toLocaleString('en-IN')} sub={`${stats.upcoming_schedules} upcoming schedules`} tone="lilac"/></div><div className="admin-main-grid"><section className="dashboard-panel demand-panel"><div className="panel-heading"><div><span className="eyebrow">PLANNING SIGNAL</span><h2>Route demand outlook</h2><p>Historical baseline · Recent 60 days</p></div><span className="panel-heading-icon"><TrendingUp size={19}/></span></div><div className="demand-legend"><span><i className="demand-dot high"/>High</span><span><i className="demand-dot medium"/>Medium</span><span><i className="demand-dot low"/>Low</span></div><div className="demand-list">{demand.slice(0,8).map((route,i)=><div className="demand-row" key={route.route_id}><div className="demand-route-name"><span className="demand-row-number">{String(i+1).padStart(2,'0')}</span><div><strong>{route.from_name} <ArrowRight size={12}/> {route.to_name}</strong><small>{route.history_points} history points · Avg {Number(route.avg_booked||0).toFixed(1)} seats</small></div></div><div className="demand-meter-wrap"><div className="demand-meter"><i style={{width:`${Math.max(3,Math.min(100,Number(route.predicted_occupancy||0)))}%`}} className={`meter-${String(route.demand_level).toLowerCase()}`}/></div><span>{Number(route.predicted_occupancy||0).toFixed(0)}%</span></div><Pill className={`demand-pill demand-${String(route.demand_level).toLowerCase()}`}>{route.demand_level}</Pill></div>)}</div><div className="baseline-note"><Info size={15}/><p><strong>How to read this:</strong> average historical booked seats/search counts give a simple Low/Medium/High estimate. It is a transparent statistical baseline on seeded data, not a trained ML model or live demand feed.</p></div></section><section className="dashboard-panel insights-panel"><div className="panel-heading"><div><span className="eyebrow">AI-ASSISTED PLANNING</span><h2>Capacity recommendations</h2><p>Ideas surfaced from demo history</p></div><span className="panel-heading-icon sparkle-panel"><Sparkles size={19}/></span></div><div className="insight-card insight-high"><span className="insight-icon"><AlertTriangle size={18}/></span><div><Pill className="demand-high">High demand</Pill><h3>Watch popular corridors</h3><p>Routes with higher recent booked-seat averages should be reviewed for extra departures on peak days.</p></div></div><div className="insight-card insight-medium"><span className="insight-icon"><TrendingUp size={18}/></span><div><Pill className="demand-medium">Capacity planning</Pill><h3>Align fleet to demand</h3><p>Compare predicted demand against 36-seat demo capacity before adding or reallocating a bus.</p></div></div><div className="insight-card insight-low"><span className="insight-icon"><Lightbulb size={18}/></span><div><Pill className="demand-low">Utilization</Pill><h3>Review quieter routes</h3><p>Lower historical utilization can signal a need to check departure timing or timetable frequency.</p></div></div><Button block onClick={refresh} disabled={loading}><RefreshCw size={15}/> Refresh 7-day estimates</Button></section></div><section className="dashboard-panel recent-bookings-panel"><div className="panel-heading"><div><span className="eyebrow">LATEST ACTIVITY</span><h2>Recent bookings</h2></div><Pill>{data.recentBookings?.length||0} records</Pill></div>{data.recentBookings?.length?<div className="recent-table-wrap"><table className="recent-table"><thead><tr><th>PNR</th><th>Passenger</th><th>Route</th><th>Booking value</th><th>Status</th><th>Booked on</th></tr></thead><tbody>{data.recentBookings.map(b=><tr key={b.pnr}><td className="pnr-table">{b.pnr}</td><td>{b.passenger_name}</td><td>{b.from_name} <ArrowRight size={12}/> {b.to_name}</td><td>{money(b.total_amount)}</td><td><Pill className={`booking-status status-${b.status}`}>{b.status}</Pill></td><td>{dateLabel(b.booked_at,{day:'2-digit',month:'short'})}</td></tr>)}</tbody></table></div>:<div className="empty-table">New demo bookings will appear here after the first passenger completes checkout.</div>}</section></>}</div></div>;
}
function AdminKpi({icon,label,value,sub,tone}) {return <div className={`admin-kpi kpi-${tone}`}><div className="kpi-top"><span>{icon}</span><span className="kpi-trend"><TrendingUp size={13}/></span></div><p>{label}</p><strong>{value??'—'}</strong><small>{sub}</small></div>;}

function AssistantPage({message,setMessage,ask,result,loading,openTrip}) {
  const examples=['Hyderabad to Bengaluru night bus under 1000','Cheapest bus from Hyderabad to Chennai','Morning bus from Bengaluru to Chennai'];
  return <div className="page-wrap assistant-page"><div className="container assistant-container"><div className="assistant-heading-art"><div className="assistant-orbit orbit-1"/><div className="assistant-orbit orbit-2"/><div className="assistant-orbit orbit-3"/><div className="assistant-core"><Sparkles size={33}/></div><span className="mini-star star-1">✳</span><span className="mini-star star-2">✦</span></div><div className="assistant-heading-copy"><Pill className="assistant-pill"><Sparkles size={13}/> INTELLI TRAVEL ASSISTANT</Pill><h1>A better trip starts<br/>with a better question.</h1><p>Tell me your route and preferences. I'll find options from the IntelliBus demo schedules and explain what fits.</p></div><form className="assistant-chat-form" onSubmit={ask}><div className="assistant-input-icon"><Sparkles size={18}/></div><input value={message} onChange={e=>setMessage(e.target.value)} placeholder="E.g. Hyderabad to Bengaluru, night bus under 1000"/><Button type="submit" disabled={loading||!message.trim()}>{loading?'Thinking…':'Find my trip'} <ArrowRight size={16}/></Button></form><div className="assistant-example-row"><span>Try asking</span>{examples.map(x=><button key={x} onClick={()=>{setMessage(x);}}>{x}</button>)}</div>{result&&<div className="assistant-response"><div className="assistant-response-head"><span><Sparkles size={17}/></span><div><strong>Intelli says</strong><small>Based on current demo schedules</small></div></div><p>{result.reply}</p>{result.items?.length>0&&<div className="assistant-option-list">{result.items.map(item=><div className="assistant-option" key={item.schedule_id}><div className="assistant-option-icon"><Bus size={19}/></div><div><strong>{item.operator_name}</strong><span>{item.bus_name} · {item.bus_type}</span><small>{timeLabel(item.departure_at)} · {durationLabel(item.duration_minutes)} · {item.available_seats} seats available</small></div><div className="assistant-option-price"><strong>{money(item.fare)}</strong><button onClick={()=>openTrip(item)}>View seats <ArrowRight size={13}/></button></div></div>)}</div>}<p className="assistant-result-disclaimer"><Info size={13}/> Demo dataset only; not live inventory. Recommendations reflect the conditions detected in your message.</p></div>}<div className="assistant-capabilities"><div><span><Search size={17}/></span><strong>Route-aware</strong><p>Looks up matching source and destination in the database.</p></div><div><span><Banknote size={17}/></span><strong>Budget-conscious</strong><p>Can filter options using a price you mention.</p></div><div><span><Moon size={17}/></span><strong>Preference-aware</strong><p>Understands simple day/night travel preferences.</p></div></div></div></div>;
}

function Footer({navTo}) {return <footer className="site-footer"><div className="container footer-main"><div className="footer-brand-block"><Logo onClick={()=>navTo('home')}/><p>Thoughtfully designed intercity travel, with a little intelligence built in.</p><Pill className="footer-demo-pill"><span/> College project demo</Pill></div><div className="footer-column"><strong>Explore</strong><button onClick={()=>navTo('home')}>Home</button><button onClick={()=>navTo('results')}>Find buses</button><button onClick={()=>navTo('bookings')}>My trips</button></div><div className="footer-column"><strong>For operators</strong><button onClick={()=>navTo('adminLogin')}>Transport dashboard</button><button onClick={()=>navTo('assistant')}>AI travel assistant</button></div><div className="footer-note-card"><span><ShieldCheck size={18}/></span><div><strong>Built for trustworthy booking</strong><p>Seat holds and reservations are checked against the database to protect seat availability during the demo.</p></div></div></div><div className="container footer-bottom"><span>© 2026 IntelliBus · Academic DBMS project</span><span>Made for smarter journeys <Sparkles size={13}/></span><span>Demo inventory · Demo payment</span></div></footer>;}
