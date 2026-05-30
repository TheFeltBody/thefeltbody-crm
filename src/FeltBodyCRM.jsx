import { useState, useEffect, useMemo, useRef } from "react";

const SEED = {
  orgs: [
    { id:'o1', name:'Eggleton House', type:'care_home', address:'Tring, Hertfordshire', phone:'01442 123456', email:'manager@eggleton.com', contactName:'Sarah Mitchell', notes:'Very receptive to Balance & Vitality.' },
    { id:'o2', name:'Nuffield Health Tring', type:'gym', address:'Tring, Hertfordshire', phone:'01442 987654', email:'tring@nuffield.com', contactName:'Lorena Vasquez', notes:'Fee renegotiation in progress. Target £40/hr.' },
    { id:'o3', name:'PPL Music', type:'other', address:'London', phone:'', email:'partnerships@ppluk.com', contactName:'', notes:'' },
  ],
  people: [
    { id:'p1', name:'Margaret Davies', email:'', phone:'07700 111222', roles:['resident'], orgId:'o1', status:'active', source:{channel:'manual',detail:''}, notes:'' },
    { id:'p2', name:'Harold Thompson', email:'', phone:'', roles:['resident'], orgId:'o1', status:'active', source:{channel:'manual',detail:''}, notes:'Needs chair for all floor exercises.' },
    { id:'p7', name:'Ruth Abioye', email:'', phone:'', roles:['resident'], orgId:'o1', status:'active', source:{channel:'manual',detail:''}, notes:'' },
    { id:'p3', name:'Anne Fischer', email:'anne.fischer@email.com', phone:'07700 333444', roles:['private_client'], orgId:null, status:'active', source:{channel:'thefeltbody.com',detail:'Contact form'}, notes:'' },
    { id:'p6', name:'David Park', email:'david@email.com', phone:'', roles:['private_client'], orgId:null, status:'active', source:{channel:'manual',detail:'Met at community class'}, notes:'' },
    { id:'p4', name:'Tom Bridges', email:'tom@email.com', phone:'07700 555666', roles:['website_student'], orgId:null, status:'active', source:{channel:'thefeltbody.com',detail:'Class booking'}, notes:'' },
    { id:'p5', name:'Clara Nguyen', email:'clara@email.com', phone:'07700 777888', roles:['website_student','tt_prospect'], orgId:null, status:'active', source:{channel:'jessesaunders.net',detail:'Class booking'}, notes:'Came to Oct workshop. Very keen on TT.' },
  ],
  series: [
    { id:'s1', name:'Balance & Vitality', recurrence:'weekly', location:'Eggleton House', orgId:'o1', startDate:'2026-04-07', rate:40, rateType:'per_class' },
    { id:'s2', name:'Felt Body Flow', recurrence:'weekly', location:'Nuffield Tring', orgId:'o2', startDate:'2026-04-08', rate:40, rateType:'per_class' },
  ],
  classes: [
    { id:'c1', name:'Balance & Vitality', date:'2026-04-28', location:'Eggleton House', orgId:'o1', seriesId:'s1', rate:40, paymentModel:'org' },
    { id:'c2', name:'Balance & Vitality', date:'2026-05-05', location:'Eggleton House', orgId:'o1', seriesId:'s1', rate:40, paymentModel:'org' },
    { id:'c2b', name:'Balance & Vitality', date:'2026-05-12', location:'Eggleton House', orgId:'o1', seriesId:'s1', rate:40, paymentModel:'org' },
    { id:'c3', name:'Felt Body Flow', date:'2026-05-03', location:'Nuffield Tring', orgId:'o2', seriesId:'s2', rate:40, paymentModel:'org' },
    { id:'c3b', name:'Felt Body Flow', date:'2026-05-10', location:'Nuffield Tring', orgId:'o2', seriesId:'s2', rate:40, paymentModel:'org' },
    { id:'c4', name:'Private Session', date:'2026-05-01', location:'Home visit', orgId:null, seriesId:null, rate:0, paymentModel:'private' },
  ],
  attendance: [
    { id:'a1', classId:'c1', personId:'p1', attended:true },
    { id:'a2', classId:'c1', personId:'p2', attended:true },
    { id:'a3', classId:'c1', personId:'p7', attended:false },
    { id:'a4', classId:'c2', personId:'p1', attended:true },
    { id:'a5', classId:'c2', personId:'p2', attended:false },
    { id:'a6', classId:'c2', personId:'p7', attended:true },
    { id:'a7', classId:'c4', personId:'p3', attended:true, paymentStatus:'package', packageId:'pk1' },
  ],
  forms: [
    { id:'fm3', name:'The Conscious Warrior' },
    { id:'fm4', name:'Rotating the Scaffold Poles' },
    { id:'fm5', name:'Fierce Dove' },
    { id:'fm6', name:'Suasti' },
  ],
  notes: [
    { id:'n1', personId:'p1', classId:'c1', text:'Moving well. Really engaged with breath work.', important:false, date:'2026-04-28' },
    { id:'n2', personId:'p1', classId:'c1', text:'Has pain in right hip — avoid deep external rotation.', important:true, date:'2026-04-28' },
    { id:'n3', personId:'p2', classId:'c1', text:'Needed extra support for balance work. Good humour throughout.', important:false, date:'2026-04-28' },
    { id:'n4', personId:'p3', classId:null, text:'Chronic lower back tension — working with pelvic floor.', important:true, date:'2026-04-20' },
    { id:'n5', personId:'p3', classId:null, text:'First session very positive. Wants fortnightly.', important:false, date:'2026-04-06' },
    { id:'n6', personId:'p3', classId:'c4', text:'Deep spinal work today. Significant release in thoracic area.', important:false, date:'2026-05-01' },
    { id:'n7', personId:'p5', classId:null, text:'Reach out re TT programme timeline in July.', important:true, date:'2026-04-15' },
  ],
  packages: [
    { id:'pk1', personId:'p3', type:'private_block', name:'Private Block x6', totalSessions:6, sessionsUsed:1, amountPaid:360, paidVia:'bank_transfer', datePurchased:'2026-03-20', notes:'' },
    { id:'pk2', personId:'p4', type:'class_package', name:'10-Class Package', totalSessions:10, sessionsUsed:3, amountPaid:120, paidVia:'stripe_tfb', datePurchased:'2026-04-01', notes:'' },
  ],
  invoices: [
    { id:'inv1', orgId:'o1', invoiceNumber:'TFB-001', issueDate:'2026-04-30', dueDate:'2026-05-14', status:'sent', lineItems:[{id:'li1',description:'Balance & Vitality — April (x4 sessions)',classIds:['c1'],qty:4,rate:40,total:160}], notes:'April sessions.', total:160 },
  ],
};

const C = {
  bg:'#0c1c13', sbg:'#091409', surf:'#122018', card:'#192c1f',
  border:'#243b2b', gold:'#c9a84c', goldBg:'#1b2813',
  text:'#f0ece4', muted:'#698a78', active:'#1c3224',
  green:'#4db879', red:'#c97070', blue:'#6ba3d4', purple:'#a07fd4',
};
const ORG_META = {
  care_home:{ label:'Care Home', color:'#4db879', bg:'#132413' },
  gym:{ label:'Gym', color:'#6ba3d4', bg:'#131d2a' },
  other:{ label:'Organisation', color:'#c9a84c', bg:'#1b2213' },
};
const PERSON_ROLES = {
  resident:{ label:'Resident', color:'#4db879', bg:'#132413' },
  private_client:{ label:'Private Client', color:'#a07fd4', bg:'#1a1428' },
  website_student:{ label:'Student', color:'#6ba3d4', bg:'#131d2a' },
  tt_prospect:{ label:'TT Prospect', color:'#c9a84c', bg:'#1b2213' },
  retreat_interest:{ label:'Retreat Interest', color:'#c97070', bg:'#2a1313' },
  workshop_interest:{ label:'Workshop Interest', color:'#6ab86a', bg:'#132413' },
};
const SOURCES = {
  'thefeltbody.com':{ label:'thefeltbody.com', icon:'⬡' },
  'jessesaunders.net':{ label:'jessesaunders.net', icon:'⬡' },
  'manual':{ label:'Manual entry', icon:'✎' },
  'referral':{ label:'Referral', icon:'◎' },
  'workshop':{ label:'Workshop signup', icon:'▦' },
  'class_signup':{ label:'Class signup', icon:'▦' },
  'social_media':{ label:'Social media', icon:'◉' },
  'other':{ label:'Other', icon:'◇' },
};
const PKG_TYPES = {
  drop_in:{ label:'Drop-in', color:'#6ba3d4' },
  class_package:{ label:'Class Package', color:'#4db879' },
  private_block:{ label:'Private Block', color:'#a07fd4' },
  retreat:{ label:'Retreat', color:'#c97070' },
  workshop:{ label:'Workshop', color:'#c9a84c' },
  other:{ label:'Other', color:'#698a78' },
};
// Which class payment models each package type can be used against
const PKG_COMPATIBILITY = {
  drop_in:       ['per_person', 'private'],  // single-use, flexible
  class_package: ['per_person'],              // group classes only
  private_block: ['private'],                 // private 1-1 only
  retreat:       ['per_person'],
  workshop:      ['per_person'],
  other:         ['per_person', 'private'],   // flexible
};
const PAY_VIA = {
  stripe_tfb:'Stripe (TFB)', stripe_js:'Stripe (JS.net)', cash:'Cash',
  bank_transfer:'Bank Transfer', paypal:'PayPal', other:'Other',
};
const RECURRENCE = {
  one_off:'One-off', weekly:'Weekly', biweekly:'Every 2 weeks', monthly:'Monthly',
};
const PAYMENT_MODELS = {
  org:        { label:'Organisation pays' },
  per_person: { label:'Each attendee pays' },
  private:    { label:'Private (one person)' },
};
const KIND_META = {
  care_class:      { label:'CareClass',       color:'#4db879', bg:'#132413' },
  gym_class:       { label:'GymClass',        color:'#6ba3d4', bg:'#131d2a' },
  org_class:       { label:'Class (org)',     color:'#c9a84c', bg:'#1b2213' },
  class:           { label:'Class',           color:'#c9a84c', bg:'#1b2213' },
  private_session: { label:'Private Session', color:'#a07fd4', bg:'#1a1428' },
};
const PAYMENT_STATUS = {
  unpaid:  { label:'Unpaid',  color:'#c97070', bg:'#2a1313', icon:'!' },
  paid:    { label:'Paid',    color:'#4db879', bg:'#132413', icon:'£' },
  package: { label:'Package', color:'#a07fd4', bg:'#1a1428', icon:'◫' },
};
const INV_STATUS = {
  draft:{ label:'Draft', color:'#698a78', bg:'#1a2a20' },
  sent:{ label:'Sent', color:'#6ba3d4', bg:'#131d2a' },
  paid:{ label:'Paid', color:'#4db879', bg:'#132413' },
};

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
const fmt = d => d ? new Date(d+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
const fmtMoney = n => typeof n==='number' ? `£${n.toFixed(2).replace(/\.00$/,'')}` : '—';
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const today = () => new Date().toISOString().slice(0,10);
const primaryRole = p => (p.roles && p.roles[0]) || 'other';
const migrate = p => ({ ...p, roles: p.roles || [p.type || 'other'], source: p.source || { channel:'manual', detail:'' } });
const migrateClass = c => {
  if(c.paymentModel) return c;
  let paymentModel;
  if(c.orgId) paymentModel = 'org';
  else if((c.name||'').toLowerCase().includes('private')) paymentModel = 'private';
  else paymentModel = 'per_person';
  return { ...c, paymentModel };
};
const classKindKey = (cls, org) => {
  if(cls.paymentModel === 'private') return 'private_session';
  if(cls.paymentModel === 'org') {
    if(org?.type === 'care_home') return 'care_class';
    if(org?.type === 'gym') return 'gym_class';
    return 'org_class';
  }
  return 'class';
};
const packageUsageCount = (pk, attendance) => {
  // Once committed to a package, the credit is consumed — attendance no-show does not refund.
  // User can still set payment back to 'unpaid' to free the credit if they choose to refund.
  const linked = attendance.filter(a => a.packageId === pk.id).length;
  return (pk.sessionsUsed || 0) + linked;
};
const packageRemaining = (pk, attendance) => {
  if(pk.type === 'drop_in') return Infinity;
  return Math.max(0, (pk.totalSessions||0) - packageUsageCount(pk, attendance));
};
const packagePerSessionValue = (pk) => {
  if(!pk || !pk.totalSessions || pk.totalSessions <= 0) return 0;
  return (pk.amountPaid || 0) / pk.totalSessions;
};
// Revenue a single class has generated — sum of drop-in payments + pro-rated package value.
// Org classes return their flat rate. No-shows still count if they were paid.
const classRevenue = (cls, attendance, packages) => {
  if(cls.paymentModel === 'org') return cls.rate || 0;
  const classAtt = attendance.filter(a => a.classId === cls.id);
  let total = 0;
  classAtt.forEach(a => {
    if(a.paymentStatus === 'paid') {
      total += a.paidAmount || 0;
    } else if(a.paymentStatus === 'package' && a.packageId) {
      const pk = packages.find(p => p.id === a.packageId);
      if(pk) total += packagePerSessionValue(pk);
    }
  });
  return total;
};
const addDays = (dateStr, n) => { const d = new Date(dateStr+'T12:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const getOrgInitials = (name) => !name ? '' : name.split(/\s+/).map(w=>w[0]).filter(Boolean).join('').toUpperCase();
const nextInvoiceNumber = (invoices, orgId, orgs) => {
  const org = orgs.find(o=>o.id===orgId); if(!org) return '';
  const prefix = `TFB-${getOrgInitials(org.name)}-`;
  const nums = invoices
    .filter(i=>i.orgId===orgId && (i.invoiceNumber||'').startsWith(prefix))
    .map(i=>parseInt(i.invoiceNumber.slice(prefix.length).replace(/\D/g,'')))
    .filter(n=>!isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}${String(max+1).padStart(4,'0')}`;
};

// Smart sort: score people by recency + frequency, with optional series context
const smartSortPeople = (people, attendance, classes, contextSeriesId) => {
  const scoreOf = (p) => {
    const atts = attendance.filter(a => a.personId === p.id && a.attended);
    const count = atts.length;
    const lastCls = atts.map(a => classes.find(c=>c.id===a.classId)).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date))[0];
    const daysSince = lastCls ? (Date.now() - new Date(lastCls.date+'T12:00')) / 86400000 : 999;
    const seriesBonus = contextSeriesId ? atts.filter(a => { const cl = classes.find(c=>c.id===a.classId); return cl && cl.seriesId === contextSeriesId; }).length * 10 : 0;
    return count * 3 + seriesBonus - daysSince * 0.03;
  };
  return [...people].sort((a,b) => scoreOf(b) - scoreOf(a));
};

// Generate recurring class instances from a series definition
const generateSeriesClasses = (series, count=12) => {
  const step = { weekly:7, biweekly:14, monthly:30 }[series.recurrence] || 7;
  return Array.from({length:count}, (_,i) => ({
    id: uid(),
    name: series.name,
    date: addDays(series.startDate, i * step),
    location: series.location,
    orgId: series.orgId,
    seriesId: series.id,
    rate: series.rate || 0,
    paymentModel: series.paymentModel || 'per_person',
  }));
};

// ─── MICRO COMPONENTS ─────────────────────────────────────────────────────────
const RoleBadge = ({ role }) => {
  const m = PERSON_ROLES[role] || { label:role, color:C.muted, bg:C.surf };
  return <span style={{background:m.bg,color:m.color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{m.label}</span>;
};
const OrgBadge = ({ type }) => {
  const m = ORG_META[type] || { label:type, color:C.muted, bg:C.surf };
  return <span style={{background:m.bg,color:m.color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{m.label}</span>;
};
const KindBadge = ({ kindKey, small }) => {
  const m = KIND_META[kindKey] || KIND_META.class;
  return <span style={{background:m.bg,color:m.color,fontSize:small?9:10,fontWeight:600,padding:small?'2px 7px':'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{m.label}</span>;
};
const PaymentBadge = ({ status, small, compact }) => {
  if(!status) return null;
  const m = PAYMENT_STATUS[status]; if(!m) return null;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,background:m.bg,color:m.color,border:`1px solid ${m.color}55`,fontSize:small?10:11,fontWeight:600,padding:small?'2px 7px':'2px 9px',borderRadius:20,letterSpacing:'0.4px',whiteSpace:'nowrap'}}>
      <span style={{fontWeight:700}}>{m.icon}</span>{!compact && m.label}
    </span>
  );
};
const Avatar = ({ name, size=36, role }) => {
  const color = PERSON_ROLES[role]?.color || C.green;
  const bgs = { '#4db879':'#132413','#a07fd4':'#1a1428','#6ba3d4':'#131d2a','#c9a84c':'#1b2213','#698a78':'#1a2a20','#c97070':'#2a1313','#6ab86a':'#132413' };
  return <div style={{width:size,height:size,borderRadius:'50%',background:bgs[color]||'#132413',border:`1.5px solid ${color}`,display:'flex',alignItems:'center',justifyContent:'center',color,fontSize:size*0.36,fontWeight:600,flexShrink:0}}>{initials(name)}</div>;
};
const NoteCard = ({ note, onToggleImportant, onClearAction, onClick, highlight, dimReason }) => {
  const overdue = note.actionDate && note.actionDate < today();
  const dueToday = note.actionDate === today();
  return (
    <div data-note-id={note.id}
      onClick={onClick}
      style={{
        background: note.important?C.goldBg:C.card,
        borderLeft: `3px solid ${note.important?C.gold:C.border}`,
        borderRadius:'0 6px 6px 0',
        padding:'10px 14px',
        marginBottom:8,
        cursor: onClick?'pointer':'default',
        boxShadow: highlight?`0 0 0 2px ${C.gold}`:'none',
        transition: 'box-shadow 0.4s ease',
      }}>
      {note.important && <div style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'1px',marginBottom:5}}>⚑ IMPORTANT</div>}
      <div style={{color:C.text,fontSize:14,lineHeight:1.7}}>{note.text}</div>
      {note.actionDate && (
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:9,flexWrap:'wrap'}}>
          <span style={{
            background: overdue?'#2a1313':dueToday?'#2a2113':'#131d2a',
            color: overdue?C.red:dueToday?C.gold:C.blue,
            border: `1px solid ${(overdue?C.red:dueToday?C.gold:C.blue)}55`,
            fontSize:11,fontWeight:500,padding:'2px 9px',borderRadius:20,letterSpacing:'0.3px',
            display:'inline-flex',alignItems:'center',gap:5}}>
            🗓 {overdue?'Overdue':dueToday?'Action today':'Action by'} · {fmt(note.actionDate)}
          </span>
          {onClearAction && (
            <button onClick={e=>{e.stopPropagation();onClearAction(note.id);}}
              style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif"}}>
              ✓ Done
            </button>
          )}
        </div>
      )}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6}}>
        <div style={{color:C.muted,fontSize:12}}>{fmt(note.date)}</div>
        {onToggleImportant && (
          <button onClick={e=>{e.stopPropagation();onToggleImportant(note.id);}}
            title={note.important?'Unflag (no longer pressing)':'Flag as important'}
            style={{background:'none',border:`1px solid ${note.important?C.gold+'88':C.border}`,color:note.important?C.gold:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.4px'}}>
            {note.important?'⚑ Unflag':'⚐ Flag'}
          </button>
        )}
      </div>
    </div>
  );
};
const SourceTag = ({ source }) => {
  if(!source?.channel) return null;
  const s = SOURCES[source.channel] || { label:source.channel, icon:'◇' };
  return <div style={{display:'flex',alignItems:'center',gap:4}}><span style={{color:C.muted,fontSize:11}}>{s.icon}</span><span style={{color:C.muted,fontSize:12}}>{s.label}{source.detail ? ` — ${source.detail}` : ''}</span></div>;
};
const SecHead = ({ children }) => <div style={{color:C.muted,fontSize:9.5,fontWeight:600,letterSpacing:'1.8px',textTransform:'uppercase',padding:'18px 20px 7px',opacity:0.7}}>{children}</div>;
const Btn = ({ onClick, children, variant='primary', small, disabled }) => {
  const v = { primary:{background:C.gold,color:'#0a1408',border:'none'}, secondary:{background:C.card,color:C.text,border:`1px solid ${C.border}`}, ghost:{background:'none',color:C.muted,border:`1px solid ${C.border}`}, danger:{background:'#2a1313',color:C.red,border:`1px solid ${C.red}44`} };
  return <button onClick={onClick} disabled={disabled} style={{...v[variant],cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.5:1,borderRadius:6,fontFamily:"'Jost',sans-serif",fontSize:small?12:14,fontWeight:500,padding:small?'5px 12px':'8px 18px'}}>{children}</button>;
};
const Stat = ({ label, value, sub }) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'16px 20px'}}>
    <div style={{color:C.muted,fontSize:11,letterSpacing:'0.5px',marginBottom:6}}>{label}</div>
    <div style={{color:C.text,fontSize:30,fontWeight:600,fontFamily:"'Cormorant Garamond',serif",lineHeight:1}}>{value}</div>
    {sub && <div style={{color:C.muted,fontSize:12,marginTop:5}}>{sub}</div>}
  </div>
);
const Row = ({ onClick, children }) => (
  <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 20px',borderBottom:`1px solid ${C.border}`,cursor:onClick?'pointer':'default'}}
    onMouseEnter={e=>{if(onClick)e.currentTarget.style.background=C.active}}
    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
    {children}
  </div>
);
const Empty = ({ text, action, onAction }) => (
  <div style={{textAlign:'center',padding:'48px 20px',color:C.muted,fontSize:14}}>
    {text}{action && <><span> </span><span style={{color:C.gold,cursor:'pointer'}} onClick={onAction}>{action}</span></>}
  </div>
);
const PageHead = ({ back, onBack, children, action }) => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28}}>
    <div style={{display:'flex',alignItems:'center',gap:12}}>
      {back && <button onClick={onBack} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',padding:'5px 11px',borderRadius:6,fontSize:13}}>← {back}</button>}
      <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,color:C.text,letterSpacing:'-0.5px',margin:0}}>{children}</h1>
    </div>
    <div style={{display:'flex',gap:8}}>{action}</div>
  </div>
);
const Tabs = ({ tabs, active, onChange }) => (
  <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:20}}>
    {tabs.map(t=>(
      <button key={t.id} onClick={()=>onChange(t.id)} style={{background:'none',border:'none',borderBottom:`2px solid ${active===t.id?C.gold:'transparent'}`,color:active===t.id?C.text:C.muted,cursor:'pointer',padding:'8px 18px',fontSize:14,fontWeight:active===t.id?500:400,fontFamily:"'Jost',sans-serif",marginBottom:-1}}>
        {t.label}
      </button>
    ))}
  </div>
);

// ─── SEARCHABLE SELECT ────────────────────────────────────────────────────────
function SearchSelect({ people, onSelect, attendance, classes, contextSeriesId, existing=[] }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const sorted = useMemo(() => smartSortPeople(people.filter(p=>!existing.includes(p.id)), attendance, classes, contextSeriesId), [people, attendance, classes, contextSeriesId, existing]);
  const filtered = useMemo(() => {
    if (!q.trim()) return sorted;
    const lq = q.toLowerCase();
    return sorted.filter(p => p.name.toLowerCase().includes(lq) || (p.email||'').toLowerCase().includes(lq));
  }, [sorted, q]);
  useEffect(() => { setTimeout(()=>inputRef.current?.focus(), 50); }, []);
  return (
    <div>
      <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name or email..." style={{width:'100%',background:C.card,border:`1px solid ${C.gold}55`,borderRadius:6,color:C.text,fontSize:14,padding:'9px 12px',fontFamily:"'Jost',sans-serif",marginBottom:8}} />
      {q===''&&<div style={{color:C.muted,fontSize:11,marginBottom:8,letterSpacing:'0.3px'}}>Showing most recently active first</div>}
      <div style={{maxHeight:280,overflowY:'auto',border:`1px solid ${C.border}`,borderRadius:6,background:C.card}}>
        {filtered.length ? filtered.map(p=>(
          <div key={p.id} onClick={()=>onSelect(p)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'background 0.1s'}}
            onMouseEnter={e=>e.currentTarget.style.background=C.active}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <Avatar name={p.name} size={30} role={primaryRole(p)} />
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:C.text,fontSize:14}}>{p.name}</div>
              <div style={{color:C.muted,fontSize:11,marginTop:1}}>{p.email||p.phone||''}</div>
            </div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
              {p.roles.slice(0,2).map(r=><RoleBadge key={r} role={r} />)}
            </div>
          </div>
        )) : <div style={{padding:'24px',textAlign:'center',color:C.muted,fontSize:14}}>No results for "{q}"</div>}
      </div>
    </div>
  );
}

// ─── MODAL SHELL ──────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => (
  <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
    <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:12,padding:28,width:wide?580:480,maxHeight:'90vh',overflowY:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
        <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,margin:0}}>{title}</h2>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:22,lineHeight:1}}>×</button>
      </div>
      {children}
    </div>
  </div>
);
const FI = ({ label, value, onChange, type='text', opts, rows, half }) => (
  <div style={{marginBottom:14,flex:half?'1 1 0':undefined,minWidth:half?0:undefined}}>
    <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>{label}</label>
    {opts ? (
      <select value={value} onChange={e=>onChange(e.target.value)} style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
        {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    ) : rows ? (
      <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif",resize:'vertical'}} />
    ) : (
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
    )}
  </div>
);

// ─── FORMS ────────────────────────────────────────────────────────────────────
function AddOrgForm({ existing, onSave, onClose, defaultType }) {
  const [f, setF] = useState(existing || {name:'',type:defaultType||'care_home',address:'',phone:'',email:'',contactName:'',notes:''});
  const s = k => v => setF(x=>({...x,[k]:v}));
  return (
    <Modal title={existing?`Edit: ${existing.name}`:"Add Organisation"} onClose={onClose}>
      <FI label="NAME" value={f.name} onChange={s('name')} />
      <FI label="TYPE" value={f.type} onChange={s('type')} opts={Object.entries(ORG_META).map(([v,m])=>({v,l:m.label}))} />
      <FI label="ADDRESS" value={f.address} onChange={s('address')} />
      <div style={{display:'flex',gap:12}}><FI label="PHONE" value={f.phone} onChange={s('phone')} half /><FI label="EMAIL" value={f.email} onChange={s('email')} half /></div>
      <FI label="CONTACT NAME" value={f.contactName} onChange={s('contactName')} />
      <FI label="NOTES" value={f.notes} onChange={s('notes')} rows={3} />
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(f.name.trim()){onSave(f);onClose();}}}>{existing?'Save Changes':'Add Organisation'}</Btn>
      </div>
    </Modal>
  );
}

function AddPersonForm({ existing, onSave, onClose, orgs, defaultType, defaultOrgId }) {
  const initRoles = existing?.roles || (defaultType?[defaultType]:['private_client']);
  const [f, setF] = useState(existing||{name:'',email:'',phone:'',orgId:defaultOrgId||'',status:'active',source:{channel:'manual',detail:''},notes:''});
  const [roles, setRoles] = useState(initRoles);
  const s = k => v => setF(x=>({...x,[k]:v}));
  const ss = k => v => setF(x=>({...x,source:{...x.source,[k]:v}}));
  const toggleRole = r => setRoles(prev=>prev.includes(r)?prev.filter(x=>x!==r):[...prev,r]);
  return (
    <Modal title={existing?`Edit: ${existing.name}`:"Add Person"} onClose={onClose} wide>
      <FI label="NAME" value={f.name} onChange={s('name')} />
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>ROLES (select all that apply)</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {Object.entries(PERSON_ROLES).map(([r,m])=>(
            <button key={r} onClick={()=>toggleRole(r)} style={{background:roles.includes(r)?m.bg:C.surf,border:`1px solid ${roles.includes(r)?m.color:C.border}`,color:roles.includes(r)?m.color:C.muted,cursor:'pointer',borderRadius:20,fontSize:11,fontWeight:600,padding:'4px 12px',textTransform:'uppercase',fontFamily:"'Jost',sans-serif"}}>{m.label}</button>
          ))}
        </div>
        {roles.length===0&&<div style={{color:C.red,fontSize:11,marginTop:6}}>Select at least one role</div>}
      </div>
      {roles.includes('resident')&&<FI label="ORGANISATION" value={f.orgId} onChange={s('orgId')} opts={[{v:'',l:'— none —'},...orgs.map(o=>({v:o.id,l:o.name}))]} />}
      <div style={{display:'flex',gap:12}}><FI label="EMAIL" value={f.email} onChange={s('email')} half /><FI label="PHONE" value={f.phone} onChange={s('phone')} half /></div>
      <FI label="STATUS" value={f.status} onChange={s('status')} opts={[{v:'active',l:'Active'},{v:'interested',l:'Interested'},{v:'inactive',l:'Inactive'}]} />
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>SOURCE</div>
        <div style={{display:'flex',gap:10}}>
          <div style={{flex:1}}><select value={f.source.channel} onChange={e=>ss('channel')(e.target.value)} style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>{Object.entries(SOURCES).map(([v,s])=><option key={v} value={v}>{s.label}</option>)}</select></div>
          <div style={{flex:1}}><input placeholder="Detail e.g. 'Contact form'" value={f.source.detail} onChange={e=>ss('detail')(e.target.value)} style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} /></div>
        </div>
      </div>
      <FI label="NOTES" value={f.notes} onChange={s('notes')} rows={2} />
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(f.name.trim()&&roles.length>0){onSave({...f,roles,orgId:roles.includes('resident')?f.orgId:null});onClose();}}}>{existing?'Save Changes':'Add Person'}</Btn>
      </div>
    </Modal>
  );
}

function AddClassForm({ existing, onSave, onClose, orgs, defaultOrgId, bookingFor, defaultPaymentModel }) {
  const [f, setF] = useState(existing
    ? { ...existing, recurrence: existing.seriesId ? 'linked' : 'one_off' }
    : {
        name: bookingFor && defaultPaymentModel==='private' ? `Private Session — ${bookingFor.name}` : '',
        date: today(),
        location: '',
        orgId: defaultOrgId || '',
        recurrence: 'one_off',
        rate: '',
        repeatCount: 12,
        paymentModel: defaultPaymentModel || ''
      });
  const s = k => v => setF(x=>({...x,[k]:v}));
  const isNew = !existing;
  // Smart default for paymentModel based on selected org
  const effectiveModel = f.paymentModel || (f.orgId ? 'org' : ((f.name||'').toLowerCase().includes('private') ? 'private' : 'per_person'));
  return (
    <Modal title={existing?'Edit Class':(bookingFor?`New session for ${bookingFor.name}`:'Add Class / Session')} onClose={onClose} wide>
      {bookingFor && (
        <div style={{background:C.goldBg,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'10px 14px',marginBottom:18,color:C.gold,fontSize:13}}>
          {bookingFor.name} will be added to the register automatically.
        </div>
      )}
      <FI label="CLASS NAME" value={f.name} onChange={s('name')} />
      <div style={{display:'flex',gap:12}}><FI label="DATE" value={f.date} onChange={s('date')} type="date" half /><FI label="LOCATION" value={f.location} onChange={s('location')} half /></div>
      <div style={{display:'flex',gap:12}}><FI label="ORGANISATION (optional)" value={f.orgId} onChange={s('orgId')} opts={[{v:'',l:'— none —'},...orgs.map(o=>({v:o.id,l:o.name}))]} half /><FI label="RATE PER SESSION (£)" value={f.rate} onChange={s('rate')} type="number" half /></div>
      <FI label="PAYMENT MODEL" value={effectiveModel} onChange={s('paymentModel')} opts={Object.entries(PAYMENT_MODELS).map(([v,m])=>({v,l:m.label}))} />
      {isNew && !bookingFor && (
        <FI label="RECURRENCE" value={f.recurrence} onChange={s('recurrence')} opts={Object.entries(RECURRENCE).map(([v,l])=>({v,l}))} />
      )}
      {isNew && !bookingFor && f.recurrence!=='one_off' && (
        <FI label="HOW MANY SESSIONS TO GENERATE" value={f.repeatCount} onChange={v=>s('repeatCount')(parseInt(v)||12)} type="number" />
      )}
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(f.name.trim()){onSave({...f,paymentModel:effectiveModel,recurrence:bookingFor?'one_off':f.recurrence});onClose();}}}>{existing?'Save':(bookingFor?'Create & Book':'Add Class')}</Btn>
      </div>
    </Modal>
  );
}

function EditSeriesClassForm({ cls, onSaveThis, onSaveFuture, onClose, orgs }) {
  const [f, setF] = useState({...cls});
  const s = k => v => setF(x=>({...x,[k]:v}));
  return (
    <Modal title="Edit Recurring Class" onClose={onClose} wide>
      <div style={{background:C.goldBg,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'10px 14px',marginBottom:18,color:C.gold,fontSize:13}}>
        This class is part of a recurring series. Save just this one, or update this and all future classes in the series.
      </div>
      <FI label="CLASS NAME" value={f.name} onChange={s('name')} />
      <div style={{display:'flex',gap:12}}><FI label="DATE" value={f.date} onChange={s('date')} type="date" half /><FI label="LOCATION" value={f.location} onChange={s('location')} half /></div>
      <div style={{display:'flex',gap:12}}><FI label="ORGANISATION (optional)" value={f.orgId||''} onChange={s('orgId')} opts={[{v:'',l:'— none —'},...orgs.map(o=>({v:o.id,l:o.name}))]} half /><FI label="RATE (£)" value={f.rate||''} onChange={s('rate')} type="number" half /></div>
      <FI label="PAYMENT MODEL" value={f.paymentModel||'per_person'} onChange={s('paymentModel')} opts={Object.entries(PAYMENT_MODELS).map(([v,m])=>({v,l:m.label}))} />
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="secondary" onClick={()=>{onSaveFuture(f);onClose();}}>Update this & future</Btn>
        <Btn onClick={()=>{onSaveThis(f);onClose();}}>Update this class only</Btn>
      </div>
    </Modal>
  );
}

function AddToRegisterForm({ onSave, onClose, people, classId, existing, attendance, classes, cls }) {
  const [selected, setSelected] = useState(null);
  const available = people.filter(p=>p.status!=='inactive');
  return (
    <Modal title="Add to Register" onClose={onClose} wide>
      <SearchSelect people={available} onSelect={p=>setSelected(p)} attendance={attendance} classes={classes} contextSeriesId={cls?.seriesId} existing={existing} />
      {selected && (
        <div style={{marginTop:14,background:C.active,border:`1px solid ${C.gold}55`,borderRadius:6,padding:'10px 14px',display:'flex',alignItems:'center',gap:12}}>
          <Avatar name={selected.name} size={28} role={primaryRole(selected)} />
          <span style={{color:C.text,fontSize:14,flex:1}}>{selected.name}</span>
          <Btn small onClick={()=>{onSave(classId,selected.id);onClose();}}>Add to register</Btn>
        </div>
      )}
    </Modal>
  );
}

function AddPackageForm({ onSave, onClose, personId }) {
  const typeDefaults = {class_package:'10-Class Package',private_block:'Private Block x6',drop_in:'Drop-in Class',retreat:'Retreat Booking',workshop:'Workshop Booking',other:''};
  const [f, setF] = useState({type:'class_package',name:'10-Class Package',totalSessions:10,sessionsUsed:0,amountPaid:'',paidVia:'stripe_tfb',datePurchased:today(),notes:''});
  const s = k => v => setF(x=>({...x,[k]:v}));
  return (
    <Modal title="Add Package / Credits" onClose={onClose} wide>
      <FI label="TYPE" value={f.type} onChange={v=>setF(x=>({...x,type:v,name:typeDefaults[v]||''}))} opts={Object.entries(PKG_TYPES).map(([v,m])=>({v,l:m.label}))} />
      <FI label="NAME / DESCRIPTION" value={f.name} onChange={s('name')} />
      {f.type!=='drop_in'&&(<div style={{display:'flex',gap:12}}><FI label="TOTAL SESSIONS" value={f.totalSessions} onChange={v=>s('totalSessions')(parseInt(v)||0)} type="number" half /><FI label="ALREADY USED" value={f.sessionsUsed} onChange={v=>s('sessionsUsed')(parseInt(v)||0)} type="number" half /></div>)}
      <div style={{display:'flex',gap:12}}><FI label="AMOUNT PAID (£)" value={f.amountPaid} onChange={s('amountPaid')} type="number" half /><FI label="PAID VIA" value={f.paidVia} onChange={s('paidVia')} opts={Object.entries(PAY_VIA).map(([v,l])=>({v,l}))} half /></div>
      <FI label="DATE PURCHASED" value={f.datePurchased} onChange={s('datePurchased')} type="date" />
      <FI label="NOTES" value={f.notes} onChange={s('notes')} rows={2} />
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(f.name.trim()){onSave({...f,personId,totalSessions:parseInt(f.totalSessions)||1,sessionsUsed:parseInt(f.sessionsUsed||0),amountPaid:parseFloat(f.amountPaid||0)});onClose();}}}>Add Package</Btn>
      </div>
    </Modal>
  );
}

// Recommend a class kind for booking based on the person's primary role
const recommendedKindForPerson = (person) => {
  const role = (person.roles || [])[0];
  if(role === 'resident') return 'care_class';
  if(role === 'private_client') return 'private_session';
  if(role === 'website_student') return 'class';
  if(role === 'tt_prospect') return 'class';
  if(role === 'workshop_interest') return 'class';
  if(role === 'retreat_interest') return 'class';
  return 'class';
};

function BookForPersonForm({ person, classes, orgs, attendance, onAddToRegister, onCreatePrivate, onClose }) {
  const recKind = recommendedKindForPerson(person);
  const t = today();
  // Upcoming + recent classes (today onwards), excluding ones the person is already on
  const alreadyIn = new Set(attendance.filter(a => a.personId === person.id).map(a => a.classId));
  const upcoming = classes
    .filter(c => c.date >= t && !alreadyIn.has(c.id))
    .sort((a,b) => a.date.localeCompare(b.date));

  // Group by kind for display
  const byKind = (kindKey) => upcoming.filter(c => classKindKey(c, orgs.find(o => o.id === c.orgId)) === kindKey);

  // What does "recommended" mean?
  // - resident → CareClasses at their org first, then any
  // - student/etc → upcoming per_person classes
  // - private client → button to create new private session
  let recommendedSection = null;
  let recommendedTitle = '';

  if(recKind === 'private_session') {
    recommendedTitle = `Recommended for a ${PERSON_ROLES[person.roles[0]]?.label || 'client'}`;
    recommendedSection = (
      <button onClick={onCreatePrivate}
        style={{width:'100%',background:C.gold,border:'none',color:'#0a1408',cursor:'pointer',borderRadius:8,padding:'14px 18px',fontFamily:"'Jost',sans-serif",fontSize:14,fontWeight:600,letterSpacing:'0.3px',display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:18,opacity:0.7}}>+</span>
        Create new Private Session for {person.name}
      </button>
    );
  } else if(recKind === 'care_class' && person.orgId) {
    const orgUpcoming = upcoming.filter(c => c.orgId === person.orgId);
    recommendedTitle = `Upcoming classes at ${orgs.find(o => o.id === person.orgId)?.name || 'their organisation'}`;
    if(orgUpcoming.length) {
      recommendedSection = (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {orgUpcoming.slice(0,5).map(c => (
            <BookableClassRow key={c.id} cls={c} orgs={orgs} primary onClick={()=>onAddToRegister(c.id)} />
          ))}
        </div>
      );
    } else {
      recommendedSection = (
        <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'10px 0'}}>
          No upcoming classes scheduled at this organisation.
        </div>
      );
    }
  } else {
    // class or workshop_interest etc — show upcoming per_person classes
    const candidate = upcoming.filter(c => c.paymentModel === 'per_person');
    recommendedTitle = `Upcoming classes you might book ${person.name.split(' ')[0]} into`;
    if(candidate.length) {
      recommendedSection = (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {candidate.slice(0,5).map(c => (
            <BookableClassRow key={c.id} cls={c} orgs={orgs} primary onClick={()=>onAddToRegister(c.id)} />
          ))}
        </div>
      );
    } else {
      recommendedSection = (
        <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'10px 0'}}>
          No upcoming per-person classes scheduled.
        </div>
      );
    }
  }

  // Other options: everything not in the recommended group
  const otherUpcoming = (() => {
    if(recKind === 'private_session') return upcoming;
    if(recKind === 'care_class' && person.orgId) return upcoming.filter(c => c.orgId !== person.orgId);
    return upcoming.filter(c => c.paymentModel !== 'per_person');
  })();

  return (
    <Modal title={`Book a session for ${person.name}`} onClose={onClose} wide>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:18}}>
        {(person.roles||[]).map(r => <RoleBadge key={r} role={r} />)}
      </div>

      <div style={{marginBottom:22}}>
        <div style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'1px',marginBottom:10}}>⭐ {recommendedTitle.toUpperCase()}</div>
        {recommendedSection}
      </div>

      {(otherUpcoming.length > 0 || recKind !== 'private_session') && (
        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:18,marginBottom:14}}>
          <div style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:'1px',marginBottom:10}}>OR</div>
          {recKind !== 'private_session' && (
            <button onClick={onCreatePrivate}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,color:C.text,cursor:'pointer',borderRadius:8,padding:'10px 14px',fontFamily:"'Jost',sans-serif",fontSize:13,marginBottom:otherUpcoming.length?10:0,display:'flex',alignItems:'center',gap:9,textAlign:'left'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.gold+'66'} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <span style={{color:C.muted,fontSize:14}}>+</span>
              Create new Private Session
            </button>
          )}
          {otherUpcoming.length > 0 && (
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:240,overflowY:'auto'}}>
              {otherUpcoming.slice(0, 12).map(c => (
                <BookableClassRow key={c.id} cls={c} orgs={orgs} onClick={()=>onAddToRegister(c.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function BookableClassRow({ cls, orgs, primary, onClick }) {
  const org = orgs.find(o => o.id === cls.orgId);
  const kindKey = classKindKey(cls, org);
  return (
    <button onClick={onClick}
      style={{
        width:'100%',
        background: primary ? C.goldBg : C.card,
        border: `1px solid ${primary?C.gold+'66':C.border}`,
        color: C.text,
        cursor:'pointer', borderRadius:8, padding:'10px 14px',
        fontFamily:"'Jost',sans-serif", fontSize:13,
        display:'flex', alignItems:'center', gap:10, textAlign:'left'
      }}
      onMouseEnter={e=>e.currentTarget.style.borderColor=C.gold} onMouseLeave={e=>e.currentTarget.style.borderColor=primary?C.gold+'66':C.border}>
      <KindBadge kindKey={kindKey} small />
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:C.text,fontSize:13,fontWeight:500}}>{cls.name}</div>
        <div style={{color:C.muted,fontSize:11,marginTop:1}}>{fmt(cls.date)} · {cls.location}</div>
      </div>
      <span style={{color:C.gold,fontSize:11,letterSpacing:'0.4px',fontWeight:500}}>Add →</span>
    </button>
  );
}

function CreateInvoiceForm({ onSave, onClose, orgs, classes, invoices, existing }) {
  const billableOrgs = orgs.filter(o=>o.type==='care_home'||o.type==='gym');
  const initialOrgId = existing?.orgId || billableOrgs[0]?.id || '';
  const [f, setF] = useState(existing || {
    orgId: initialOrgId,
    invoiceNumber: initialOrgId ? nextInvoiceNumber(invoices, initialOrgId, orgs) : '',
    issueDate: today(),
    dueDate: addDays(today(),14),
    notes:'',
    lineItems:[]
  });
  const s = k => v => setF(x=>({...x,[k]:v}));
  // Classes already on any other invoice — locked from import to prevent double-billing
  const usedClassIds = useMemo(()=>{
    const set = new Set();
    (invoices||[]).forEach(inv=>{
      (inv.lineItems||[]).forEach(li=>{
        (li.classIds||[]).forEach(cid=>set.add(cid));
      });
    });
    return set;
  },[invoices]);
  const orgClasses = useMemo(()=>
    classes
      .filter(c=>c.orgId===f.orgId)
      .filter(c=>!usedClassIds.has(c.id))
      .sort((a,b)=>b.date.localeCompare(a.date))
      .slice(0,30),
  [classes,f.orgId,usedClassIds]);
  const handleOrgChange = (newOrgId) => {
    setF(x=>({
      ...x,
      orgId: newOrgId,
      // Auto-update invoice number on org change for new invoices only
      invoiceNumber: existing ? x.invoiceNumber : nextInvoiceNumber(invoices, newOrgId, orgs)
    }));
    setToImport([]);
  };
  const addLineItem = () => setF(x=>({...x,lineItems:[...x.lineItems,{id:uid(),description:'',qty:1,rate:orgClasses[0]?.rate||40,total:0,classIds:[]}]}));
  const updateLI = (id,k,v) => setF(x=>({...x,lineItems:x.lineItems.map(li=>li.id===id?{...li,[k]:v,total:k==='qty'?(parseFloat(v)||0)*(li.rate||0):k==='rate'?(li.qty||1)*(parseFloat(v)||0):li.total}:li)}));
  const removeLI = id => setF(x=>({...x,lineItems:x.lineItems.filter(li=>li.id!==id)}));
  const total = f.lineItems.reduce((s,li)=>s+(li.qty||1)*(li.rate||0),0);
  // One line item per class, sorted chronologically — date · class name · price
  const importClasses = (clsIds) => {
    const cls = clsIds
      .map(cid=>classes.find(c=>c.id===cid))
      .filter(Boolean)
      .sort((a,b)=>a.date.localeCompare(b.date));
    const newItems = cls.map(c=>({
      id: uid(),
      description: `${fmt(c.date)} — ${c.name}`,
      qty: 1,
      rate: c.rate || 40,
      total: c.rate || 40,
      classIds: [c.id],
    }));
    setF(x=>({...x,lineItems:[...x.lineItems,...newItems]}));
  };
  const [importing, setImporting] = useState(false);
  const [toImport, setToImport] = useState([]);
  return (
    <Modal title={existing?`Edit Invoice ${existing.invoiceNumber}`:"Create Invoice"} onClose={onClose} wide>
      <div style={{display:'flex',gap:12}}>
        <FI label="ORGANISATION" value={f.orgId} onChange={handleOrgChange} opts={billableOrgs.map(o=>({v:o.id,l:o.name}))} half />
        <FI label="INVOICE NUMBER" value={f.invoiceNumber} onChange={s('invoiceNumber')} half />
      </div>
      <div style={{display:'flex',gap:12}}><FI label="ISSUE DATE" value={f.issueDate} onChange={s('issueDate')} type="date" half /><FI label="DUE DATE" value={f.dueDate} onChange={s('dueDate')} type="date" half /></div>
      <div style={{marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px'}}>LINE ITEMS</div>
          <div style={{display:'flex',gap:6}}>
            <Btn variant="ghost" small onClick={()=>setImporting(!importing)}>Import from classes</Btn>
            <Btn variant="ghost" small onClick={addLineItem}>+ Add row</Btn>
          </div>
        </div>
        {importing && (
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:12,marginBottom:10}}>
            <div style={{color:C.muted,fontSize:12,marginBottom:8}}>Select classes to import:</div>
            <div style={{maxHeight:160,overflowY:'auto'}}>
              {orgClasses.length === 0 ? (
                <div style={{color:C.muted,fontSize:12,fontStyle:'italic',padding:'8px 0'}}>No available classes — all recent classes for this organisation are already on another invoice.</div>
              ) : orgClasses.map(c=>(
                <label key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',cursor:'pointer',color:C.text,fontSize:13}}>
                  <input type="checkbox" checked={toImport.includes(c.id)} onChange={e=>setToImport(p=>e.target.checked?[...p,c.id]:p.filter(x=>x!==c.id))} style={{accentColor:C.gold}} />
                  {c.name} — {fmt(c.date)} {c.rate?`(£${c.rate})`:''}
                </label>
              ))}
            </div>
            <div style={{marginTop:8,display:'flex',justifyContent:'flex-end',gap:8}}>
              <Btn variant="ghost" small onClick={()=>setImporting(false)}>Cancel</Btn>
              <Btn small onClick={()=>{importClasses(toImport);setImporting(false);setToImport([]);}}>Import selected</Btn>
            </div>
          </div>
        )}
        {f.lineItems.length>0 ? (
          <div style={{border:`1px solid ${C.border}`,borderRadius:6,overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 60px 70px 70px 32px',gap:0,background:C.surf,padding:'6px 10px',borderBottom:`1px solid ${C.border}`}}>
              {['Description','Qty','Rate','Total',''].map((h,i)=><div key={i} style={{color:C.muted,fontSize:10,letterSpacing:'0.5px'}}>{h}</div>)}
            </div>
            {f.lineItems.map(li=>(
              <div key={li.id} style={{display:'grid',gridTemplateColumns:'1fr 60px 70px 70px 32px',gap:0,padding:'6px 10px',borderBottom:`1px solid ${C.border}`,alignItems:'center'}}>
                <input value={li.description} onChange={e=>updateLI(li.id,'description',e.target.value)} style={{background:'none',border:'none',color:C.text,fontSize:13,fontFamily:"'Jost',sans-serif",width:'100%'}} />
                <input type="number" value={li.qty} onChange={e=>updateLI(li.id,'qty',parseFloat(e.target.value)||0)} style={{background:'none',border:'none',color:C.text,fontSize:13,fontFamily:"'Jost',sans-serif",width:'100%'}} />
                <input type="number" value={li.rate} onChange={e=>updateLI(li.id,'rate',parseFloat(e.target.value)||0)} style={{background:'none',border:'none',color:C.text,fontSize:13,fontFamily:"'Jost',sans-serif",width:'100%'}} />
                <div style={{color:C.gold,fontSize:13}}>£{((li.qty||1)*(li.rate||0)).toFixed(0)}</div>
                <button onClick={()=>removeLI(li.id)} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16,lineHeight:1}}>×</button>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'flex-end',padding:'8px 10px',background:C.card}}>
              <div style={{color:C.gold,fontSize:15,fontWeight:600}}>Total: £{total.toFixed(2)}</div>
            </div>
          </div>
        ) : <div style={{color:C.muted,fontSize:13,padding:'12px 0'}}>No line items yet.</div>}
      </div>
      <FI label="NOTES" value={f.notes} onChange={s('notes')} rows={2} />
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(f.orgId){onSave({...f,total,status:existing?.status||'draft'});onClose();}}}>Save Invoice</Btn>
      </div>
    </Modal>
  );
}

function NoteForm({ personId, classId, onSave, onCancel }) {
  const [text, setText] = useState('');
  const [imp, setImp] = useState(false);
  const [actionDate, setActionDate] = useState('');
  const save = () => {
    if(!text.trim()) return;
    const note = { personId, classId, text:text.trim(), important:imp, date:today() };
    if(actionDate) note.actionDate = actionDate;
    onSave(note);
    setText(''); setImp(false); setActionDate('');
  };
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:16,marginBottom:12}}>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={3} placeholder="Add a note..." style={{width:'100%',background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:14,padding:'10px 12px',fontFamily:"'Jost',sans-serif",resize:'vertical',outline:'none',lineHeight:1.6}} />
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:10,gap:14,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:18,flexWrap:'wrap'}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',color:imp?C.gold:C.muted,fontSize:13}}>
            <input type="checkbox" checked={imp} onChange={e=>setImp(e.target.checked)} style={{accentColor:C.gold}} /> Mark as important
          </label>
          <label style={{display:'flex',alignItems:'center',gap:8,color:actionDate?C.blue:C.muted,fontSize:13}}>
            Action by
            <input type="date" value={actionDate} onChange={e=>setActionDate(e.target.value)}
              style={{background:C.surf,border:`1px solid ${actionDate?C.blue+'66':C.border}`,borderRadius:4,color:C.text,fontSize:12,padding:'4px 8px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
            {actionDate && <button onClick={()=>setActionDate('')} title="Clear action date" style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:14,lineHeight:1,padding:0}}>×</button>}
          </label>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn variant="ghost" small onClick={onCancel}>Cancel</Btn>
          <Btn small onClick={save}>Save note</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ view, nav, invoices }) {
  const unpaidInvoices = invoices.filter(i=>i.status!=='paid').length;
  const Item = ({ name, params={}, label, icon, indent, badge }) => {
    const active = view.name===name && Object.entries(params).every(([k,v])=>view[k]===v);
    return (
      <div onClick={()=>nav(name,params)} style={{display:'flex',alignItems:'center',gap:9,padding:`8px 20px 8px ${indent?28:20}px`,color:active?C.gold:C.muted,background:active?C.active:'transparent',cursor:'pointer',fontSize:13,fontWeight:active?500:400,borderLeft:`2px solid ${active?C.gold:'transparent'}`,transition:'all 0.12s'}}
        onMouseEnter={e=>{if(!active){e.currentTarget.style.color=C.text;e.currentTarget.style.background=C.surf;}}}
        onMouseLeave={e=>{if(!active){e.currentTarget.style.color=C.muted;e.currentTarget.style.background='transparent';}}}>
        <span style={{fontSize:12,opacity:0.7,width:14,flexShrink:0}}>{icon}</span>
        <span style={{flex:1}}>{label}</span>
        {badge>0&&<span style={{background:C.red,color:'#fff',fontSize:10,fontWeight:600,padding:'1px 7px',borderRadius:20,lineHeight:'16px'}}>{badge}</span>}
      </div>
    );
  };
  return (
    <div style={{width:216,background:C.sbg,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0,overflowY:'auto'}}>
      <div style={{padding:'24px 20px 12px'}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:C.gold,letterSpacing:'1.5px',fontWeight:600}}>THE FELT BODY</div>
        <div style={{color:C.muted,fontSize:9,letterSpacing:'3px',marginTop:2,opacity:0.6}}>CLIENT RECORD SYSTEM</div>
      </div>
      <Item name="dashboard" label="Dashboard" icon="◈" />
      <SecHead>Organisations</SecHead>
      <Item name="org_list" params={{orgType:'care_home'}} label="Care Homes" icon="⌂" />
      <Item name="org_list" params={{orgType:'gym'}} label="Gyms" icon="◎" />
      <Item name="org_list" params={{orgType:'other'}} label="Other Orgs" icon="◇" />
      <SecHead>People</SecHead>
      <Item name="people" params={{personType:'all'}} label="All Contacts" icon="◉" />
      <Item name="people" params={{personType:'private_client'}} label="Private Clients" icon="▸" indent />
      <Item name="people" params={{personType:'website_student'}} label="Students" icon="▸" indent />
      <Item name="people" params={{personType:'tt_prospect'}} label="TT Prospects" icon="▸" indent />
      <Item name="people" params={{personType:'retreat_interest'}} label="Retreat Interest" icon="▸" indent />
      <Item name="people" params={{personType:'workshop_interest'}} label="Workshop Interest" icon="▸" indent />
      <SecHead>Sessions</SecHead>
      <Item name="classes" label="All Classes" icon="▦" />
      <Item name="forms_list" label="Forms" icon="◍" />
      <SecHead>Finance</SecHead>
      <Item name="invoices" label="Invoices" icon="⬡" badge={unpaidInvoices} />
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ orgs, people, classes, attendance, notes, packages, invoices, nav }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const isToday = selectedDate === today();
  const dateLabel = (() => {
    const t = today();
    const tmrw = addDays(t, 1);
    const yest = addDays(t, -1);
    if(selectedDate===t) return 'Today';
    if(selectedDate===tmrw) return 'Tomorrow';
    if(selectedDate===yest) return 'Yesterday';
    return null;
  })();

  const onDay = classes.filter(c=>c.date===selectedDate).sort((a,b)=>a.location.localeCompare(b.location));
  const onDayClassIds = useMemo(()=>new Set(onDay.map(c=>c.id)), [onDay]);
  const peopleOnDay = useMemo(()=>{
    const ids = new Set();
    attendance.forEach(a=>{ if(onDayClassIds.has(a.classId)) ids.add(a.personId); });
    return ids;
  }, [attendance, onDayClassIds]);

  // Important notes: only those connected to a person attending one of the displayed classes,
  // OR a note directly attached to one of those classes.
  const imp = useMemo(()=>{
    return notes
      .filter(n => n.important && (onDayClassIds.has(n.classId) || peopleOnDay.has(n.personId)))
      .sort((a,b)=>new Date(b.date)-new Date(a.date))
      .slice(0,6);
  }, [notes, onDayClassIds, peopleOnDay]);

  // To-Do: any note with an action date, sorted soonest-first (overdue at top).
  const todos = useMemo(()=>{
    return notes
      .filter(n => n.actionDate)
      .sort((a,b) => a.actionDate.localeCompare(b.actionDate));
  }, [notes]);

  const activePkgs = packages.filter(p=>p.type!=='drop_in'&&p.sessionsUsed<p.totalSessions).length;
  const outstanding = invoices.filter(i=>i.status!=='paid').reduce((s,i)=>s+(i.total||0),0);

  const personOf = (id) => people.find(p=>p.id===id);
  const goToNote = (n) => nav('person_detail', { personId: n.personId, highlightNoteId: n.id });

  return (
    <div style={{padding:'32px 36px',maxWidth:920}}>
      <div style={{marginBottom:30}}>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,color:C.text,margin:'0 0 4px'}}>Dashboard</h1>
        <div style={{color:C.muted,fontSize:14}}>{fmt(today())}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:36}}>
        <Stat label="Organisations" value={orgs.length} sub={`${orgs.filter(o=>o.type==='care_home').length} care homes`} />
        <Stat label="All Contacts" value={people.length} sub={`${people.filter(p=>p.status==='active').length} active`} />
        <Stat label="To Do" value={todos.length} sub={(()=>{ const o=todos.filter(t=>t.actionDate<today()).length; return o>0?`${o} overdue`:'all on track'; })()} />
        <Stat label="Outstanding" value={fmtMoney(outstanding)} sub={`${invoices.filter(i=>i.status!=='paid').length} invoice${invoices.filter(i=>i.status!=='paid').length!==1?'s':''}`} />
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:28,marginBottom:32}}>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,gap:10,flexWrap:'wrap'}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,color:C.gold,fontWeight:600}}>
              Classes
              {dateLabel && <span style={{color:C.muted,fontSize:13,fontWeight:400,marginLeft:8,fontFamily:"'Jost',sans-serif"}}>· {dateLabel}</span>}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12,flexWrap:'wrap'}}>
            <button onClick={()=>setSelectedDate(addDays(selectedDate,-1))}
              style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'4px 9px',lineHeight:1,fontFamily:"'Jost',sans-serif"}}>‹</button>
            <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
              style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'5px 9px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
            <button onClick={()=>setSelectedDate(addDays(selectedDate,1))}
              style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'4px 9px',lineHeight:1,fontFamily:"'Jost',sans-serif"}}>›</button>
            {!isToday && (
              <button onClick={()=>setSelectedDate(today())}
                style={{background:C.goldBg,border:`1px solid ${C.gold}88`,color:C.gold,cursor:'pointer',borderRadius:6,fontSize:12,padding:'4px 11px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>Today</button>
            )}
          </div>
          {onDay.length ? onDay.map(c=>{
            const cOrg = orgs.find(o=>o.id===c.orgId);
            const kk = classKindKey(c, cOrg);
            return (
              <div key={c.id} onClick={()=>nav('class_detail',{classId:c.id})} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 16px',marginBottom:9,cursor:'pointer',transition:'border-color 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.gold+'66'} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <div style={{color:C.text,fontSize:14,fontWeight:500}}>{c.name}</div>
                  <KindBadge kindKey={kk} small />
                  {c.seriesId&&<span style={{color:C.muted,fontSize:11,marginLeft:2}}>↻</span>}
                </div>
                <div style={{color:C.muted,fontSize:12,marginTop:3}}>{c.location}{c.rate>0?` · ${fmtMoney(c.rate)}`:''}</div>
              </div>
            );
          }) : <div style={{color:C.muted,fontSize:13,padding:'18px 0',fontStyle:'italic'}}>No classes on this day.</div>}
        </div>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,color:C.gold,marginBottom:6,fontWeight:600}}>Important Notes</div>
          <div style={{color:C.muted,fontSize:11,letterSpacing:'0.4px',marginBottom:14}}>
            {onDay.length ? `For people on today's register` : `No classes on this day`}
          </div>
          {imp.length ? imp.map(n=>{
            const p = personOf(n.personId);
            return (
              <div key={n.id} onClick={()=>goToNote(n)} style={{background:C.goldBg,borderLeft:`3px solid ${C.gold}`,borderRadius:'0 8px 8px 0',padding:'10px 14px',marginBottom:9,cursor:'pointer',transition:'background 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.background='#23311a'} onMouseLeave={e=>e.currentTarget.style.background=C.goldBg}>
                {p && <div style={{color:C.gold,fontSize:11,fontWeight:600,letterSpacing:'0.5px',marginBottom:3}}>{p.name}</div>}
                <div style={{color:C.text,fontSize:13,lineHeight:1.6}}>{n.text}</div>
                <div style={{color:C.muted,fontSize:12,marginTop:4}}>{fmt(n.date)}</div>
              </div>
            );
          }) : <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'12px 0'}}>{onDay.length?'Nothing flagged for today\'s people.':'—'}</div>}
        </div>
      </div>

      {todos.length>0 && (
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,color:C.gold,marginBottom:14,fontWeight:600}}>
            To Do
            <span style={{color:C.muted,fontSize:13,fontWeight:400,marginLeft:8,fontFamily:"'Jost',sans-serif"}}>· {todos.length} item{todos.length!==1?'s':''}</span>
          </div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
            {todos.map((n,i)=>{
              const p = personOf(n.personId);
              const overdue = n.actionDate < today();
              const dueToday = n.actionDate === today();
              const accent = overdue ? C.red : dueToday ? C.gold : C.blue;
              return (
                <div key={n.id} onClick={()=>goToNote(n)}
                  style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',borderBottom:i<todos.length-1?`1px solid ${C.border}`:'none',cursor:'pointer',background:C.card,transition:'background 0.12s'}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.active} onMouseLeave={e=>e.currentTarget.style.background=C.card}>
                  <div style={{width:6,height:36,borderRadius:3,background:accent,flexShrink:0}} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                      {p && <div style={{color:C.text,fontSize:14,fontWeight:500}}>{p.name}</div>}
                      {n.important && <span style={{color:C.gold,fontSize:9,fontWeight:700,letterSpacing:'0.5px'}}>⚑</span>}
                    </div>
                    <div style={{color:C.muted,fontSize:13,lineHeight:1.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{n.text}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{color:accent,fontSize:11,fontWeight:600,letterSpacing:'0.4px',textTransform:'uppercase'}}>
                      {overdue?'Overdue':dueToday?'Today':'Upcoming'}
                    </div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{fmt(n.actionDate)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ORG LIST / DETAIL ────────────────────────────────────────────────────────
function OrgList({ orgs, people, classes, orgType, nav, onAdd }) {
  const m = ORG_META[orgType];
  const list = orgs.filter(o=>o.type===orgType);
  return (
    <div style={{padding:'32px 36px'}}>
      <PageHead action={<Btn onClick={onAdd}>+ Add {m.label}</Btn>}>{m.label}s</PageHead>
      {list.length ? (
        <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
          {list.map(org=>{
            const pc=people.filter(p=>p.orgId===org.id).length, cc=classes.filter(c=>c.orgId===org.id).length;
            return (
              <Row key={org.id} onClick={()=>nav('org_detail',{orgId:org.id})}>
                <div style={{width:40,height:40,borderRadius:8,background:m.bg,border:`1.5px solid ${m.color}`,display:'flex',alignItems:'center',justifyContent:'center',color:m.color,fontSize:15,fontWeight:600,flexShrink:0}}>{initials(org.name)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:C.text,fontSize:15,fontWeight:500,marginBottom:2}}>{org.name}</div>
                  <div style={{color:C.muted,fontSize:12}}>{org.address||'—'}</div>
                </div>
                {org.contactName&&<div style={{color:C.muted,fontSize:13}}>{org.contactName}</div>}
                <div style={{display:'flex',gap:7,flexShrink:0}}>
                  <span style={{background:C.surf,color:C.muted,fontSize:11,padding:'3px 10px',borderRadius:20}}>{pc} people</span>
                  <span style={{background:C.surf,color:C.muted,fontSize:11,padding:'3px 10px',borderRadius:20}}>{cc} classes</span>
                </div>
              </Row>
            );
          })}
        </div>
      ) : <Empty text={`No ${m.label.toLowerCase()}s yet.`} action="Add one →" onAction={onAdd} />}
    </div>
  );
}

function OrgDetail({ org, people, classes, invoices, nav, backInfo, onEdit, onAddPerson, onAddClass, onCreateInvoice, onEditInvoice, onUpdateInvoiceStatus }) {
  const [tab, setTab] = useState('people');
  const m = ORG_META[org.type];
  const op=people.filter(p=>p.orgId===org.id);
  const oc=classes.filter(c=>c.orgId===org.id).sort((a,b)=>b.date.localeCompare(a.date));
  const oi=invoices.filter(i=>i.orgId===org.id).sort((a,b)=>b.issueDate.localeCompare(a.issueDate));
  const showInvoices = org.type==='care_home'||org.type==='gym';
  const tabList = [{id:'people',label:`People (${op.length})`},{id:'classes',label:`Classes (${oc.length})`}];
  if(showInvoices) tabList.push({id:'invoices',label:`Invoices (${oi.length})`});
  return (
    <div style={{padding:'32px 36px'}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={<Btn variant="secondary" onClick={onEdit}>Edit</Btn>}>{org.name}</PageHead>
      <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:24}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:20,alignSelf:'start'}}>
          <OrgBadge type={org.type} />
          <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:12}}>
            {org.contactName&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>CONTACT</div><div style={{color:C.text,fontSize:14}}>{org.contactName}</div></div>}
            {org.address&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>ADDRESS</div><div style={{color:C.text,fontSize:13}}>{org.address}</div></div>}
            {org.phone&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>PHONE</div><div style={{color:C.text,fontSize:13}}>{org.phone}</div></div>}
            {org.email&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>EMAIL</div><div style={{color:C.gold,fontSize:13}}>{org.email}</div></div>}
          </div>
          {org.notes&&<div style={{borderTop:`1px solid ${C.border}`,marginTop:16,paddingTop:14,color:C.muted,fontSize:13,lineHeight:1.6}}>{org.notes}</div>}
        </div>
        <div>
          <Tabs tabs={tabList} active={tab} onChange={setTab} />
          {tab==='people'&&<>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}><Btn small onClick={onAddPerson}>+ Add Person</Btn></div>
            {op.length?<div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
              {op.map(p=>(
                <Row key={p.id} onClick={()=>nav('person_detail',{personId:p.id})}>
                  <Avatar name={p.name} size={34} role={primaryRole(p)} />
                  <div style={{flex:1}}><div style={{color:C.text,fontSize:14}}>{p.name}</div></div>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>{p.roles.map(r=><RoleBadge key={r} role={r} />)}</div>
                </Row>
              ))}
            </div>:<Empty text="No people added yet" />}
          </>}
          {tab==='classes'&&<>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}><Btn small onClick={onAddClass}>+ Add Class</Btn></div>
            {oc.length?<div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
              {oc.map(c=>(
                <Row key={c.id} onClick={()=>nav('class_detail',{classId:c.id})}>
                  <div style={{flex:1}}><div style={{color:C.text,fontSize:14,fontWeight:500}}>{c.name}{c.seriesId&&<span style={{color:C.muted,fontSize:11,marginLeft:6}}>↻</span>}</div><div style={{color:C.muted,fontSize:12}}>{fmt(c.date)} · {c.location}</div></div>
                  {c.rate>0&&<div style={{color:C.muted,fontSize:13}}>{fmtMoney(c.rate)}</div>}
                </Row>
              ))}
            </div>:<Empty text="No classes logged yet" />}
          </>}
          {tab==='invoices'&&<>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}><Btn small onClick={onCreateInvoice}>+ Create Invoice</Btn></div>
            {oi.length?<div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
              {oi.map(inv=>{
                const sm=INV_STATUS[inv.status]||INV_STATUS.draft;
                return (
                  <Row key={inv.id} onClick={()=>nav('invoice_detail',{invoiceId:inv.id})}>
                    <div style={{flex:1}}>
                      <div style={{color:C.text,fontSize:14,fontWeight:500}}>{inv.invoiceNumber}</div>
                      <div style={{color:C.muted,fontSize:12}}>Issued {fmt(inv.issueDate)} · Due {fmt(inv.dueDate)}</div>
                    </div>
                    <div style={{color:C.gold,fontSize:14,fontWeight:500}}>{fmtMoney(inv.total)}</div>
                    <span style={{background:sm.bg,color:sm.color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase'}}>{sm.label}</span>
                  </Row>
                );
              })}
            </div>:<Empty text="No invoices yet" />}
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── PEOPLE LIST / DETAIL ────────────────────────────────────────────────────
function PeopleList({ people, orgs, personType, nav, onAdd }) {
  const [q, setQ] = useState('');
  const list = people.filter(p=>personType==='all'||p.roles.includes(personType)).filter(p=>!q||p.name.toLowerCase().includes(q.toLowerCase())||(p.email||'').toLowerCase().includes(q.toLowerCase()));
  const title = personType==='all'?'All Contacts':(PERSON_ROLES[personType]?.label+'s'||personType);
  return (
    <div style={{padding:'32px 36px'}}>
      <PageHead action={<Btn onClick={onAdd}>+ Add Person</Btn>}>{title}</PageHead>
      <div style={{marginBottom:16}}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name or email..." style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:14,padding:'9px 14px',width:300,fontFamily:"'Jost',sans-serif",outline:'none'}} /></div>
      {list.length?<div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
        {list.map(p=>{
          const org=orgs.find(o=>o.id===p.orgId);
          return (
            <Row key={p.id} onClick={()=>nav('person_detail',{personId:p.id})}>
              <Avatar name={p.name} size={36} role={primaryRole(p)} />
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.text,fontSize:14,fontWeight:500}}>{p.name}</div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:2,flexWrap:'wrap'}}>
                  <span style={{color:C.muted,fontSize:12}}>{p.email||p.phone||'No contact details'}{org&&` · ${org.name}`}</span>
                  <SourceTag source={p.source} />
                </div>
              </div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:220}}>{p.roles.map(r=><RoleBadge key={r} role={r} />)}</div>
              <div style={{width:8,height:8,borderRadius:'50%',background:p.status==='active'?C.green:p.status==='interested'?C.gold:C.muted,flexShrink:0}} />
            </Row>
          );
        })}
      </div>:<Empty text="No results" />}
    </div>
  );
}

function PersonDetail({ person, org, pNotes, pClasses, attendance, packages, classes, orgs, nav, backInfo, highlightNoteId, onAddNote, onEdit, onAddPackage, onUseSession, onReturnSession, onToggleImportant, onClearAction, onBook }) {
  const [addNote, setAddNote] = useState(false);
  const [tab, setTab] = useState('notes');
  const [flashId, setFlashId] = useState(null);
  const impNotes=pNotes.filter(n=>n.important), regNotes=pNotes.filter(n=>!n.important);
  const pPkgs=packages.filter(pk=>pk.personId===person.id);

  // When arriving with a highlightNoteId, switch to notes tab, scroll to the note, flash for ~1.6s
  useEffect(()=>{
    if(!highlightNoteId) return;
    setTab('notes');
    setFlashId(highlightNoteId);
    const t1 = setTimeout(()=>{
      const el = document.querySelector(`[data-note-id="${highlightNoteId}"]`);
      if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
    }, 80);
    const t2 = setTimeout(()=>setFlashId(null), 1800);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  }, [highlightNoteId]);

  return (
    <div style={{padding:'32px 36px',maxWidth:940}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={<><Btn onClick={onBook}>+ Book</Btn><Btn variant="secondary" onClick={onEdit}>Edit</Btn></>}>{person.name}</PageHead>
      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:24}}>
        <div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:20,marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
              <Avatar name={person.name} size={50} role={primaryRole(person)} />
              <div style={{flex:1}}><div style={{color:C.text,fontSize:16,fontWeight:500}}>{person.name}</div><div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>{person.roles.map(r=><RoleBadge key={r} role={r} />)}</div></div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {person.email&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>EMAIL</div><div style={{color:C.gold,fontSize:13}}>{person.email}</div></div>}
              {person.phone&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>PHONE</div><div style={{color:C.text,fontSize:13}}>{person.phone}</div></div>}
              {org&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>ORGANISATION</div><div style={{color:C.blue,fontSize:13,cursor:'pointer'}} onClick={()=>nav('org_detail',{orgId:org.id})}>{org.name}</div></div>}
              <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>STATUS</div><div style={{color:person.status==='active'?C.green:person.status==='interested'?C.gold:C.muted,fontSize:13,fontWeight:500}}>{person.status}</div></div>
              <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>SOURCE</div><SourceTag source={person.source} /></div>
            </div>
            {person.notes&&<div style={{borderTop:`1px solid ${C.border}`,marginTop:14,paddingTop:12,color:C.muted,fontSize:13,lineHeight:1.6}}>{person.notes}</div>}
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'16px 20px'}}>
            <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:12}}>CLASS HISTORY</div>
            {pClasses.length?pClasses.map(c=>{
              const att=attendance.find(a=>a.classId===c.id&&a.personId===person.id);
              return (<div key={c.id} onClick={()=>nav('class_detail',{classId:c.id})} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}><div><div style={{color:C.text,fontSize:13}}>{c.name}</div><div style={{color:C.muted,fontSize:11}}>{fmt(c.date)}</div></div><div style={{width:8,height:8,borderRadius:'50%',background:att?.attended?C.green:C.red}} /></div>);
            }):<div style={{color:C.muted,fontSize:13}}>No classes yet</div>}
          </div>
        </div>
        <div>
          <Tabs tabs={[{id:'notes',label:`Notes (${pNotes.length})`},{id:'packages',label:`Packages (${pPkgs.length})`}]} active={tab} onChange={setTab} />
          {tab==='notes'&&<>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}><Btn small onClick={()=>setAddNote(!addNote)}>{addNote?'Cancel':'+ Add Note'}</Btn></div>
            {addNote&&<NoteForm personId={person.id} classId={null} onSave={n=>{onAddNote(n);setAddNote(false);}} onCancel={()=>setAddNote(false)} />}
            {impNotes.length>0&&<><div style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'1px',marginBottom:8,marginTop:4}}>⚑ IMPORTANT</div>{impNotes.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} highlight={flashId===n.id} />)}{regNotes.length>0&&<div style={{borderTop:`1px solid ${C.border}`,margin:'18px 0',opacity:0.4}} />}</>}
            {regNotes.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} highlight={flashId===n.id} />)}
            {pNotes.length===0&&!addNote&&<Empty text="No notes yet" />}
          </>}
          {tab==='packages'&&<>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}><Btn small onClick={onAddPackage}>+ Add Package</Btn></div>
            {pPkgs.length?pPkgs.map(pk=>{
              const linkedAtt = attendance.filter(a => a.packageId === pk.id);
              const linkedCount = linkedAtt.length;
              const totalUsed = (pk.sessionsUsed || 0) + linkedCount;
              const remaining = pk.type==='drop_in' ? 1 : Math.max(0, pk.totalSessions - totalUsed);
              const pct = pk.type==='drop_in' ? 100 : Math.round((remaining/pk.totalSessions)*100);
              const pkColor = PKG_TYPES[pk.type]?.color || C.muted;
              const isExpended = remaining<=0;
              return (
                <div key={pk.id} style={{background:C.card,border:`1px solid ${isExpended?C.border:pkColor+'55'}`,borderRadius:8,padding:'16px 20px',marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                    <div><div style={{color:C.text,fontSize:15,fontWeight:500}}>{pk.name}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{PKG_TYPES[pk.type]?.label} · {fmt(pk.datePurchased)}</div></div>
                    <div style={{textAlign:'right'}}><div style={{color:C.gold,fontSize:14,fontWeight:500}}>£{pk.amountPaid}</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{PAY_VIA[pk.paidVia]||pk.paidVia}</div></div>
                  </div>
                  {pk.type!=='drop_in'&&<>
                    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                      <div style={{flex:1,height:5,background:C.surf,borderRadius:3,overflow:'hidden'}}><div style={{width:`${pct}%`,height:'100%',background:isExpended?C.red:pkColor,borderRadius:3,transition:'width 0.3s'}} /></div>
                      <div style={{color:isExpended?C.red:pkColor,fontSize:14,fontWeight:600,minWidth:80,textAlign:'right'}}>{remaining}/{pk.totalSessions} left</div>
                    </div>
                    {linkedAtt.length>0 && (
                      <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.4px',marginBottom:7}}>LINKED SESSIONS · {linkedCount}</div>
                        <div style={{display:'flex',flexDirection:'column',gap:5}}>
                          {linkedAtt.map(a => {
                            const c = pClasses.find(cl => cl.id === a.classId);
                            if(!c) return null;
                            return (
                              <div key={a.id} onClick={()=>nav('class_detail',{classId:c.id})}
                                style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0',cursor:'pointer',opacity:a.attended?1:0.55}}>
                                <div style={{color:C.text,fontSize:13}}>{c.name}{!a.attended && <span style={{color:C.muted,fontSize:11,fontStyle:'italic',marginLeft:7}}>· no-show</span>}</div>
                                <div style={{color:C.muted,fontSize:12}}>{fmt(c.date)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {pk.sessionsUsed>0 && (
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                        <div style={{color:C.muted,fontSize:11,letterSpacing:'0.3px'}}>Manual offset: {pk.sessionsUsed}</div>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={()=>onReturnSession(pk.id)} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 8px',fontFamily:"'Jost',sans-serif"}}>− 1</button>
                        </div>
                      </div>
                    )}
                    {pk.sessionsUsed===0 && (
                      <div style={{display:'flex',justifyContent:'flex-end',marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                        <button onClick={()=>onUseSession(pk.id)} disabled={isExpended} title="Manual offset for sessions used outside this CRM" style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:isExpended?'not-allowed':'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif",opacity:isExpended?0.5:1}}>+ Manual offset</button>
                      </div>
                    )}
                  </>}
                  {pk.notes&&<div style={{color:C.muted,fontSize:12,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>{pk.notes}</div>}
                </div>
              );
            }):<Empty text="No packages yet" />}
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── CLASSES LIST / DETAIL ────────────────────────────────────────────────────
function ClassList({ classes, orgs, series, attendance, nav, onAdd }) {
  const sorted=[...classes].sort((a,b)=>b.date.localeCompare(a.date));
  return (
    <div style={{padding:'32px 36px'}}>
      <PageHead action={<Btn onClick={onAdd}>+ Add Class</Btn>}>All Classes</PageHead>
      {sorted.length?<div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
        {sorted.map(c=>{
          const org=orgs.find(o=>o.id===c.orgId), att=attendance.filter(a=>a.classId===c.id), present=att.filter(a=>a.attended).length;
          const ser=series.find(s=>s.id===c.seriesId);
          const kindKey = classKindKey(c, org);
          const tracksPay = c.paymentModel === 'per_person' || c.paymentModel === 'private';
          const unpaidCount = tracksPay ? att.filter(a => a.attended && (!a.paymentStatus || a.paymentStatus === 'unpaid')).length : 0;
          return (
            <Row key={c.id} onClick={()=>nav('class_detail',{classId:c.id})}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <div style={{color:C.text,fontSize:14,fontWeight:500}}>{c.name}</div>
                  {ser&&<span style={{color:C.muted,fontSize:11,background:C.surf,padding:'1px 7px',borderRadius:10}}>↻ {RECURRENCE[ser.recurrence]||ser.recurrence}</span>}
                </div>
                <div style={{color:C.muted,fontSize:12,marginTop:2}}>{fmt(c.date)} · {c.location}</div>
              </div>
              <KindBadge kindKey={kindKey} />
              {unpaidCount>0 && (
                <span style={{background:'#2a1313',color:C.red,fontSize:11,fontWeight:600,padding:'2px 9px',borderRadius:20,letterSpacing:'0.4px',flexShrink:0}}>{unpaidCount} unpaid</span>
              )}
              <span style={{background:C.surf,color:C.muted,fontSize:11,padding:'3px 10px',borderRadius:20,flexShrink:0}}>{present}/{att.length} attended</span>
            </Row>
          );
        })}
      </div>:<Empty text="No classes logged yet" />}
    </div>
  );
}

function ClassDetail({ cls, org, people, attendance, notes, series, forms, packages, nav, backInfo, onToggle, onAddNote, onAddToRegister, onEdit, onToggleImportant, onClearAction, onUpdateClass, onSetPayment }) {
  const [expanded, setExpanded] = useState(null); // { type:'note'|'payment', personId }
  const reg = attendance.filter(a=>a.classId===cls.id).map(a=>({...a,person:people.find(p=>p.id===a.personId)})).filter(a=>a.person);
  const ser = series.find(s=>s.id===cls.seriesId);
  const kindKey = classKindKey(cls, org);
  const isOrgBilled = cls.paymentModel === 'org';
  const tracksPayment = cls.paymentModel === 'per_person' || cls.paymentModel === 'private';

  // Payment summary for non-org classes — counts paid/package regardless of attendance
  // (no-shows still owe / still consumed credit)
  const paymentSummary = useMemo(()=>{
    if(!tracksPayment) return null;
    let unpaid=0, paid=0, viaPackage=0, totalCash=0, totalPkgValue=0;
    reg.forEach(r => {
      const st = r.paymentStatus;
      if(st === 'paid') {
        paid++;
        totalCash += (r.paidAmount || 0);
      } else if(st === 'package') {
        viaPackage++;
        const pk = packages.find(p => p.id === r.packageId);
        if(pk) totalPkgValue += packagePerSessionValue(pk);
      } else {
        unpaid++;
      }
    });
    return { unpaid, paid, viaPackage, totalCash, totalPkgValue, totalRevenue: totalCash + totalPkgValue };
  }, [reg, tracksPayment, packages]);

  return (
    <div style={{padding:'32px 36px',maxWidth:920}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={<Btn variant="secondary" onClick={onEdit}>Edit</Btn>}>{cls.name}</PageHead>
      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        <KindBadge kindKey={kindKey} />
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.text,fontSize:13}}>{fmt(cls.date)}</div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.text,fontSize:13}}>{cls.location}</div>
        {org&&<div onClick={()=>nav('org_detail',{orgId:org.id})} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.blue,fontSize:13,cursor:'pointer'}}>{org.name}</div>}
        {ser&&<div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.muted,fontSize:13}}>↻ {RECURRENCE[ser.recurrence]} series</div>}
        {cls.rate>0&&<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.gold,fontSize:13}}>{fmtMoney(cls.rate)}{isOrgBilled?'/session':' drop-in'}</div>}
      </div>

      {paymentSummary && (paymentSummary.paid + paymentSummary.viaPackage + paymentSummary.unpaid > 0) && (
        <div style={{display:'flex',gap:8,marginBottom:24,flexWrap:'wrap',alignItems:'center'}}>
          {paymentSummary.paid>0 && (
            <div style={{background:'#132413',border:`1px solid ${C.green}55`,color:C.green,fontSize:12,padding:'4px 11px',borderRadius:6}}>
              {paymentSummary.paid} paid · {fmtMoney(paymentSummary.totalCash)}
            </div>
          )}
          {paymentSummary.viaPackage>0 && (
            <div style={{background:'#1a1428',border:`1px solid ${C.purple}55`,color:C.purple,fontSize:12,padding:'4px 11px',borderRadius:6}}
              title={`Pro-rated package value: ${fmtMoney(paymentSummary.totalPkgValue)}`}>
              {paymentSummary.viaPackage} via package · {fmtMoney(paymentSummary.totalPkgValue)}
            </div>
          )}
          {paymentSummary.unpaid>0 && (
            <div style={{background:'#2a1313',border:`1px solid ${C.red}55`,color:C.red,fontSize:12,padding:'4px 11px',borderRadius:6}}>
              {paymentSummary.unpaid} unpaid
            </div>
          )}
          {paymentSummary.totalRevenue>0 && (
            <div style={{marginLeft:'auto',background:C.goldBg,border:`1px solid ${C.gold}66`,color:C.gold,fontSize:13,fontWeight:600,padding:'4px 13px',borderRadius:6,letterSpacing:'0.3px'}}>
              Revenue: {fmtMoney(paymentSummary.totalRevenue)}
            </div>
          )}
        </div>
      )}

      <ClassLog cls={cls} forms={forms} onUpdateClass={onUpdateClass} nav={nav} />

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:21,color:C.text,fontWeight:600}}>Register <span style={{color:C.muted,fontSize:16,fontWeight:400}}>({reg.filter(r=>r.attended).length}/{reg.length} attended)</span></div>
        <Btn small onClick={onAddToRegister}>+ Add to Register</Btn>
      </div>
      {reg.length?<div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
        {reg.map((r) => {
          const { person, attended, personId, id: attId } = r;
          const pn = notes.filter(n=>n.personId===personId&&n.classId===cls.id);
          const hasImp = pn.some(n=>n.important);
          const noteOpen = expanded?.type==='note' && expanded?.personId===personId;
          const payOpen  = expanded?.type==='payment' && expanded?.personId===personId;
          const status = r.paymentStatus || (tracksPayment ? 'unpaid' : null);
          return (
            <div key={personId}>
              <Row>
                <Avatar name={person.name} size={34} role={primaryRole(person)} />
                <div style={{flex:1,cursor:'pointer',minWidth:0}} onClick={()=>nav('person_detail',{personId})}>
                  <div style={{color:C.text,fontSize:14}}>{person.name}</div>
                  <div style={{display:'flex',gap:4,marginTop:3,flexWrap:'wrap',alignItems:'center'}}>{person.roles.map(role=><RoleBadge key={role} role={role} />)}{hasImp&&<span style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'0.5px',marginLeft:4}}>⚑ IMPORTANT NOTE</span>}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:9,flexWrap:'wrap',justifyContent:'flex-end'}}>
                  {tracksPayment && (
                    <button
                      onClick={()=>setExpanded(payOpen?null:{type:'payment',personId})}
                      title="Set payment"
                      style={{
                        background: PAYMENT_STATUS[status].bg,
                        border:`1px solid ${PAYMENT_STATUS[status].color}${payOpen?'':'55'}`,
                        color: PAYMENT_STATUS[status].color,
                        cursor:'pointer', borderRadius:4, fontSize:11, padding:'3px 9px', fontFamily:"'Jost',sans-serif", fontWeight:600, letterSpacing:'0.4px',
                        display:'inline-flex', alignItems:'center', gap:5,
                      }}>
                      <span>{PAYMENT_STATUS[status].icon}</span>
                      {status==='paid' && r.paidAmount ? `Paid · ${fmtMoney(r.paidAmount)}` : PAYMENT_STATUS[status].label}
                    </button>
                  )}
                  <button onClick={()=>setExpanded(noteOpen?null:{type:'note',personId})} style={{background:'none',border:`1px solid ${noteOpen||pn.length?C.gold:C.border}`,color:noteOpen||pn.length?C.gold:C.muted,cursor:'pointer',fontSize:12,padding:'4px 10px',borderRadius:4,fontFamily:"'Jost',sans-serif"}}>{pn.length?`${pn.length} note${pn.length>1?'s':''}`:'+ note'}</button>
                  <button onClick={()=>onToggle(cls.id,personId)} style={{background:attended?'#122412':'#2a1313',border:`1px solid ${attended?C.green:C.red}55`,color:attended?C.green:C.red,cursor:'pointer',borderRadius:4,fontSize:12,padding:'4px 12px',fontFamily:"'Jost',sans-serif",fontWeight:500}}>{attended?'✓ Attended':'✗ Absent'}</button>
                </div>
              </Row>
              {noteOpen&&(<div style={{background:C.surf,borderTop:`1px solid ${C.border}`,padding:'16px 20px 16px 68px'}}>{pn.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} />)}<NoteForm personId={personId} classId={cls.id} onSave={n=>{onAddNote(n);}} onCancel={()=>setExpanded(null)} /></div>)}
              {payOpen&&(
                <PaymentEditor
                  attendance={r}
                  cls={cls}
                  packages={packages}
                  allAttendance={attendance}
                  onSave={(patch)=>{ onSetPayment(attId, patch); setExpanded(null); }}
                  onCancel={()=>setExpanded(null)} />
              )}
            </div>
          );
        })}
      </div>:<Empty text="Nobody on the register yet." action="Add people →" onAction={onAddToRegister} />}
    </div>
  );
}

// ─── PAYMENT EDITOR ───────────────────────────────────────────────────────────
function PaymentEditor({ attendance: a, cls, packages, allAttendance, onSave, onCancel }) {
  const compatibleModels = (pk) => PKG_COMPATIBILITY[pk.type] || [];
  const personPkgs = packages.filter(pk => 
      pk.personId === a.personId &&
      compatibleModels(pk).includes(cls.paymentModel)
    )
    .map(pk => ({ pk, remaining: packageRemaining(pk, allAttendance) }))
    // include the currently-linked package even if it would otherwise be 0
    .filter(({pk, remaining}) => remaining > 0 || pk.id === a.packageId);

  // Note for incompatible packages the person owns
  const incompatibleCount = packages.filter(pk =>
    pk.personId === a.personId && !compatibleModels(pk).includes(cls.paymentModel)
  ).length;

  const [mode, setMode] = useState(a.paymentStatus || 'unpaid');
  const [amount, setAmount] = useState(a.paidAmount ?? cls.rate ?? '');
  const [packageId, setPackageId] = useState(a.packageId || personPkgs[0]?.pk.id || '');

  const handleSave = () => {
    if(mode === 'paid') {
      const amt = parseFloat(amount);
      onSave({ paymentStatus:'paid', paidAmount: isNaN(amt) ? 0 : amt });
    } else if(mode === 'package') {
      if(!packageId) return;
      onSave({ paymentStatus:'package', packageId });
    } else {
      onSave({ paymentStatus:'unpaid' });
    }
  };

  const radio = (val, label, disabled) => (
    <label style={{display:'flex',alignItems:'center',gap:7,cursor:disabled?'not-allowed':'pointer',color:disabled?C.muted:mode===val?C.gold:C.text,fontSize:13,opacity:disabled?0.5:1}}>
      <input type="radio" disabled={disabled} checked={mode===val} onChange={()=>setMode(val)} style={{accentColor:C.gold}} />
      {label}
    </label>
  );

  return (
    <div style={{background:C.surf,borderTop:`1px solid ${C.border}`,padding:'14px 20px 16px 68px'}}>
      <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:10}}>HOW IS THIS SESSION PAID?</div>
      <div style={{display:'flex',flexDirection:'column',gap:9,marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          {radio('paid','Drop-in')}
          {mode==='paid' && (
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{color:C.muted,fontSize:13}}>£</span>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"
                style={{width:80,background:C.card,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontSize:13,padding:'4px 8px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
            </div>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          {radio('package','Use package', personPkgs.length===0)}
          {mode==='package' && personPkgs.length>0 && (
            <select value={packageId} onChange={e=>setPackageId(e.target.value)}
              style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontSize:13,padding:'4px 8px',fontFamily:"'Jost',sans-serif",outline:'none',minWidth:240}}>
              {personPkgs.map(({pk,remaining}) => (
                <option key={pk.id} value={pk.id}>
                  {pk.name} — {remaining===Infinity ? 'unlimited' : `${remaining} of ${pk.totalSessions} left`}
                </option>
              ))}
            </select>
          )}
          {personPkgs.length===0 && (
            <span style={{color:C.muted,fontSize:12,fontStyle:'italic'}}>
              {incompatibleCount > 0
                ? `No compatible packages (${incompatibleCount} owned but for a different class type)`
                : 'No active packages for this person'}
            </span>
          )}
        </div>
        {radio('unpaid','Unpaid (still owes)')}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
        <Btn variant="ghost" small onClick={onCancel}>Cancel</Btn>
        <Btn small onClick={handleSave}>Save</Btn>
      </div>
    </div>
  );
}

// ─── CLASS LOG (forms worked + reflection) ────────────────────────────────────
function ClassLog({ cls, forms, onUpdateClass, nav }) {
  const worked = cls.formsWorked || [];
  const reflection = cls.reflection || '';
  const [draftReflection, setDraftReflection] = useState(reflection);
  const [editing, setEditing] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Keep draft in sync if class changes underneath us
  useEffect(()=>{ setDraftReflection(reflection); },[reflection,cls.id]);

  const toggle = (formId) => {
    const next = worked.includes(formId) ? worked.filter(x=>x!==formId) : [...worked,formId];
    onUpdateClass(cls.id, { formsWorked: next });
  };
  const saveReflection = () => {
    onUpdateClass(cls.id, { reflection: draftReflection.trim() });
    setEditing(false);
    setSavedFlash(true);
    setTimeout(()=>setSavedFlash(false), 1400);
  };

  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'18px 22px',marginBottom:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,color:C.gold,fontWeight:600}}>Class log</div>
        {savedFlash && <div style={{color:C.green,fontSize:11,letterSpacing:'1px'}}>✓ SAVED</div>}
      </div>

      <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:9}}>FORMS WORKED</div>
      {forms.length ? (
        <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:18}}>
          {forms.map(f=>{
            const on = worked.includes(f.id);
            return (
              <button key={f.id} onClick={()=>toggle(f.id)}
                style={{background:on?C.goldBg:C.surf,border:`1px solid ${on?C.gold:C.border}`,color:on?C.gold:C.muted,cursor:'pointer',borderRadius:20,fontSize:12,fontWeight:500,padding:'5px 13px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px',display:'inline-flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:10,opacity:on?1:0.5}}>{on?'●':'○'}</span>
                {f.name}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{color:C.muted,fontSize:13,marginBottom:18,fontStyle:'italic'}}>
          No forms defined yet. <span style={{color:C.gold,cursor:'pointer'}} onClick={()=>nav('forms_list')}>Add forms →</span>
        </div>
      )}

      <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:7}}>WHAT WENT WELL · ANYTHING NOTABLE</div>
      {editing ? (
        <>
          <textarea value={draftReflection} onChange={e=>setDraftReflection(e.target.value)} rows={4}
            placeholder="A breakthrough, a struggle, an unexpected moment, a question to follow up on..."
            style={{width:'100%',background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:14,padding:'10px 12px',fontFamily:"'Jost',sans-serif",resize:'vertical',outline:'none',lineHeight:1.6}} />
          <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:8}}>
            <Btn variant="ghost" small onClick={()=>{setDraftReflection(reflection);setEditing(false);}}>Cancel</Btn>
            <Btn small onClick={saveReflection}>Save</Btn>
          </div>
        </>
      ) : reflection ? (
        <div onClick={()=>setEditing(true)}
          style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,padding:'12px 14px',color:C.text,fontSize:14,lineHeight:1.6,cursor:'pointer',whiteSpace:'pre-wrap'}}>
          {reflection}
          <div style={{color:C.muted,fontSize:11,marginTop:8,letterSpacing:'0.4px'}}>Click to edit</div>
        </div>
      ) : (
        <div onClick={()=>setEditing(true)}
          style={{background:C.surf,border:`1px dashed ${C.border}`,borderRadius:6,padding:'12px 14px',color:C.muted,fontSize:13,cursor:'pointer',fontStyle:'italic'}}>
          + Add a reflection on this class
        </div>
      )}
    </div>
  );
}

// ─── FORMS LIST (canonical syllabus forms) ────────────────────────────────────
function FormsList({ forms, classes, onAdd, onUpdate, onRemove, onMove }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  const usageCount = (formId) => classes.filter(c=>(c.formsWorked||[]).includes(formId)).length;

  const handleAdd = () => {
    if(draft.trim()){ onAdd(draft.trim()); setDraft(''); setAdding(false); }
  };
  const startEdit = (f) => { setEditingId(f.id); setEditDraft(f.name); };
  const saveEdit = () => { if(editDraft.trim()){ onUpdate(editingId, editDraft.trim()); setEditingId(null); }};
  const handleRemove = (f) => {
    const used = usageCount(f.id);
    const msg = used>0
      ? `Remove "${f.name}"? It's currently logged in ${used} class${used>1?'es':''}; those entries will lose this tag but stay otherwise intact.`
      : `Remove "${f.name}"?`;
    if(window.confirm(msg)) onRemove(f.id);
  };

  return (
    <div style={{padding:'32px 36px',maxWidth:760}}>
      <PageHead action={!adding && <Btn onClick={()=>setAdding(true)}>+ Add Form</Btn>}>Forms</PageHead>
      <div style={{color:C.muted,fontSize:13,lineHeight:1.6,marginBottom:22,maxWidth:560}}>
        The canonical list of forms in The Felt Body syllabus. Use these to tag what you worked in each class. The list is yours to grow as the practice develops.
      </div>

      {adding && (
        <div style={{background:C.card,border:`1px solid ${C.gold}55`,borderRadius:8,padding:16,marginBottom:14}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:6}}>NEW FORM NAME</div>
          <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter') handleAdd(); if(e.key==='Escape'){setAdding(false);setDraft('');}}}
            placeholder="e.g. Suasti"
            style={{width:'100%',background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:14,padding:'9px 12px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
          <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:10}}>
            <Btn variant="ghost" small onClick={()=>{setAdding(false);setDraft('');}}>Cancel</Btn>
            <Btn small onClick={handleAdd}>Add</Btn>
          </div>
        </div>
      )}

      {forms.length ? (
        <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
          {forms.map((f,i)=>{
            const used = usageCount(f.id);
            const isEditing = editingId===f.id;
            return (
              <div key={f.id} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px 12px 12px',borderBottom:i<forms.length-1?`1px solid ${C.border}`:'none',background:isEditing?C.active:'transparent'}}>
                <div style={{display:'flex',flexDirection:'column',gap:1}}>
                  <button onClick={()=>onMove(f.id,-1)} disabled={i===0}
                    style={{background:'none',border:'none',color:i===0?C.border:C.muted,cursor:i===0?'not-allowed':'pointer',fontSize:11,padding:'1px 4px',lineHeight:1}}>▲</button>
                  <button onClick={()=>onMove(f.id,1)} disabled={i===forms.length-1}
                    style={{background:'none',border:'none',color:i===forms.length-1?C.border:C.muted,cursor:i===forms.length-1?'not-allowed':'pointer',fontSize:11,padding:'1px 4px',lineHeight:1}}>▼</button>
                </div>
                <div style={{color:C.muted,fontSize:13,fontFamily:"'Cormorant Garamond',serif",fontWeight:600,minWidth:24,textAlign:'right'}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  {isEditing ? (
                    <input autoFocus value={editDraft} onChange={e=>setEditDraft(e.target.value)}
                      onKeyDown={e=>{if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditingId(null);}}
                      style={{width:'100%',background:C.surf,border:`1px solid ${C.gold}55`,borderRadius:4,color:C.text,fontSize:14,padding:'5px 9px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
                  ) : (
                    <div style={{color:C.text,fontSize:14}}>{f.name}</div>
                  )}
                </div>
                <div style={{color:C.muted,fontSize:11,letterSpacing:'0.4px',whiteSpace:'nowrap'}}>{used} use{used!==1?'s':''}</div>
                <div style={{display:'flex',gap:6}}>
                  {isEditing ? (
                    <>
                      <button onClick={()=>setEditingId(null)} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'3px 9px',fontFamily:"'Jost',sans-serif"}}>Cancel</button>
                      <button onClick={saveEdit} style={{background:C.gold,border:'none',color:'#0a1408',cursor:'pointer',borderRadius:4,fontSize:11,padding:'3px 9px',fontFamily:"'Jost',sans-serif",fontWeight:500}}>Save</button>
                    </>
                  ) : (
                    <>
                      <button onClick={()=>startEdit(f)} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'3px 9px',fontFamily:"'Jost',sans-serif"}}>Edit</button>
                      <button onClick={()=>handleRemove(f)} style={{background:'none',border:`1px solid ${C.red}44`,color:C.red,cursor:'pointer',borderRadius:4,fontSize:11,padding:'3px 9px',fontFamily:"'Jost',sans-serif"}}>Remove</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : !adding && <Empty text="No forms yet." action="Add one →" onAction={()=>setAdding(true)} />}
    </div>
  );
}

// ─── INVOICES LIST / DETAIL ────────────────────────────────────────────────────
function InvoiceList({ invoices, orgs, nav, onAdd }) {
  const sorted=[...invoices].sort((a,b)=>b.issueDate.localeCompare(a.issueDate));
  const total = invoices.reduce((s,i)=>s+(i.total||0),0);
  const outstanding = invoices.filter(i=>i.status!=='paid').reduce((s,i)=>s+(i.total||0),0);
  return (
    <div style={{padding:'32px 36px'}}>
      <PageHead action={<Btn onClick={onAdd}>+ Create Invoice</Btn>}>Invoices</PageHead>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:28}}>
        <Stat label="Total Invoiced" value={fmtMoney(total)} />
        <Stat label="Outstanding" value={fmtMoney(outstanding)} sub={`${invoices.filter(i=>i.status==='sent').length} sent, awaiting payment`} />
        <Stat label="Paid" value={fmtMoney(total-outstanding)} sub={`${invoices.filter(i=>i.status==='paid').length} invoices`} />
      </div>
      {sorted.length?<div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
        {sorted.map(inv=>{
          const org=orgs.find(o=>o.id===inv.orgId);
          const sm=INV_STATUS[inv.status]||INV_STATUS.draft;
          return (
            <Row key={inv.id} onClick={()=>nav('invoice_detail',{invoiceId:inv.id})}>
              <div style={{flex:1}}>
                <div style={{color:C.text,fontSize:14,fontWeight:500}}>{inv.invoiceNumber}</div>
                <div style={{color:C.muted,fontSize:12,marginTop:2}}>{org?.name||'—'} · Issued {fmt(inv.issueDate)}</div>
              </div>
              <div style={{color:C.gold,fontSize:15,fontWeight:500}}>{fmtMoney(inv.total)}</div>
              <span style={{background:sm.bg,color:sm.color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase'}}>{sm.label}</span>
            </Row>
          );
        })}
      </div>:<Empty text="No invoices yet." action="Create one →" onAction={onAdd} />}
    </div>
  );
}

function InvoiceDetail({ inv, org, onEdit, onStatusChange, nav, backInfo }) {
  const sm=INV_STATUS[inv.status]||INV_STATUS.draft;
  return (
    <div style={{padding:'32px 36px',maxWidth:760}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={<><Btn variant="secondary" onClick={onEdit}>Edit</Btn></>}>{inv.invoiceNumber}</PageHead>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:28}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:28}}>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:C.text,marginBottom:4}}>{org?.name||'—'}</div>
            {org?.address&&<div style={{color:C.muted,fontSize:13}}>{org.address}</div>}
            {org?.contactName&&<div style={{color:C.muted,fontSize:13}}>{org.contactName}</div>}
          </div>
          <div style={{textAlign:'right'}}>
            <span style={{background:sm.bg,color:sm.color,fontSize:11,fontWeight:600,padding:'3px 12px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase'}}>{sm.label}</span>
            <div style={{color:C.muted,fontSize:12,marginTop:8}}>Issued: {fmt(inv.issueDate)}</div>
            <div style={{color:C.muted,fontSize:12}}>Due: {fmt(inv.dueDate)}</div>
          </div>
        </div>
        <div style={{border:`1px solid ${C.border}`,borderRadius:6,overflow:'hidden',marginBottom:20}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 60px 70px 80px',background:C.surf,padding:'8px 16px',borderBottom:`1px solid ${C.border}`}}>
            {['Description','Qty','Rate','Total'].map(h=><div key={h} style={{color:C.muted,fontSize:11,letterSpacing:'0.5px'}}>{h}</div>)}
          </div>
          {inv.lineItems.map(li=>(
            <div key={li.id} style={{display:'grid',gridTemplateColumns:'1fr 60px 70px 80px',padding:'10px 16px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{color:C.text,fontSize:14}}>{li.description}</div>
              <div style={{color:C.muted,fontSize:14}}>{li.qty}</div>
              <div style={{color:C.muted,fontSize:14}}>{fmtMoney(li.rate)}</div>
              <div style={{color:C.gold,fontSize:14,fontWeight:500}}>{fmtMoney((li.qty||1)*(li.rate||0))}</div>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'flex-end',padding:'12px 16px',background:C.card}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,color:C.gold,fontWeight:600}}>Total: {fmtMoney(inv.total)}</div>
          </div>
        </div>
        {inv.notes&&<div style={{color:C.muted,fontSize:13,marginBottom:20}}>{inv.notes}</div>}
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          {inv.status==='draft'&&<Btn onClick={()=>onStatusChange('sent')}>Mark as Sent</Btn>}
          {inv.status==='sent'&&<Btn onClick={()=>onStatusChange('paid')}>Mark as Paid</Btn>}
          {inv.status==='paid'&&<div style={{color:C.green,fontSize:14,fontWeight:500,display:'flex',alignItems:'center',gap:6}}>✓ Paid</div>}
          {inv.status!=='draft'&&<Btn variant="ghost" onClick={()=>onStatusChange('draft')}>Revert to Draft</Btn>}
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function FeltBodyCRM() {
  const [history, setHistory] = useState([{ name:'dashboard' }]);
  const view = history[history.length - 1];
  const [orgs, setOrgs] = useState(SEED.orgs);
  const [people, setPeople] = useState(SEED.people);
  const [series, setSeries] = useState(SEED.series);
  const [classes, setClasses] = useState(SEED.classes);
  const [attendance, setAttendance] = useState(SEED.attendance);
  const [notes, setNotes] = useState(SEED.notes);
  const [packages, setPackages] = useState(SEED.packages);
  const [invoices, setInvoices] = useState(SEED.invoices);
  const [forms, setForms] = useState(SEED.forms);
  const [modal, setModal] = useState(null);

  useEffect(()=>{
    (async()=>{
      try {
        const d=await window.storage.get('tfb:crm:v3');
        if(d?.value){
          const p=JSON.parse(d.value);
          if(p.orgs?.length) setOrgs(p.orgs);
          if(p.people?.length) setPeople(p.people.map(migrate));
          if(p.series?.length) setSeries(p.series);
          if(p.classes?.length) setClasses(p.classes.map(migrateClass));
          if(p.attendance?.length) setAttendance(p.attendance);
          if(p.notes?.length) setNotes(p.notes);
          if(p.packages?.length) setPackages(p.packages);
          if(p.invoices?.length) setInvoices(p.invoices);
          if(p.forms?.length) setForms(p.forms);
        }
      }catch(e){}
    })();
  },[]);
  useEffect(()=>{
    (async()=>{ try{ await window.storage.set('tfb:crm:v3',JSON.stringify({orgs,people,series,classes,attendance,notes,packages,invoices,forms})); }catch(e){} })();
  },[orgs,people,series,classes,attendance,notes,packages,invoices,forms]);

  const nav = (name, params={}) => {
    const next = { name, ...params };
    setHistory(h => {
      const cur = h[h.length-1];
      if (JSON.stringify(cur) === JSON.stringify(next)) return h;
      return [...h, next];
    });
  };
  const goBack = () => setHistory(h => h.length > 1 ? h.slice(0, -1) : h);
  const close = () => setModal(null);
  const addNote = n => setNotes(p=>[...p,{id:uid(),...n}]);
  const toggleNoteImportant = id => setNotes(p=>p.map(n=>n.id===id?{...n,important:!n.important}:n));
  const clearNoteAction = id => setNotes(p=>p.map(n=>n.id===id?(()=>{const{actionDate,...rest}=n;return rest;})():n));
  const updateClassFields = (classId, fields) => setClasses(p=>p.map(c=>c.id===classId?{...c,...fields}:c));
  const addForm = name => setForms(p=>[...p,{id:uid(),name}]);
  const updateForm = (id,name) => setForms(p=>p.map(f=>f.id===id?{...f,name}:f));
  const removeForm = id => setForms(p=>p.filter(f=>f.id!==id));
  const moveForm = (id,dir) => setForms(p=>{
    const i=p.findIndex(f=>f.id===id); if(i<0) return p;
    const j=i+dir; if(j<0||j>=p.length) return p;
    const c=[...p]; [c[i],c[j]]=[c[j],c[i]]; return c;
  });
  const toggleAtt = (classId,personId) => setAttendance(prev=>{
    const ex=prev.find(a=>a.classId===classId&&a.personId===personId);
    if(ex) return prev.map(a=>a.classId===classId&&a.personId===personId?{...a,attended:!a.attended}:a);
    return [...prev,{id:uid(),classId,personId,attended:true}];
  });
  const setAttendancePayment = (attId, patch) => {
    setAttendance(prev => prev.map(a => {
      if(a.id !== attId) return a;
      // Build new attendance with merged fields, dropping cleared ones
      const next = { ...a, ...patch };
      if(patch.paymentStatus === 'paid') { delete next.packageId; }
      else if(patch.paymentStatus === 'package') { delete next.paidAmount; }
      else if(patch.paymentStatus === 'unpaid') { delete next.packageId; delete next.paidAmount; }
      return next;
    }));
  };

  const handleAddClass = (f) => {
    const paymentModel = f.paymentModel || (f.orgId ? 'org' : 'per_person');
    if(f.recurrence && f.recurrence !== 'one_off') {
      const newSeries = { id:uid(), name:f.name, recurrence:f.recurrence, location:f.location, orgId:f.orgId||null, startDate:f.date, rate:parseFloat(f.rate)||0, paymentModel };
      const newSerId = newSeries.id;
      setSeries(p=>[...p,newSeries]);
      const instances = generateSeriesClasses({...newSeries, id:newSerId}, parseInt(f.repeatCount)||12);
      setClasses(p=>[...p,...instances]);
    } else {
      setClasses(p=>[...p,{id:uid(),name:f.name,date:f.date,location:f.location,orgId:f.orgId||null,seriesId:null,rate:parseFloat(f.rate)||0,paymentModel}]);
    }
  };

  const handleEditClass = (cls, updated, scope) => {
    if(scope==='this') {
      setClasses(p=>p.map(c=>c.id===cls.id?{...c,...updated,seriesId:c.seriesId}:c));
    } else {
      // Update this and all future in series
      setClasses(p=>p.map(c=>{
        if(c.seriesId===cls.seriesId && c.date>=cls.date) {
          return {...c, name:updated.name, location:updated.location, orgId:updated.orgId||null, rate:parseFloat(updated.rate)||c.rate, paymentModel:updated.paymentModel||c.paymentModel};
        }
        return c;
      }));
      setSeries(p=>p.map(s=>s.id===cls.seriesId?{...s,name:updated.name,location:updated.location,orgId:updated.orgId||null,rate:parseFloat(updated.rate)||s.rate,paymentModel:updated.paymentModel||s.paymentModel}:s));
    }
  };

  const renderModal = () => {
    if(!modal) return null;
    switch(modal.type){
      case 'add_org': return <AddOrgForm defaultType={modal.orgType} onSave={o=>setOrgs(p=>[...p,{id:uid(),...o}])} onClose={close} />;
      case 'edit_org': return <AddOrgForm existing={modal.org} onSave={o=>setOrgs(p=>p.map(x=>x.id===modal.org.id?{...x,...o}:x))} onClose={close} />;
      case 'add_person': return <AddPersonForm orgs={orgs} defaultType={modal.personType} defaultOrgId={modal.orgId} onSave={p=>setPeople(prev=>[...prev,{id:uid(),...p}])} onClose={close} />;
      case 'edit_person': return <AddPersonForm existing={modal.person} orgs={orgs} onSave={p=>setPeople(prev=>prev.map(x=>x.id===modal.person.id?{...x,...p}:x))} onClose={close} />;
      case 'add_class': return <AddClassForm orgs={orgs} defaultOrgId={modal.orgId} onSave={handleAddClass} onClose={close} />;
      case 'edit_class': {
        const cls=modal.cls;
        if(cls.seriesId) return <EditSeriesClassForm cls={cls} orgs={orgs} onSaveThis={u=>handleEditClass(cls,u,'this')} onSaveFuture={u=>handleEditClass(cls,u,'future')} onClose={close} />;
        return <AddClassForm existing={cls} orgs={orgs} onSave={u=>setClasses(p=>p.map(c=>c.id===cls.id?{...c,...u}:c))} onClose={close} />;
      }
      case 'add_to_register': {
        const cls=classes.find(c=>c.id===modal.classId);
        return <AddToRegisterForm people={people} classId={modal.classId} existing={attendance.filter(a=>a.classId===modal.classId).map(a=>a.personId)} attendance={attendance} classes={classes} cls={cls} onSave={(cid,pid)=>setAttendance(p=>[...p,{id:uid(),classId:cid,personId:pid,attended:false}])} onClose={close} />;
      }
      case 'add_package': return <AddPackageForm personId={modal.personId} onSave={pk=>setPackages(p=>[...p,{id:uid(),...pk}])} onClose={close} />;
      case 'book': {
        const person = people.find(p => p.id === modal.personId);
        if(!person) return null;
        return <BookForPersonForm
          person={person}
          classes={classes}
          orgs={orgs}
          attendance={attendance}
          onAddToRegister={(classId)=>{
            // Add attendance, close modal, navigate to that class
            setAttendance(p => [...p, {id:uid(), classId, personId:person.id, attended:false}]);
            close();
            nav('class_detail', { classId });
          }}
          onCreatePrivate={()=>{
            // Switch modal to AddClassForm in private session mode
            setModal({ type:'book_create_private', personId: person.id });
          }}
          onClose={close} />;
      }
      case 'book_create_private': {
        const person = people.find(p => p.id === modal.personId);
        if(!person) return null;
        return <AddClassForm
          orgs={orgs}
          bookingFor={{ personId: person.id, name: person.name }}
          defaultPaymentModel="private"
          onSave={(f) => {
            // Create the class, then add attendance for this person, then navigate
            const newId = uid();
            const newClass = {
              id: newId,
              name: f.name,
              date: f.date,
              location: f.location,
              orgId: f.orgId || null,
              seriesId: null,
              rate: parseFloat(f.rate) || 0,
              paymentModel: f.paymentModel || 'private',
            };
            setClasses(p => [...p, newClass]);
            setAttendance(p => [...p, {id:uid(), classId:newId, personId:person.id, attended:false}]);
            close();
            nav('class_detail', { classId: newId });
          }}
          onClose={close} />;
      }
      case 'create_invoice': return <CreateInvoiceForm orgs={orgs} classes={classes} invoices={invoices} onSave={inv=>setInvoices(p=>[...p,{id:uid(),...inv}])} onClose={close} />;
      case 'edit_invoice': return <CreateInvoiceForm existing={modal.inv} orgs={orgs} classes={classes} invoices={invoices} onSave={inv=>setInvoices(p=>p.map(x=>x.id===modal.inv.id?{...x,...inv}:x))} onClose={close} />;
      default: return null;
    }
  };

  // Compute a smart back label from the previous entry in the history stack
  const backInfo = useMemo(() => {
    if (history.length < 2) return null;
    const prev = history[history.length - 2];
    let label = 'Back';
    switch (prev.name) {
      case 'dashboard': label = 'Dashboard'; break;
      case 'classes': label = 'All Classes'; break;
      case 'forms_list': label = 'Forms'; break;
      case 'invoices': label = 'Invoices'; break;
      case 'people':
        label = prev.personType === 'all' ? 'All Contacts' : (PERSON_ROLES[prev.personType]?.label || 'People');
        if (label !== 'People' && label !== 'All Contacts') label += 's';
        break;
      case 'org_list':
        label = (ORG_META[prev.orgType]?.label || 'Organisations') + 's';
        break;
      case 'org_detail': {
        const o = orgs.find(o => o.id === prev.orgId);
        label = o ? o.name : 'Organisation';
        break;
      }
      case 'person_detail': {
        const p = people.find(p => p.id === prev.personId);
        label = p ? p.name : 'Person';
        break;
      }
      case 'class_detail': {
        const c = classes.find(c => c.id === prev.classId);
        label = c ? `${c.name} · ${fmt(c.date)}` : 'Class';
        break;
      }
      case 'invoice_detail': {
        const i = invoices.find(i => i.id === prev.invoiceId);
        label = i ? i.invoiceNumber : 'Invoice';
        break;
      }
      default: label = 'Back';
    }
    return { label, onBack: goBack };
  }, [history, orgs, people, classes, invoices]);

  const renderView = () => {
    const { name, orgId, orgType, personType, personId, classId, invoiceId, highlightNoteId } = view;
    switch(name){
      case 'dashboard': return <Dashboard orgs={orgs} people={people} classes={classes} attendance={attendance} notes={notes} packages={packages} invoices={invoices} nav={nav} />;
      case 'org_list': return <OrgList orgs={orgs} people={people} classes={classes} orgType={orgType} nav={nav} onAdd={()=>setModal({type:'add_org',orgType})} />;
      case 'org_detail': {
        const org=orgs.find(o=>o.id===orgId); if(!org) return <Empty text="Not found" />;
        return <OrgDetail org={org} people={people} classes={classes} invoices={invoices} nav={nav} backInfo={backInfo}
          onEdit={()=>setModal({type:'edit_org',org})}
          onAddPerson={()=>setModal({type:'add_person',orgId,personType:org.type==='care_home'?'resident':'website_student'})}
          onAddClass={()=>setModal({type:'add_class',orgId})}
          onCreateInvoice={()=>setModal({type:'create_invoice',orgId})}
          onEditInvoice={inv=>setModal({type:'edit_invoice',inv})}
          onUpdateInvoiceStatus={(invId,st)=>setInvoices(p=>p.map(x=>x.id===invId?{...x,status:st}:x))} />;
      }
      case 'people': return <PeopleList people={people} orgs={orgs} personType={personType} nav={nav} onAdd={()=>setModal({type:'add_person',personType:personType==='all'?'private_client':personType})} />;
      case 'person_detail': {
        const person=people.find(p=>p.id===personId); if(!person) return <Empty text="Not found" />;
        const org=orgs.find(o=>o.id===person.orgId);
        const pn=notes.filter(n=>n.personId===person.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
        const pc=attendance.filter(a=>a.personId===person.id).map(a=>classes.find(c=>c.id===a.classId)).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
        return <PersonDetail person={person} org={org} pNotes={pn} pClasses={pc} attendance={attendance} packages={packages} classes={classes} orgs={orgs} nav={nav} backInfo={backInfo} highlightNoteId={highlightNoteId}
          onAddNote={addNote}
          onToggleImportant={toggleNoteImportant}
          onClearAction={clearNoteAction}
          onEdit={()=>setModal({type:'edit_person',person})}
          onAddPackage={()=>setModal({type:'add_package',personId})}
          onBook={()=>setModal({type:'book',personId})}
          onUseSession={id=>setPackages(p=>p.map(x=>x.id===id?{...x,sessionsUsed:Math.min(x.sessionsUsed+1,x.totalSessions)}:x))}
          onReturnSession={id=>setPackages(p=>p.map(x=>x.id===id?{...x,sessionsUsed:Math.max(x.sessionsUsed-1,0)}:x))} />;
      }
      case 'classes': return <ClassList classes={classes} orgs={orgs} series={series} attendance={attendance} nav={nav} onAdd={()=>setModal({type:'add_class'})} />;
      case 'forms_list': return <FormsList forms={forms} classes={classes} onAdd={addForm} onUpdate={updateForm} onRemove={removeForm} onMove={moveForm} />;
      case 'class_detail': {
        const cls=classes.find(c=>c.id===classId); if(!cls) return <Empty text="Not found" />;
        const org=orgs.find(o=>o.id===cls.orgId);
        return <ClassDetail cls={cls} org={org} people={people} attendance={attendance} notes={notes} series={series} forms={forms} packages={packages} nav={nav} backInfo={backInfo}
          onToggle={toggleAtt} onAddNote={addNote}
          onToggleImportant={toggleNoteImportant}
          onClearAction={clearNoteAction}
          onUpdateClass={updateClassFields}
          onSetPayment={setAttendancePayment}
          onAddToRegister={()=>setModal({type:'add_to_register',classId})}
          onEdit={()=>setModal({type:'edit_class',cls})} />;
      }
      case 'invoices': return <InvoiceList invoices={invoices} orgs={orgs} nav={nav} onAdd={()=>setModal({type:'create_invoice'})} />;
      case 'invoice_detail': {
        const inv=invoices.find(i=>i.id===invoiceId); if(!inv) return <Empty text="Not found" />;
        const org=orgs.find(o=>o.id===inv.orgId);
        return <InvoiceDetail inv={inv} org={org} nav={nav} backInfo={backInfo}
          onEdit={()=>setModal({type:'edit_invoice',inv})}
          onStatusChange={st=>setInvoices(p=>p.map(x=>x.id===inv.id?{...x,status:st}:x))} />;
      }
      default: return null;
    }
  };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500;600&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2a4a37;border-radius:2px}input,select,textarea{outline:none}input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.5)}`}</style>
      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:C.bg,fontFamily:"'Jost',sans-serif",color:C.text,position:'relative'}}>
        <Sidebar view={view} nav={nav} invoices={invoices} />
        <main style={{flex:1,overflowY:'auto',overflowX:'hidden'}}>{renderView()}</main>
        {modal&&renderModal()}
      </div>
    </>
  );
}
