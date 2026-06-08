import { useState, useEffect, useMemo, useRef, createContext, useContext } from "react";
import { supabase } from "./lib/supabase.js";
import * as data from "./lib/dataLayer.js";

// Empty initial state. Real data is fetched from Supabase by loadAll() after auth.
// The original SEED constant is kept as a structural reference for the eleven entities.
const SEED = {
  orgs: [],
  people: [],
  series: [],
  classes: [],
  attendance: [],
  forms: [],
  notes: [],
  packages: [],
  invoices: [],
  projects: [],
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
  personal:{ label:'Personal', color:'#c98fd4', bg:'#241328' },
};
const PERSON_ROLES = {
  resident:{ label:'Resident', color:'#4db879', bg:'#132413' },
  private_client:{ label:'Private Client', color:'#a07fd4', bg:'#1a1428' },
  website_student:{ label:'Student', color:'#6ba3d4', bg:'#131d2a' },
  tt_prospect:{ label:'TT Prospect', color:'#c9a84c', bg:'#1b2213' },
  retreat_interest:{ label:'Retreat Interest', color:'#c97070', bg:'#2a1313' },
  workshop_interest:{ label:'Workshop Interest', color:'#6ab86a', bg:'#132413' },
  personal_contact:{ label:'Personal Contact', color:'#c98fd4', bg:'#241328' },
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
  monthly_unlimited:{ label:'Monthly Unlimited', color:'#d48fc0' },
  class_package:{ label:'Class Package', color:'#4db879' },
  private_block:{ label:'Private Block', color:'#a07fd4' },
  retreat:{ label:'Retreat', color:'#c97070' },
  workshop:{ label:'Workshop', color:'#c9a84c' },
  other:{ label:'Other', color:'#698a78' },
};
// Which class payment models each package type can be used against
const PKG_COMPATIBILITY = {
  drop_in:       ['per_person', 'private'],  // single-use, flexible
  monthly_unlimited: ['per_person'],          // group classes, never depletes
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
const BANK_DETAILS = {
  accountName: 'Jesse Saunders',
  sortCode: '04-03-33',
  accountNumber: '15360781',
  bank: 'Mettle',
};
// Interaction kinds: notes plus other communication types logged on a person.
// 'note' is the default and dominant kind; others are added via the multi-kind
// buttons on PersonDetail. Used for the kind badge on cards and the filter chips.
// Note: separate from the KIND_META constant above, which is for class/session kinds.
// Interaction kinds. The first five are human/inbound surfaces (notes Jesse
// types, calls he logs, emails sent/received, meetings, website form
// submissions). `booking` and `payment` are seeded ahead of Phase 7 — they'll
// be written by the future Stripe webhook Worker when a customer books a
// class or buys a package on thefeltbody.com. No rows of those kinds exist
// yet, but the Comms Log renderer + filter chips are kind-agnostic, so the
// feed lights up automatically when they start arriving. Adding them here
// (not later) means the icon/color identity is settled before any real
// rows depend on it.
const INTERACTION_KINDS = {
  note:    { label:'Note',    icon:'📝', color:'#8a9aa3', bg:'#1a2226' },
  call:    { label:'Call',    icon:'📞', color:'#4db879', bg:'#132413' },
  email:   { label:'Email',   icon:'✉️',  color:'#6ba3d4', bg:'#131d2a' },
  meeting: { label:'Meeting', icon:'💬', color:'#a07fd4', bg:'#1a1428' },
  form:    { label:'Form',    icon:'📋', color:'#d49966', bg:'#2a1d10' },
  booking: { label:'Booking', icon:'📅', color:'#7fc4b8', bg:'#13282a' },
  payment: { label:'Payment', icon:'💷', color:'#c9a84c', bg:'#1b2213' },
};

// Household member relationship labels. Keys match the DB CHECK constraint on
// household_members.relationship (adult/child/partner/parent/guardian/friend/
// grandparent/other). Used for the relationship picker and the member rows on
// the PersonDetail household card.
// EDIT THIS if the home household is renamed: the Personal Dashboard shows the
// one household whose name EXACTLY matches this string (case-insensitive,
// trimmed). Exact match — not substring — because other households may share
// the "Osmington" address word; only the home household is named precisely this.
const HOME_HOUSEHOLD_NAME = '10 Osmington';

const RELATIONSHIP_LABELS = {
  adult:       'Adult',
  child:       'Child',
  partner:     'Partner',
  parent:      'Parent',
  guardian:    'Guardian',
  friend:      'Friend',
  grandparent: 'Grandparent',
  other:       'Other',
};
const RELATIONSHIP_KEYS = ['adult','child','partner','parent','guardian','friend','grandparent','other'];

// ─── CUSTOM TYPES INFRASTRUCTURE ──────────────────────────────────────────────
// Built-in org types and person roles can be extended at runtime by the user.
// Custom types are persisted and merged with the built-ins everywhere via TypesContext.
const TYPE_PALETTE = [
  { color:'#4db879', bg:'#132413' }, // green
  { color:'#6ba3d4', bg:'#131d2a' }, // blue
  { color:'#c9a84c', bg:'#1b2213' }, // gold
  { color:'#a07fd4', bg:'#1a1428' }, // purple
  { color:'#c97070', bg:'#2a1313' }, // red
  { color:'#6ab86a', bg:'#132413' }, // mint
  { color:'#d49966', bg:'#2a1d10' }, // amber
  { color:'#7fc4b8', bg:'#13282a' }, // teal
];
const TYPE_ICONS = ['◇','⌂','◎','▦','⬡','◈','◉','⊙','◍','◫','▣','⌬','✦','◆','▲','●'];

const TypesContext = createContext({ orgTypes: ORG_META, personRoles: PERSON_ROLES });
const useTypes = () => useContext(TypesContext);

// Mobile UI context: lets any header/view access the hamburger toggle without
// prop-drilling. Also exposes a per-view `expandAll` toggle state (Dashboard
// accordion expand/contract) so MobileHeader can render a toggle button next
// to the page title.
const MobileUIContext = createContext({
  onMobileNavOpen: () => {},
  expandAll: false,
  setExpandAll: () => {},
  showExpandToggle: false,  // only true on views that have accordion sections
});
const useMobileUI = () => useContext(MobileUIContext);

// Roles/types shown as quick-jump items in the sidebar's expanded section.
// 'resident' is a real role used in badges/avatars but isn't a sidebar shortcut
// (residents are reached via their care home org). Same for 'other' org category —
// keep it in the merged map and as a sidebar item, just at the bottom of built-ins.
const ORG_SIDEBAR_TYPES = ['care_home','gym','other'];
const PERSON_SIDEBAR_ROLES = ['private_client','website_student','tt_prospect','retreat_interest','workshop_interest'];
// ─── Personal contacts (Sienna World, Neighbours, etc.) ──────────────────────
// Personal contacts are tagged with the `personal_contact` role and filed under
// an org of type `personal`. Both the role and the org type are created through
// the normal custom-type UI — no schema change. These predicates keep personal
// people/orgs out of client-facing surfaces (All Contacts, dashboard stats, the
// All Organisations list) while leaving them reachable via their own sidebar
// section and their org's detail page.
//
// isPersonalOnly: carries the personal tag AND is not also a client. A person who
// is BOTH a client and personal is NOT personal-only — they stay visible in client
// views, get emailed per their client relationship, and also appear under their
// personal org. doNotEmail is left as a manual per-person flag (set true by hand on
// pure personal contacts); it is intentionally not driven by these predicates.
const CLIENT_ROLES = ['private_client','website_student','tt_prospect','retreat_interest','workshop_interest','resident'];
const isPersonalOnly = p => {
  const roles = p.roles || [];
  return roles.includes('personal_contact') && !roles.some(r => CLIENT_ROLES.includes(r));
};
const isPersonalOrg = o => o.type === 'personal';

// Merge built-ins (ALL of them, so badges/avatars keep working) with custom types.
// Custom types are appended in the order they were created.
const buildOrgTypes = (custom=[]) => {
  const merged = {};
  Object.entries(ORG_META).forEach(([k,v]) => { merged[k] = { ...v, _builtin:true }; });
  custom.forEach(t => { merged[t.key] = { label:t.label, color:t.color, bg:t.bg, icon:t.icon, _builtin:false }; });
  return merged;
};
const buildPersonRoles = (custom=[]) => {
  const merged = {};
  Object.entries(PERSON_ROLES).forEach(([k,v]) => { merged[k] = { ...v, _builtin:true }; });
  custom.forEach(t => { merged[t.key] = { label:t.label, color:t.color, bg:t.bg, _builtin:false }; });
  return merged;
};

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

// Mobile detection: matches the 767px CSS breakpoint used by data-desktop-sidebar /
// data-hamburger. Components that need to BRANCH STRUCTURALLY (not just style) on
// mobile call this hook. CSS-only adjustments should keep using the existing
// media queries.
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return isMobile;
};

// Tiny localStorage-backed state. Used for "remember last opened" UI state
// (Dashboard mobile accordion section, mobile expand/contract toggle) where
// persistence is convenience-only — fine if it's wiped, fine if it's per-device.
// Wraps in try/catch because localStorage can throw in private-mode Safari.
const useLocalStorage = (key, initial) => {
  const [val, setVal] = useState(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch { return initial; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
};

const fmt = d => d ? new Date(d+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
// Relative time for activity-feed rows. Takes a YYYY-MM-DD string and
// resolves to "today", "yesterday", "N days ago", "last week", "N weeks
// ago", falling back to the absolute fmt() for anything older than ~6
// weeks. Used by CommsLogView and the Dashboard RecentActivitySummary.
// Absolute dates remain available via the hover-title on each row.
const fmtRel = d => {
  if (!d) return '—';
  const then = new Date(d+'T12:00');
  const now  = new Date();
  const days = Math.floor((now - then) / 86400000);
  if (days < 0)   return fmt(d);            // future-dated (rare)
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)   return `${days} days ago`;
  if (days < 14)  return 'last week';
  if (days < 42)  return `${Math.floor(days/7)} weeks ago`;
  return fmt(d);
};
// Format a "HH:MM" 24h string as friendly 12h. Returns null if not set or malformed.
const fmtTime = t => {
  if(!t || typeof t !== 'string') return null;
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr,10), m = parseInt(mStr,10);
  if(isNaN(h)||isNaN(m)) return null;
  const hh = h===0 ? 12 : h>12 ? h-12 : h;
  const mm = m.toString().padStart(2,'0');
  return `${hh}:${mm}${h<12?'am':'pm'}`;
};

// For pre-filling the time input on new classes — current hour, zeroed minutes.
const currentHourTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:00`;
};
// Hours-and-minutes -> minutes since midnight. Used to position classes in the week grid.
const timeToMin = t => {
  if(!t || typeof t !== 'string') return null;
  const [h,m] = t.split(':').map(n=>parseInt(n,10));
  if(isNaN(h)||isNaN(m)) return null;
  return h*60+m;
};
const fmtMoney = n => typeof n==='number' ? `£${n.toFixed(2).replace(/\.00$/,'')}` : '—';

// Given an ISO date string 'YYYY-MM-DD', return { age, label } where label is a
// human birthday line, e.g. "turns 8 in 12 days" or "today! 🎂". Returns null for
// blank/invalid input so callers can render nothing. Computed at read time — no
// stored age to drift. Uses local date parts to avoid timezone-shift off-by-one.
const birthdayInfo = (iso) => {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let age = today.getFullYear() - y;
  // Next birthday this year (months are 0-indexed in Date)
  let next = new Date(today.getFullYear(), mo - 1, d);
  if (next < today) { next = new Date(today.getFullYear() + 1, mo - 1, d); }
  else if (next > today) { age -= 1; } // haven't had this year's birthday yet
  const days = Math.round((next - today) / 86400000);
  const turning = age + 1;
  let label;
  if (days === 0) label = `${turning} today 🎂`;
  else if (days === 1) label = `turns ${turning} tomorrow`;
  else if (days <= 30) label = `turns ${turning} in ${days} days`;
  else label = `age ${age}`;
  return { age, days, label };
};

// Days-until info for a contact_date. Recurring dates (anniversaries) roll to
// the next occurrence the way birthdays do, and report how many years it marks.
// One-off dates report days until (negative once past). Returns null on bad input.
const contactDateInfo = (iso, recurring) => {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (recurring) {
    let years = today.getFullYear() - y;
    let next = new Date(today.getFullYear(), mo - 1, d);
    if (next < today) { next = new Date(today.getFullYear() + 1, mo - 1, d); }
    else if (next > today) { years -= 1; }
    const days = Math.round((next - today) / 86400000);
    const marking = years + 1; // the upcoming occurrence's count
    return { recurring: true, days, years: marking };
  }
  const target = new Date(y, mo - 1, d);
  const days = Math.round((target - today) / 86400000);
  return { recurring: false, days };
};
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
// First letter of each word in a label — used by the mobile RoleBadge so the
// compact badges fit on narrow rows. "Private Client" → "PC", "TT Prospect" →
// "TP" (digits/letters from each word's first character), "Student" → "S".
const labelAbbrev = (label) => String(label || '').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase();
const today = () => new Date().toISOString().slice(0,10);
const primaryRole = p => (p.roles && p.roles[0]) || 'other';
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
  // monthly_unlimited never depletes; drop_in is a single paid session (count = totalSessions, typically 1)
  if(pk.type === 'monthly_unlimited') return Infinity;
  return Math.max(0, (pk.totalSessions||0) - packageUsageCount(pk, attendance));
};
// Types that don't show a session-count / depletion UI:
//   drop_in = single session (no countdown), monthly_unlimited = never depletes.
const isCountlessPkg = (type) => type === 'drop_in' || type === 'monthly_unlimited';
const packagePerSessionValue = (pk, attendance) => {
  if(!pk) return 0;
  if(pk.type === 'monthly_unlimited') {
    const used = (attendance || []).filter(a => a.packageId === pk.id && a.paymentStatus === 'package').length;
    return used > 0 ? (pk.amountPaid || 0) / used : 0;
  }
  if(!pk.totalSessions || pk.totalSessions <= 0) return 0;
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
      if(pk) total += packagePerSessionValue(pk, attendance);
    }
  });
  return total;
};
const addDays = (dateStr, n) => { const d = new Date(dateStr+'T12:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
// addMonths: calendar-month add (clamps to month length, e.g. Jan 31 +1mo → Feb 28).
const addMonths = (dateStr, n) => { const d = new Date(dateStr+'T12:00'); const day=d.getDate(); d.setMonth(d.getMonth()+n); if(d.getDate()<day) d.setDate(0); return d.toISOString().slice(0,10); };
// ─── Derived activity (bookings + payments) ───────────────────────────────────
// Bookings and payments already live in the system as attendance rows and
// packages — they are NOT separate interaction records. Rather than dual-writing
// duplicate rows into `interactions` (which would need backfilling and create a
// permanent sync burden), we SYNTHESISE interaction-shaped rows from the
// existing data at read time. The Recent Activity feed and the Payments tab
// merge these with the real interactions; everything sorts together by date.
//
// This means every booking/payment ever entered shows up immediately with no
// migration. When Phase 7 Stripe lands, those external events DO write real
// interaction rows (they have no attendance row otherwise) and merge in
// seamlessly alongside these derived ones.
//
// Each derived row mirrors the note/interaction shape enough for the feed:
//   { id, kind, date, personId, classId, text, subject, _derived:true, ... }
// `_derived` marks them so UI can avoid offering note-only actions (edit,
// delete, mark-important) on rows that aren't real interactions.
//
// Booking rows are COMBINED: one row per attendance, showing the booking plus
// how it was paid (drop-in £, package deduction, or unpaid). Package purchases
// are their own payment rows, dated to datePurchased.

// Human-readable payment descriptor for one attendance row.
const attendancePayLabel = (a, packages) => {
  if (a.paymentStatus === 'paid') {
    return a.paidAmount != null ? `paid ${fmtMoney(a.paidAmount)} drop-in` : 'paid drop-in';
  }
  if (a.paymentStatus === 'package' && a.packageId) {
    const pk = packages.find(p => p.id === a.packageId);
    return pk ? `1 session from ${pk.name}` : '1 session from package';
  }
  return 'unpaid';
};

// Booking events — one combined row per attendance row. Dated to the class date.
const deriveBookings = (attendance, classes, packages) =>
  attendance.map(a => {
    const cls = classes.find(c => c.id === a.classId);
    if (!cls) return null; // orphan attendance (class deleted) — skip
    const pay = attendancePayLabel(a, packages);
    return {
      id: `bk_${a.id}`,
      kind: 'booking',
      date: cls.date,
      personId: a.personId,
      classId: a.classId,
      subject: cls.name,
      text: `Booked into ${cls.name} — ${pay}${a.attended === false ? ' · did not attend' : ''}.`,
      _derived: true,
      _payStatus: a.paymentStatus || 'unpaid',
      _attended: a.attended,
    };
  }).filter(Boolean);

// Payment events — package PURCHASES (lump sums). Drop-in payments are already
// surfaced inside their booking row above, so we don't double-count them here;
// the Payments tab composes its own fuller list separately (see PersonDetail).
const derivePackagePurchases = (packages) =>
  packages.filter(pk => pk.datePurchased).map(pk => ({
    id: `pay_pkg_${pk.id}`,
    kind: 'payment',
    date: pk.datePurchased,
    personId: pk.personId,
    classId: null,
    subject: pk.name,
    text: `Purchased ${pk.name}${pk.amountPaid ? ` — ${fmtMoney(pk.amountPaid)}` : ''}${pk.paidVia && pk.paidVia!=='other' ? ` (${pk.paidVia})` : ''}.`,
    _derived: true,
  }));

// All derived activity for the global Recent Activity feed: bookings + package
// purchases. (Drop-in payments live inside their booking rows.)
const deriveActivity = (attendance, classes, packages) => [
  ...deriveBookings(attendance, classes, packages),
  ...derivePackagePurchases(packages),
];

// ─── Web Activity ────────────────────────────────────────────────────────────
// Real (non-derived) interaction rows minted by the website pipeline: booking
// reservations from the form worker (source='form', kind='booking') and, later,
// card payments from the Stripe worker (source='stripe'). Distinct from the
// Recent Activity feed (which is mostly deriveActivity register entries) and
// from Inbox (unlinked inbound comms). Unread state reuses interactions.read_at
// — the same column Threads uses — so "seen on one machine" clears everywhere.
const WEB_EVENT_SOURCES = ['form', 'stripe'];
const isWebEvent = (n) =>
  !n._derived && WEB_EVENT_SOURCES.includes(n.source) && n.direction !== 'outbound';
const webEvents = (notes) =>
  notes.filter(isWebEvent).sort((a, b) =>
    (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
const webUnreadCount = (notes) => notes.filter(n => isWebEvent(n) && !n.readAt).length;

// UK convention: weeks run Monday–Sunday. Returns the Monday of the week containing dateStr.
const startOfWeek = (dateStr) => {
  const d = new Date(dateStr+'T12:00');
  const dow = d.getDay(); // 0=Sun, 1=Mon, … 6=Sat
  const offset = dow === 0 ? -6 : 1 - dow; // distance back to Monday
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0,10);
};
const endOfWeek = (dateStr) => addDays(startOfWeek(dateStr), 6);
const lastDayOfMonth = (dateStr) => {
  const d = new Date(dateStr+'T12:00');
  const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return last.toISOString().slice(0,10);
};
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

// HTML escape for safe injection into the printable invoice template
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Renders the printable invoice HTML body — used by the inline print overlay.
// Sandboxed iframes (e.g. Claude artifacts) often block window.open / popups,
// so we render this directly into the page and use print CSS to isolate it.
const renderPrintableInvoice = (inv, org) => {
  const itemsHtml = (inv.lineItems||[]).map(li => `
    <tr>
      <td>${escHtml(li.description)}</td>
      <td class="num">${li.qty}</td>
      <td class="num">£${(li.rate||0).toFixed(2)}</td>
      <td class="num bold">£${((li.qty||1)*(li.rate||0)).toFixed(2)}</td>
    </tr>`).join('');
  return `
  <div class="invoice-print-page">
    <div class="head">
      <div>
        <div class="brand">The Felt Body</div>
        <div class="tagline">Somatic movement</div>
      </div>
      <div>
        <div class="invtitle">Invoice</div>
        <div class="invnum">${escHtml(inv.invoiceNumber)}</div>
        <div class="meta">Issued: ${fmt(inv.issueDate)}</div>
        <div class="meta">Due: ${fmt(inv.dueDate)}</div>
      </div>
    </div>
    <div class="billto">
      <div class="label">Billed to</div>
      <div class="org-name">${escHtml(org?.name || '—')}</div>
      ${org?.address ? `<div class="org-meta">${escHtml(org.address)}</div>` : ''}
      ${org?.contactName ? `<div class="org-meta">Attn: ${escHtml(org.contactName)}</div>` : ''}
      ${org?.email ? `<div class="org-meta">${escHtml(org.email)}</div>` : ''}
    </div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Rate</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="total-row"><div class="total">Total: £${(inv.total||0).toFixed(2)}</div></div>
    <div class="pay-block">
      <h3>Payment — Bank Transfer</h3>
      <div class="pay-row"><span class="lbl">Account name</span><span class="val">${escHtml(BANK_DETAILS.accountName)}</span></div>
      <div class="pay-row"><span class="lbl">Bank</span><span class="val">${escHtml(BANK_DETAILS.bank)}</span></div>
      <div class="pay-row"><span class="lbl">Sort code</span><span class="val mono">${escHtml(BANK_DETAILS.sortCode)}</span></div>
      <div class="pay-row"><span class="lbl">Account number</span><span class="val mono">${escHtml(BANK_DETAILS.accountNumber)}</span></div>
      <div class="pay-row"><span class="lbl">Reference</span><span class="val mono">${escHtml(inv.invoiceNumber)}</span></div>
    </div>
    ${inv.notes ? `<div class="notes">${escHtml(inv.notes)}</div>` : ''}
    <div class="footer">Thank you</div>
  </div>`;
};

// Stylesheet for the print overlay. Hides everything except the overlay during print.
const PRINT_INVOICE_STYLES = `
  .invoice-print-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 24px; }
  .invoice-print-shell { background: #fff; color: #1f2a22; font-family: 'Jost', sans-serif; max-width: 760px; width: 100%; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); overflow: hidden; line-height: 1.5; }
  .invoice-print-toolbar { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px; background: #f5f3ee; border-bottom: 1px solid #ece8de; }
  .invoice-print-toolbar button { font-family: 'Jost', sans-serif; font-size: 13px; padding: 8px 18px; border-radius: 6px; cursor: pointer; border: none; }
  .invoice-print-toolbar .primary { background: #1a3a25; color: #fff; }
  .invoice-print-toolbar .secondary { background: #fff; color: #1f2a22; border: 1px solid #d8d2c0; }
  .invoice-print-page { padding: 40px 36px; }
  .invoice-print-page .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #c9a84c; padding-bottom: 22px; margin-bottom: 32px; }
  .invoice-print-page .brand { font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 600; color: #1a3a25; line-height: 1; }
  .invoice-print-page .tagline { font-size: 10px; letter-spacing: 2.5px; color: #698a78; text-transform: uppercase; margin-top: 6px; }
  .invoice-print-page .invtitle { font-size: 11px; letter-spacing: 2px; color: #698a78; text-transform: uppercase; text-align: right; }
  .invoice-print-page .invnum { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 600; color: #1a3a25; text-align: right; margin-top: 4px; }
  .invoice-print-page .meta { color: #698a78; font-size: 12px; text-align: right; margin-top: 4px; }
  .invoice-print-page .billto { margin-bottom: 30px; }
  .invoice-print-page .label { font-size: 10px; letter-spacing: 1.5px; color: #698a78; margin-bottom: 6px; text-transform: uppercase; font-weight: 500; }
  .invoice-print-page .org-name { font-family: 'Cormorant Garamond', serif; font-size: 22px; color: #1a3a25; font-weight: 600; }
  .invoice-print-page .org-meta { color: #698a78; font-size: 13px; margin-top: 2px; }
  .invoice-print-page table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .invoice-print-page th { background: #f5f3ee; padding: 10px 12px; text-align: left; font-size: 10px; letter-spacing: 1.2px; color: #698a78; font-weight: 600; text-transform: uppercase; }
  .invoice-print-page th.num, .invoice-print-page td.num { text-align: right; }
  .invoice-print-page td { padding: 4px 12px; border-bottom: 1px solid #ece8de; font-size: 13px; color: #1f2a22; }
  .invoice-print-page td.bold { color: #1a3a25; font-weight: 600; }
  .invoice-print-page .total-row { display: flex; justify-content: flex-end; padding: 16px 12px 0; }
  .invoice-print-page .total-row .total { font-family: 'Cormorant Garamond', serif; font-size: 26px; color: #1a3a25; font-weight: 600; }
  .invoice-print-page .pay-block { background: #faf8f3; border: 1px solid #e8e2d0; padding: 20px 24px; border-radius: 6px; margin-top: 32px; }
  .invoice-print-page .pay-block h3 { font-size: 10px; letter-spacing: 2px; color: #1a3a25; margin: 0 0 14px; text-transform: uppercase; font-weight: 600; }
  .invoice-print-page .pay-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
  .invoice-print-page .pay-row .lbl { color: #698a78; }
  .invoice-print-page .pay-row .val { color: #1f2a22; font-weight: 500; }
  .invoice-print-page .pay-row .val.mono { font-family: 'Courier New', monospace; letter-spacing: 0.5px; }
  .invoice-print-page .notes { color: #698a78; font-size: 13px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #ece8de; font-style: italic; }
  .invoice-print-page .footer { text-align: center; color: #b8b4a8; font-size: 10px; margin-top: 50px; letter-spacing: 2px; text-transform: uppercase; }
  @media print {
    /* Hide everything except the printable invoice page during printing */
    body * { visibility: hidden !important; }
    .invoice-print-overlay, .invoice-print-overlay * { visibility: visible !important; }
    .invoice-print-overlay { position: absolute !important; inset: 0 !important; padding: 0 !important; background: #fff !important; overflow: visible !important; }
    .invoice-print-shell { box-shadow: none !important; border-radius: 0 !important; max-width: none !important; width: 100% !important; }
    .invoice-print-toolbar { display: none !important; }
    @page { margin: 15mm; size: A4; }
  }
`;

// Build a complete standalone HTML document for the invoice — used by both
// the iframe-based print and the download fallback. Self-contained so it
// renders correctly when opened separately.
const buildStandaloneInvoiceHtml = (inv, org) => {
  const bodyHtml = renderPrintableInvoice(inv, org);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escHtml(inv.invoiceNumber)} — The Felt Body</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Jost', sans-serif; color: #1f2a22; margin: 0; padding: 20px; background: #fff; line-height: 1.5; }
  .invoice-print-page { padding: 40px 36px; max-width: 760px; margin: 0 auto; background: #fff; }
  .invoice-print-page .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #c9a84c; padding-bottom: 22px; margin-bottom: 32px; }
  .invoice-print-page .brand { font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 600; color: #1a3a25; line-height: 1; }
  .invoice-print-page .tagline { font-size: 10px; letter-spacing: 2.5px; color: #698a78; text-transform: uppercase; margin-top: 6px; }
  .invoice-print-page .invtitle { font-size: 11px; letter-spacing: 2px; color: #698a78; text-transform: uppercase; text-align: right; }
  .invoice-print-page .invnum { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 600; color: #1a3a25; text-align: right; margin-top: 4px; }
  .invoice-print-page .meta { color: #698a78; font-size: 12px; text-align: right; margin-top: 4px; }
  .invoice-print-page .billto { margin-bottom: 30px; }
  .invoice-print-page .label { font-size: 10px; letter-spacing: 1.5px; color: #698a78; margin-bottom: 6px; text-transform: uppercase; font-weight: 500; }
  .invoice-print-page .org-name { font-family: 'Cormorant Garamond', serif; font-size: 22px; color: #1a3a25; font-weight: 600; }
  .invoice-print-page .org-meta { color: #698a78; font-size: 13px; margin-top: 2px; }
  .invoice-print-page table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .invoice-print-page th { background: #f5f3ee; padding: 10px 12px; text-align: left; font-size: 10px; letter-spacing: 1.2px; color: #698a78; font-weight: 600; text-transform: uppercase; }
  .invoice-print-page th.num, .invoice-print-page td.num { text-align: right; }
  .invoice-print-page td { padding: 11px 12px; border-bottom: 1px solid #ece8de; font-size: 13px; color: #1f2a22; }
  .invoice-print-page td.bold { color: #1a3a25; font-weight: 600; }
  .invoice-print-page .total-row { display: flex; justify-content: flex-end; padding: 16px 12px 0; }
  .invoice-print-page .total-row .total { font-family: 'Cormorant Garamond', serif; font-size: 26px; color: #1a3a25; font-weight: 600; }
  .invoice-print-page .pay-block { background: #faf8f3; border: 1px solid #e8e2d0; padding: 20px 24px; border-radius: 6px; margin-top: 32px; }
  .invoice-print-page .pay-block h3 { font-size: 10px; letter-spacing: 2px; color: #1a3a25; margin: 0 0 14px; text-transform: uppercase; font-weight: 600; }
  .invoice-print-page .pay-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
  .invoice-print-page .pay-row .lbl { color: #698a78; }
  .invoice-print-page .pay-row .val { color: #1f2a22; font-weight: 500; }
  .invoice-print-page .pay-row .val.mono { font-family: 'Courier New', monospace; letter-spacing: 0.5px; }
  .invoice-print-page .notes { color: #698a78; font-size: 13px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #ece8de; font-style: italic; }
  .invoice-print-page .footer { text-align: center; color: #b8b4a8; font-size: 10px; margin-top: 50px; letter-spacing: 2px; text-transform: uppercase; }
  @media print { body { padding: 0; } @page { margin: 15mm; size: A4; } }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
};

// Download the invoice as a self-contained HTML file. This is the most reliable
// path in sandboxed iframes (Claude artifacts) — file downloads aren't blocked
// the way window.open / window.print can be. User opens the file in their browser
// and uses File → Print → Save as PDF.
const downloadInvoiceHtml = (inv, org) => {
  try {
    const html = buildStandaloneInvoiceHtml(inv, org);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice ${inv.invoiceNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch (e) {
    return false;
  }
};

// Render the invoice as an inline overlay with two action buttons:
// Print (uses a hidden iframe — more reliable than window.print() in sandboxed contexts)
// and Download (always works — gives user an HTML file they can print from their browser).
function PrintInvoiceOverlay({ inv, org, onClose }) {
  const html = useMemo(() => renderPrintableInvoice(inv, org), [inv, org]);
  const [printStatus, setPrintStatus] = useState(null); // null | 'trying' | 'failed'

  // Print via a hidden iframe. The iframe gets its own document, so calling
  // print() on its contentWindow scope is more sandbox-friendly than window.print().
  const handlePrint = () => {
    setPrintStatus('trying');
    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      document.body.appendChild(iframe);
      const fullHtml = buildStandaloneInvoiceHtml(inv, org);
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(fullHtml);
      doc.close();
      const cleanup = () => { try { document.body.removeChild(iframe); } catch(e){} };
      const tryPrint = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setPrintStatus(null);
          setTimeout(cleanup, 1500);
        } catch (e) {
          // Print blocked — let the user know to use Download instead
          setPrintStatus('failed');
          cleanup();
        }
      };
      // Wait for the iframe to load (fonts/layout) before triggering print
      iframe.onload = tryPrint;
      // Safety net in case onload doesn't fire (cached / sync write)
      setTimeout(() => { if(printStatus !== null) tryPrint(); }, 500);
    } catch (e) {
      setPrintStatus('failed');
    }
  };

  const handleDownload = () => {
    const ok = downloadInvoiceHtml(inv, org);
    if(!ok) setPrintStatus('failed');
  };

  return (
    <>
      <style>{PRINT_INVOICE_STYLES}</style>
      <div className="invoice-print-overlay" onClick={onClose}>
        <div className="invoice-print-shell" onClick={e => e.stopPropagation()}>
          <div className="invoice-print-toolbar">
            {printStatus === 'failed' && (
              <span style={{color:'#c97070',fontSize:12,marginRight:'auto',alignSelf:'center'}}>
                Print blocked here — try Download instead.
              </span>
            )}
            <button className="secondary" onClick={handleDownload}>↓ Download HTML</button>
            <button className="primary" onClick={handlePrint}>🖨 Print / Save as PDF</button>
            <button className="secondary" onClick={onClose}>Close</button>
          </div>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </>
  );
}

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

// Generate recurring class instances from a series definition. No local id —
// caller passes these to data.classes.createMany() which gets DB-assigned UUIDs.
const generateSeriesClasses = (series, count=12) => {
  const step = { weekly:7, biweekly:14, monthly:30 }[series.recurrence] || 7;
  return Array.from({length:count}, (_,i) => ({
    name: series.name,
    date: addDays(series.startDate, i * step),
    time: series.time || '',
    duration: series.duration || 60,
    location: series.location,
    orgId: series.orgId,
    seriesId: series.id,
    rate: series.rate || 0,
    paymentModel: series.paymentModel || 'per_person',
    isBookable: series.isBookable ?? false,
    capacity: series.capacity ?? null,
    publicBlurb: series.publicBlurb || '',
    joinUrl: series.joinUrl || '',
    bookingInfo: series.bookingInfo || '',
  }));
};

// ─── MICRO COMPONENTS ─────────────────────────────────────────────────────────
const RoleBadge = ({ role, compact }) => {
  const { personRoles } = useTypes();
  const m = personRoles[role] || PERSON_ROLES[role] || { label:role, color:C.muted, bg:C.surf };
  const text = compact ? labelAbbrev(m.label) : m.label;
  return <span title={compact ? m.label : undefined} style={{background:m.bg,color:m.color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{text}</span>;
};
const OrgBadge = ({ type }) => {
  const { orgTypes } = useTypes();
  const m = orgTypes[type] || ORG_META[type] || { label:type, color:C.muted, bg:C.surf };
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
  const { personRoles } = useTypes();
  const meta = personRoles[role] || PERSON_ROLES[role];
  const color = meta?.color || C.green;
  const bg = meta?.bg || '#132413';
  return <div style={{width:size,height:size,borderRadius:'50%',background:bg,border:`1.5px solid ${color}`,display:'flex',alignItems:'center',justifyContent:'center',color,fontSize:size*0.36,fontWeight:600,flexShrink:0}}>{initials(name)}</div>;
};
const NoteCard = ({ note, onToggleImportant, onClearAction, onReopenNote, onUpdateActionDate, onDelete, onClick, highlight, dimReason }) => {
  const [editingDate, setEditingDate] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Auto-disarm the delete-confirm if user looks away
  useEffect(()=>{
    if(!confirmingDelete) return;
    const id = setTimeout(()=>setConfirmingDelete(false), 4000);
    return ()=>clearTimeout(id);
  }, [confirmingDelete]);
  const completed = !!note.completed;
  const overdue = !completed && note.actionDate && note.actionDate < today();
  const dueToday = !completed && note.actionDate === today();
  const accent = completed ? C.muted : overdue?C.red:dueToday?C.gold:C.blue;
  // Snooze pushes the action forward from the later of (current actionDate, today).
  const snooze = (days) => {
    if(!onUpdateActionDate) return;
    const base = note.actionDate && note.actionDate >= today() ? note.actionDate : today();
    onUpdateActionDate(note.id, addDays(base, days));
  };
  // Completed-note styling: darker background and dimmer text rather than strikethrough,
  // so the content stays readable while clearly signalling it's done.
  const cardBg = completed ? C.bg : (note.important ? C.goldBg : C.card);
  const textColor = completed ? C.muted : C.text;
  return (
    <div data-note-id={note.id}
      onClick={onClick}
      style={{
        background: cardBg,
        borderLeft: `3px solid ${completed ? C.border : note.important?C.gold:C.border}`,
        borderRadius:'0 6px 6px 0',
        padding:'10px 14px',
        marginBottom:8,
        cursor: onClick?'pointer':'default',
        boxShadow: highlight?`0 0 0 2px ${C.gold}`:'none',
        transition: 'box-shadow 0.4s ease, background 0.2s, color 0.2s',
        // Leaves room for the sticky PageHead so a scrolled-to note never
        // tucks under it. Harmless on views without a sticky header.
        scrollMarginTop: 90,
      }
      }>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap'}}>
        {(() => {
          const k = INTERACTION_KINDS[note.kind] || INTERACTION_KINDS.note;
          return (
            <span title={k.label} style={{fontSize:13,lineHeight:1,opacity:0.85}}>
              {k.icon}
            </span>
          );
        })()}
        {note.important && !completed && (
          <span style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'1px'}}>⚑ IMPORTANT</span>
        )}
      </div>
      
      <div style={{color:textColor,fontSize:14,lineHeight:1.7,opacity:completed?0.75:1}}>{note.text}</div>
      {note.actionDate && (
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:9,flexWrap:'wrap'}} onClick={e=>e.stopPropagation()}>
          {editingDate && onUpdateActionDate && !completed ? (
            <>
              <input type="date" value={note.actionDate}
                onChange={e=>{ if(e.target.value) onUpdateActionDate(note.id, e.target.value); }}
                onBlur={()=>setEditingDate(false)}
                autoFocus
                style={{background:C.surf,border:`1px solid ${accent}66`,borderRadius:4,color:C.text,fontSize:12,padding:'3px 8px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
              <button onClick={()=>setEditingDate(false)} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:11,fontFamily:"'Jost',sans-serif"}}>done</button>
            </>
          ) : (
            <span
              onClick={()=>!completed && onUpdateActionDate && setEditingDate(true)}
              title={(!completed && onUpdateActionDate) ? 'Click to change date' : ''}
              style={{
                background: completed ? C.surf : overdue?'#2a1313':dueToday?'#2a2113':'#131d2a',
                color: accent,
                border: `1px solid ${accent}55`,
                fontSize:11,fontWeight:500,padding:'2px 9px',borderRadius:20,letterSpacing:'0.3px',
                display:'inline-flex',alignItems:'center',gap:5,
                cursor: (!completed && onUpdateActionDate) ? 'pointer' : 'default'}}>
              {completed
                ? `✓ Completed${note.completedAt?` · ${fmt(note.completedAt)}`:''}`
                : `🗓 ${overdue?'Overdue':dueToday?'Action today':'Action by'} · ${fmt(note.actionDate)}`}
            </span>
          )}
          {!completed && onUpdateActionDate && !editingDate && (
            <>
              <button onClick={()=>snooze(7)} title="Push out 1 week"
                style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 7px',fontFamily:"'Jost',sans-serif"}}>+1w</button>
              <button onClick={()=>snooze(30)} title="Push out 1 month"
                style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 7px',fontFamily:"'Jost',sans-serif"}}>+1m</button>
            </>
          )}
          {!completed && onClearAction && !editingDate && (
            <button onClick={()=>onClearAction(note.id)}
              style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif"}}>
              ✓ Done
            </button>
          )}
          {completed && onReopenNote && (
            <button onClick={()=>onReopenNote(note.id)}
              style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif"}}>
              ↺ Reopen
            </button>
          )}
        </div>
      )}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6,gap:8}}>
        <div style={{color:C.muted,fontSize:12}}>{fmt(note.date)}</div>
        <div style={{display:'flex',alignItems:'center',gap:6}} onClick={e=>e.stopPropagation()}>
          {/* Subtle delete: a small × that arms on first click, deletes on second.
              Sandbox-safe (no native confirm). Quietly low-contrast so it doesn't shout. */}
          {onDelete && !confirmingDelete && (
            <button onClick={()=>setConfirmingDelete(true)}
              title="Delete note"
              style={{background:'none',border:'none',color:C.muted,cursor:'pointer',padding:'2px 6px',fontSize:14,opacity:0.4,fontFamily:"'Jost',sans-serif",lineHeight:1,transition:'opacity 0.15s'}}
              onMouseEnter={e=>e.currentTarget.style.opacity=0.9}
              onMouseLeave={e=>e.currentTarget.style.opacity=0.4}>
              ×
            </button>
          )}
          {onDelete && confirmingDelete && (
            <>
              <button onClick={()=>setConfirmingDelete(false)}
                style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:3,fontSize:10,padding:'1px 6px',fontFamily:"'Jost',sans-serif",lineHeight:1.2}}>cancel</button>
              <button onClick={()=>{ setConfirmingDelete(false); onDelete(note.id); }}
                style={{background:'#2a1313',border:`1px solid ${C.red}66`,color:C.red,cursor:'pointer',borderRadius:3,fontSize:10,padding:'1px 6px',fontFamily:"'Jost',sans-serif",lineHeight:1.2,fontWeight:600}}>delete</button>
            </>
          )}
          {onToggleImportant && !completed && (
            <button onClick={e=>{e.stopPropagation();onToggleImportant(note.id);}}
              title={note.important?'Unflag (no longer pressing)':'Flag as important'}
              style={{background:'none',border:`1px solid ${note.important?C.gold+'88':C.border}`,color:note.important?C.gold:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.4px'}}>
              {note.important?'⚑ Unflag':'⚐ Flag'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
const SourceTag = ({ source }) => {
  if(!source?.channel) return null;
  const s = SOURCES[source.channel] || { label:source.channel, icon:'◇' };
  return <div style={{display:'flex',alignItems:'center',gap:4}}><span style={{color:C.muted,fontSize:11}}>{s.icon}</span><span style={{color:C.muted,fontSize:12}}>{s.label}{source.detail ? ` — ${source.detail}` : ''}</span></div>;
};
const Btn = ({ onClick, children, variant='primary', small, disabled }) => {
  const v = { primary:{background:C.gold,color:'#0a1408',border:'none'}, secondary:{background:C.card,color:C.text,border:`1px solid ${C.border}`}, ghost:{background:'none',color:C.muted,border:`1px solid ${C.border}`}, danger:{background:'#2a1313',color:C.red,border:`1px solid ${C.red}44`} };
  return <button onClick={onClick} disabled={disabled} style={{...v[variant],cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.5:1,borderRadius:6,fontFamily:"'Jost',sans-serif",fontSize:small?12:14,fontWeight:500,padding:small?'5px 12px':'8px 18px'}}>{children}</button>;
};

// Two-step confirm button. First click reveals confirm/cancel pair; second click on confirm fires onConfirm.
// We use this instead of window.confirm() because sandboxed iframes (e.g. Claude artifacts) silently block native dialogs.
// `armedLabel` is shown only after the first click; `idleLabel` is the resting state.
const ConfirmBtn = ({ onConfirm, idleLabel, armedLabel='Confirm?', cancelLabel='Cancel', variant='danger', small=true, title }) => {
  const [armed, setArmed] = useState(false);
  // Auto-disarm after a few seconds of no interaction so the button doesn't sit in armed state forever
  useEffect(()=>{
    if(!armed) return;
    const id = setTimeout(()=>setArmed(false), 4000);
    return ()=>clearTimeout(id);
  }, [armed]);
  if(!armed) {
    return <Btn variant={variant} small={small} onClick={(e)=>{ e.stopPropagation(); setArmed(true); }} title={title}>{idleLabel}</Btn>;
  }
  return (
    <span style={{display:'inline-flex',gap:6,alignItems:'center'}} onClick={e=>e.stopPropagation()}>
      <Btn variant="ghost" small={small} onClick={()=>setArmed(false)}>{cancelLabel}</Btn>
      <Btn variant={variant} small={small} onClick={()=>{ setArmed(false); onConfirm(); }}>{armedLabel}</Btn>
    </span>
  );
};
const Stat = ({ label, value, sub }) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'16px 20px'}}>
    <div style={{color:C.muted,fontSize:11,letterSpacing:'0.5px',marginBottom:6}}>{label}</div>
    <div style={{color:C.text,fontSize:30,fontWeight:600,fontFamily:"'Cormorant Garamond',serif",lineHeight:1}}>{value}</div>
    {sub && <div style={{color:C.muted,fontSize:12,marginTop:5}}>{sub}</div>}
  </div>
);
const Row = ({ onClick, children, style }) => (
  <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 20px',borderBottom:`1px solid ${C.border}`,cursor:onClick?'pointer':'default',...(style||{})}}
    onMouseEnter={e=>{if(onClick)e.currentTarget.style.background=C.active}}
    onMouseLeave={e=>{e.currentTarget.style.background=(style&&style.background)||'transparent'}}>
    {children}
  </div>
);
const Empty = ({ text, action, onAction }) => (
  <div style={{textAlign:'center',padding:'48px 20px',color:C.muted,fontSize:14}}>
    {text}{action && <><span> </span><span style={{color:C.gold,cursor:'pointer'}} onClick={onAction}>{action}</span></>}
  </div>
);
const PageHead = ({ back, onBack, children, action, sticky, subInfo }) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileHeader back={back} onBack={onBack} action={action} subInfo={subInfo}>{children}</MobileHeader>;
  }
  return (
    <div style={{
      display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28,
      ...(sticky ? {
        // Pin the header (back button + title + actions) to the top of the
        // scroll container so it stays reachable on long pages — e.g. a contact
        // with a deep notes history reached via a highlighted note. Negative
        // top margin + matching padding absorbs the wrapper's top padding so the
        // header sits flush at the top edge when stuck. zIndex keeps it above
        // scrolling cards; the bg + border give it a clean edge.
        position:'sticky', top:0, zIndex:5,
        background:C.bg, marginTop:-32, paddingTop:18, paddingBottom:14,
        borderBottom:`1px solid ${C.border}`,
      } : {}),
    }}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        {back && <button onClick={onBack} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',padding:'5px 11px',borderRadius:6,fontSize:13}}>← {back}</button>}
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,color:C.text,letterSpacing:'-0.5px',margin:0}}>{children}</h1>
      </div>
      <div style={{display:'flex',gap:8}}>{action}</div>
    </div>
  );
};

// ─── MOBILE HEADER ────────────────────────────────────────────────────────────
// Two-row sticky header used on all views when viewport ≤ 767px.
//
//   Row 1 (always present):
//     [☰ hamburger] [Title] ............................... [⇕ expand toggle]
//
//   Row 2 (sub-header, only when there's something to show):
//     [← back] ........................ [subInfo (e.g. date)] [actions]
//
// The expand toggle only renders when the current view registers
// `showExpandToggle: true` via MobileUIContext (currently Dashboard only).
// In contracted mode the accordion shows one open section at a time; in
// expanded mode all sections open and the page scrolls normally.
const MobileHeader = ({ back, onBack, children, action, subInfo }) => {
  const { onMobileNavOpen, expandAll, setExpandAll, showExpandToggle } = useMobileUI();
  const hasSubRow = back || subInfo || action;
  return (
    <div style={{
      position:'sticky', top:0, zIndex:6,
      background:C.bg,
      marginTop:-12, marginLeft:-12, marginRight:-12, marginBottom:14,
      borderBottom:`1px solid ${C.border}`,
    }}>
      {/* Row 1: hamburger + title + expand toggle */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'10px 14px 8px',minHeight:48}}>
        <button onClick={onMobileNavOpen}
          aria-label="Open navigation menu"
          style={{background:'none',border:'none',color:C.text,cursor:'pointer',fontSize:22,padding:'4px 8px',lineHeight:1,flexShrink:0}}>
          ☰
        </button>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,letterSpacing:'-0.3px',margin:0,flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {children}
        </h1>
        {showExpandToggle && (
          <button onClick={()=>setExpandAll(v=>!v)}
            title={expandAll ? 'Collapse — pin section titles to screen' : 'Expand — show all sections, scroll page'}
            aria-label={expandAll ? 'Collapse all sections' : 'Expand all sections'}
            style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'5px 10px',lineHeight:1,flexShrink:0,fontFamily:"'Jost',sans-serif"}}>
            {expandAll ? '⤓' : '⤒'}
          </button>
        )}
      </div>
      {/* Row 2: sub-header — back / info / action */}
      {hasSubRow && (
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 14px 10px',borderTop:`1px solid ${C.border}44`,flexWrap:'wrap'}}>
          {back ? (
            <button onClick={onBack} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',padding:'4px 9px',borderRadius:6,fontSize:12,fontFamily:"'Jost',sans-serif",flexShrink:0}}>
              ← {back}
            </button>
          ) : <div />}
          <div style={{flex:1}} />
          {subInfo && <div style={{color:C.muted,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0}}>{subInfo}</div>}
          {action && <div style={{display:'flex',gap:6,flexShrink:0}}>{action}</div>}
        </div>
      )}
    </div>
  );
};
const Tabs = ({ tabs, active, onChange }) => (
  <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:20}}>
    {tabs.map(t=>(
      <button key={t.id} onClick={()=>onChange(t.id)} style={{background:'none',border:'none',borderBottom:`2px solid ${active===t.id?C.gold:'transparent'}`,color:active===t.id?C.text:C.muted,cursor:'pointer',padding:'8px 18px',fontSize:14,fontWeight:active===t.id?500:400,fontFamily:"'Jost',sans-serif",marginBottom:-1}}>
        {t.label}
      </button>
    ))}
  </div>
);

// Mobile variant of Tabs. Each tab carries an `icon`, a short `name`, and a
// `count`. Unselected tabs show just icon + count to stay narrow; the selected
// tab also shows its name. All tabs share the row equally (flex:1) so four sit
// comfortably across a phone width. The bar is sticky so it stays reachable as
// the tab body scrolls. `topOffset` accounts for any sticky PageHead above it.
const MobileTabBar = ({ tabs, active, onChange, topOffset=0 }) => (
  <div style={{position:'sticky',top:topOffset,zIndex:5,background:C.bg,display:'flex',gap:6,padding:'8px 0 10px',marginBottom:14,borderBottom:`1px solid ${C.border}`}}>
    {tabs.map(t=>{
      const on = active===t.id;
      return (
        <button key={t.id} onClick={()=>onChange(t.id)} title={t.name}
          style={{flex:1,minWidth:0,display:'flex',alignItems:'center',justifyContent:'center',gap:5,
            background:on?C.goldBg:'transparent',color:on?C.gold:C.muted,
            border:`1px solid ${on?C.gold+'88':C.border}`,borderRadius:6,
            padding:'7px 6px',cursor:'pointer',fontFamily:"'Jost',sans-serif",
            fontSize:12,fontWeight:on?600:500,lineHeight:1,overflow:'hidden'}}>
          <span style={{fontSize:13,lineHeight:1,flexShrink:0}}>{t.icon}</span>
          {on && <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.name}</span>}
          <span style={{opacity:0.7,fontSize:11,flexShrink:0}}>{t.count}</span>
        </button>
      );
    })}
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
const Modal = ({ title, onClose, children, wide, xwide, topAlign }) => (
  <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:topAlign?'flex-start':'center',justifyContent:'center',zIndex:100,overflowY:'auto'}}>
    <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:12,padding:28,width:xwide?860:wide?580:480,maxHeight:topAlign?'none':'90vh',overflowY:topAlign?'visible':'auto',marginTop:topAlign?16:0}}>
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
      <input
        type={type}
        value={type==='time' ? String(value||'').slice(0,5) : value}
        onChange={e=>onChange(type==='time' ? e.target.value.slice(0,5) : e.target.value)}
        style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}
      />
    )}
  </div>
);

// ─── FORMS ────────────────────────────────────────────────────────────────────
function AddOrgForm({ existing, onSave, onClose, defaultType }) {
  const { orgTypes } = useTypes();
  const [f, setF] = useState(existing || {name:'',type:defaultType||'care_home',address:'',phone:'',email:'',website:'',contactName:'',notes:''});
  const s = k => v => setF(x=>({...x,[k]:v}));
  return (
    <Modal title={existing?`Edit: ${existing.name}`:"Add Organisation"} onClose={onClose}>
      <FI label="NAME" value={f.name} onChange={s('name')} />
      <FI label="TYPE" value={f.type} onChange={s('type')} opts={Object.entries(orgTypes).map(([v,m])=>({v,l:m.label}))} />
      <FI label="ADDRESS" value={f.address} onChange={s('address')} />
      <div style={{display:'flex',gap:12}}><FI label="PHONE" value={f.phone} onChange={s('phone')} half /><FI label="EMAIL" value={f.email} onChange={s('email')} half /></div>
      <FI label="WEBSITE" value={f.website||''} onChange={s('website')} />
      <FI label="CONTACT NAME" value={f.contactName} onChange={s('contactName')} />
      <FI label="NOTES" value={f.notes} onChange={s('notes')} rows={3} />
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(f.name.trim()){onSave(f);onClose();}}}>{existing?'Save Changes':'Add Organisation'}</Btn>
      </div>
    </Modal>
  );
}

function AddPersonForm({ existing, onSave, onClose, orgs, defaultType, defaultOrgId, onEmailAdd, onEmailDelete, onEmailSetPrimary, onAddPersonRole, customPersonRoles: customRolesList=[] }) {
  const { personRoles } = useTypes();
  const [addingRoleType, setAddingRoleType] = useState(false);
  const initRoles = existing?.roles || (defaultType?[defaultType]:['private_client']);
  // Strip `emails` and `email` from form state — managed separately
  const initForm = existing ? (() => { const {emails, email, ...rest} = existing; return rest; })()
    : {name:'',phone:'',website:'',address:'',dateOfBirth:'',orgId:defaultOrgId||'',status:'active',source:{channel:'manual',detail:''},notes:'',defaultSessionRate:'',rateNotes:''};
  const [f, setF] = useState(initForm);
  const [roles, setRoles] = useState(initRoles);
  // Emails: live for edit (server is source of truth), staged for create.
  const [emails, setEmails] = useState(existing?.emails || []);
  const [newEmail, setNewEmail] = useState('');
  const isEdit = !!existing;

  const s = k => v => setF(x=>({...x,[k]:v}));
  const ss = k => v => setF(x=>({...x,source:{...x.source,[k]:v}}));
  const toggleRole = r => setRoles(prev=>prev.includes(r)?prev.filter(x=>x!==r):[...prev,r]);
  const isResident = roles.includes('resident');

  // Residents must be attached to a care home; non-residents can be linked to any org or none.
  useEffect(()=>{
    if(!isResident) return;
    if(!f.orgId) return;
    const o = orgs.find(o=>o.id===f.orgId);
    if(o && o.type!=='care_home') setF(x=>({...x,orgId:''}));
  }, [isResident]); // eslint-disable-line

  const orgOptions = isResident ? orgs.filter(o=>o.type==='care_home') : orgs;
  const noCareHomes = isResident && orgOptions.length===0;
  const canSave = f.name.trim() && roles.length>0 && (!isResident || !!f.orgId);

  // Email handlers — for edit mode, fire to server immediately and update
  // local state on success. For create mode, just stage in local state.
  const addEmail = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    if (emails.some(e => (e.email||'').toLowerCase() === trimmed.toLowerCase())) {
      setNewEmail('');
      return;
    }
    if (isEdit && onEmailAdd) {
      try {
        const saved = await onEmailAdd(existing.id, { email: trimmed, isPrimary: emails.length===0 });
        if (saved) {
          // If we just added a primary, demote the old primary in local state
          setEmails(prev => {
            const next = saved.isPrimary ? prev.map(e => ({...e, isPrimary:false})) : prev.slice();
            return [...next, saved];
          });
          setNewEmail('');
        }
      } catch (e) { /* parent shows error toast */ }
    } else {
      setEmails(prev => [
        ...prev.map(e => ({...e, isPrimary:false})),
        { email: trimmed, isPrimary: emails.length===0, source:'manual' },
      ]);
      setNewEmail('');
    }
  };
  const deleteEmail = async (idx) => {
    const target = emails[idx];
    if (!target) return;
    if (isEdit && onEmailDelete && target.id) {
      try {
        await onEmailDelete(target.id, existing.id);
        // Remove locally; if it was primary, promote the oldest remaining one
        setEmails(prev => {
          const next = prev.filter((_,i) => i !== idx);
          if (target.isPrimary && next.length) next[0] = {...next[0], isPrimary:true};
          return next;
        });
      } catch (e) { /* parent error */ }
    } else {
      setEmails(prev => {
        const next = prev.filter((_,i) => i !== idx);
        if (target.isPrimary && next.length) next[0] = {...next[0], isPrimary:true};
        return next;
      });
    }
  };
  const setPrimary = async (idx) => {
    const target = emails[idx];
    if (!target || target.isPrimary) return;
    if (isEdit && onEmailSetPrimary && target.id) {
      try {
        await onEmailSetPrimary(target.id, existing.id);
        setEmails(prev => prev.map((e,i) => ({...e, isPrimary: i===idx})));
      } catch (e) { /* parent error */ }
    } else {
      setEmails(prev => prev.map((e,i) => ({...e, isPrimary: i===idx})));
    }
  };

  return (
    <Modal title={existing?`Edit: ${existing.name}`:"Add Person"} onClose={onClose} wide>
      <FI label="NAME" value={f.name} onChange={s('name')} />
      <div style={{marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px'}}>ROLES (select all that apply)</div>
          {onAddPersonRole && !addingRoleType && <button onClick={()=>setAddingRoleType(true)} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:11,padding:0,fontFamily:"'Jost',sans-serif"}}>+ New role type</button>}
        </div>
        {addingRoleType && onAddPersonRole && (
          <AddTypeForm kind="person"
            existingKeys={[...Object.keys(PERSON_ROLES), ...customRolesList.map(t=>t.key)]}
            onSave={t => { onAddPersonRole(t).then(saved => { toggleRole(saved.key); }); }}
            onClose={()=>setAddingRoleType(false)} />
        )}
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {Object.entries(personRoles).map(([r,m])=>(
            <button key={r} onClick={()=>toggleRole(r)} style={{background:roles.includes(r)?m.bg:C.surf,border:`1px solid ${roles.includes(r)?m.color:C.border}`,color:roles.includes(r)?m.color:C.muted,cursor:'pointer',borderRadius:20,fontSize:11,fontWeight:600,padding:'4px 12px',textTransform:'uppercase',fontFamily:"'Jost',sans-serif"}}>{m.label}</button>
          ))}
        </div>
        {roles.length===0&&<div style={{color:C.red,fontSize:11,marginTop:6}}>Select at least one role</div>}
      </div>
      <FI label={isResident ? "CARE HOME (required for residents)" : "ORGANISATION (optional)"}
        value={f.orgId} onChange={s('orgId')}
        opts={[
          {v:'',l: isResident ? '— select care home —' : '— none —'},
          ...orgOptions.map(o=>({v:o.id,l:o.name}))
        ]} />
      {noCareHomes && <div style={{color:C.red,fontSize:11,marginTop:-8,marginBottom:14}}>No care homes set up yet — add one first, or pick a different role.</div>}

      {/* Emails (multi) */}
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:6}}>
          EMAILS{isEdit && <span style={{marginLeft:8,fontStyle:'italic',textTransform:'none',letterSpacing:0,color:C.muted+'aa'}}>changes save immediately</span>}
        </div>
        {emails.length > 0 && (
          <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:6}}>
            {emails.map((e,idx) => (
              <div key={e.id || `${e.email}-${idx}`} style={{display:'flex',gap:6,alignItems:'center',padding:'5px 8px',background:C.card,border:`1px solid ${C.border}`,borderRadius:4}}>
                <button onClick={()=>setPrimary(idx)} title={e.isPrimary?'Primary email':'Mark as primary'}
                  style={{background:'none',border:'none',cursor:e.isPrimary?'default':'pointer',color:e.isPrimary?C.gold:C.muted+'88',fontSize:14,padding:0,width:18,lineHeight:1}}>
                  {e.isPrimary ? '★' : '☆'}
                </button>
                <span style={{flex:1,color:C.text,fontSize:13,wordBreak:'break-all'}}>{e.email}</span>
                {e.isPrimary && <span style={{color:C.gold,fontSize:10,letterSpacing:'0.5px'}}>PRIMARY</span>}
                <button onClick={()=>deleteEmail(idx)} title="Remove"
                  style={{background:'none',border:'none',cursor:'pointer',color:C.muted+'88',fontSize:14,padding:'0 4px',lineHeight:1}}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{display:'flex',gap:6}}>
          <input value={newEmail} onChange={e=>setNewEmail(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addEmail();}}}
            placeholder="Add email address"
            style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
          <Btn variant="ghost" small onClick={addEmail} disabled={!newEmail.trim()}>+ Add</Btn>
        </div>
      </div>

      <FI label="PHONE" value={f.phone} onChange={s('phone')} />
      <FI label="WEBSITE" value={f.website||''} onChange={s('website')} />
      <FI label="ADDRESS" value={f.address||''} onChange={s('address')} />
      <div style={{display:'flex',gap:12}}>
        <FI label="DATE OF BIRTH" value={f.dateOfBirth||''} onChange={s('dateOfBirth')} type="date" half />
        <div style={{flex:'1 1 0'}} />
      </div>
      <div style={{display:'flex',gap:12}}>
        <FI label="DEFAULT SESSION RATE (£)" value={f.defaultSessionRate||''} onChange={s('defaultSessionRate')} type="number" half />
        <FI label="RATE NOTES" value={f.rateNotes||''} onChange={s('rateNotes')} half />
      </div>
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
        <Btn onClick={()=>{if(canSave){onSave({...f,roles,orgId:f.orgId||null,emails});onClose();}}} disabled={!canSave}>{existing?'Save Changes':'Add Person'}</Btn>
      </div>
    </Modal>
  );
}

// Modal for adding a new custom org type or person role.
// Picks one of the palette colors + an icon (icon only used by org types in the sidebar).
function AddTypeForm({ kind, onSave, onClose, existingKeys=[] }) {
  const isOrg = kind === 'org';
  const [label, setLabel] = useState('');
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [iconIdx, setIconIdx] = useState(0);
  const trimmed = label.trim();
  // Generate a stable key from the label, suffixed with a short uid in case of collision
  const makeKey = () => {
    const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,30) || 'type';
    let key = `c_${base}`;
    if(existingKeys.includes(key)) key = `${key}_${Math.random().toString(36).slice(2,5)}`;
    return key;
  };
  const submit = () => {
    if(!trimmed) return;
    const palette = TYPE_PALETTE[paletteIdx];
    const newType = {
      key: makeKey(),
      label: trimmed,
      color: palette.color,
      bg: palette.bg,
    };
    if(isOrg) newType.icon = TYPE_ICONS[iconIdx];
    onSave(newType);
    onClose();
  };
  return (
    <Modal title={isOrg ? 'Add Organisation Type' : 'Add Contact Type'} onClose={onClose}>
      <FI label="NAME" value={label} onChange={setLabel} />
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>COLOUR</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {TYPE_PALETTE.map((p,i)=>(
            <button key={i} onClick={()=>setPaletteIdx(i)}
              style={{width:34,height:34,borderRadius:'50%',background:p.bg,border:`2px solid ${paletteIdx===i?p.color:'transparent'}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:p.color}} />
            </button>
          ))}
        </div>
      </div>
      {isOrg && (
        <div style={{marginBottom:14}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>ICON</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {TYPE_ICONS.map((ic,i)=>(
              <button key={i} onClick={()=>setIconIdx(i)}
                style={{width:32,height:32,borderRadius:6,background:iconIdx===i?TYPE_PALETTE[paletteIdx].bg:C.surf,border:`1px solid ${iconIdx===i?TYPE_PALETTE[paletteIdx].color:C.border}`,color:iconIdx===i?TYPE_PALETTE[paletteIdx].color:C.muted,cursor:'pointer',fontSize:14,fontFamily:"'Jost',sans-serif"}}>{ic}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px'}}>PREVIEW</div>
        <span style={{background:TYPE_PALETTE[paletteIdx].bg,color:TYPE_PALETTE[paletteIdx].color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>
          {isOrg && <span style={{marginRight:4}}>{TYPE_ICONS[iconIdx]}</span>}{trimmed||'—'}
        </span>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={!trimmed}>Add Type</Btn>
      </div>
    </Modal>
  );
}

function AddClassForm({ existing, onSave, onClose, orgs, defaultOrgId, defaultDate, bookingFor, defaultPaymentModel, packages, allAttendance }) {
  const [f, setF] = useState(existing
    ? { ...existing, time: existing.time || '', duration: existing.duration || 60, recurrence: existing.seriesId ? 'linked' : 'one_off' }
    : {
        name: bookingFor && defaultPaymentModel==='private' ? `Private Session — ${bookingFor.name}` : '',
        date: defaultDate || today(),
        time: currentHourTime(),
        duration: 60,
        location: '',
        orgId: defaultOrgId || '',
        recurrence: 'one_off',
        rate: bookingFor?.defaultSessionRate ?? '',
        repeatCount: 12,
        paymentModel: defaultPaymentModel || '',
        isBookable: false,
        capacity: '',
        publicBlurb: '',
        joinUrl: '',
        bookingInfo: ''
      });
  const s = k => v => setF(x=>({...x,[k]:v}));
  const isNew = !existing;
  // Smart default for paymentModel based on selected org
  const effectiveModel = f.paymentModel || (f.orgId ? 'org' : ((f.name||'').toLowerCase().includes('private') ? 'private' : 'per_person'));

  // ── Inline payment picker for private sessions ────────────────────────────
  // Only shown when creating a private session for a known person (bookingFor set).
  // Lets staff write the attendance row's payment status in the same save as the
  // session creation — saves a trip to ClassDetail PaymentEditor afterwards.
  const showPaymentPicker = isNew && bookingFor && effectiveModel === 'private';
  const personPkgs = useMemo(() => {
    if(!showPaymentPicker || !packages) return [];
    return packages
      .filter(pk => pk.personId === bookingFor.personId && (PKG_COMPATIBILITY[pk.type] || []).includes('private'))
      .map(pk => ({ pk, remaining: packageRemaining(pk, allAttendance || []) }))
      .filter(({remaining}) => remaining > 0);
  }, [showPaymentPicker, packages, allAttendance, bookingFor]);

  // Default: Package if any eligible, else Unpaid. Mirrors PaymentEditor pattern.
  const [payMode, setPayMode] = useState(() => personPkgs.length > 0 ? 'package' : 'unpaid');
  const [payAmount, setPayAmount] = useState(f.rate ?? '');
  const [payPackageId, setPayPackageId] = useState(personPkgs[0]?.pk.id || '');

  // Keep amount in sync if user edits the session rate before saving
  useEffect(() => { if(payMode === 'paid') setPayAmount(f.rate ?? ''); }, [f.rate, payMode]);

  const buildPaymentChoice = () => {
    if(!showPaymentPicker) return undefined;
    if(payMode === 'paid') {
      const amt = parseFloat(payAmount);
      return { paymentStatus: 'paid', paidAmount: isNaN(amt) ? 0 : amt };
    }
    if(payMode === 'package' && payPackageId) {
      return { paymentStatus: 'package', packageId: payPackageId };
    }
    return { paymentStatus: 'unpaid' };
  };

  const payRadio = (val, label) => (
    <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',color:payMode===val?C.gold:C.text,fontSize:13}}>
      <input type="radio" checked={payMode===val} onChange={()=>setPayMode(val)} style={{accentColor:C.gold}} />
      {label}
    </label>
  );

  return (
    <Modal title={existing?'Edit Class':(bookingFor?`New session for ${bookingFor.name}`:'Add Class / Session')} onClose={onClose} wide>
      {bookingFor && (
        <div style={{background:C.goldBg,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'10px 14px',marginBottom:18,color:C.gold,fontSize:13}}>
          {bookingFor.name} will be added to the register automatically.
        </div>
      )}
      <FI label="CLASS NAME" value={f.name} onChange={s('name')} />
      <div style={{display:'flex',gap:12}}>
        <FI label="DATE" value={f.date} onChange={s('date')} type="date" half />
        <FI label="TIME (optional)" value={f.time} onChange={s('time')} type="time" half />
      </div>
      <div style={{display:'flex',gap:12}}>
        <FI label="DURATION (mins)" value={f.duration} onChange={v=>s('duration')(parseInt(v)||60)} type="number" half />
        <FI label="LOCATION" value={f.location} onChange={s('location')} half />
      </div>
      <div style={{display:'flex',gap:12}}>
        <FI label="ORGANISATION (optional)" value={f.orgId} onChange={s('orgId')} opts={[{v:'',l:'— none —'},...orgs.map(o=>({v:o.id,l:o.name}))]} half />
        <FI label="RATE PER SESSION (£)" value={f.rate} onChange={s('rate')} type="number" half />
      </div>
      <FI label="PAYMENT MODEL" value={effectiveModel} onChange={s('paymentModel')} opts={Object.entries(PAYMENT_MODELS).map(([v,m])=>({v,l:m.label}))} />
      {showPaymentPicker && (
        <div style={{marginBottom:14}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>HOW IS THIS SESSION PAID?</div>
          <div style={{display:'flex',flexDirection:'column',gap:9}}>
            <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
              {payRadio('paid','Drop-in')}
              {payMode==='paid' && (
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{color:C.muted,fontSize:13}}>£</span>
                  <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="0"
                    style={{width:80,background:C.card,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontSize:13,padding:'4px 8px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
                </div>
              )}
            </div>
            {personPkgs.length > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                {payRadio('package','Use package')}
                {payMode==='package' && (
                  <select value={payPackageId} onChange={e=>setPayPackageId(e.target.value)}
                    style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontSize:13,padding:'4px 8px',fontFamily:"'Jost',sans-serif",outline:'none',minWidth:240}}>
                    {personPkgs.map(({pk,remaining}) => (
                      <option key={pk.id} value={pk.id}>
                        {pk.name} — {remaining===Infinity ? 'unlimited' : `${remaining} of ${pk.totalSessions} left`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {payRadio('unpaid','Unpaid (still owes)')}
          </div>
        </div>
      )}
      {isNew && !bookingFor && (
        <FI label="RECURRENCE" value={f.recurrence} onChange={s('recurrence')} opts={Object.entries(RECURRENCE).map(([v,l])=>({v,l}))} />
      )}
      {isNew && !bookingFor && f.recurrence!=='one_off' && (
        <FI label="HOW MANY SESSIONS TO GENERATE" value={f.repeatCount} onChange={v=>s('repeatCount')(parseInt(v)||12)} type="number" />
      )}
      {!bookingFor && effectiveModel === 'per_person' && (
        <div style={{marginTop:8,marginBottom:14,padding:'14px 16px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surf}}>
          <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',color:f.isBookable?C.gold:C.text,fontSize:14}}>
            <input type="checkbox" checked={!!f.isBookable} onChange={e=>s('isBookable')(e.target.checked)} style={{accentColor:C.gold,width:16,height:16}} />
            Publish to website (bookable on thefeltbody.com)
          </label>
          {f.isBookable && (
            <div style={{marginTop:14}}>
              <FI label="CAPACITY PER CLASS (blank = uncapped)" value={f.capacity} onChange={s('capacity')} type="number" />
              <FI label="WEBSITE DESCRIPTION (optional)" value={f.publicBlurb} onChange={s('publicBlurb')} />
              <FI label="JOINING LINK (Zoom / Meet / map — optional)" value={f.joinUrl ?? ''} onChange={s('joinUrl')} placeholder="https://…" />
              <FI label="JOINING NOTES (optional)" value={f.bookingInfo ?? ''} onChange={s('bookingInfo')} />
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                The joining link appears as a button in the booking confirmation email; notes appear beneath it.
              </div>
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                The rate above (£{f.rate||0}) is shown to customers as the per-place price.
                {isNew && f.recurrence && f.recurrence!=='one_off' && ' Applies to every class in this series.'}
                {!isNew && f.recurrence==='linked' && ' Changes here apply to this one class; use “this and future” editing to publish the rest of the series.'}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(f.name.trim()){onSave({...f,paymentModel:effectiveModel,recurrence:bookingFor?'one_off':f.recurrence,paymentChoice:buildPaymentChoice()});onClose();}}}>{existing?'Save':(bookingFor?'Create & Book':'Add Class')}</Btn>
      </div>
    </Modal>
  );
}

function EditSeriesClassForm({ cls, onSaveThis, onSaveFuture, onClose, orgs }) {
  const [f, setF] = useState({...cls, time: cls.time || '', duration: cls.duration || 60});
  const s = k => v => setF(x=>({...x,[k]:v}));
  return (
    <Modal title="Edit Recurring Class" onClose={onClose} wide>
      <div style={{background:C.goldBg,border:`1px solid ${C.gold}44`,borderRadius:6,padding:'10px 14px',marginBottom:18,color:C.gold,fontSize:13}}>
        This class is part of a recurring series. Save just this one, or update this and all future classes in the series.
      </div>
      <FI label="CLASS NAME" value={f.name} onChange={s('name')} />
      <div style={{display:'flex',gap:12}}>
        <FI label="DATE" value={f.date} onChange={s('date')} type="date" half />
        <FI label="TIME (optional)" value={f.time} onChange={s('time')} type="time" half />
      </div>
      <div style={{display:'flex',gap:12}}>
        <FI label="DURATION (mins)" value={f.duration} onChange={v=>s('duration')(parseInt(v)||60)} type="number" half />
        <FI label="LOCATION" value={f.location} onChange={s('location')} half />
      </div>
      <div style={{display:'flex',gap:12}}>
        <FI label="ORGANISATION (optional)" value={f.orgId||''} onChange={s('orgId')} opts={[{v:'',l:'— none —'},...orgs.map(o=>({v:o.id,l:o.name}))]} half />
        <FI label="RATE (£)" value={f.rate||''} onChange={s('rate')} type="number" half />
      </div>
      <FI label="PAYMENT MODEL" value={f.paymentModel||'per_person'} onChange={s('paymentModel')} opts={Object.entries(PAYMENT_MODELS).map(([v,m])=>({v,l:m.label}))} />
      {(f.paymentModel||'per_person') === 'per_person' && (
        <div style={{marginTop:8,marginBottom:14,padding:'14px 16px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surf}}>
          <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',color:f.isBookable?C.gold:C.text,fontSize:14}}>
            <input type="checkbox" checked={!!f.isBookable} onChange={e=>s('isBookable')(e.target.checked)} style={{accentColor:C.gold,width:16,height:16}} />
            Publish to website (bookable on thefeltbody.com)
          </label>
          {f.isBookable && (
            <div style={{marginTop:14}}>
              <FI label="CAPACITY PER CLASS (blank = uncapped)" value={f.capacity ?? ''} onChange={s('capacity')} type="number" />
              <FI label="WEBSITE DESCRIPTION (optional)" value={f.publicBlurb ?? ''} onChange={s('publicBlurb')} />
              <FI label="JOINING LINK (Zoom / Meet / map — optional)" value={f.joinUrl ?? ''} onChange={s('joinUrl')} placeholder="https://…" />
              <FI label="JOINING NOTES (optional)" value={f.bookingInfo ?? ''} onChange={s('bookingInfo')} />
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                The rate above (£{f.rate||0}) is shown to customers as the per-place price.
                “Update this class only” publishes just this date; “Update this &amp; future” publishes every class from here on.
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="secondary" onClick={()=>{onSaveFuture(f);onClose();}}>Update this & future</Btn>
        <Btn onClick={()=>{onSaveThis(f);onClose();}}>Update this class only</Btn>
      </div>
    </Modal>
  );
}

function AddToRegisterForm({ onSave, onClose, people, classId, existing, attendance, classes, cls, onAddNew }) {
  const [selected, setSelected] = useState(null);
  const available = people.filter(p=>p.status!=='inactive');
  return (
    <Modal title="Add to Register" onClose={onClose} wide topAlign>
      <SearchSelect people={available} onSelect={p=>setSelected(p)} attendance={attendance} classes={classes} contextSeriesId={cls?.seriesId} existing={existing} />
      {selected && (
        <div style={{marginTop:14,background:C.active,border:`1px solid ${C.gold}55`,borderRadius:6,padding:'10px 14px',display:'flex',alignItems:'center',gap:12}}>
          <Avatar name={selected.name} size={28} role={primaryRole(selected)} />
          <span style={{color:C.text,fontSize:14,flex:1}}>{selected.name}</span>
          <Btn small onClick={()=>{onSave(classId,selected.id);onClose();}}>Add to register</Btn>
        </div>
      )}
      {onAddNew && !selected && (
        <div style={{marginTop:18,paddingTop:16,borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div style={{color:C.muted,fontSize:12}}>Can't find them?</div>
          <Btn variant="ghost" small onClick={onAddNew}>+ Add new contact</Btn>
        </div>
      )}
    </Modal>
  );
}

function AddPackageForm({ onSave, onClose, personId, templates=[] }) {
  // Active templates only, in display order. The picker REPLACES the old
  // hardcoded typeDefaults; "— None —" leaves the form at manual defaults so an
  // ad-hoc package can still be entered without a template.
  const activeTemplates = templates.filter(t => t.active);
  const BLANK = {type:'class_package',name:'',totalSessions:10,sessionsUsed:0,amountPaid:'',paidVia:'stripe_tfb',datePurchased:today(),expiresAt:'',notes:''};
  const [templateId, setTemplateId] = useState('');
  const [f, setF] = useState(BLANK);
  const s = k => v => setF(x=>({...x,[k]:v}));

  // Selecting a template prefills every field from the template row. The chosen
  // validity window is captured so the expiry recomputes if the purchase date is
  // later edited; clearing the template stops that auto-recompute.
  const [validityDays, setValidityDays] = useState(null);
  const applyTemplate = (id) => {
    setTemplateId(id);
    if (!id) { setValidityDays(null); setF(BLANK); return; }
    const t = activeTemplates.find(x => x.id === id);
    if (!t) return;
    setValidityDays(t.validityDays ?? null);
    setF(x => ({
      ...x,
      type: t.type,
      name: t.name,
      totalSessions: t.totalSessions,
      amountPaid: t.defaultAmount === '' ? '' : t.defaultAmount,
      paidVia: t.paidVia || 'stripe_tfb',
      notes: t.notes || '',
      // recompute expiry from the (current) purchase date + window
      expiresAt: (t.validityDays && x.datePurchased) ? addDays(x.datePurchased, t.validityDays) : '',
    }));
  };

  // Keep expiry in step with purchase date while a windowed template is active.
  const onDatePurchased = (v) => {
    setF(x => ({
      ...x,
      datePurchased: v,
      expiresAt: (validityDays && v) ? addDays(v, validityDays) : x.expiresAt,
    }));
  };

  const templateOpts = [
    { v:'', l:'— None (manual) —' },
    ...activeTemplates.map(t => ({ v:t.id, l:t.name })),
  ];

  return (
    <Modal title="Add Package / Credits" onClose={onClose} wide>
      <FI label="TEMPLATE" value={templateId} onChange={applyTemplate} opts={templateOpts} />
      <FI label="TYPE" value={f.type} onChange={s('type')} opts={Object.entries(PKG_TYPES).map(([v,m])=>({v,l:m.label}))} />
      <FI label="NAME / DESCRIPTION" value={f.name} onChange={s('name')} />
      {!isCountlessPkg(f.type)&&(<div style={{display:'flex',gap:12}}><FI label="TOTAL SESSIONS" value={f.totalSessions} onChange={v=>s('totalSessions')(parseInt(v)||0)} type="number" half /><FI label="ALREADY USED" value={f.sessionsUsed} onChange={v=>s('sessionsUsed')(parseInt(v)||0)} type="number" half /></div>)}
      <div style={{display:'flex',gap:12}}><FI label="AMOUNT PAID (£)" value={f.amountPaid} onChange={s('amountPaid')} type="number" half /><FI label="PAID VIA" value={f.paidVia} onChange={s('paidVia')} opts={Object.entries(PAY_VIA).map(([v,l])=>({v,l}))} half /></div>
      <div style={{display:'flex',gap:12}}><FI label="DATE PURCHASED" value={f.datePurchased} onChange={onDatePurchased} type="date" half /><FI label="EXPIRES (blank = never)" value={f.expiresAt} onChange={s('expiresAt')} type="date" half /></div>
      <FI label="NOTES" value={f.notes} onChange={s('notes')} rows={2} />
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(f.name.trim()){onSave({...f,personId,totalSessions:parseInt(f.totalSessions)||1,sessionsUsed:parseInt(f.sessionsUsed||0),amountPaid:parseFloat(f.amountPaid||0)});onClose();}}}>Add Package</Btn>
      </div>
    </Modal>
  );
}

// ─── MergePeopleForm ─────────────────────────────────────────────────────────
// Side-by-side merge of two contacts. Layout: [Person A] [Master preview] [Person B].
// A radio at the top picks which side is the master (the other gets hard-deleted
// server-side after FK reassignment). For each field:
//   - if both sides have the same value, or only one has a value → master shows
//     it automatically (no radio).
//   - if values differ → small radio under each side picks which goes into master.
// The master preview column is fully editable — typing into a field there
// overrides whichever side was picked. Roles are intentionally NOT combined;
// master keeps its own roles (loser's roles are discarded with the loser row).
//
// All related rows (notes, attendance, packages, payments, org_contacts,
// emails) are combined into the master server-side in a single transaction
// via the merge_people() Postgres function.
function MergePeopleForm({ personA, personB, orgs, onMerge, onClose }) {
  // Master side: 'A' or 'B'. Default to whichever has more populated fields.
  const score = (p) => ['phone','website','notes','orgId'].filter(k=>{
    const v = k==='orgId' ? p[k] : (p[k]||'').toString().trim();
    return !!v;
  }).length + ((p.defaultSessionRate||'')!==''?1:0) + (p.emails?.length || 0);
  const [masterSide, setMasterSide] = useState(score(personA) >= score(personB) ? 'A' : 'B');
  const master = masterSide==='A' ? personA : personB;
  const loser  = masterSide==='A' ? personB : personA;

  // For each field, track which side the user picked when values differ.
  // Default: master side wins. Reset whenever masterSide flips.
  const fields = ['name','phone','website','address','dateOfBirth','notes','orgId','status','defaultSessionRate','rateNotes'];
  const [pick, setPick] = useState(() => Object.fromEntries(fields.map(k=>[k,masterSide])));
  // sourceChannel + sourceDetail nested under source.* — handle separately
  const [sourcePick, setSourcePick] = useState(masterSide);
  useEffect(() => {
    setPick(Object.fromEntries(fields.map(k=>[k,masterSide])));
    setSourcePick(masterSide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterSide]);

  // Initial merged value for a field = whichever side the pick points to.
  const initialFor = (k) => {
    const fromA = personA[k];
    const fromB = personB[k];
    return pick[k]==='A' ? fromA : fromB;
  };
  // Track user edits to the master preview separately from auto-pick.
  // null = follow pick; string/number = user override.
  const [overrides, setOverrides] = useState({});
  // Reset overrides when masterSide flips (intent has changed)
  useEffect(() => { setOverrides({}); /* eslint-disable-next-line */ }, [masterSide]);

  const get = (k) => overrides[k] !== undefined ? overrides[k] : (initialFor(k) ?? '');
  const setOverride = (k) => (v) => setOverrides(o => ({...o, [k]: v}));

  // Source has nested channel/detail
  const sourceChannel = overrides.sourceChannel !== undefined
    ? overrides.sourceChannel
    : (sourcePick==='A' ? personA.source?.channel : personB.source?.channel) || 'manual';
  const sourceDetail = overrides.sourceDetail !== undefined
    ? overrides.sourceDetail
    : (sourcePick==='A' ? personA.source?.detail : personB.source?.detail) || '';

  // Renders the small "A | B" radio under a field row, only if values differ.
  const FieldRadio = ({ fieldKey, valA, valB, displayA, displayB }) => {
    const differ = (valA||'') !== (valB||'');
    if (!differ) return null;
    return (
      <div style={{display:'flex',gap:14,fontSize:11,color:C.muted,marginTop:4}}>
        <label style={{display:'flex',gap:4,cursor:'pointer',alignItems:'center'}}>
          <input type="radio" checked={pick[fieldKey]==='A'} onChange={()=>{
            setPick(p=>({...p,[fieldKey]:'A'}));
            setOverrides(o=>{const n={...o}; delete n[fieldKey]; return n;});
          }} />
          <span>A: {displayA || <em style={{color:C.muted+'88'}}>empty</em>}</span>
        </label>
        <label style={{display:'flex',gap:4,cursor:'pointer',alignItems:'center'}}>
          <input type="radio" checked={pick[fieldKey]==='B'} onChange={()=>{
            setPick(p=>({...p,[fieldKey]:'B'}));
            setOverrides(o=>{const n={...o}; delete n[fieldKey]; return n;});
          }} />
          <span>B: {displayB || <em style={{color:C.muted+'88'}}>empty</em>}</span>
        </label>
      </div>
    );
  };

  // Read-only side column showing one person's values
  const SidePanel = ({ p, side, isMaster }) => {
    const org = orgs.find(o => o.id === p.orgId);
    return (
      <div style={{
        flex:1, padding:14,
        background: isMaster ? '#2a3a2a' : C.card,
        border:`1px solid ${isMaster ? C.green+'66' : C.border}`,
        borderRadius:8, minWidth:0,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <label style={{display:'flex',gap:6,alignItems:'center',cursor:'pointer',fontSize:12,color:C.text,fontWeight:500}}>
            <input type="radio" checked={masterSide===side} onChange={()=>setMasterSide(side)} />
            Person {side} {isMaster && <span style={{color:C.green,fontSize:10,letterSpacing:'0.5px'}}>· MASTER</span>}
          </label>
        </div>
        <div style={{fontSize:13,color:C.text,fontWeight:500,marginBottom:8}}>{p.name}</div>
        <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>
          {(p.emails?.length || 0) > 0 ? (
            p.emails.map(e => (
              <div key={e.id || e.email}>
                {e.email}
                {e.isPrimary && p.emails.length > 1 && <span style={{color:C.gold,marginLeft:6,fontSize:9,letterSpacing:'0.5px'}}>PRIMARY</span>}
              </div>
            ))
          ) : (
            <div>{p.email || <em style={{opacity:0.5}}>no email</em>}</div>
          )}
          <div>{p.phone || <em style={{opacity:0.5}}>no phone</em>}</div>
          {p.website && <div>{p.website}</div>}
          {org && <div>{org.name}</div>}
          <div style={{marginTop:6}}>{p.roles.map(r=><RoleBadge key={r} role={r} />)}</div>
          <div style={{marginTop:8,fontStyle:'italic',color:C.muted+'cc'}}>
            {p.defaultSessionRate !== '' ? `Rate: ${fmtMoney(p.defaultSessionRate)}` : 'No default rate'}
          </div>
          {p.notes && <div style={{marginTop:8,whiteSpace:'pre-wrap',color:C.muted}}>{p.notes}</div>}
        </div>
        {!isMaster && (
          <div style={{marginTop:12,padding:'6px 8px',background:C.red+'15',border:`1px solid ${C.red}44`,borderRadius:4,fontSize:10,color:C.red,letterSpacing:'0.3px'}}>
            ⚠ Will be deleted. All linked records re-pointed to master.
          </div>
        )}
      </div>
    );
  };

  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const invalid = !get('name').toString().trim();

  const doMerge = async () => {
    if (invalid || busy) return;
    setBusy(true);
    try {
      // Build the master patch in DB column shape (snake_case + split source).
      // Note: `email` is no longer in the patch — emails live in people_emails
      // and are auto-combined by the merge_people() function.
      const patch = {
        name: get('name'),
        phone: get('phone') || null,
        website: get('website') || null,
        address: get('address') || null,
        date_of_birth: get('dateOfBirth') || null,
        notes: get('notes') || null,
        org_id: get('orgId') || null,
        status: get('status') || 'active',
        source_channel: sourceChannel || 'manual',
        source_detail: sourceDetail || null,
        default_session_rate: get('defaultSessionRate') === '' ? null : get('defaultSessionRate'),
        rate_notes: get('rateNotes') || null,
      };
      await onMerge(master.id, loser.id, patch);
      onClose();
    } catch (e) {
      setBusy(false);
      // onMerge bubbles via onError already; just unwind the busy flag
    }
  };

  const orgOpts = [{v:'',l:'(none)'}].concat(orgs.map(o=>({v:o.id,l:o.name})));

  return (
    <Modal title="Merge Contacts" onClose={onClose} xwide>
      <div style={{color:C.muted,fontSize:12,marginBottom:18,lineHeight:1.5}}>
        Pick which contact survives as the <strong style={{color:C.text}}>master</strong>. The other is deleted, and
        its linked records (notes, sessions, packages, payments, org links, emails) are re-pointed to the master.
        Edit any master field below before confirming.
      </div>

      {/* Three columns: Person A | Master preview | Person B */}
      <div style={{display:'flex',gap:12,marginBottom:18,alignItems:'stretch'}}>
        <SidePanel p={personA} side="A" isMaster={masterSide==='A'} />

        {/* Master preview column */}
        <div style={{flex:1.3, padding:14, background:C.surf, border:`1px solid ${C.green}88`, borderRadius:8, minWidth:0}}>
          <div style={{fontSize:11,letterSpacing:'0.6px',color:C.green,marginBottom:12,fontWeight:600}}>
            ✎ MASTER (editable)
          </div>

          {/* NAME */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>NAME</label>
            <input value={get('name')} onChange={e=>setOverride('name')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            <FieldRadio fieldKey="name" valA={personA.name} valB={personB.name} displayA={personA.name} displayB={personB.name} />
          </div>

          {/* EMAILS — all are combined into the master automatically.
              Duplicates (case-insensitive) are skipped server-side. After
              merge the master keeps its own primary; new addresses arrive as
              non-primary and can be re-starred from PersonDetail. */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>EMAILS (combined)</label>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px'}}>
              {(() => {
                const seen = new Set();
                const merged = [];
                // Master emails first (kept as primary), then any new ones from loser
                for (const src of [master.emails || [], loser.emails || []]) {
                  for (const e of src) {
                    const k = (e.email || '').toLowerCase();
                    if (!k || seen.has(k)) continue;
                    seen.add(k);
                    merged.push({ ...e, fromLoser: src === (loser.emails || []) });
                  }
                }
                if (merged.length === 0) {
                  return <div style={{color:C.muted,fontSize:12,fontStyle:'italic'}}>No emails on either contact</div>;
                }
                return merged.map((e,i) => (
                  <div key={`${e.email}-${i}`} style={{display:'flex',gap:6,alignItems:'center',padding:'2px 0',fontSize:12}}>
                    <span style={{color:e.isPrimary && !e.fromLoser ? C.gold : C.muted+'88',fontSize:12,width:14}}>{e.isPrimary && !e.fromLoser ? '★' : '·'}</span>
                    <span style={{flex:1,color:C.text,wordBreak:'break-all'}}>{e.email}</span>
                    {e.isPrimary && !e.fromLoser && <span style={{color:C.gold,fontSize:9,letterSpacing:'0.5px'}}>PRIMARY</span>}
                    {e.fromLoser && <span style={{color:C.muted+'aa',fontSize:9,letterSpacing:'0.5px'}}>+ from loser</span>}
                  </div>
                ));
              })()}
            </div>
            <div style={{color:C.muted,fontSize:10,marginTop:4,fontStyle:'italic'}}>
              All addresses are kept on the master. Re-star a different primary from the contact's page after merge.
            </div>
          </div>

          {/* PHONE */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>PHONE</label>
            <input value={get('phone')} onChange={e=>setOverride('phone')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            <FieldRadio fieldKey="phone" valA={personA.phone} valB={personB.phone} displayA={personA.phone} displayB={personB.phone} />
          </div>

          {/* WEBSITE */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>WEBSITE</label>
            <input value={get('website')} onChange={e=>setOverride('website')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            <FieldRadio fieldKey="website" valA={personA.website} valB={personB.website} displayA={personA.website} displayB={personB.website} />
          </div>

          {/* ADDRESS */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>ADDRESS</label>
            <input value={get('address')} onChange={e=>setOverride('address')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            <FieldRadio fieldKey="address" valA={personA.address} valB={personB.address} displayA={personA.address} displayB={personB.address} />
          </div>

          {/* DATE OF BIRTH */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>DATE OF BIRTH</label>
            <input type="date" value={get('dateOfBirth')||''} onChange={e=>setOverride('dateOfBirth')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            <FieldRadio fieldKey="dateOfBirth" valA={personA.dateOfBirth} valB={personB.dateOfBirth} displayA={personA.dateOfBirth||'—'} displayB={personB.dateOfBirth||'—'} />
          </div>

          {/* ORG */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>ORG</label>
            <select value={get('orgId')||''} onChange={e=>setOverride('orgId')(e.target.value||null)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
              {orgOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <FieldRadio fieldKey="orgId"
              valA={personA.orgId} valB={personB.orgId}
              displayA={orgs.find(o=>o.id===personA.orgId)?.name || '—'}
              displayB={orgs.find(o=>o.id===personB.orgId)?.name || '—'} />
          </div>

          {/* STATUS */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>STATUS</label>
            <select value={get('status')} onChange={e=>setOverride('status')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
              <option value="active">Active</option>
              <option value="interested">Interested</option>
              <option value="inactive">Inactive</option>
            </select>
            <FieldRadio fieldKey="status" valA={personA.status} valB={personB.status} displayA={personA.status} displayB={personB.status} />
          </div>

          {/* SOURCE */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>SOURCE</label>
            <div style={{display:'flex',gap:8}}>
              <select value={sourceChannel} onChange={e=>setOverrides(o=>({...o,sourceChannel:e.target.value}))}
                style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
                {Object.entries(SOURCES).map(([v,s])=><option key={v} value={v}>{s.label}</option>)}
              </select>
              <input value={sourceDetail} onChange={e=>setOverrides(o=>({...o,sourceDetail:e.target.value}))} placeholder="Detail"
                style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            </div>
            {((personA.source?.channel!==personB.source?.channel) || (personA.source?.detail!==personB.source?.detail)) && (
              <div style={{display:'flex',gap:14,fontSize:11,color:C.muted,marginTop:4}}>
                <label style={{display:'flex',gap:4,cursor:'pointer',alignItems:'center'}}>
                  <input type="radio" checked={sourcePick==='A'} onChange={()=>{
                    setSourcePick('A');
                    setOverrides(o=>{const n={...o}; delete n.sourceChannel; delete n.sourceDetail; return n;});
                  }} />
                  <span>A: {(SOURCES[personA.source?.channel]?.label || personA.source?.channel || '—')}{personA.source?.detail?` · ${personA.source.detail}`:''}</span>
                </label>
                <label style={{display:'flex',gap:4,cursor:'pointer',alignItems:'center'}}>
                  <input type="radio" checked={sourcePick==='B'} onChange={()=>{
                    setSourcePick('B');
                    setOverrides(o=>{const n={...o}; delete n.sourceChannel; delete n.sourceDetail; return n;});
                  }} />
                  <span>B: {(SOURCES[personB.source?.channel]?.label || personB.source?.channel || '—')}{personB.source?.detail?` · ${personB.source.detail}`:''}</span>
                </label>
              </div>
            )}
          </div>

          {/* DEFAULT SESSION RATE */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>DEFAULT RATE (£)</label>
            <input type="number" value={get('defaultSessionRate')} onChange={e=>setOverride('defaultSessionRate')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            <FieldRadio fieldKey="defaultSessionRate"
              valA={personA.defaultSessionRate} valB={personB.defaultSessionRate}
              displayA={personA.defaultSessionRate===''?'—':`£${personA.defaultSessionRate}`}
              displayB={personB.defaultSessionRate===''?'—':`£${personB.defaultSessionRate}`} />
          </div>

          {/* RATE NOTES */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>RATE NOTES</label>
            <input value={get('rateNotes')} onChange={e=>setOverride('rateNotes')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            <FieldRadio fieldKey="rateNotes" valA={personA.rateNotes} valB={personB.rateNotes} displayA={personA.rateNotes} displayB={personB.rateNotes} />
          </div>

          {/* NOTES */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>NOTES</label>
            <textarea value={get('notes')} onChange={e=>setOverride('notes')(e.target.value)} rows={3}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif",resize:'vertical'}} />
            <FieldRadio fieldKey="notes" valA={personA.notes} valB={personB.notes} displayA={personA.notes} displayB={personB.notes} />
          </div>

          <div style={{padding:8,background:C.card,border:`1px dashed ${C.border}`,borderRadius:4,fontSize:11,color:C.muted,marginTop:8}}>
            Master keeps its own roles: {master.roles.map(r=><RoleBadge key={r} role={r} />)}
          </div>
        </div>

        <SidePanel p={personB} side="B" isMaster={masterSide==='B'} />
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:8,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
        <div style={{fontSize:11,color:C.muted,fontStyle:'italic'}}>
          Person <strong style={{color:C.red}}>{masterSide==='A'?'B':'A'}</strong> ({loser.name}) will be permanently deleted. A merge_audit row preserves snapshots.
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {armed ? (
            <>
              <span style={{color:C.red,fontSize:12}}>Confirm merge?</span>
              <Btn variant="ghost" small onClick={()=>setArmed(false)}>Cancel</Btn>
              <button onClick={doMerge} disabled={invalid||busy}
                style={{background:C.red,border:'none',color:'#fff',cursor:busy?'wait':'pointer',borderRadius:4,fontSize:12,padding:'7px 14px',fontFamily:"'Jost',sans-serif",fontWeight:500,opacity:invalid?0.5:1}}>
                {busy ? 'Merging…' : 'Confirm merge'}
              </button>
            </>
          ) : (
            <>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn onClick={()=>setArmed(true)} disabled={invalid}>Merge contacts</Btn>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// EditPackageForm — same fields as AddPackageForm but pre-filled.
// Guards:
//   - totalSessions can't drop below totalUsed (manual offset + linked attendance)
//   - sessionsUsed (manual offset) can't drop below 0 or above (totalSessions - linkedCount)
//   - Delete only enabled when totalUsed===0 (no manual offset, no linked sessions).
//     Hard-deletes via deletePackage handler — no recovery, so the gate matters.
function EditPackageForm({ pkg, linkedCount, onSave, onDelete, onClose }) {
  const [f, setF] = useState({
    type: pkg.type,
    name: pkg.name,
    totalSessions: pkg.totalSessions,
    sessionsUsed: pkg.sessionsUsed || 0,
    amountPaid: pkg.amountPaid ?? '',
    paidVia: pkg.paidVia || 'other',
    datePurchased: pkg.datePurchased || today(),
    expiresAt: pkg.expiresAt || '',
    notes: pkg.notes || '',
  });
  const [armed, setArmed] = useState(false);
  const s = k => v => setF(x=>({...x,[k]:v}));
  const totalUsed = (parseInt(f.sessionsUsed)||0) + linkedCount;
  const totalSessionsNum = parseInt(f.totalSessions)||0;
  const minTotal = Math.max(1, totalUsed);
  const maxOffset = Math.max(0, totalSessionsNum - linkedCount);
  const canDelete = totalUsed === 0;
  const totalTooLow = !isCountlessPkg(f.type) && totalSessionsNum < totalUsed;
  const offsetTooHigh = !isCountlessPkg(f.type) && (parseInt(f.sessionsUsed)||0) > maxOffset;
  const invalid = !f.name.trim() || totalTooLow || offsetTooHigh;
  const save = () => {
    if(invalid) return;
    onSave({
      ...f,
      personId: pkg.personId,
      totalSessions: parseInt(f.totalSessions)||1,
      sessionsUsed: parseInt(f.sessionsUsed||0),
      amountPaid: parseFloat(f.amountPaid||0),
    });
    onClose();
  };
  return (
    <Modal title="Edit Package" onClose={onClose} wide>
      <FI label="TYPE" value={f.type} onChange={s('type')} opts={Object.entries(PKG_TYPES).map(([v,m])=>({v,l:m.label}))} />
      <FI label="NAME / DESCRIPTION" value={f.name} onChange={s('name')} />
      {!isCountlessPkg(f.type)&&(<>
        <div style={{display:'flex',gap:12}}>
          <FI label={`TOTAL SESSIONS${minTotal>1?` (min ${minTotal})`:''}`} value={f.totalSessions} onChange={v=>s('totalSessions')(parseInt(v)||0)} type="number" half />
          <FI label={`MANUAL OFFSET${linkedCount>0?` (max ${maxOffset})`:''}`} value={f.sessionsUsed} onChange={v=>s('sessionsUsed')(parseInt(v)||0)} type="number" half />
        </div>
        {linkedCount>0 && (
          <div style={{color:C.muted,fontSize:11,marginTop:-8,marginBottom:14,fontStyle:'italic'}}>
            {linkedCount} session{linkedCount===1?'':'s'} linked via attendance · total used: {totalUsed}
          </div>
        )}
        {totalTooLow && <div style={{color:C.red,fontSize:12,marginBottom:10}}>Total can't be below sessions already used ({totalUsed}).</div>}
        {offsetTooHigh && <div style={{color:C.red,fontSize:12,marginBottom:10}}>Manual offset can't exceed total minus linked sessions ({maxOffset}).</div>}
      </>)}
      <div style={{display:'flex',gap:12}}><FI label="AMOUNT PAID (£)" value={f.amountPaid} onChange={s('amountPaid')} type="number" half /><FI label="PAID VIA" value={f.paidVia} onChange={s('paidVia')} opts={Object.entries(PAY_VIA).map(([v,l])=>({v,l}))} half /></div>
      <div style={{display:'flex',gap:12}}><FI label="DATE PURCHASED" value={f.datePurchased} onChange={s('datePurchased')} type="date" half /><FI label="EXPIRES (blank = never)" value={f.expiresAt} onChange={s('expiresAt')} type="date" half /></div>
      {/* Quick-extend: bumps expires_at from its current value (or from today if
          blank) by a fixed step. Just date math written back to the same field. */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginTop:-6,marginBottom:14,flexWrap:'wrap'}}>
        <span style={{color:C.muted,fontSize:11,letterSpacing:'0.5px'}}>EXTEND</span>
        {[{l:'+1 week',fn:d=>addDays(d,7)},{l:'+1 month',fn:d=>addMonths(d,1)},{l:'+3 months',fn:d=>addMonths(d,3)}].map(b=>(
          <button key={b.l} type="button"
            onClick={()=>s('expiresAt')(b.fn(f.expiresAt||today()))}
            style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'3px 9px',fontFamily:"'Jost',sans-serif"}}
            onMouseEnter={e=>{e.currentTarget.style.color=C.gold;e.currentTarget.style.borderColor=C.gold+'88';}}
            onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.borderColor=C.border;}}>
            {b.l}
          </button>
        ))}
        {f.expiresAt && (
          <button type="button" onClick={()=>s('expiresAt')('')}
            style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:11,fontFamily:"'Jost',sans-serif",textDecoration:'underline',opacity:0.7}}>
            clear
          </button>
        )}
      </div>
      <FI label="NOTES" value={f.notes} onChange={s('notes')} rows={2} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:4}}>
        <div>
          {canDelete ? (
            armed ? (
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{color:C.red,fontSize:12}}>Delete permanently?</span>
                <Btn variant="ghost" small onClick={()=>setArmed(false)}>Cancel</Btn>
                <button onClick={()=>{onDelete();onClose();}}
                  style={{background:C.red,border:'none',color:'#fff',cursor:'pointer',borderRadius:4,fontSize:12,padding:'5px 11px',fontFamily:"'Jost',sans-serif",fontWeight:500}}>
                  Confirm delete
                </button>
              </div>
            ) : (
              <button onClick={()=>setArmed(true)}
                style={{background:'none',border:`1px solid ${C.red}88`,color:C.red,cursor:'pointer',borderRadius:4,fontSize:12,padding:'5px 11px',fontFamily:"'Jost',sans-serif"}}>
                Delete package
              </button>
            )
          ) : (
            <span style={{color:C.muted,fontSize:11,fontStyle:'italic'}}>
              Can't delete — package has {totalUsed} session{totalUsed===1?'':'s'} used
            </span>
          )}
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={invalid}>Save Changes</Btn>
        </div>
      </div>
    </Modal>
  );
}

// PackageTemplateForm — add/edit a package template. Same core fields as a
// package MINUS per-purchase data (sessionsUsed, amountPaid-as-actual, dates).
// Instead: default_amount (list price prefill), validity_days (expiry window in
// days; blank = never expires), active, stripe_price_id (Phase 7).
function PackageTemplateForm({ existing, onSave, onClose }) {
  const [f, setF] = useState(existing || {
    type:'class_package', name:'', totalSessions:10, defaultAmount:'',
    paidVia:'stripe_tfb', validityDays:'', notes:'', active:true, stripePriceId:'',
  });
  const s = k => v => setF(x=>({...x,[k]:v}));
  const valid = f.name.trim().length > 0;
  return (
    <Modal title={existing?`Edit Template: ${existing.name}`:"Add Package Template"} onClose={onClose} wide>
      <FI label="TYPE" value={f.type} onChange={s('type')} opts={Object.entries(PKG_TYPES).map(([v,m])=>({v,l:m.label}))} />
      <FI label="NAME / DESCRIPTION" value={f.name} onChange={s('name')} />
      {!isCountlessPkg(f.type) && (
        <FI label="TOTAL SESSIONS" value={f.totalSessions} onChange={v=>s('totalSessions')(parseInt(v)||0)} type="number" />
      )}
      <div style={{display:'flex',gap:12}}>
        <FI label="DEFAULT PRICE (£)" value={f.defaultAmount} onChange={s('defaultAmount')} type="number" half />
        <FI label="DEFAULT PAID VIA" value={f.paidVia} onChange={s('paidVia')} opts={Object.entries(PAY_VIA).map(([v,l])=>({v,l}))} half />
      </div>
      <FI label="VALIDITY (DAYS — blank = never expires)" value={f.validityDays} onChange={v=>s('validityDays')(v===''?'':(parseInt(v)||''))} type="number" />
      <FI label="NOTES" value={f.notes} onChange={s('notes')} rows={2} />
      {/* Stripe price ID — populated in Phase 7. Shown now so templates can be
          wired ahead of the webhook; safe to leave blank. */}
      <FI label="STRIPE PRICE ID (Phase 7 — optional)" value={f.stripePriceId} onChange={s('stripePriceId')} />
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,cursor:'pointer'}} onClick={()=>s('active')(!f.active)}>
        <span style={{width:16,height:16,borderRadius:4,border:`1px solid ${f.active?C.gold:C.border}`,background:f.active?C.gold:'transparent',display:'inline-flex',alignItems:'center',justifyContent:'center',color:C.bg,fontSize:11,fontWeight:700}}>{f.active?'✓':''}</span>
        <span style={{color:C.text,fontSize:13}}>Active (shown in the package picker)</span>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(valid){onSave({...f,totalSessions:parseInt(f.totalSessions)||0});onClose();}}} disabled={!valid}>{existing?'Save Changes':'Add Template'}</Btn>
      </div>
    </Modal>
  );
}
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
  const { personRoles } = useTypes();
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
    recommendedTitle = `Recommended for a ${(personRoles[person.roles[0]]||PERSON_ROLES[person.roles[0]])?.label || 'client'}`;
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
  const orgClasses = useMemo(()=> {
    const t = today();
    return classes
      .filter(c=>c.orgId===f.orgId)
      .filter(c=>!usedClassIds.has(c.id))
      .sort((a,b)=>a.date.localeCompare(b.date)) // oldest first
      .slice(0,30);
  }, [classes,f.orgId,usedClassIds]);
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
  const newItems = cls.map(c=>{
    const d = new Date(c.date+'T12:00');
    const dateLabel = d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
    const parts = [dateLabel];
    if(c.time) parts.push(c.time);
    if(c.duration) parts.push(`${c.duration}min`);
    return {
      id: uid(),
      description: `${parts.join(' · ')} — ${c.name}`,
      qty: 1,
      rate: c.rate || 40,
      total: c.rate || 40,
      classIds: [c.id],
    };
  });
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

// Inline form for logging a note, call, email, or meeting.
// `kind` controls which conditional fields show:
//   - call/email: direction picker (outbound default — "I called/emailed them")
//   - email:      subject line
//   - call/meeting: duration in minutes
// Default kind='note' keeps the ClassDetail per-person usage backward-compatible.
//
// Edit mode: pass `existing` (a UI-shape note) to pre-fill all state. In edit
// mode the kind is editable via an inline kind-picker row at the top so the
// user can fix a typo'd kind (e.g. "this was actually a call, not a note").
function NoteForm({ personId, classId, kind='note', existing, onSave, onCancel }) {
  const isEdit = !!existing;
  const [text, setText] = useState(existing?.text || '');
  const [imp, setImp] = useState(existing?.important ?? false);
  const [actionDate, setActionDate] = useState(existing?.actionDate || '');
  const [direction, setDirection] = useState(
    existing ? (existing.direction || null) : 'outbound'
  );
  const [subject, setSubject] = useState(existing?.subject || '');
  const [durationMins, setDurationMins] = useState(
    existing?.durationMins != null ? String(existing.durationMins) : ''
  );
  // In edit mode, kind is internal state (editable). In add mode it's driven
  // by the `kind` prop and locked for the lifetime of the form.
  const [editKind, setEditKind] = useState(existing?.kind || kind || 'note');
  const activeKind = isEdit ? editKind : kind;

  const meta = INTERACTION_KINDS[activeKind] || INTERACTION_KINDS.note;
  const needsDirection = activeKind === 'call' || activeKind === 'email';
  const needsSubject = activeKind === 'email';
  const needsDuration = activeKind === 'call' || activeKind === 'meeting';
  const placeholder = {
    note:    'Add a note...',
    call:    'What did you discuss?',
    email:   'Email summary or body...',
    meeting: 'Meeting notes — what came up?',
  }[activeKind] || 'Add a note...';
  const saveLabel = isEdit ? 'Save changes' : `Save ${meta.label.toLowerCase()}`;

  const save = () => {
    if(!text.trim()) return;
    const note = {
      personId,
      classId,
      text: text.trim(),
      important: imp,
      kind: activeKind,
    };
    // Add mode sets today; edit mode preserves the original date so the timeline
    // ordering doesn't shift when a note is touched up.
    if(!isEdit) note.date = today();
    note.actionDate = actionDate || null;

    if(isEdit) {
      // EDIT MODE: write every kind-specific field from current form state,
      // regardless of whether the active kind "needs" it. This means toggling
      // the kind chip doesn't destroy data — if you accidentally change a
      // call to a note and save, the duration/direction are preserved. To
      // actually clear a field, edit the input itself (clear the duration
      // number, blank the subject). Direction has no "clear" UI, but since
      // we init to null when existing.direction was null, it only writes a
      // value if the user explicitly clicked outbound/inbound.
      note.direction = direction || null;
      note.subject = subject.trim();  // '' is fine; the mapper converts to null
      note.durationMins = (durationMins !== '' && !isNaN(parseInt(durationMins,10)))
        ? parseInt(durationMins, 10)
        : null;
    } else {
      // ADD MODE: only write fields relevant to the chosen kind, so creating
      // a note doesn't pollute the row with a default 'outbound' direction.
      if(needsDirection) note.direction = direction;
      if(needsSubject && subject.trim()) note.subject = subject.trim();
      if(needsDuration && durationMins !== '' && !isNaN(parseInt(durationMins,10))) {
        note.durationMins = parseInt(durationMins, 10);
      }
      // Manually-logged inbound emails have no Message-ID (they didn't come
      // through the email worker), so without this they'd save with a null
      // thread_id and the Reply button would mint a fresh, unrelated thread —
      // the reply wouldn't group with the original. Mint a synthetic thread_id
      // here so the Reply path has a parent to inherit. 'manual:' prefix marks
      // origin and won't collide with Brevo/inbound Message-IDs.
      if(activeKind === 'email' && note.direction === 'inbound') {
        note.threadId = `manual:${crypto.randomUUID()}`;
      }
    }

    onSave(note);
    // Only reset in add mode — edit mode closes the modal externally and a
    // stale-reset would just flash empty fields between save and unmount.
    if(!isEdit) {
      setText(''); setImp(false); setActionDate('');
      setDirection('outbound'); setSubject(''); setDurationMins('');
    }
  };

  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${meta.color}88`,borderRadius:8,padding:16,marginBottom:12}}>
      {/* Header. Add mode: static icon + label. Edit mode: kind picker so a
          mis-tagged note (e.g. recorded as note but was actually a call) can
          be corrected. The picker uses the same chip pattern as the filter row
          to feel consistent. */}
      {isEdit ? (
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12,flexWrap:'wrap'}}>
          <span style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginRight:4}}>KIND</span>
          {Object.entries(INTERACTION_KINDS).map(([k, km]) => {
            const active = editKind === k;
            return (
              <button key={k} onClick={()=>setEditKind(k)} style={{
                background: active ? km.bg : 'transparent',
                color: active ? km.color : C.muted,
                border: `1px solid ${active ? km.color+'88' : C.border}`,
                borderRadius:4, fontSize:11, fontWeight:500, letterSpacing:'0.3px',
                padding:'3px 9px', cursor:'pointer',
                fontFamily:"'Jost',sans-serif",
                display:'inline-flex', alignItems:'center', gap:5,
              }}>
                <span style={{fontSize:11,lineHeight:1}}>{km.icon}</span>
                {km.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <span style={{fontSize:14,lineHeight:1}}>{meta.icon}</span>
          <span style={{color:meta.color,fontSize:11,fontWeight:600,letterSpacing:'0.6px',textTransform:'uppercase'}}>{meta.label}</span>
        </div>
      )}

      {/* Email subject */}
      {needsSubject && (
        <input type="text" value={subject} onChange={e=>setSubject(e.target.value)}
          placeholder="Subject"
          style={{width:'100%',background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:14,padding:'8px 12px',fontFamily:"'Jost',sans-serif",outline:'none',marginBottom:8}} />
      )}

      {/* Direction picker (call/email) + duration (call/meeting), one compact row */}
      {(needsDirection || needsDuration) && (
        <div style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap',marginBottom:10}}>
          {needsDirection && (
            <div style={{display:'flex',gap:4}}>
              {['outbound','inbound'].map(d => (
                <button key={d} onClick={()=>setDirection(d)}
                  style={{
                    background: direction===d ? meta.bg : 'transparent',
                    color: direction===d ? meta.color : C.muted,
                    border: `1px solid ${direction===d ? meta.color+'88' : C.border}`,
                    borderRadius:4, fontSize:11, fontWeight:500, letterSpacing:'0.3px',
                    padding:'3px 10px', cursor:'pointer', fontFamily:"'Jost',sans-serif",
                  }}>
                  {d==='outbound' ? '→ Outbound' : '← Inbound'}
                </button>
              ))}
            </div>
          )}
          {needsDuration && (
            <label style={{display:'flex',alignItems:'center',gap:6,color:C.muted,fontSize:13}}>
              Duration
              <input type="number" min="0" value={durationMins} onChange={e=>setDurationMins(e.target.value)}
                placeholder="—"
                style={{width:60,background:C.surf,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontSize:12,padding:'4px 8px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
              <span style={{color:C.muted,fontSize:11}}>min</span>
            </label>
          )}
        </div>
      )}

      <textarea value={text} onChange={e=>setText(e.target.value)} rows={3} placeholder={placeholder} style={{width:'100%',background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:14,padding:'10px 12px',fontFamily:"'Jost',sans-serif",resize:'vertical',outline:'none',lineHeight:1.6}} />
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
          <Btn small onClick={save}>{saveLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

// Edit-mode wrapper: drops NoteForm into a Modal with its `existing` prefill.
// Save calls onSave with the full UI-shape note (caller translates to DB patch).
function EditNoteForm({ note, onSave, onClose }) {
  return (
    <Modal title="Edit note" onClose={onClose} wide>
      <NoteForm
        personId={note.personId}
        classId={note.classId}
        existing={note}
        onSave={n=>{ onSave(n); onClose(); }}
        onCancel={onClose}
      />
    </Modal>
  );
}

// Compose-and-send modal for the CRM adhoc email feature. Plain-text v1: the
// form-worker handles HTML escaping + \n -> <br>, and sends via Brevo with no
// template (htmlContent direct). Errors from the worker (validation, missing
// primary email, Brevo failure) surface inline so the user can fix and retry
// without losing their draft. The outbound interaction is written server-side
// and returned to the caller via onSend, which is expected to splice it into
// the parent's notes state so it appears on PersonDetail immediately.
function SendEmailModal({ person, onSend, onClose, initialSubject = '', initialBody = '', threadId, inReplyTo, draftKey }) {
  // Draft persistence: if a draftKey is supplied (reply from a thread), the
  // in-progress body survives closing/reopening the modal via localStorage.
  // Subject is seeded from initialSubject (e.g. "Re: …") and not persisted —
  // it's derived and cheap to regenerate.
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(() => {
    if (draftKey) {
      try { const saved = localStorage.getItem(draftKey); if (saved != null) return saved; } catch {}
    }
    return initialBody;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Persist body as it changes. Writes are cheap and the modal is short-lived,
  // so no debounce. Cleared on successful send.
  useEffect(() => {
    if (!draftKey) return;
    try { localStorage.setItem(draftKey, body); } catch {}
  }, [body, draftKey]);

  const hasEmail = !!person.email;
  const canSend = !busy && hasEmail && subject.trim() && body.trim();

  const send = async () => {
    if (!canSend) return;
    setBusy(true); setErr(null);
    try {
      const res = await onSend({
        personId: person.id,
        subject: subject.trim(),
        body, // server escapes + \n -> <br>; keep newlines intact
        threadId,   // undefined for fresh sends → server mints a new thread_id
        inReplyTo,  // undefined for fresh sends → no In-Reply-To header
      });
      // Best-effort log failure: email *did* send, but the interaction row
      // didn't write. Surface and still close — user can add a manual note.
      if (res?.warning) alert(res.warning);
      if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Email ${person.name}`} onClose={busy ? ()=>{} : onClose} wide>
      <div style={{color:C.muted,fontSize:11,marginBottom:14,letterSpacing:'0.3px'}}>
        TO: {hasEmail
          ? <span style={{color:C.text}}>{person.email}</span>
          : <span style={{color:C.gold}}>⚠ No primary email — set one on this contact before sending</span>}
      </div>
      <input
        type="text"
        value={subject}
        onChange={e=>setSubject(e.target.value)}
        placeholder="Subject"
        disabled={busy}
        maxLength={200}
        style={{
          width:'100%',background:C.card,border:`1px solid ${C.border}`,
          borderRadius:6,color:C.text,fontSize:14,padding:'8px 12px',
          fontFamily:"'Jost',sans-serif",outline:'none',marginBottom:10,
        }}
      />
      <textarea
        value={body}
        onChange={e=>setBody(e.target.value)}
        rows={12}
        placeholder="Write your message..."
        disabled={busy}
        style={{
          width:'100%',background:C.card,border:`1px solid ${C.border}`,
          borderRadius:6,color:C.text,fontSize:14,padding:'10px 12px',
          fontFamily:"'Jost',sans-serif",resize:'vertical',outline:'none',
          lineHeight:1.6,
        }}
      />
      {err && (
        <div style={{
          marginTop:12,padding:'8px 12px',background:'#3a1f1f',
          border:'1px solid #6b2e2e',borderRadius:6,color:'#e8a4a4',
          fontSize:12,lineHeight:1.5,
        }}>
          {err}
        </div>
      )}
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}>
        <Btn variant="ghost" small onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn small onClick={send} disabled={!canSend}>{busy ? 'Sending…' : 'Send email'}</Btn>
      </div>
    </Modal>
  );
}

// Hoisted out of Sidebar so its internal hover state survives Sidebar re-renders.
// (Defining it inline made React see a "new" component type on every parent re-render
// and unmount/remount, wiping local state including the hover toggle for the × button.)
function SidebarCustomTypeItem({ active, indent, label, icon, count, onNav, onDelete }) {
  const [hover, setHover] = useState(false);
  const [armed, setArmed] = useState(false);
  // Auto-disarm so the confirm state doesn't get stuck if the user looks away
  useEffect(()=>{
    if(!armed) return;
    const id = setTimeout(()=>setArmed(false), 4000);
    return ()=>clearTimeout(id);
  }, [armed]);
  const canDelete = count === 0 && onDelete;
  return (
    <div
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>{ setHover(false); setArmed(false); }}
      style={{display:'flex',alignItems:'center',padding:`8px 20px 8px ${indent?28:20}px`,color:active?C.gold:C.muted,background:active?C.active:hover?C.surf:'transparent',cursor:'pointer',fontSize:13,fontWeight:active?500:400,borderLeft:`2px solid ${active?C.gold:'transparent'}`,transition:'all 0.12s'}}>
      <div onClick={onNav} style={{display:'flex',alignItems:'center',gap:9,flex:1,minWidth:0}}>
        <span style={{fontSize:12,opacity:0.7,width:14,flexShrink:0}}>{icon}</span>
        <span style={{flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</span>
        {count > 0 && <span style={{color:C.muted,fontSize:10,opacity:0.7}}>{count}</span>}
      </div>
      {hover && canDelete && !armed && (
        <button onClick={(e)=>{ e.stopPropagation(); setArmed(true); }}
          title="Remove type (only when empty)"
          style={{background:'none',border:'none',color:C.muted,cursor:'pointer',padding:'2px 6px',fontSize:14,marginLeft:4,opacity:0.6,fontFamily:"'Jost',sans-serif",lineHeight:1}}>
          ×
        </button>
      )}
      {hover && canDelete && armed && (
        <span style={{display:'inline-flex',gap:4,alignItems:'center',marginLeft:4}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setArmed(false)}
            title="Cancel"
            style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:3,fontSize:10,padding:'1px 6px',fontFamily:"'Jost',sans-serif",lineHeight:1.2}}>
            cancel
          </button>
          <button onClick={()=>{ setArmed(false); onDelete(); }}
            title="Confirm removal"
            style={{background:'#2a1313',border:`1px solid ${C.red}66`,color:C.red,cursor:'pointer',borderRadius:3,fontSize:10,padding:'1px 6px',fontFamily:"'Jost',sans-serif",lineHeight:1.2,fontWeight:600}}>
            remove
          </button>
        </span>
      )}
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ view, nav, invoices, notes, projects=[], customOrgTypes, customPersonRoles, onAddOrgType, onAddPersonRole, orgs, people, onRemoveOrgType, onRemovePersonRole, onSignOut, mode='client', onSwitchMode, onAddPersonalOrg }) {
  const unpaidInvoices = invoices.filter(i=>i.status!=='paid').length;
  const inboxCount = notes.filter(n =>
    (n.kind === 'email' || n.kind === 'form') &&
    n.direction !== 'outbound' &&
    n.source !== 'todo' &&
    !n.personId && !n.projectId
  ).length;
  const activeProjects = projects.filter(p => p.status === 'active' && !!p.isPersonal === (mode === 'personal')).length;
  // Threads = emails from known contacts. Badge counts distinct threads
  // (or solo emails) that contain at least one unread INBOUND message.
  // Outbound messages don't count as unread — you sent them.
  const threadsUnread = (() => {
    const seen = new Set();
    let count = 0;
    notes.forEach(n => {
      if (n.kind !== 'email' || !n.personId || n.readAt || n.direction === 'outbound') return;
      const key = n.threadId || `solo:${n.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      count++;
    });
    return count;
  })();
  const webUnread = webUnreadCount(notes);

  // Accordion nav: at most one section group open at a time. Sections are
  // 'orgs' | 'people' | 'sessions' | 'finance'. Opening one closes the others.
  // The top items (Dashboard / Inbox / Recent Activity) aren't grouped — they
  // stay flat since each is a single destination with nothing to expand.
  const sectionForView =
    (view.name === 'org_list' || view.name === 'org_detail') ? 'orgs' :
    (view.name === 'people'   || view.name === 'person_detail') ? 'people' :
    (view.name === 'week_view' || view.name === 'month_view' || view.name === 'classes' || view.name === 'class_detail' || view.name === 'forms_list') ? 'sessions' :
    (view.name === 'invoices' || view.name === 'invoice_detail') ? 'finance' :
    null;
  const [openSection, setOpenSection] = useState(sectionForView || 'people');
  // When navigating into a section, open it (and close the others).
  useEffect(()=>{ if(sectionForView) setOpenSection(sectionForView); }, [sectionForView]);
  const toggleSection = (key) => setOpenSection(cur => cur === key ? null : key);
  // Mode-switcher dropdown (Client ⇄ Personal record system)
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const isPersonal = mode === 'personal';

  const Item = ({ name, params={}, label, icon, indent, badge, count, onClick, isActive }) => {
    const active = isActive !== undefined ? isActive : (view.name===name && Object.entries(params).every(([k,v])=>view[k]===v));
    return (
      <div onClick={onClick || (()=>nav(name,params))} style={{display:'flex',alignItems:'center',gap:9,padding:`8px 20px 8px ${indent?28:20}px`,color:active?C.gold:C.muted,background:active?C.active:'transparent',cursor:'pointer',fontSize:13,fontWeight:active?500:400,borderLeft:`2px solid ${active?C.gold:'transparent'}`,transition:'all 0.12s'}}
        onMouseEnter={e=>{if(!active){e.currentTarget.style.color=C.text;e.currentTarget.style.background=C.surf;}}}
        onMouseLeave={e=>{if(!active){e.currentTarget.style.color=C.muted;e.currentTarget.style.background='transparent';}}}>
        <span style={{fontSize:12,opacity:0.7,width:14,flexShrink:0}}>{icon}</span>
        <span style={{flex:1}}>{label}</span>
        {count>0&&<span style={{color:active?C.gold:C.muted,fontSize:11,opacity:0.8,fontWeight:500}}>{count}</span>}
        {badge>0&&<span style={{background:C.red,color:'#fff',fontSize:10,fontWeight:600,padding:'1px 7px',borderRadius:20,lineHeight:'16px'}}>{badge}</span>}
      </div>
    );
  };

  // Small "+ Add type" affordance that lives at the end of an expanded sub-list.
  const AddTypeAction = ({ onClick, label }) => (
    <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:9,padding:'6px 20px 10px 28px',color:C.muted,cursor:'pointer',fontSize:11.5,fontStyle:'italic',opacity:0.75,transition:'all 0.12s'}}
      onMouseEnter={e=>{e.currentTarget.style.color=C.gold;e.currentTarget.style.opacity=1;}}
      onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.opacity=0.75;}}>
      <span style={{fontSize:12,width:14,flexShrink:0}}>+</span>
      <span>{label ? `Add ${label}…` : 'Add type…'}</span>
    </div>
  );

  // Collapsible section header (accordion). Clicking anywhere on it toggles the
  // group open/closed. Carries an optional badge (e.g. unpaid-invoice count)
  // so a collapsed section can still signal it needs attention. Styled like
  // the old SecHead label but interactive, with a rotating chevron. The label
  // sits in a gold tint with a faint bottom rule so the section headers read
  // clearly as group dividers (matching the gold section headings used on the
  // Dashboard). Hover lifts the whole row to full gold.
  const SectionToggle = ({ label, sectionKey, badge }) => {
    const open = openSection === sectionKey;
    return (
      <div onClick={()=>toggleSection(sectionKey)}
        style={{
          display:'flex',alignItems:'center',gap:8,
          margin:'10px 16px 2px', padding:'7px 4px 8px',
          cursor:'pointer',userSelect:'none',transition:'color 0.12s',
          color:C.gold, borderBottom:`1px solid ${C.border}`,
        }}
        onMouseEnter={e=>e.currentTarget.style.color=C.text}
        onMouseLeave={e=>e.currentTarget.style.color=C.gold}>
        <span style={{flex:1,fontSize:10,fontWeight:700,letterSpacing:'1.8px',textTransform:'uppercase',opacity:0.85}}>{label}</span>
        {badge>0 && <span style={{background:C.red,color:'#fff',fontSize:9,fontWeight:600,padding:'1px 6px',borderRadius:20,lineHeight:'15px'}}>{badge}</span>}
        <span style={{fontSize:9,opacity:0.6,transition:'transform 0.18s',transform:open?'rotate(0deg)':'rotate(-90deg)',display:'inline-flex'}}>▾</span>
      </div>
    );
  };

  return (
    <div style={{width:216,background:C.sbg,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0,overflowY:'auto'}}>
      <div style={{padding:'24px 20px 12px',position:'relative'}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:C.gold,letterSpacing:'1.5px',fontWeight:600}}>THE FELT BODY</div>
        <div onClick={()=>setModeMenuOpen(o=>!o)}
          style={{display:'flex',alignItems:'center',gap:6,marginTop:2,cursor:'pointer'}}
          title="Switch record system">
          <span style={{color:isPersonal?C.blue:C.muted,fontSize:9,letterSpacing:'3px',opacity:isPersonal?0.85:0.6}}>
            {isPersonal ? 'PERSONAL RECORD SYSTEM' : 'CLIENT RECORD SYSTEM'}
          </span>
          <span style={{color:C.muted,fontSize:8,opacity:0.6,transform:modeMenuOpen?'rotate(180deg)':'none',transition:'transform 0.12s'}}>▾</span>
        </div>
        {modeMenuOpen && (
          <div style={{position:'absolute',top:'100%',left:16,right:16,marginTop:2,background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,overflow:'hidden',zIndex:30,boxShadow:'0 8px 24px rgba(0,0,0,0.4)'}}>
            {[{k:'client',l:'Client Record System',c:C.gold},{k:'personal',l:'Personal Record System',c:C.blue}].map(opt=>(
              <div key={opt.k}
                onClick={()=>{ setModeMenuOpen(false); onSwitchMode && onSwitchMode(opt.k); }}
                style={{padding:'9px 12px',fontSize:11,letterSpacing:'0.5px',cursor:'pointer',color:mode===opt.k?opt.c:C.muted,background:mode===opt.k?C.active:'transparent',borderLeft:`2px solid ${mode===opt.k?opt.c:'transparent'}`}}
                onMouseEnter={e=>{if(mode!==opt.k){e.currentTarget.style.color=C.text;e.currentTarget.style.background=C.card;}}}
                onMouseLeave={e=>{if(mode!==opt.k){e.currentTarget.style.color=C.muted;e.currentTarget.style.background='transparent';}}}>
                {mode===opt.k?'● ':'○ '}{opt.l}
              </div>
            ))}
          </div>
        )}
      </div>
      <Item name="projects" label="Projects" icon="❖" count={activeProjects} isActive={view.name==='projects' || view.name==='project_detail'} />
      <Item name="dashboard" label="Dashboard" icon="◈" />
      {!isPersonal && <Item name="inbox" label="Inbox" icon="✉" badge={inboxCount} />}
      {!isPersonal && <Item name="threads" label="Threads" icon="✦" badge={threadsUnread} />}
      {!isPersonal && <Item name="web_activity" label="Web Activity" icon="◇" badge={webUnread} />}
      {isPersonal && <Item name="households" label="Households" icon="⌂" />}
      {isPersonal && <Item name="birthdays" label="Birthdays" icon="🎂" />}

      <SectionToggle label="Organisations" sectionKey="orgs" />
      {openSection==='orgs' && (
        <>
          {isPersonal ? (
            <>
              {orgs.filter(o=>o.type==='personal').map(o => (
                <Item key={o.id} name="org_detail" params={{orgId:o.id}} label={o.name} icon="◈" indent
                  isActive={view.name==='org_detail' && view.orgId===o.id} />
              ))}
              <AddTypeAction onClick={onAddPersonalOrg} label="Personal org" />
            </>
          ) : (
            <>
              <Item name="org_list" params={{orgType:'all'}} label="All Organisations" icon="⛁" indent />
              <Item name="org_list" params={{orgType:'care_home'}} label="Care Homes" icon="⌂" indent />
              <Item name="org_list" params={{orgType:'gym'}} label="Gyms" icon="◎" indent />
              <Item name="org_list" params={{orgType:'other'}} label="Other Orgs" icon="◇" indent />
              {customOrgTypes.filter(t=>t.key!=='personal').map(t => {
                const count = orgs.filter(o=>o.type===t.key).length;
                const active = view.name==='org_list' && view.orgType===t.key;
                return <SidebarCustomTypeItem key={t.key}
                  active={active} indent
                  label={`${t.label}s`} icon={t.icon||'◇'} count={count}
                  onNav={()=>nav('org_list',{orgType:t.key})}
                  onDelete={()=>onRemoveOrgType && onRemoveOrgType(t.key)} />;
              })}
              <AddTypeAction onClick={onAddOrgType} />
            </>
          )}
        </>
      )}

      <SectionToggle label={isPersonal ? "Contacts" : "People"} sectionKey="people" />
      {openSection==='people' && (
        <>
          {isPersonal ? (
            <Item name="people" params={{personType:'personal_contact'}} label="All Personal Contacts" icon="◉" indent />
          ) : (
            <>
              <Item name="people" params={{personType:'recent'}} label="Recent Contacts" icon="◷" indent />
              <Item name="people" params={{personType:'all'}} label="All Contacts" icon="◉" indent />
              <Item name="people" params={{personType:'private_client'}} label="Private Clients" icon="▸" indent />
              <Item name="people" params={{personType:'website_student'}} label="Students" icon="▸" indent />
              <Item name="people" params={{personType:'resident'}} label="Residents" icon="▸" indent />
              <Item name="people" params={{personType:'tt_prospect'}} label="TT Prospects" icon="▸" indent />
              <Item name="people" params={{personType:'retreat_interest'}} label="Retreat Interest" icon="▸" indent />
              <Item name="people" params={{personType:'workshop_interest'}} label="Workshop Interest" icon="▸" indent />
              {customPersonRoles.filter(t=>t.key!=='personal_contact').map(t => {
                const count = people.filter(p=>(p.roles||[]).includes(t.key)).length;
                const active = view.name==='people' && view.personType===t.key;
                return <SidebarCustomTypeItem key={t.key}
                  active={active} indent
                  label={`${t.label}s`} icon="▸" count={count}
                  onNav={()=>nav('people',{personType:t.key})}
                  onDelete={()=>onRemovePersonRole && onRemovePersonRole(t.key)} />;
              })}
              <AddTypeAction onClick={onAddPersonRole} />
            </>
          )}
        </>
      )}

      {!isPersonal && <SectionToggle label="Sessions" sectionKey="sessions" />}
      {!isPersonal && openSection==='sessions' && (
        <>
          <Item name="week_view" label="Week View" icon="▦" indent />
          <Item name="month_view" label="Month View" icon="▥" indent />
          <Item name="classes" label="All Classes" icon="≡" indent />
          <Item name="forms_list" label="Forms" icon="◍" indent />
        </>
      )}

      {!isPersonal && <SectionToggle label="Finance" sectionKey="finance" badge={unpaidInvoices} />}
      {!isPersonal && openSection==='finance' && (
        <>
          <Item name="invoices" label="Invoices" icon="⬡" badge={unpaidInvoices} indent />
        </>
      )}

      {!isPersonal && <Item name="comms_log" label="Recent Activity" icon="◷" />}
      {!isPersonal && <Item name="package_templates" label="Package Templates" icon="❒" />}

      {/* Pushed to the bottom; flex:column on the parent + marginTop:auto on this wrapper */}
      <div style={{marginTop:'auto',padding:'14px 20px',borderTop:`1px solid ${C.border}`}}>
        <button onClick={onSignOut}
          style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,
            cursor:'pointer',borderRadius:4,fontSize:11,padding:'6px 10px',width:'100%',
            fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── QUICK TODO MODAL ─────────────────────────────────────────────────────────
// Lightweight modal for adding a free-floating to-do from the Dashboard header.
// Saves with source='todo' so it satisfies the interactions_anchored constraint
// without needing a person or session anchor. Person picker is optional — if
// filled, the to-do also appears on that contact's Comms tab.
function QuickTodoModal({ people, projects=[], onSave, onClose }) {
  const [text, setText] = useState('');
  const [actionDate, setActionDate] = useState('');
  const [personId, setPersonId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const canSave = !busy && text.trim() && (personId || projectId);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave({
        text: text.trim(),
        actionDate: actionDate || null,
        personId: personId || null,
        projectId: projectId || null,
        kind: 'note',
        source: 'todo',
        date: today(),
        important: false,
      });
      onClose();
    } catch(e) {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: '100%', background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 6, color: C.text, fontSize: 14, padding: '8px 12px',
    fontFamily: "'Jost',sans-serif", outline: 'none',
  };

  return (
    <Modal title="Add To Do" onClose={busy ? ()=>{} : onClose}>
      <textarea
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
        rows={3}
        placeholder="What needs doing?"
        disabled={busy}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, marginBottom: 12 }}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 4, letterSpacing: '0.3px' }}>DATE</div>
          <input
            type="date"
            value={actionDate}
            onChange={e => setActionDate(e.target.value)}
            disabled={busy}
            style={{ ...inputStyle, width: 'auto', fontSize: 13 }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 4, letterSpacing: '0.3px' }}>LINK TO PERSON</div>
          <select
            value={personId}
            onChange={e => setPersonId(e.target.value)}
            disabled={busy}
            style={{ ...inputStyle, fontSize: 13, cursor: 'pointer' }}
          >
            <option value="">— none —</option>
            {[...people]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {projects.filter(p => p.status === 'active').length > 0 && (
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 4, letterSpacing: '0.3px' }}>PROJECT</div>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              disabled={busy}
              style={{ ...inputStyle, fontSize: 13, cursor: 'pointer' }}
            >
              <option value="">— none —</option>
              {[...projects].filter(p => p.status === 'active')
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {text.trim() && !personId && !projectId && (
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 10, fontStyle: 'italic' }}>
          Link this to-do to a person or a project to save it.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn variant="secondary" small onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn small onClick={save} disabled={!canSave}>
          {busy ? 'Saving…' : 'Add To Do'}
        </Btn>
      </div>
    </Modal>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ orgs, people, classes, attendance, notes, packages, invoices, projects=[], nav, onAddClass, onCompleteNote, onReopenNote, onAddTodo, onMarkWebRead }) {
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

  const onDay = classes.filter(c=>c.date===selectedDate).sort((a,b) => {
    // Order by time first (earliest first), then by location for same-time classes
    const at = a.time || '99:99', bt = b.time || '99:99';
    if(at !== bt) return at.localeCompare(bt);
    return (a.location||'').localeCompare(b.location||'');
  });
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

  // Active to-dos = notes with an action date that haven't been marked completed.
  // The filter widget below decides what subset to display.
  const t = today();
  const weekEnd = useMemo(() => endOfWeek(t), [t]);
  const monthEnd = useMemo(() => lastDayOfMonth(t), [t]);

  const [todoFilter, setTodoFilter] = useState('today'); // today | week | month | all | completed
  const [showTodoModal, setShowTodoModal] = useState(false);

  const todoCounts = useMemo(() => {
    const active = notes.filter(n => n.actionDate && !n.completed);
    return {
      today: active.filter(n => n.actionDate <= t).length,
      week: active.filter(n => n.actionDate <= weekEnd).length,
      month: active.filter(n => n.actionDate <= monthEnd).length,
      all: active.length,
      completed: notes.filter(n => n.completed).length,
    };
  }, [notes, t, weekEnd, monthEnd]);

  const filteredTodos = useMemo(() => {
    if(todoFilter === 'completed') {
      return notes.filter(n => n.completed)
        .sort((a,b) => (b.completedAt||'').localeCompare(a.completedAt||''));
    }
    let active = notes.filter(n => n.actionDate && !n.completed);
    if(todoFilter === 'today')      active = active.filter(n => n.actionDate <= t);
    else if(todoFilter === 'week')  active = active.filter(n => n.actionDate <= weekEnd);
    else if(todoFilter === 'month') active = active.filter(n => n.actionDate <= monthEnd);
    // 'all' shows every active item
    return active.sort((a,b) => a.actionDate.localeCompare(b.actionDate));
  }, [notes, todoFilter, t, weekEnd, monthEnd]);

  const activePkgs = packages.filter(p=>p.type==='monthly_unlimited'||(p.type!=='drop_in'&&p.sessionsUsed<p.totalSessions)).length;
  const outstanding = invoices.filter(i=>i.status!=='paid').reduce((s,i)=>s+(i.total||0),0);

  const personOf = (id) => people.find(p=>p.id===id);
  const projectOf = (id) => projects.find(p=>p.id===id);
  const goToNote = (n) => {
    if (n.projectId) return nav('project_detail', { projectId: n.projectId });
    if (n.personId) return nav('person_detail', { personId: n.personId, highlightNoteId: n.id });
    // Anchorless (shouldn't happen post-B2) — no destination, do nothing.
  };

  // ─── Mobile accordion plumbing ─────────────────────────────────────────────
  // Section keys are stable identifiers used for the "last opened" memory.
  // The toggle in MobileHeader flips expandAll between contracted (one open,
  // titles always visible) and expanded (all open, page scrolls).
  const isMobile = useIsMobile();
  const { expandAll } = useMobileUI();
  const [openSection, setOpenSection] = useLocalStorage('fbc.dashboard.openSection', 'todo');
  const recentItems = useMemo(() =>
    [...notes, ...deriveActivity(attendance, classes, packages)]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6),
    [notes, attendance, classes, packages]
  );

  // Web Activity for the dashboard panel: newest website bookings/payments,
  // capped. Unread count drives the header meta. Sibling of Recent Activity,
  // sits above it. Clicking a row marks it read + opens the contact.
  const webItems = useMemo(() => webEvents(notes).slice(0, 6), [notes]);
  const webUnreadN = useMemo(() => webUnreadCount(notes), [notes]);
  const renderWebActivityBody = () => (
    webItems.length === 0 ? (
      <Empty text="No website bookings yet." />
    ) : (
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {webItems.map(n => (
          <WebActivityRow key={n.id} note={n} compact
            personName={personOf(n.personId)?.name || ''}
            onOpen={() => { if(!n.readAt) onMarkWebRead && onMarkWebRead(n.id); if(n.personId) nav('person_detail',{personId:n.personId}); }} />
        ))}
      </div>
    )
  );

  // The actual section body renderers — each one returns JSX, called by both
  // mobile and desktop layouts. Pulled into named consts so the desktop side
  // can flow them in order while mobile wraps each in an accordion panel.
  const renderTodoBody = () => (
    (todoCounts.all > 0 || todoCounts.completed > 0) ? (
      <>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
          {[
            {key:'today', label:'Today', count:todoCounts.today},
            {key:'week', label:'This Week', count:todoCounts.week},
            {key:'month', label:'This Month', count:todoCounts.month},
            {key:'all', label:'All', count:todoCounts.all},
            {key:'completed', label:'Completed', count:todoCounts.completed},
          ].map(p => (
            <button key={p.key} onClick={()=>setTodoFilter(p.key)}
              style={{
                background: todoFilter===p.key ? C.goldBg : C.surf,
                border: `1px solid ${todoFilter===p.key ? C.gold+'aa' : C.border}`,
                color: todoFilter===p.key ? C.gold : C.muted,
                cursor:'pointer', borderRadius:20, fontSize:11.5, padding:'3px 10px',
                fontFamily:"'Jost',sans-serif",
                fontWeight: todoFilter===p.key ? 600 : 400,
                letterSpacing:'0.3px',
              }}>
              {p.label}{p.count>0?` · ${p.count}`:''}
            </button>
          ))}
        </div>
        {filteredTodos.length > 0 ? (
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
            {filteredTodos.map((n,i)=>{
              const p = personOf(n.personId);
              const isCompleted = !!n.completed;
              const overdue = !isCompleted && n.actionDate < t;
              const dueToday = !isCompleted && n.actionDate === t;
              const accent = isCompleted ? C.muted : (overdue ? C.red : dueToday ? C.gold : C.blue);
              const rightLabel = isCompleted ? 'Completed' : (overdue?'Overdue':dueToday?'Today':'Upcoming');
              const rightDate = isCompleted ? n.completedAt : n.actionDate;
              return (
                <div key={n.id} onClick={()=>goToNote(n)}
                  style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',borderBottom:i<filteredTodos.length-1?`1px solid ${C.border}`:'none',cursor:'pointer',background:isCompleted?C.bg:C.card,transition:'background 0.12s'}}
                  onMouseEnter={e=>e.currentTarget.style.background=isCompleted?C.surf:C.active} onMouseLeave={e=>e.currentTarget.style.background=isCompleted?C.bg:C.card}>
                  <div style={{width:6,height:36,borderRadius:3,background:accent,flexShrink:0,opacity:isCompleted?0.5:1}} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                      {p && <div style={{color:isCompleted?C.muted:C.text,fontSize:14,fontWeight:500}}>{p.name}</div>}
                      {!p && n.projectId && projectOf(n.projectId) && (
                        <div style={{color:isCompleted?C.muted:C.gold,fontSize:13,fontWeight:500}}>▸ {projectOf(n.projectId).name}</div>
                      )}
                      {n.important && !isCompleted && <span style={{color:C.gold,fontSize:9,fontWeight:700,letterSpacing:'0.5px'}}>⚑</span>}
                    </div>
                    <div style={{color:C.muted,fontSize:13,lineHeight:1.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',opacity:isCompleted?0.7:1}}>{n.text}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{color:accent,fontSize:11,fontWeight:600,letterSpacing:'0.4px',textTransform:'uppercase'}}>
                      {rightLabel}
                    </div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{rightDate ? fmt(rightDate) : '—'}</div>
                  </div>
                  {/* Quick complete/reopen toggle without leaving the dashboard */}
                  <button onClick={(e)=>{ e.stopPropagation(); isCompleted ? (onReopenNote && onReopenNote(n.id)) : (onCompleteNote && onCompleteNote(n.id)); }}
                    title={isCompleted ? 'Reopen' : 'Mark done'}
                    style={{background:'none',border:`1px solid ${C.border}`,color:isCompleted?C.muted:C.green,cursor:'pointer',borderRadius:4,fontSize:13,padding:'4px 9px',fontFamily:"'Jost',sans-serif",flexShrink:0,lineHeight:1}}>
                    {isCompleted ? '↺' : '✓'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'18px 6px'}}>
            {todoFilter==='completed' ? 'Nothing completed yet.' : todoFilter==='today' ? 'Nothing on for today.' : 'Nothing in this range.'}
          </div>
        )}
      </>
    ) : (
      <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'12px 0'}}>Nothing on the to-do list.</div>
    )
  );

  const renderClassesBody = () => (
    <>
      {/* Date controls (the back/forward/today pickers) */}
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
        const timeLbl = fmtTime(c.time);
        return (
          <div key={c.id} onClick={()=>nav('class_detail',{classId:c.id})} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 16px',marginBottom:9,cursor:'pointer',transition:'border-color 0.15s'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.gold+'66'} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              {timeLbl && <span style={{color:C.gold,fontSize:13,fontWeight:600,fontFamily:"'Jost',sans-serif",letterSpacing:'0.2px'}}>{timeLbl}</span>}
              <div style={{color:C.text,fontSize:14,fontWeight:500}}>{c.name}</div>
              <KindBadge kindKey={kk} small />
              {c.seriesId&&<span style={{color:C.muted,fontSize:11,marginLeft:2}}>↻</span>}
            </div>
            <div style={{color:C.muted,fontSize:12,marginTop:3}}>{c.location}</div>
          </div>
        );
      }) : <div style={{color:C.muted,fontSize:13,padding:'18px 0',fontStyle:'italic'}}>No classes on this day.</div>}
    </>
  );

  const renderImportantNotesBody = () => (
    <>
      <div style={{color:C.muted,fontSize:11,letterSpacing:'0.4px',marginBottom:14}}>
        {onDay.length ? `For people on this day's register` : `No classes on this day`}
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
      }) : <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'12px 0'}}>{onDay.length?'Nothing flagged for this day\'s people.':'—'}</div>}
    </>
  );

  const renderRecentActivityBody = () => (
    recentItems.length === 0
      ? <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'12px 0'}}>No recent activity yet.</div>
      : (
        <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
          {recentItems.map((n, i) => {
            const meta = INTERACTION_KINDS[n.kind] || INTERACTION_KINDS.note;
            const p = personOf(n.personId);
            const onClick = p
              ? () => nav('person_detail', { personId: p.id, highlightNoteId: n.id })
              : (n.classId ? () => nav('class_detail', { classId: n.classId }) : null);
            const clickable = !!onClick;
            const snip = String(n.text || '').replace(/\s+/g, ' ').trim();
            const display = snip.length > 90 ? snip.slice(0, 90) + '…' : snip;
            return (
              <div key={n.id} onClick={onClick || undefined}
                title={`${meta.label} · ${fmt(n.date)}${p?` · ${p.name}`:''}`}
                style={{
                  display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
                  borderBottom: i < recentItems.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: clickable ? 'pointer' : 'default',
                  background: C.card, transition:'background 0.12s',
                }}
                onMouseEnter={e=>{ if(clickable) e.currentTarget.style.background = C.active; }}
                onMouseLeave={e=>{ if(clickable) e.currentTarget.style.background = C.card; }}>
                <div style={{
                  width:24, height:24, borderRadius:6,
                  background:meta.bg, border:`1px solid ${meta.color}55`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  flexShrink:0, fontSize:12, lineHeight:1,
                }}>{meta.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                    <div style={{color:C.text,fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {p ? p.name : (n.fromEmail || n.toEmail || 'Unassigned')}
                    </div>
                    {n.subject && (
                      <div style={{color:C.gold,fontSize:11,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',opacity:0.9}}>
                        {n.subject}
                      </div>
                    )}
                  </div>
                  <div style={{color:C.muted,fontSize:12,lineHeight:1.4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {display || <span style={{fontStyle:'italic',opacity:0.7}}>—</span>}
                  </div>
                </div>
                <div style={{color:C.muted,fontSize:11,flexShrink:0,whiteSpace:'nowrap'}}>
                  {fmtRel(n.date)}
                </div>
              </div>
            );
          })}
        </div>
      )
  );

  // Sections array drives both layouts. Order is the same on desktop and mobile:
  // To Do first, then Classes, Important Notes, Recent Activity. Each entry has
  // a meta-label rendered next to the title (counts, dates) and an optional
  // header action (e.g. "+ Class" on Classes).
  const sections = [
    {
      key: 'todo',
      title: 'To Do',
      meta: `${filteredTodos.length} item${filteredTodos.length!==1?'s':''}`,
      action: (
        <button onClick={() => setShowTodoModal(true)}
          style={{background:C.goldBg,border:`1px solid ${C.gold}88`,color:C.gold,cursor:'pointer',borderRadius:6,fontSize:12,padding:'4px 11px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px',fontWeight:500}}>
          + Add To Do
        </button>
      ),
      body: renderTodoBody,
    },
    {
      key: 'classes',
      title: 'Classes',
      meta: dateLabel || null,
      action: (
        <button onClick={()=>onAddClass && onAddClass(selectedDate)}
          title={`Add class for ${fmt(selectedDate)}`}
          style={{background:C.goldBg,border:`1px solid ${C.gold}88`,color:C.gold,cursor:'pointer',borderRadius:6,fontSize:12,padding:'4px 11px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px',fontWeight:500}}>
          + Class
        </button>
      ),
      body: renderClassesBody,
    },
    {
      key: 'important',
      title: 'Important Notes',
      meta: null,
      action: null,
      body: renderImportantNotesBody,
    },
    {
      key: 'web',
      title: 'Web activity',
      meta: webUnreadN > 0 ? `${webUnreadN} new` : null,
      action: (
        <button onClick={()=>nav('web_activity')}
          style={{background:'none',border:'none',color:C.gold,cursor:'pointer',fontSize:12,padding:0,fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>
          View all →
        </button>
      ),
      body: renderWebActivityBody,
    },
    {
      key: 'recent',
      title: 'Recent activity',
      meta: recentItems.length ? `last ${recentItems.length}` : null,
      action: (
        <button onClick={()=>nav('comms_log')}
          style={{background:'none',border:'none',color:C.gold,cursor:'pointer',fontSize:12,padding:0,fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>
          View all →
        </button>
      ),
      body: renderRecentActivityBody,
    },
  ];

  // SectionTitle: shared header row used by both layouts. On mobile it's also
  // the accordion's tap target.
  const SectionTitleBar = ({ s, isOpen, onToggle, mobile }) => (
    <div onClick={mobile ? onToggle : undefined}
      style={{
        display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
        marginBottom: mobile ? 0 : 14,
        padding: mobile ? '12px 14px' : 0,
        background: mobile ? C.card : 'transparent',
        border: mobile ? `1px solid ${C.border}` : 'none',
        borderRadius: mobile ? 8 : 0,
        cursor: mobile ? 'pointer' : 'default',
        flexWrap:'wrap',
      }}>
      <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0,flex:1}}>
        {mobile && (
          <span style={{color:C.muted,fontSize:13,width:14,display:'inline-block',transition:'transform 0.15s',transform:isOpen?'rotate(90deg)':'rotate(0deg)'}}>▸</span>
        )}
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:mobile?17:19,color:C.gold,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {s.title}
          {s.meta && <span style={{color:C.muted,fontSize:13,fontWeight:400,marginLeft:8,fontFamily:"'Jost',sans-serif"}}>· {s.meta}</span>}
        </div>
      </div>
      {s.action && (
        <div onClick={e=>e.stopPropagation()}>{s.action}</div>
      )}
    </div>
  );

  // ─── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    // Contracted: section titles always pinned, ONE body expanded with internal
    // scroll. Expanded: all sections open, page scrolls normally.
    const showSectionBody = (key) => expandAll || openSection === key;
    const onToggle = (key) => {
      if (expandAll) return;  // ignore taps in expanded mode; whole point is they're all open
      setOpenSection(key === openSection ? null : key);
    };

    if (expandAll) {
      return (
        <>
        <div style={{padding:'12px 12px 24px'}}>
          <PageHead subInfo={fmt(today())}>Dashboard</PageHead>
          <div style={{display:'flex',flexDirection:'column',gap:18}}>
            {sections.map(s => (
              <div key={s.key}>
                <SectionTitleBar s={s} mobile={false} />
                <div>{s.body()}</div>
              </div>
            ))}
          </div>
        </div>
        {showTodoModal && (
          <QuickTodoModal people={people} projects={projects} onSave={onAddTodo} onClose={() => setShowTodoModal(false)} />
        )}
        </>
      );
    }

    // Contracted accordion. Titles are flex items; the OPEN one flex-grows
    // to fill the remaining viewport and scrolls internally.
    return (
      <>
      <div style={{padding:'12px 12px 0',display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
        <PageHead subInfo={fmt(today())}>Dashboard</PageHead>
        <div style={{display:'flex',flexDirection:'column',gap:8,flex:1,minHeight:0}}>
          {sections.map(s => {
            const isOpen = showSectionBody(s.key);
            return (
              <div key={s.key} style={{
                display:'flex',flexDirection:'column',
                flex: isOpen ? '1 1 auto' : '0 0 auto',
                minHeight: 0,
              }}>
                <SectionTitleBar s={s} isOpen={isOpen} onToggle={()=>onToggle(s.key)} mobile />
                {isOpen && (
                  <div style={{flex:1,minHeight:0,overflowY:'auto',padding:'12px 4px 14px'}}>
                    {s.body()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {showTodoModal && (
        <QuickTodoModal people={people} projects={projects} onSave={onAddTodo} onClose={() => setShowTodoModal(false)} />
      )}
      </>
    );
  }

  // ─── DESKTOP LAYOUT ────────────────────────────────────────────────────────
  return (
  <>
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px',maxWidth:920}}>
      <div style={{marginBottom:30}}>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,color:C.text,margin:'0 0 4px'}}>Dashboard</h1>
        <div style={{color:C.muted,fontSize:14}}>{fmt(today())}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:36}}>
        <Stat label="Organisations" value={orgs.filter(o=>!isPersonalOrg(o)).length} sub={`${orgs.filter(o=>o.type==='care_home').length} care homes`} />
        <Stat label="All Contacts" value={people.filter(p=>!isPersonalOnly(p)).length} sub={`${people.filter(p=>p.status==='active'&&!isPersonalOnly(p)).length} active`} />
        <Stat label="To Do" value={todoCounts.all} sub={(()=>{ const o=notes.filter(n=>n.actionDate&&!n.completed&&n.actionDate<t).length; return o>0?`${o} overdue`:'all on track'; })()} />
        <Stat label="Outstanding" value={fmtMoney(outstanding)} sub={`${invoices.filter(i=>i.status!=='paid').length} invoice${invoices.filter(i=>i.status!=='paid').length!==1?'s':''}`} />
      </div>

      {/* Section order: To Do → Classes → Important Notes → Recent Activity.
          The bottom two render side-by-side at >=920px (Important / Classes
          historically; now we keep the same two-column flow for compactness
          but with To Do at the top spanning full width). */}
      <div style={{marginBottom:32}}>
        <SectionTitleBar s={sections[0]} mobile={false} />
        {renderTodoBody()}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:28,marginBottom:32}}>
        <div>
          <SectionTitleBar s={sections[1]} mobile={false} />
          {renderClassesBody()}
        </div>
        <div>
          <SectionTitleBar s={sections[2]} mobile={false} />
          {renderImportantNotesBody()}
        </div>
      </div>

      <div style={{marginTop:32}}>
        <SectionTitleBar s={sections[3]} mobile={false} />
        {renderWebActivityBody()}
      </div>

      {recentItems.length > 0 && (
        <div style={{marginTop:32}}>
          <SectionTitleBar s={sections[4]} mobile={false} />
          {renderRecentActivityBody()}
        </div>
      )}
    </div>
    {showTodoModal && (
      <QuickTodoModal
        people={people}
        projects={projects}
        onSave={onAddTodo}
        onClose={() => setShowTodoModal(false)}
      />
    )}
  </>
  );
}


// Surfaces interactions with person_id IS NULL (Phase 8 Half A). Rows arrive
// here when the inbound Worker, form submissions, or future Brevo webhooks
// ingest a communication whose sender/recipient doesn't match any existing
// contact. Each row gets an "Assign to person" action (which optionally adds
// the address to that person's email list) and a "Discard" action.
//
// Reads from the shared `notes` array (already in state from loadAll), so
// no extra fetching is needed. The badge on the sidebar uses the same count.
function InboxView({ notes, people, attendance, classes, onAssign, onDiscard }) {
  const isMobile = useIsMobile();
  const { personRoles } = useTypes();
  const [pickerFor, setPickerFor] = useState(null);  // note row currently being assigned

  const unlinked = useMemo(() =>
    notes
      .filter(n =>
        (n.kind === 'email' || n.kind === 'form') &&
        n.direction !== 'outbound' &&
        n.source !== 'todo' &&
        !n.personId && !n.projectId
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [notes]);

  // Snippet: first ~140 chars of the body, single-line for the row preview.
  // Full body shows after expansion (click row).
  const snippet = (t) => {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    return s.length > 140 ? s.slice(0, 140) + '…' : s;
  };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '24px 32px',maxWidth:920}}>
      <PageHead subInfo={unlinked.length === 0 ? 'all clear' : `${unlinked.length} unlinked`}>Inbox</PageHead>
      {!isMobile && (
        <p style={{color:C.muted,fontSize:13,marginTop:-12,marginBottom:24,maxWidth:560,lineHeight:1.5}}>
          Communications whose sender doesn't match any existing contact land here.
          Assign each one to a person (or discard if spam / irrelevant).
        </p>
      )}

      {unlinked.length === 0 ? (
        <Empty text="No unlinked communications. Inbox is clear." />
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {unlinked.map(n => {
            const meta = INTERACTION_KINDS[n.kind] || INTERACTION_KINDS.note;
            // Show the address that's "the other party" — sender for inbound,
            // recipient for outbound. Fall back to whichever's present.
            const counterparty = n.direction === 'outbound'
              ? (n.toEmail || n.fromEmail)
              : (n.fromEmail || n.toEmail);
            return (
              <div key={n.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'14px 16px'}}>
                {/* Top row: kind chip, direction, counterparty, date */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
                  <span style={{
                    display:'inline-flex',alignItems:'center',gap:5,
                    background:meta.bg,color:meta.color,
                    border:`1px solid ${meta.color}55`,
                    borderRadius:4,padding:'2px 8px',fontSize:11,fontWeight:600,letterSpacing:'0.3px',
                  }}>
                    <span style={{fontSize:11,lineHeight:1}}>{meta.icon}</span>
                    {meta.label}
                  </span>
                  {n.direction && (
                    <span style={{color:C.muted,fontSize:11,letterSpacing:'0.4px',textTransform:'uppercase'}}>
                      {n.direction}
                    </span>
                  )}
                  {counterparty && (
                    <span style={{color:C.text,fontSize:13,fontWeight:500}}>{counterparty}</span>
                  )}
                  <span style={{marginLeft:'auto',color:C.muted,fontSize:11}}>{fmt(n.date)}</span>
                </div>

                {/* Subject (if email/form) */}
                {n.subject && (
                  <div style={{color:C.gold,fontSize:13,fontWeight:500,marginBottom:6}}>
                    {n.subject}
                  </div>
                )}

                {/* Body snippet */}
                <div style={{color:C.text,fontSize:13,lineHeight:1.5,marginBottom:12,opacity:0.9}}>
                  {snippet(n.text)}
                </div>

                {/* Actions */}
                <div style={{display:'flex',justifyContent:'flex-end',gap:8,alignItems:'center'}}>
                  <ConfirmBtn idleLabel="Discard"
                    onConfirm={() => onDiscard(n.id)}
                    title="Soft-delete this row (won't appear anywhere)" />
                  <Btn small onClick={() => setPickerFor(n)}>Assign to person →</Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pickerFor && (
        <AssignToPersonModal
          note={pickerFor}
          people={people}
          attendance={attendance}
          classes={classes}
          onClose={() => setPickerFor(null)}
          onAssign={(personId, addEmailIfNew) => {
            onAssign(pickerFor.id, personId, addEmailIfNew);
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}

// Modal for picking the person to assign an unlinked interaction to.
// Reuses the existing SearchSelect component (used elsewhere for the class
// register), so contact search behaviour is consistent. "Also add this email"
// checkbox defaults on — the killer feature of the inbox is one-click
// "log this comm AND learn this new address".
function AssignToPersonModal({ note, people, attendance, classes, onClose, onAssign }) {
  const [selected, setSelected] = useState(null);
  const [addEmail, setAddEmail] = useState(true);

  // Pick which address would be added (matches assignToPerson logic in data layer).
  const candidateEmail = note.direction === 'outbound'
    ? note.toEmail
    : note.fromEmail;

  const available = people.filter(p => p.status !== 'inactive');

  return (
    <Modal title="Assign to contact" onClose={onClose} wide>
      <div style={{color:C.muted,fontSize:12,marginBottom:14,lineHeight:1.5}}>
        Pick the contact this {INTERACTION_KINDS[note.kind]?.label.toLowerCase() || 'communication'} belongs to.
        {candidateEmail && (
          <> The email address <span style={{color:C.gold}}>{candidateEmail}</span> can be added to their contact record at the same time.</>
        )}
      </div>

      <SearchSelect people={available} onSelect={p => setSelected(p)}
        attendance={attendance} classes={classes} />

      {selected && (
        <div style={{marginTop:14,background:C.active,border:`1px solid ${C.gold}55`,borderRadius:6,padding:'10px 14px'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom: candidateEmail ? 10 : 0}}>
            <Avatar name={selected.name} size={28} role={primaryRole(selected)} />
            <span style={{color:C.text,fontSize:14,flex:1}}>{selected.name}</span>
          </div>

          {candidateEmail && (
            <label style={{display:'flex',alignItems:'center',gap:8,color:C.muted,fontSize:12,cursor:'pointer',userSelect:'none'}}>
              <input type="checkbox" checked={addEmail}
                onChange={e => setAddEmail(e.target.checked)}
                style={{accentColor:C.gold}} />
              Also add <span style={{color:C.text}}>{candidateEmail}</span> to {selected.name.split(' ')[0]}'s emails
            </label>
          )}
        </div>
      )}

      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}>
        <Btn variant="ghost" small onClick={onClose}>Cancel</Btn>
        <Btn small disabled={!selected}
          onClick={() => selected && onAssign(selected.id, addEmail)}>
          Assign
        </Btn>
      </div>
    </Modal>
  );
}

// ─── RECENT ACTIVITY ──────────────────────────────────────────────────────────
// Activity feed across the whole business. Two modes:
//   • Nothing selected  → global feed (last N interactions across everyone),
//                          newest first, with kind filter chips.
//   • Entity selected    → all activity for one contact or organisation,
//                          reached via the search box at the top.
//
// For a contact, "activity" = interactions anchored to that person. For an
// organisation, interactions don't carry an org_id, so we derive it: the
// org's members (people.orgId === org.id) plus the org's classes — any
// interaction anchored to one of those people or classes counts.
//
// Why this exists: Phase 8 Half A auto-files inbound emails to PersonDetail
// silently. Without a feed, those rows pass under attention. This is the
// "did anything happen?" surface — click any row to open the linked record.
//

// ─── WEB ACTIVITY ─────────────────────────────────────────────────────────────
// Dedicated feed of real interaction rows minted by the website pipeline:
// booking reservations (source='form', kind='booking') now, card payments
// (source='stripe') once the Stripe worker lands. Separate from Recent Activity
// (mostly derived register entries) and Inbox (unknown-sender comms) so a single
// website booking doesn't vanish among hundreds of gym-class attendances.
// Unread = interactions.read_at IS NULL (shared with Threads). Per-row: clicking
// a row opens the linked person AND marks it read; "Mark all read" clears the lot.

// Shared row renderer — used by both the full view and the dashboard panel.
function WebActivityRow({ note, personName, onOpen, compact }) {
  const meta = INTERACTION_KINDS[note.kind] || INTERACTION_KINDS.note;
  const unread = !note.readAt;
  return (
    <div onClick={onOpen}
      style={{
        display:'flex',alignItems:'flex-start',gap:11,
        background: unread ? C.goldBg : C.card,
        border:`1px solid ${unread ? C.gold+'55' : C.border}`,
        borderRadius:8, padding: compact ? '10px 12px' : '13px 16px',
        cursor:'pointer', transition:'background 0.12s,border-color 0.12s',
      }}
      onMouseEnter={e=>{ e.currentTarget.style.borderColor = C.gold+'99'; }}
      onMouseLeave={e=>{ e.currentTarget.style.borderColor = unread ? C.gold+'55' : C.border; }}>
      {/* Unread dot */}
      <span style={{
        width:8,height:8,borderRadius:8,flexShrink:0,marginTop:6,
        background: unread ? C.gold : 'transparent',
        border: unread ? 'none' : `1px solid ${C.border}`,
      }} />
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:compact?2:4,flexWrap:'wrap'}}>
          <span style={{
            display:'inline-flex',alignItems:'center',gap:4,
            background:meta.bg,color:meta.color,border:`1px solid ${meta.color}55`,
            borderRadius:4,padding:'1px 7px',fontSize:10,fontWeight:600,letterSpacing:'0.3px',
          }}>
            <span style={{fontSize:10,lineHeight:1}}>{meta.icon}</span>{meta.label}
          </span>
          <span style={{color:C.text,fontSize:13,fontWeight:unread?600:500}}>
            {personName || 'Unknown contact'}
          </span>
          <span style={{marginLeft:'auto',color:C.muted,fontSize:11}}>{fmt(note.date)}</span>
        </div>
        <div style={{color:C.text,fontSize:compact?12.5:13,lineHeight:1.45,opacity:0.88,
          ...(compact ? {whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'} : {})}}>
          {note.text}
        </div>
      </div>
    </div>
  );
}

function WebActivityView({ notes, people, nav, onMarkRead, onMarkAllRead }) {
  const isMobile = useIsMobile();
  const events = useMemo(() => webEvents(notes), [notes]);
  const unread = useMemo(() => events.filter(n => !n.readAt).length, [events]);
  const nameFor = (id) => people.find(p => p.id === id)?.name || '';

  const open = (n) => {
    if (!n.readAt) onMarkRead(n.id);
    if (n.personId) nav('person_detail', { personId: n.personId });
  };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '24px 32px',maxWidth:920}}>
      <PageHead subInfo={unread > 0 ? `${unread} new` : 'all caught up'} action={
        unread > 0 ? (
          <button onClick={onMarkAllRead}
            style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',
              borderRadius:6,fontSize:12,padding:'5px 12px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}
            onMouseEnter={e=>{e.currentTarget.style.color=C.gold;e.currentTarget.style.borderColor=C.gold+'88';}}
            onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.borderColor=C.border;}}>
            Mark all read
          </button>
        ) : null
      }>Web Activity</PageHead>
      {!isMobile && (
        <p style={{color:C.muted,fontSize:13,marginTop:-12,marginBottom:22,maxWidth:560,lineHeight:1.5}}>
          Bookings and payments that came in through the website. Click any row to open the contact.
        </p>
      )}
      {events.length === 0 ? (
        <Empty text="No website activity yet. Bookings made on thefeltbody.com will appear here." />
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:9}}>
          {events.map(n => (
            <WebActivityRow key={n.id} note={n} personName={nameFor(n.personId)} onOpen={() => open(n)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BIRTHDAYS (personal mode) ────────────────────────────────────────────────
// Chronological "who's next" list of personal contacts with a date of birth.
// The whole point of capturing DOB on personal contacts: a glanceable upcoming-
// birthday list so Jesse doesn't miss them. Sorted by days-until-next-birthday
// (computed via birthdayInfo), nearest first. Contacts without a DOB are listed
// separately at the bottom as a gentle prompt to fill them in.
function BirthdaysView({ people, orgs, nav }) {
  const isMobile = useIsMobile();
  const personal = useMemo(() => people.filter(p => (p.roles||[]).includes('personal_contact')), [people]);
  const withDob = useMemo(() => {
    return personal
      .filter(p => p.dateOfBirth)
      .map(p => ({ p, b: birthdayInfo(p.dateOfBirth) }))
      .filter(x => x.b)
      .sort((a, b) => a.b.days - b.b.days);
  }, [personal]);
  const withoutDob = useMemo(() => personal.filter(p => !p.dateOfBirth), [personal]);
  const orgName = (id) => orgs.find(o => o.id === id)?.name || '';

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '24px 32px',maxWidth:680}}>
      <PageHead>🎂 Birthdays</PageHead>
      {!isMobile && (
        <p style={{color:C.muted,fontSize:13,marginTop:-12,marginBottom:22,lineHeight:1.5}}>
          Upcoming birthdays across your personal contacts — soonest first.
        </p>
      )}

      {withDob.length === 0 && withoutDob.length === 0 && (
        <Empty text="No personal contacts yet. Add some in Personal mode to track birthdays." />
      )}

      {withDob.map(({ p, b }) => (
        <div key={p.id} onClick={()=>nav('person_detail',{personId:p.id})}
          style={{display:'flex',alignItems:'center',gap:14,padding:'12px 14px',marginBottom:8,background:C.surf,border:`1px solid ${b.days<=7?C.gold+'66':C.border}`,borderRadius:10,cursor:'pointer'}}
          onMouseEnter={e=>e.currentTarget.style.background=C.card}
          onMouseLeave={e=>e.currentTarget.style.background=C.surf}>
          <div style={{width:44,textAlign:'center',flexShrink:0}}>
            <div style={{color:b.days<=7?C.gold:C.text,fontSize:20,fontWeight:600,lineHeight:1}}>{b.days===0?'🎉':b.days}</div>
            <div style={{color:C.muted,fontSize:9,letterSpacing:'0.5px',marginTop:2}}>{b.days===0?'TODAY':b.days===1?'DAY':'DAYS'}</div>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:C.text,fontSize:15,fontWeight:500}}>{p.name}</div>
            <div style={{color:C.muted,fontSize:12,marginTop:2}}>
              {b.label}{orgName(p.orgId) && <span style={{opacity:0.7}}> · {orgName(p.orgId)}</span>}
            </div>
          </div>
          <div style={{color:C.muted,fontSize:12,flexShrink:0}}>{p.dateOfBirth}</div>
        </div>
      ))}

      {withoutDob.length > 0 && (
        <div style={{marginTop:24}}>
          <div style={{color:C.muted,fontSize:11,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10}}>No date of birth yet</div>
          {withoutDob.map(p => (
            <div key={p.id} onClick={()=>nav('person_detail',{personId:p.id})}
              style={{display:'flex',alignItems:'center',gap:14,padding:'10px 14px',marginBottom:6,background:'transparent',border:`1px solid ${C.border}`,borderRadius:10,cursor:'pointer',opacity:0.7}}
              onMouseEnter={e=>e.currentTarget.style.opacity=1}
              onMouseLeave={e=>e.currentTarget.style.opacity=0.7}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.text,fontSize:14}}>{p.name}</div>
                {orgName(p.orgId) && <div style={{color:C.muted,fontSize:12,marginTop:2}}>{orgName(p.orgId)}</div>}
              </div>
              <div style={{color:C.muted,fontSize:11,fontStyle:'italic',flexShrink:0}}>add DOB</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── THREADS ──────────────────────────────────────────────────────────────────
// Communications hub for KNOWN contacts. Every email to/from someone already
// in the CRM (kind='email', person_id IS NOT NULL) lands here, grouped into
// threads by thread_id. Distinct from the Inbox, which surfaces comms from
// people NOT yet in the CRM (person_id IS NULL).
//
// The point: a clean place to see and work through real correspondence,
// separate from the noise of a personal Gmail. Unread threads are flagged so
// nothing passes without crossing Jesse's attention — automation files the
// mail, but a human still sees it. Opening a thread marks every unread message
// in it as read (read_at stamped server-side via onMarkThreadRead).
//
// "Thread" = all rows sharing a thread_id. Emails with no thread_id each form
// their own single-message pseudo-thread (key `solo:<id>`). Reads the shared
// `notes` array (kept fresh by the 60s poll) — no extra fetching.
function ThreadsView({ notes, people, nav, onMarkThreadRead, initialThreadKey, onSendEmail }) {
  const isMobile = useIsMobile();
  const [selectedKey, setSelectedKey] = useState(initialThreadKey || null);
  const [search, setSearch] = useState('');
  const [replyTo, setReplyTo] = useState(null); // { person, threadId, inReplyTo, initialSubject, draftKey } | null

  const personById = useMemo(() => {
    const m = {};
    people.forEach(p => { m[p.id] = p; });
    return m;
  }, [people]);

  // Build threads from email interactions belonging to known contacts.
  // Each thread: { key, threadId|null, soloId|null, subject, messages[],
  // personIds Set, latestDate, unreadCount }. Sorted newest-first by latest
  // message date.
  const threads = useMemo(() => {
    const emails = notes.filter(n => n.kind === 'email' && n.personId);
    const groups = new Map();
    emails.forEach(n => {
      const key = n.threadId ? `t:${n.threadId}` : `solo:${n.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          threadId: n.threadId || null,
          soloId: n.threadId ? null : n.id,
          messages: [],
          personIds: new Set(),
        });
      }
      const g = groups.get(key);
      g.messages.push(n);
      if (n.personId) g.personIds.add(n.personId);
    });
    const arr = [...groups.values()].map(g => {
      // Chronological within the thread (oldest → newest). `date` is a
      // YYYY-MM-DD column, so same-day messages tie — fall back to createdAt
      // (insertion timestamp) for a stable, intuitive order. If createdAt is
      // missing for an old row, treat it as 0 so it loses the tiebreak.
      g.messages.sort((a, b) => {
        const d = new Date(a.date) - new Date(b.date);
        if (d !== 0) return d;
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      });
      const withSubject = g.messages.find(m => m.subject);
      g.subject = (withSubject && withSubject.subject) || '(no subject)';
      g.latestDate = g.messages.reduce((mx, m) => m.date > mx ? m.date : mx, g.messages[0].date);
      // Unread count excludes outbound — you sent it, you've read it.
      g.unreadCount = g.messages.filter(m => !m.readAt && m.direction !== 'outbound').length;
      g.hasInbound = g.messages.some(m => m.direction === 'inbound');
      return g;
    });
    // Threads = conversations. A cold outbound (compose from PersonDetail with
    // a fresh subject) mints a new thread_id but is just "an email you sent" —
    // not a conversation. Only show threads with at least one inbound message.
    // A reply via the Reply button inherits the parent thread_id, so it lands
    // in a thread that already has inbound messages and shows up correctly.
    const conversations = arr.filter(g => g.hasInbound);
    conversations.sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));
    return conversations;
  }, [notes]);

  const participantNames = (t) =>
    [...t.personIds].map(id => personById[id]?.name).filter(Boolean).join(', ') || 'Unknown contact';

  // Build the reply context for a thread: resolve the single counterparty,
  // derive a "Re: …" subject (stripping any existing Re: prefixes), carry the
  // thread_id so the outbound row groups into this thread, and use the latest
  // message's external_id as In-Reply-To so the recipient's client threads it.
  // draftKey namespaces the in-progress body per thread (survives modal close).
  const buildReply = (t) => {
    const personId = [...t.personIds][0];
    const person = personById[personId];
    if (!person) return null;
    const last = t.messages[t.messages.length - 1];
    const baseSubject = (t.subject || '').replace(/^\s*(re:\s*)+/i, '').trim();
    return {
      person,
      threadId: t.threadId || undefined,
      inReplyTo: (last && last.externalId) || undefined,
      initialSubject: baseSubject ? `Re: ${baseSubject}` : '',
      draftKey: `felt.threads.draft.${t.key}`,
    };
  };

  const replyModal = replyTo && (
    <SendEmailModal
      person={replyTo.person}
      onSend={onSendEmail}
      onClose={() => setReplyTo(null)}
      initialSubject={replyTo.initialSubject}
      threadId={replyTo.threadId}
      inReplyTo={replyTo.inReplyTo}
      draftKey={replyTo.draftKey}
    />
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(t =>
      t.subject.toLowerCase().includes(q) ||
      participantNames(t).toLowerCase().includes(q)
    );
  }, [threads, search]);

  const selected = useMemo(
    () => threads.find(t => t.key === selectedKey) || null,
    [threads, selectedKey]
  );

  // Opening a thread marks it read. Run as an effect off the selected key so it
  // fires once per open, not on every render. Only fires if there's something
  // unread (avoids a pointless write when re-opening an already-read thread).
  useEffect(() => {
    if (selected && selected.unreadCount > 0) {
      onMarkThreadRead(selected.threadId, selected.soloId);
    }
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── THREAD ROW (list item) ────────────────────────────────────────────────
  const ThreadRow = ({ t, active }) => {
    const unread = t.unreadCount > 0;
    const names = participantNames(t);
    const last = t.messages[t.messages.length - 1];
    const snippet = String(last.text || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    return (
      <div onClick={() => setSelectedKey(t.key)}
        style={{
          padding: '12px 14px',
          borderBottom: `1px solid ${C.border}`,
          cursor: 'pointer',
          background: active ? C.active : (unread ? C.goldBg : C.card),
          borderLeft: `3px solid ${active ? C.gold : (unread ? C.gold + '88' : 'transparent')}`,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.surf; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = unread ? C.goldBg : C.card; }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold, flexShrink: 0 }} />}
          <span style={{ color: C.text, fontSize: 13.5, fontWeight: unread ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
            {names}
          </span>
          {t.messages.length > 1 && (
            <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>{t.messages.length}</span>
          )}
          <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>{fmtRel(t.latestDate)}</span>
        </div>
        <div style={{ color: unread ? C.gold : C.muted, fontSize: 12.5, fontWeight: unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>
          {t.subject}
        </div>
        <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.85 }}>
          {snippet || <span style={{ fontStyle: 'italic', opacity: 0.7 }}>—</span>}
        </div>
      </div>
    );
  };

  // ─── MESSAGE (in expanded thread) ──────────────────────────────────────────
  const Message = ({ m }) => {
    const inbound = m.direction === 'inbound';
    const person = personById[m.personId];
    const counterparty = inbound ? (m.fromEmail || '') : (m.toEmail || '');
    return (
      <div style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${inbound ? C.blue : C.gold}`,
        borderRadius: '0 8px 8px 0',
        padding: '12px 16px',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, flexWrap: 'wrap' }}>
          <span style={{
            color: inbound ? C.blue : C.gold, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.6px', textTransform: 'uppercase',
          }}>
            {inbound ? '↓ Received' : '↑ Sent'}
          </span>
          {person && (
            <span onClick={() => nav('person_detail', { personId: person.id })}
              style={{ color: C.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.color = C.gold}
              onMouseLeave={e => e.currentTarget.style.color = C.text}>
              {person.name}
            </span>
          )}
          {counterparty && <span style={{ color: C.muted, fontSize: 12 }}>{counterparty}</span>}
          <span style={{ marginLeft: 'auto', color: C.muted, fontSize: 11 }}>{fmt(m.date)}</span>
        </div>
        {m.subject && (
          <div style={{ color: C.gold, fontSize: 13, fontWeight: 500, marginBottom: 6, opacity: 0.9 }}>
            {m.subject}
          </div>
        )}
        <div style={{ color: C.text, fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap', opacity: 0.92 }}>
          {m.text || <span style={{ fontStyle: 'italic', opacity: 0.6 }}>(no body)</span>}
        </div>
      </div>
    );
  };

  // ─── EXPANDED THREAD PANEL ──────────────────────────────────────────────────
  const ThreadPanel = ({ t, onBack }) => {
    const names = participantNames(t);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ padding: isMobile ? '12px 14px' : '4px 4px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {onBack && (
            <button onClick={onBack}
              style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontFamily: "'Jost',sans-serif", marginBottom: 10 }}>
              ← Threads
            </button>
          )}
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: C.text, fontWeight: 600, marginBottom: 3 }}>
            {t.subject}
          </div>
          <div style={{ color: C.muted, fontSize: 13 }}>
            {names} · {t.messages.length} message{t.messages.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? '14px' : '16px 4px' }}>
          {(() => {
            // Newest message first, then the Reply button directly underneath
            // it, then the older messages below. `.slice()` so we don't mutate
            // the shared thread array. createdAt tiebreaker keeps same-day
            // messages ordered correctly (otherwise equal `date` values render
            // in arbitrary order).
            const ordered = t.messages.slice().sort((a, b) => {
              const d = new Date(b.date) - new Date(a.date);
              if (d !== 0) return d;
              return new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date);
            });
            const [newest, ...older] = ordered;
            return (
              <>
                {newest && <Message key={newest.id} m={newest} />}
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4, marginBottom: 12 }}>
                  <Btn small onClick={() => { const r = buildReply(t); if (r) setReplyTo(r); }}>
                    ↩ Reply
                  </Btn>
                </div>
                {older.map(m => <Message key={m.id} m={m} />)}
              </>
            );
          })()}
        </div>
      </div>
    );
  };

  const searchBar = (
    <input
      type="text"
      value={search}
      onChange={e => setSearch(e.target.value)}
      placeholder="Search threads…"
      style={{
        width: '100%', background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 6, color: C.text, fontSize: 13, padding: '8px 12px',
        fontFamily: "'Jost',sans-serif", outline: 'none', boxSizing: 'border-box',
      }}
    />
  );

  const listEl = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: isMobile ? '0 0 12px' : '0 4px 12px', flexShrink: 0 }}>{searchBar}</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <Empty text={threads.length === 0
            ? 'No threads yet. Emails to and from your contacts will appear here once they start flowing in.'
            : 'No threads match your search.'} />
        ) : (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {filtered.map(t => <ThreadRow key={t.key} t={t} active={t.key === selectedKey} />)}
          </div>
        )}
      </div>
    </div>
  );

  // ─── MOBILE: list OR panel (not both) ───────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ padding: '12px 12px 0', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {!selected && <PageHead subInfo={`${threads.length} thread${threads.length !== 1 ? 's' : ''}`}>Threads</PageHead>}
        <div style={{ flex: 1, minHeight: 0 }}>
          {selected
            ? <ThreadPanel t={selected} onBack={() => setSelectedKey(null)} />
            : listEl}
        </div>
        {replyModal}
      </div>
    );
  }

  // ─── DESKTOP: two-panel (list | thread) ─────────────────────────────────────
  return (
    <div style={{ padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, boxSizing: 'border-box' }}>
      <div style={{ flexShrink: 0 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 600, color: C.text, letterSpacing: '-0.5px', margin: '0 0 4px' }}>Threads</h1>
        <p style={{ color: C.muted, fontSize: 13, marginTop: 0, marginBottom: 18, maxWidth: 560, lineHeight: 1.5 }}>
          Email correspondence with your contacts — a clean space to read and work through, separate from your personal inbox. Unread threads are flagged in gold.
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24 }}>
        <div style={{ minHeight: 0 }}>{listEl}</div>
        <div style={{ minHeight: 0, borderLeft: `1px solid ${C.border}`, paddingLeft: 24 }}>
          {selected
            ? <ThreadPanel t={selected} />
            : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13, fontStyle: 'italic', opacity: 0.7 }}>
                Select a thread to read it
              </div>}
        </div>
      </div>
      {replyModal}
    </div>
  );
}

// Path B note (2026-05-19): `interactions` is the universal event ledger.
// Phase 7 Stripe Worker will write kind='booking'/'payment' rows; they show
// here automatically. A chip lets the user hide transactional rows to focus
// on human comms. Reads the shared `notes` array (kept fresh by 60s polling).
function RecentActivityView({ notes, people, classes, orgs, attendance, packages, projects=[], nav }) {
  const isMobile = useIsMobile();
  const [kindFilter, setKindFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null); // null | {type:'person'|'org', id}
  const MAX_ROWS = 30;

  const personOf = (id) => people.find(p => p.id === id);
  const classOf  = (id) => classes.find(c => c.id === id);
  const projectOf = (id) => projects.find(p => p.id === id);

  // Merge real interactions with derived booking/payment rows (see deriveActivity).
  // Derived rows are read-only (_derived:true) — synthesised from attendance +
  // packages, not stored. This is the single source the feed filters/sorts from.
  const allActivity = useMemo(
    () => [...notes, ...deriveActivity(attendance, classes, packages)],
    [notes, attendance, classes, packages]
  );

  // Resolve the selected entity to a concrete record + its activity set.
  const selectedRecord = useMemo(() => {
    if (!selected) return null;
    if (selected.type === 'person') return people.find(p => p.id === selected.id) || null;
    if (selected.type === 'org')    return orgs.find(o => o.id === selected.id) || null;
    return null;
  }, [selected, people, orgs]);

  // The base set for the current scope (before kind filter).
  // Global = everything; person = their rows; org = rows for its members/classes.
  const scoped = useMemo(() => {
    if (!selected) return allActivity;
    if (selected.type === 'person') {
      return allActivity.filter(n => n.personId === selected.id);
    }
    // org: build the member + class id sets, then match rows to either.
    const memberIds = new Set(people.filter(p => p.orgId === selected.id).map(p => p.id));
    const classIds  = new Set(classes.filter(c => c.orgId === selected.id).map(c => c.id));
    return allActivity.filter(n => (n.personId && memberIds.has(n.personId)) || (n.classId && classIds.has(n.classId)));
  }, [selected, allActivity, people, classes]);

  // Kind counts over the current scope (drives chip visibility + badges).
  const kindCounts = useMemo(() => {
    const c = { all: scoped.length };
    Object.keys(INTERACTION_KINDS).forEach(k => { c[k] = 0; });
    scoped.forEach(n => { const k = n.kind || 'note'; if (c[k] !== undefined) c[k] += 1; });
    return c;
  }, [scoped]);

  // Chips: 'All' first, then each kind present in scope. Zero-count kinds are
  // hidden so the bar only shows what's actually here (incl. booking/payment
  // once those rows exist — they're real chips, just filterable like any other).
  const visibleChips = useMemo(() => {
    const chips = [{ key: 'all', label: 'All', count: kindCounts.all }];
    Object.entries(INTERACTION_KINDS).forEach(([k, meta]) => {
      if (kindCounts[k] > 0) chips.push({ key: k, label: meta.label + 's', count: kindCounts[k], meta });
    });
    return chips;
  }, [kindCounts]);

  // If the active chip's kind has no rows in this scope, fall back to 'all'.
  const effectiveKind = (kindFilter !== 'all' && kindCounts[kindFilter] === 0) ? 'all' : kindFilter;

  // Final list: scope → kind filter → sort desc → slice. In entity mode we
  // don't slice (show the full history); the global feed caps at MAX_ROWS.
  const rows = useMemo(() => {
    const ofKind = effectiveKind === 'all' ? scoped : scoped.filter(n => (n.kind || 'note') === effectiveKind);
    const sorted = [...ofKind].sort((a, b) => new Date(b.date) - new Date(a.date));
    return selected ? sorted : sorted.slice(0, MAX_ROWS);
  }, [scoped, effectiveKind, selected]);

  // Search results: match contacts + orgs by name (and contact email). Capped.
  // Only computed while typing and nothing is selected yet.
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const personIsPersonal = p => (p.roles||[]).includes('personal_contact') && !(p.roles||[]).some(r => CLIENT_ROLES.includes(r));
    const pHits = people
      .filter(p => p.name?.toLowerCase().includes(q) || (p.email||'').toLowerCase().includes(q))
      .slice(0, 6)
      .map(p => ({ type:'person', id:p.id, name:p.name, sub: p.email || (orgs.find(o=>o.id===p.orgId)?.name) || '', offWorld: personIsPersonal(p) }));
    const oHits = orgs
      .filter(o => o.name?.toLowerCase().includes(q))
      .slice(0, 4)
      .map(o => ({ type:'org', id:o.id, name:o.name, sub: o.type==='personal' ? 'Personal' : 'Organisation', offWorld: o.type==='personal' }));
    // On-world results first, off-world (personal) dimmed and after.
    return [...pHits, ...oHits].sort((a,b) => (a.offWorld?1:0) - (b.offWorld?1:0));
  }, [query, people, orgs]);

  const snippet = (t) => {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    return s.length > 140 ? s.slice(0, 140) + '…' : s;
  };

  const targetFor = (n) => {
    // Derived booking rows are about the class — click through to it.
    if (n._derived && n.kind === 'booking' && n.classId) {
      return () => nav('class_detail', { classId: n.classId });
    }
    // Real interactions highlight the specific note on the person's page;
    // derived rows (e.g. package purchases) just open the person.
    if (n.personId) {
      return () => nav('person_detail', n._derived ? { personId: n.personId } : { personId: n.personId, highlightNoteId: n.id });
    }
    if (n.classId) return () => nav('class_detail', { classId: n.classId });
    return null;
  };

  const pickEntity = (hit) => { setSelected({ type: hit.type, id: hit.id }); setQuery(''); setKindFilter('all'); };
  const clearEntity = () => { setSelected(null); setKindFilter('all'); };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '24px 32px',maxWidth:920}}>
      <PageHead subInfo={
        rows.length === 0
          ? (selected ? 'no activity' : 'nothing yet')
          : (selected ? `${rows.length} item${rows.length!==1?'s':''}` : `latest ${rows.length}`)
      }>Recent Activity</PageHead>

      {/* Search box (contacts + orgs). Selecting a result switches the page
          into entity mode; clearing returns to the global feed. */}
      <div style={{position:'relative',marginTop:14,marginBottom:18,maxWidth:440}}>
        {selected ? (
          // Selected-entity pill: shows who/what is scoped, with a clear (×).
          <div style={{display:'flex',alignItems:'center',gap:10,background:C.goldBg,border:`1px solid ${C.gold}88`,borderRadius:8,padding:'9px 12px'}}>
            <span style={{fontSize:13,opacity:0.8}}>{selected.type==='org' ? '⛁' : '◉'}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:C.text,fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {selectedRecord ? selectedRecord.name : 'Unknown'}
              </div>
              <div style={{color:C.muted,fontSize:11}}>
                {selected.type==='org' ? 'All activity for this organisation' : 'All activity for this contact'}
              </div>
            </div>
            <button onClick={clearEntity} title="Clear"
              style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16,lineHeight:1,padding:'2px 4px'}}>×</button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="Search a contact or organisation…"
              style={{width:'100%',boxSizing:'border-box',background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontSize:13,fontFamily:"'Jost',sans-serif",outline:'none'}}
              onFocus={e=>e.currentTarget.style.borderColor=C.gold+'88'}
              onBlur={e=>e.currentTarget.style.borderColor=C.border}
            />
            {searchResults.length > 0 && (
              <div style={{position:'absolute',top:'100%',left:0,right:0,marginTop:4,background:C.surf,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden',zIndex:20,boxShadow:'0 8px 24px rgba(0,0,0,0.4)'}}>
                {searchResults.map(hit => (
                  <div key={`${hit.type}_${hit.id}`} onClick={()=>pickEntity(hit)}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',cursor:'pointer',borderBottom:`1px solid ${C.border}`,opacity:hit.offWorld?0.5:1}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.active}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{fontSize:13,opacity:0.7,width:16,flexShrink:0}}>{hit.type==='org'?'⛁':'◉'}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:C.text,fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{hit.name}</div>
                      {hit.sub && <div style={{color:C.muted,fontSize:11,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{hit.sub}</div>}
                    </div>
                    {hit.offWorld && <span style={{fontSize:9,letterSpacing:'0.5px',color:C.blue,border:`1px solid ${C.blue}55`,borderRadius:10,padding:'1px 7px',flexShrink:0}}>PERSONAL</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!selected && (
        <p style={{color:C.muted,fontSize:13,marginTop:0,marginBottom:18,maxWidth:560,lineHeight:1.5}}>
          Everything happening across all contacts — most recent first. Search above to
          see the full history for one contact or organisation.
        </p>
      )}

      {/* Kind filter chips */}
      {visibleChips.length > 1 && (
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:20}}>
          {visibleChips.map(chip => {
            const active = effectiveKind === chip.key;
            const activeColor = chip.meta ? chip.meta.color : C.gold;
            const activeBg    = chip.meta ? chip.meta.bg    : C.goldBg;
            return (
              <button key={chip.key} onClick={() => setKindFilter(chip.key)}
                style={{
                  background: active ? activeBg : C.surf,
                  border:     `1px solid ${active ? activeColor+'aa' : C.border}`,
                  color:      active ? activeColor : C.muted,
                  cursor:     'pointer', borderRadius:20, fontSize:11.5, padding:'3px 10px',
                  fontFamily: "'Jost',sans-serif",
                  fontWeight: active ? 600 : 400, letterSpacing:'0.3px',
                  display:'inline-flex', alignItems:'center', gap:5,
                }}>
                {chip.meta && <span style={{fontSize:11,lineHeight:1}}>{chip.meta.icon}</span>}
                {chip.label}{chip.count > 0 ? ` · ${chip.count}` : ''}
              </button>
            );
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty text={selected
          ? 'No activity recorded for this ' + (selected.type==='org'?'organisation':'contact') + ' yet.'
          : (effectiveKind === 'all'
              ? 'No activity yet. Logged notes, calls, emails and form submissions will appear here.'
              : `No ${(INTERACTION_KINDS[effectiveKind]?.label || 'item').toLowerCase()} activity yet.`)} />
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {rows.map(n => {
            const meta = INTERACTION_KINDS[n.kind] || INTERACTION_KINDS.note;
            const person = personOf(n.personId);
            const cls    = classOf(n.classId);
            const counterparty = n.direction === 'outbound'
              ? (n.toEmail || n.fromEmail)
              : (n.fromEmail || n.toEmail);
            const onClick = targetFor(n);
            const clickable = !!onClick;
            return (
              <div key={n.id} onClick={onClick || undefined}
                title={`${meta.label} · ${fmt(n.date)}`}
                style={{
                  background:C.card, border:`1px solid ${C.border}`,
                  borderRadius:8, padding:'14px 16px',
                  cursor: clickable ? 'pointer' : 'default',
                  transition:'background 0.12s',
                }}
                onMouseEnter={e=>{ if(clickable) e.currentTarget.style.background = C.active; }}
                onMouseLeave={e=>{ if(clickable) e.currentTarget.style.background = C.card; }}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
                  <span style={{
                    display:'inline-flex',alignItems:'center',gap:5,
                    background:meta.bg, color:meta.color,
                    border:`1px solid ${meta.color}55`,
                    borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:600, letterSpacing:'0.3px',
                  }}>
                    <span style={{fontSize:11,lineHeight:1}}>{meta.icon}</span>
                    {meta.label}
                  </span>
                  {n.direction && (
                    <span style={{color:C.muted,fontSize:11,letterSpacing:'0.4px',textTransform:'uppercase'}}>
                      {n.direction}
                    </span>
                  )}
                  {person ? (
                    <span style={{color:C.text,fontSize:13,fontWeight:500}}>{person.name}</span>
                  ) : cls ? (
                    <span style={{color:C.text,fontSize:13,fontWeight:500}}>
                      {cls.name} <span style={{color:C.muted,fontSize:11,fontWeight:400,marginLeft:4}}>· {fmt(cls.date)}</span>
                    </span>
                  ) : (
                    <span style={{color:C.muted,fontSize:13,fontStyle:'italic'}}>{n.projectId && projectOf(n.projectId) ? 'Project to-do' : 'Unassigned'}</span>
                  )}
                  {counterparty && !person && (
                    <span style={{color:C.muted,fontSize:12}}>{counterparty}</span>
                  )}
                  {n.projectId && projectOf(n.projectId) && (
                    <span onClick={(e)=>{ e.stopPropagation(); nav('project_detail',{projectId:n.projectId}); }}
                      title="Go to project"
                      style={{color:C.gold,fontSize:11,cursor:'pointer',border:`1px solid ${C.gold}55`,borderRadius:10,padding:'1px 8px',display:'inline-flex',alignItems:'center',gap:4}}>
                      ▸ {projectOf(n.projectId).name}
                    </span>
                  )}
                  <span style={{marginLeft:'auto',color:C.muted,fontSize:11}}>{fmtRel(n.date)}</span>
                </div>

                {n.subject && (
                  <div style={{color:C.gold,fontSize:13,fontWeight:500,marginBottom:6}}>
                    {n.subject}
                  </div>
                )}

                <div style={{color:C.text,fontSize:13,lineHeight:1.5,opacity:0.9}}>
                  {snippet(n.text)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── HOUSEHOLDS LIST (personal-mode nav) ──────────────────────────────────────
// Browse households with search + sort + inline member expand. Households are
// created/managed from PersonDetail's household card (HouseholdModal); this view
// is read + navigate only — clicking a member opens their PersonDetail. No
// dedicated household detail page (decided V1): the inline expand IS the detail.
function HouseholdsList({ households, householdMembers, people, nav }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name'); // 'name' | 'size'
  const [expanded, setExpanded] = useState(() => new Set());

  // Members grouped by household, resolved to people, with relationship.
  const membersByHousehold = useMemo(() => {
    const map = new Map();
    householdMembers.forEach(hm => {
      const person = people.find(p => p.id === hm.personId);
      if (!person) return;
      if (!map.has(hm.householdId)) map.set(hm.householdId, []);
      map.get(hm.householdId).push({ ...hm, person });
    });
    return map;
  }, [householdMembers, people]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = households.map(h => ({
      h,
      members: membersByHousehold.get(h.id) || [],
    }));
    if (needle) {
      // Match household name OR any member name.
      list = list.filter(({ h, members }) =>
        h.name.toLowerCase().includes(needle) ||
        members.some(m => m.person.name.toLowerCase().includes(needle)));
    }
    list.sort((a, b) => sort === 'size'
      ? b.members.length - a.members.length || a.h.name.localeCompare(b.h.name)
      : a.h.name.localeCompare(b.h.name));
    return list;
  }, [households, membersByHousehold, q, sort]);

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '24px 32px',maxWidth:680}}>
      <PageHead>⌂ Households</PageHead>
      <div style={{display:'flex',gap:8,marginBottom:18,flexWrap:'wrap',alignItems:'center'}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search households or members…"
          style={{flex:1,minWidth:180,background:C.surf,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontSize:14,fontFamily:"'Jost',sans-serif"}} />
        <div style={{display:'flex',gap:4}}>
          {['name','size'].map(s => (
            <button key={s} onClick={()=>setSort(s)}
              style={{background:sort===s?C.active:C.surf,border:`1px solid ${sort===s?C.gold:C.border}`,color:sort===s?C.gold:C.muted,cursor:'pointer',borderRadius:6,fontSize:12,padding:'8px 12px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>
              {s==='name'?'A–Z':'Size'}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && (
        <Empty text={q ? 'No households match that search.' : 'No households yet. Create one from a contact’s detail page (the Household card).'} />
      )}

      {rows.map(({ h, members }) => {
        const isOpen = expanded.has(h.id);
        return (
          <div key={h.id} style={{marginBottom:8,background:C.surf,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden'}}>
            <div onClick={()=>toggle(h.id)}
              style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background=C.card}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{color:C.muted,fontSize:12,width:14,flexShrink:0,transition:'transform 0.12s',transform:isOpen?'rotate(90deg)':'none'}}>▸</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.text,fontSize:15,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{h.name}</div>
                {h.notes && <div style={{color:C.muted,fontSize:12,marginTop:2,fontStyle:'italic',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{h.notes}</div>}
              </div>
              <span style={{color:C.muted,fontSize:12,flexShrink:0}}>{members.length} {members.length===1?'member':'members'}</span>
            </div>
            {isOpen && (
              <div style={{borderTop:`1px solid ${C.border}`,padding:'6px 14px 10px 40px'}}>
                {members.length === 0 ? (
                  <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'8px 0'}}>No members yet.</div>
                ) : members.map(m => (
                  <div key={m.id} onClick={()=>nav('person_detail',{personId:m.person.id})}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',cursor:'pointer',borderBottom:`1px solid ${C.border}44`}}>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{color:C.text,fontSize:14}}>{m.person.name}</span>
                    </div>
                    <span style={{color:C.muted,fontSize:11,letterSpacing:'0.3px',flexShrink:0}}>{RELATIONSHIP_LABELS[m.relationship] || 'Other'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PERSONAL DASHBOARD ───────────────────────────────────────────────────────
// The home surface in Personal mode (distinct from the business Dashboard, which
// is class/booking centric). Card stack — no mobile accordion (fewer sections,
// doesn't need one-open-at-a-time). Panels: Households, upcoming birthdays +
// anniversaries (recurring contact_dates), and active personal projects.
function PersonalDashboard({ people, orgs, households, householdMembers, contactDates, projects=[], nav }) {
  const isMobile = useIsMobile();

  // Personal contacts only (mirrors BirthdaysView scoping).
  const personalIds = useMemo(() => new Set(
    people.filter(p => (p.roles||[]).includes('personal_contact')).map(p => p.id)
  ), [people]);
  const nameOf = (id) => people.find(p => p.id === id)?.name || '';

  // Upcoming dates: personal-contact birthdays + recurring contact_dates within
  // the next 60 days, merged and sorted soonest-first. One-off dates in the past
  // are dropped; future one-offs within 60 days are included.
  const upcoming = useMemo(() => {
    const items = [];
    people.forEach(p => {
      if (!personalIds.has(p.id) || !p.dateOfBirth) return;
      const b = birthdayInfo(p.dateOfBirth);
      if (b && b.days <= 60) items.push({ key:`b_${p.id}`, personId:p.id, name:p.name, kind:'birthday', days:b.days, sub:b.label });
    });
    contactDates.forEach(d => {
      // Only person-anchored personal-contact dates surface on the personal dashboard.
      if (!d.personId || !personalIds.has(d.personId)) return;
      const info = contactDateInfo(d.date, d.recurring);
      if (!info) return;
      if (info.days < 0 || info.days > 60) return;
      const sub = info.recurring
        ? (info.years > 0 ? `${d.label} · ${info.years} ${info.years===1?'year':'years'}` : d.label)
        : d.label;
      items.push({ key:`d_${d.id}`, personId:d.personId, name:nameOf(d.personId), kind:'date', days:info.days, sub });
    });
    return items.sort((a,b) => a.days - b.days).slice(0, 8);
  }, [people, contactDates, personalIds]);

  // Personal projects, active first.
  const personalProjects = useMemo(() =>
    projects.filter(p => p.isPersonal && p.status === 'active')
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8),
    [projects]);

  // Home household: the dashboard shows ONLY this one, expanded with its members.
  // Matched by EXACT name (case-insensitive, trimmed) against HOME_HOUSEHOLD_NAME —
  // edit that constant if the household is renamed. Other households are reached
  // via the Households nav, not shown here. If no household matches, the card
  // falls back to a prompt + link to the full list.
  const homeHousehold = useMemo(() => {
    const target = HOME_HOUSEHOLD_NAME.trim().toLowerCase();
    return households.find(h => h.name.trim().toLowerCase() === target) || null;
  }, [households]);
  const homeMembers = useMemo(() => {
    if (!homeHousehold) return [];
    return householdMembers
      .filter(hm => hm.householdId === homeHousehold.id)
      .map(hm => ({ ...hm, person: people.find(p => p.id === hm.personId) }))
      .filter(m => m.person);
  }, [homeHousehold, householdMembers, people]);

  const Card = ({ title, count, onMore, children }) => (
    <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:12,padding:'16px 18px',marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',marginBottom:12}}>
        <div style={{color:C.muted,fontSize:11,letterSpacing:'1.5px',textTransform:'uppercase',flex:1}}>{title}</div>
        {onMore && <button onClick={onMore} style={{background:'none',border:'none',color:C.gold,cursor:'pointer',fontSize:12,fontFamily:"'Jost',sans-serif"}}>View all →</button>}
      </div>
      {children}
    </div>
  );

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '24px 32px',maxWidth:680}}>
      {isMobile ? <MobileHeader>Personal</MobileHeader> : <PageHead>Personal</PageHead>}

      <Card title={homeHousehold ? homeHousehold.name : 'Household'} onMore={()=>nav('households')}>
        {!homeHousehold ? (
          <Empty text="Home household not found. Create or rename one to match, or browse all households." />
        ) : homeMembers.length === 0 ? (
          <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'4px 0'}}>No members yet.</div>
        ) : homeMembers.map(m => (
          <div key={m.id} onClick={()=>nav('person_detail',{personId:m.person.id})}
            style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',cursor:'pointer',borderBottom:`1px solid ${C.border}44`}}>
            <span style={{color:C.muted,fontSize:13,width:16,flexShrink:0}}>◉</span>
            <span style={{flex:1,minWidth:0,color:C.text,fontSize:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.person.name}</span>
            <span style={{color:C.muted,fontSize:11,flexShrink:0}}>{RELATIONSHIP_LABELS[m.relationship] || 'Other'}</span>
          </div>
        ))}
      </Card>

      <Card title="Upcoming — birthdays & anniversaries" onMore={()=>nav('birthdays')}>
        {upcoming.length === 0 ? (
          <Empty text="Nothing in the next 60 days." />
        ) : upcoming.map(it => (
          <div key={it.key} onClick={()=>nav('person_detail',{personId:it.personId})}
            style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',cursor:'pointer',borderBottom:`1px solid ${C.border}44`}}>
            <div style={{width:38,textAlign:'center',flexShrink:0}}>
              <div style={{color:it.days<=7?C.gold:C.text,fontSize:18,fontWeight:600,lineHeight:1}}>{it.days===0?'🎉':it.days}</div>
              <div style={{color:C.muted,fontSize:8,letterSpacing:'0.5px',marginTop:2}}>{it.days===0?'TODAY':it.days===1?'DAY':'DAYS'}</div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:C.text,fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {it.kind==='birthday'?'🎂 ':'❤ '}{it.name}
              </div>
              <div style={{color:C.muted,fontSize:12,marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.sub}</div>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Personal projects" onMore={()=>nav('projects')}>
        {personalProjects.length === 0 ? (
          <Empty text="No personal projects yet." />
        ) : personalProjects.map(p => (
          <div key={p.id} onClick={()=>nav('project_detail',{projectId:p.id})}
            style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',cursor:'pointer',borderBottom:`1px solid ${C.border}44`}}>
            <span style={{color:C.muted,fontSize:13,width:16,flexShrink:0}}>❖</span>
            <span style={{flex:1,minWidth:0,color:C.text,fontSize:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
// Top-level "your work" list. Projects hold todos via interactions.project_id.
// V1: status is 'active' | 'done' only — no archive, no hard-delete UI. Add a
// project inline; click through to ProjectDetail for its todos + notes.
function ProjectsView({ projects, notes, nav, onAddProject, onSetStatus, mode='client' }) {
  const isMobile = useIsMobile();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // Projects are mode-scoped: personal mode shows personal projects, business
  // mode shows business projects. New projects are tagged with the current mode
  // by the parent's addProject handler.
  const inMode = projects.filter(p => !!p.isPersonal === (mode === 'personal'));
  const active = inMode.filter(p => p.status === 'active')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const done = inMode.filter(p => p.status === 'done')
    .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));

  // Open-todo count per project (todos = interactions with this project_id that
  // aren't completed). Project todos are notes carrying projectId.
  const openCount = (pid) => notes.filter(n => n.projectId === pid && !n.completed).length;

  const save = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onAddProject({ name, status: 'active', notes: '' });
      setNewName(''); setAdding(false);
    } finally { setBusy(false); }
  };

  const Card = ({ p }) => {
    const open = openCount(p.id);
    const isDone = p.status === 'done';
    return (
      <div onClick={() => nav('project_detail', { projectId: p.id })}
        style={{
          background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
          padding:'14px 16px', cursor:'pointer', transition:'background 0.12s',
          display:'flex', alignItems:'center', gap:14,
        }}
        onMouseEnter={e=>e.currentTarget.style.background=C.active}
        onMouseLeave={e=>e.currentTarget.style.background=C.card}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{color:isDone?C.muted:C.text, fontSize:15, fontWeight:500, fontFamily:"'Cormorant Garamond',serif", textDecoration:isDone?'line-through':'none'}}>
            {p.name}
          </div>
          <div style={{color:C.muted, fontSize:11.5, marginTop:3}}>
            {isDone
              ? `Completed ${fmt(p.completedAt) }`
              : (open > 0 ? `${open} open to-do${open!==1?'s':''}` : 'No open to-dos')}
          </div>
        </div>
        <div onClick={e=>e.stopPropagation()}>
          {isDone ? (
            <Btn variant="ghost" small onClick={()=>onSetStatus(p.id, 'active')}>Reopen</Btn>
          ) : (
            <Btn variant="secondary" small onClick={()=>onSetStatus(p.id, 'done')}>Mark done</Btn>
          )}
        </div>
      </div>
    );
  };

  const inputStyle = {
    flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:6,
    color:C.text, fontSize:14, padding:'8px 12px', fontFamily:"'Jost',sans-serif", outline:'none',
  };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '24px 32px', maxWidth:760}}>
      <PageHead subInfo={`${active.length} active`}
        action={!adding && <Btn small onClick={()=>setAdding(true)}>+ New Project</Btn>}>
        Projects
      </PageHead>

      {adding && (
        <div style={{display:'flex', gap:8, marginBottom:18, alignItems:'center'}}>
          <input autoFocus value={newName} disabled={busy}
            onChange={e=>setNewName(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') save(); if(e.key==='Escape'){ setAdding(false); setNewName(''); } }}
            placeholder="Project name…" style={inputStyle}
            onFocus={e=>e.currentTarget.style.borderColor=C.gold+'88'}
            onBlur={e=>e.currentTarget.style.borderColor=C.border} />
          <Btn small onClick={save} disabled={!newName.trim()||busy}>{busy?'Adding…':'Add'}</Btn>
          <Btn variant="ghost" small onClick={()=>{ setAdding(false); setNewName(''); }} disabled={busy}>Cancel</Btn>
        </div>
      )}

      {active.length === 0 && done.length === 0 ? (
        <Empty text="No projects yet." action={adding ? undefined : '+ New Project'} onAction={()=>setAdding(true)} />
      ) : (
        <>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {active.map(p => <Card key={p.id} p={p} />)}
            {active.length === 0 && (
              <div style={{color:C.muted, fontSize:13, fontStyle:'italic', padding:'8px 2px'}}>No active projects.</div>
            )}
          </div>

          {done.length > 0 && (
            <div style={{marginTop:26}}>
              <div onClick={()=>setShowDone(s=>!s)}
                style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', color:C.muted, fontSize:11, fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:12, userSelect:'none'}}>
                <span style={{fontSize:9, transition:'transform 0.18s', transform:showDone?'rotate(0deg)':'rotate(-90deg)', display:'inline-flex'}}>▾</span>
                Completed · {done.length}
              </div>
              {showDone && (
                <div style={{display:'flex', flexDirection:'column', gap:10}}>
                  {done.map(p => <Card key={p.id} p={p} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PACKAGE TEMPLATES VIEW ──────────────────────────────────────────────────
// Manage canonical package definitions. These prefill AddPackageForm and (Phase
// 7) drive the Stripe webhook. Templates are copy-at-purchase: editing one never
// touches packages already sold from it. Archive (active=false) hides a template
// from the picker while keeping it for history; hard-delete is for mistakes.
function PackageTemplatesView({ templates, nav, onAdd, onEdit, onSetActive, onDelete }) {
  const isMobile = useIsMobile();
  const [showArchived, setShowArchived] = useState(false);
  const active = templates.filter(t => t.active).sort((a,b)=>(a.position-b.position)||a.name.localeCompare(b.name));
  const archived = templates.filter(t => !t.active).sort((a,b)=>a.name.localeCompare(b.name));

  const Card = ({ t }) => {
    const color = PKG_TYPES[t.type]?.color || C.muted;
    const [armed, setArmed] = useState(false);
    return (
      <div style={{background:C.card,border:`1px solid ${t.active?color+'55':C.border}`,borderRadius:8,padding:'14px 16px',display:'flex',alignItems:'center',gap:14}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.text,fontSize:15,fontWeight:500}}>{t.name}</div>
          <div style={{color:C.muted,fontSize:11.5,marginTop:3}}>
            {PKG_TYPES[t.type]?.label}
            {!isCountlessPkg(t.type) && ` · ${t.totalSessions} sessions`}
            {t.defaultAmount!=='' && ` · £${t.defaultAmount}`}
            {` · ${t.validityDays ? `expires after ${t.validityDays} days` : 'never expires'}`}
            {t.stripePriceId && ' · Stripe linked'}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <Btn variant="ghost" small onClick={()=>onEdit(t.id)}>Edit</Btn>
          {t.active
            ? <Btn variant="secondary" small onClick={()=>onSetActive(t.id, false)}>Archive</Btn>
            : <Btn variant="secondary" small onClick={()=>onSetActive(t.id, true)}>Restore</Btn>}
          {armed ? (
            <button onClick={()=>onDelete(t.id)}
              style={{background:C.red,border:'none',color:'#fff',cursor:'pointer',borderRadius:4,fontSize:11,padding:'4px 9px',fontFamily:"'Jost',sans-serif",fontWeight:500}}>
              Confirm
            </button>
          ) : (
            <button onClick={()=>setArmed(true)}
              style={{background:'none',border:`1px solid ${C.red}66`,color:C.red,cursor:'pointer',borderRadius:4,fontSize:11,padding:'4px 9px',fontFamily:"'Jost',sans-serif"}}>
              Delete
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '24px 32px', maxWidth:760}}>
      <PageHead subInfo={`${active.length} active`}
        action={<Btn small onClick={onAdd}>+ New Template</Btn>}>
        Package Templates
      </PageHead>

      {templates.length === 0 ? (
        <Empty text="No templates yet." action="+ New Template" onAction={onAdd} />
      ) : (
        <>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {active.map(t => <Card key={t.id} t={t} />)}
            {active.length === 0 && <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'8px 2px'}}>No active templates.</div>}
          </div>
          {archived.length > 0 && (
            <div style={{marginTop:24}}>
              <div onClick={()=>setShowArchived(s=>!s)} style={{color:C.muted,fontSize:12,cursor:'pointer',marginBottom:10,letterSpacing:'0.5px',userSelect:'none'}}>
                {showArchived?'▾':'▸'} Archived ({archived.length})
              </div>
              {showArchived && (
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {archived.map(t => <Card key={t.id} t={t} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PROJECT DETAIL ─────────────────────────────────────────────────────────
// One project: its name + status, its todos (notes carrying projectId), and a
// free-text notes field. Todos can be added inline, completed, reopened, deleted.
// A project todo may also be person-linked — we surface that contact's name.
function ProjectDetail({ project, notes, people, nav, backInfo,
  onAddTodo, onCompleteNote, onReopenNote, onDeleteNote, onUpdateActionDate, onUpdateNoteText, onSetStatus, onUpdateProject }) {
  const isMobile = useIsMobile();
  const [newTodo, setNewTodo] = useState('');
  const [newDate, setNewDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const todoInputRef = useRef(null);
  // Name edit: local draft, save on blur/Enter if changed.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name || '');
  useEffect(()=>{ setNameDraft(project.name || ''); setEditingName(false); }, [project.id]);
  // Notes field: local draft, save on blur if changed.
  const [notesDraft, setNotesDraft] = useState(project.notes || '');
  useEffect(()=>{ setNotesDraft(project.notes || ''); }, [project.id]);

  const saveName = () => {
    const name = nameDraft.trim();
    setEditingName(false);
    if (!name || name === project.name) { setNameDraft(project.name || ''); return; }
    onUpdateProject(project.id, { name, status: project.status, notes: project.notes || '', completedAt: project.completedAt });
  };

  // Inline todo-text edit. State hoisted here (not inside TodoRow) so the row
  // component stays stateless — defining a stateful component in render would
  // remount it on every parent render and drop the edit mid-type.
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [todoDraft, setTodoDraft] = useState('');
  const startEditTodo = (t) => { setEditingTodoId(t.id); setTodoDraft(t.text); };
  const saveEditTodo = () => {
    const id = editingTodoId;
    setEditingTodoId(null);
    if (id && todoDraft.trim()) onUpdateNoteText(id, todoDraft);
  };
  // Inline todo-date edit: which row's date input is open.
  const [editingDateId, setEditingDateId] = useState(null);

  const personOf = (id) => people.find(p => p.id === id);

  const todos = notes.filter(n => n.projectId === project.id);
  const openTodos = todos.filter(t => !t.completed)
    .sort((a,b) => (a.actionDate||'9999').localeCompare(b.actionDate||'9999'));
  const doneTodos = todos.filter(t => t.completed)
    .sort((a,b) => (b.completedAt||b.date||'').localeCompare(a.completedAt||a.date||''));

  const [justAdded, setJustAdded] = useState(false);
  const addTodo = async () => {
    const text = newTodo.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onAddTodo({
        text, actionDate: newDate || null, projectId: project.id,
        personId: null, kind: 'note', source: 'todo', date: today(), important: false,
      });
      setNewTodo(''); setNewDate('');
      setJustAdded(true);
    } finally { setBusy(false); }
  };
  // Refocus the add-todo input once it re-enables (it's disabled during the
  // async add, so focusing inside addTodo is a no-op). Effect fires after busy
  // clears and the input is interactive again.
  useEffect(() => {
    if (justAdded && !busy) {
      todoInputRef.current?.focus();
      setJustAdded(false);
    }
  }, [justAdded, busy]);

  const saveNotes = () => {
    if (notesDraft === (project.notes || '')) return;
    onUpdateProject(project.id, { name: project.name, status: project.status, notes: notesDraft, completedAt: project.completedAt });
  };

  const isDone = project.status === 'done';
  const inputStyle = {
    background:C.card, border:`1px solid ${C.border}`, borderRadius:6,
    color:C.text, fontSize:14, padding:'8px 12px', fontFamily:"'Jost',sans-serif", outline:'none',
  };

  const TodoRow = ({ t }) => {
    const person = personOf(t.personId);
    const overdue = !t.completed && t.actionDate && t.actionDate < today();
    return (
      <div style={{display:'flex', alignItems:'flex-start', gap:12, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'12px 14px'}}>
        <div onClick={()=> t.completed ? onReopenNote(t.id) : onCompleteNote(t.id)}
          title={t.completed?'Reopen':'Mark done'}
          style={{
            width:18, height:18, flexShrink:0, marginTop:1, borderRadius:4, cursor:'pointer',
            border:`1.5px solid ${t.completed?C.green:C.muted}`, background:t.completed?C.green:'transparent',
            color:'#0a1408', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700,
          }}>
          {t.completed ? '✓' : ''}
        </div>
        <div style={{flex:1, minWidth:0}}>
          {editingTodoId === t.id ? (
            <input
              autoFocus
              value={todoDraft}
              onChange={e=>setTodoDraft(e.target.value)}
              onBlur={saveEditTodo}
              onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); saveEditTodo(); } if(e.key==='Escape'){ setEditingTodoId(null); } }}
              style={{
                width:'100%', background:C.surf, border:`1px solid ${C.gold}88`, borderRadius:4,
                color:C.text, fontSize:13.5, lineHeight:1.5, padding:'4px 8px',
                fontFamily:"'Jost',sans-serif", outline:'none',
              }}
            />
          ) : (
            <div onClick={()=> !t.completed && startEditTodo(t)}
              title={t.completed ? '' : 'Click to edit'}
              style={{color:t.completed?C.muted:C.text, fontSize:13.5, lineHeight:1.5, textDecoration:t.completed?'line-through':'none', cursor:t.completed?'default':'text'}}>
              {t.text}
            </div>
          )}
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginTop:4, alignItems:'center'}}>
            {editingDateId === t.id ? (
              <input
                type="date"
                autoFocus
                defaultValue={t.actionDate || ''}
                onChange={e=>{ onUpdateActionDate(t.id, e.target.value || null); }}
                onBlur={()=>setEditingDateId(null)}
                onKeyDown={e=>{ if(e.key==='Enter'||e.key==='Escape') setEditingDateId(null); }}
                style={{
                  background:C.surf, border:`1px solid ${C.gold}88`, borderRadius:4,
                  color:C.text, fontSize:11, padding:'2px 6px', fontFamily:"'Jost',sans-serif", outline:'none',
                }}
              />
            ) : t.actionDate ? (
              <span onClick={()=> !t.completed && setEditingDateId(t.id)}
                title={t.completed ? '' : 'Click to change date'}
                style={{color:overdue?C.red:C.muted, fontSize:11, cursor:t.completed?'default':'pointer'}}>
                {overdue ? 'Overdue · ' : ''}{fmt(t.actionDate)}
              </span>
            ) : !t.completed ? (
              <span onClick={()=>setEditingDateId(t.id)}
                title="Add a date"
                style={{color:C.muted, fontSize:11, cursor:'pointer', opacity:0.65}}>
                + date
              </span>
            ) : null}
            {person && (
              <span onClick={()=>nav('person_detail',{personId:person.id})}
                style={{color:C.gold, fontSize:11, cursor:'pointer'}}>
                ◉ {person.name}
              </span>
            )}
          </div>
        </div>
        <div style={{flexShrink:0}}>
          <ConfirmBtn idleLabel="✕" armedLabel="Delete" variant="danger" small
            title="Delete to-do" onConfirm={()=>onDeleteNote(t.id)} />
        </div>
      </div>
    );
  };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '24px 32px', maxWidth:760}}>
      <PageHead back={backInfo ? backInfo.label : 'Projects'} onBack={()=>nav('projects')} sticky
        subInfo={isDone ? 'completed' : `${openTodos.length} open`}
        action={
          isDone
            ? <Btn variant="ghost" small onClick={()=>onSetStatus(project.id,'active')}>Reopen</Btn>
            : <Btn variant="secondary" small onClick={()=>onSetStatus(project.id,'done')}>Mark done</Btn>
        }>
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={e=>setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); saveName(); } if(e.key==='Escape'){ setNameDraft(project.name||''); setEditingName(false); } }}
            style={{
              background:'transparent', border:'none', borderBottom:`2px solid ${C.gold}88`,
              color:'inherit', font:'inherit', outline:'none', padding:0, width:'100%', maxWidth:520,
            }}
          />
        ) : (
          <span onClick={()=>setEditingName(true)} title="Click to rename"
            style={{cursor:'pointer'}}>
            {project.name}
          </span>
        )}
      </PageHead>

      {/* Add a to-do */}
      {!isDone && (
        <div style={{display:'flex', gap:8, marginBottom:20, flexWrap:'wrap'}}>
          <input value={newTodo} disabled={busy} ref={todoInputRef}
            onChange={e=>setNewTodo(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') addTodo(); }}
            placeholder="Add a to-do…"
            style={{...inputStyle, flex:'1 1 240px'}}
            onFocus={e=>e.currentTarget.style.borderColor=C.gold+'88'}
            onBlur={e=>e.currentTarget.style.borderColor=C.border} />
          <input type="date" value={newDate} disabled={busy}
            onChange={e=>setNewDate(e.target.value)}
            style={{...inputStyle, fontSize:13, width:'auto'}} />
          <Btn small onClick={addTodo} disabled={!newTodo.trim()||busy}>{busy?'Adding…':'Add'}</Btn>
        </div>
      )}

      {/* Open todos */}
      {openTodos.length === 0 && doneTodos.length === 0 ? (
        <Empty text="No to-dos in this project yet." />
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {openTodos.map(t => <TodoRow key={t.id} t={t} />)}
          {openTodos.length === 0 && !isDone && (
            <div style={{color:C.muted, fontSize:13, fontStyle:'italic', padding:'4px 2px'}}>All to-dos complete.</div>
          )}
        </div>
      )}

      {/* Completed todos (collapsed) */}
      {doneTodos.length > 0 && (
        <div style={{marginTop:22}}>
          <div onClick={()=>setShowCompleted(s=>!s)}
            style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', color:C.muted, fontSize:11, fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:12, userSelect:'none'}}>
            <span style={{fontSize:9, transition:'transform 0.18s', transform:showCompleted?'rotate(0deg)':'rotate(-90deg)', display:'inline-flex'}}>▾</span>
            Completed · {doneTodos.length}
          </div>
          {showCompleted && (
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              {doneTodos.map(t => <TodoRow key={t.id} t={t} />)}
            </div>
          )}
        </div>
      )}

      {/* Project notes */}
      <div style={{marginTop:28}}>
        <div style={{color:C.muted, fontSize:11, fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:10}}>Notes</div>
        <textarea value={notesDraft}
          onChange={e=>setNotesDraft(e.target.value)}
          onBlur={saveNotes}
          rows={5} placeholder="Anything worth keeping about this project…"
          style={{...inputStyle, width:'100%', resize:'vertical', lineHeight:1.6}} />
      </div>
    </div>
  );
}


// Small notepad icon shown on a booking/class row when that session has notes
// attached. Desktop: hovering shows the note text in a floating tooltip.
// Everywhere: clicking the icon calls onToggle so the parent row can expand
// inline to reveal the full note(s) — no navigation away (Jesse's preference).
// `count` drives an optional little badge; `expanded` flips the icon's tint so
// it reads as "open". The click is stopPropagation'd by the parent wrapper so
// it never triggers the row's own navigate-on-click.
function NoteIndicator({ count, expanded, onToggle, previewText }) {
  if (!count) return null;
  // Hover preview uses the NATIVE title attribute rather than a positioned
  // element: a custom absolute tooltip gets clipped by any ancestor with
  // overflow:auto/hidden (e.g. the scrollable BOOKINGS list on a contact card),
  // which was cutting the note in half. The native title is never clipped.
  // The full note is always reachable by tapping the icon to expand the row.
  const hint = previewText ? (previewText.length>180 ? previewText.slice(0,177)+'…' : previewText) : '';
  return (
    <span
      onClick={(e)=>{ e.stopPropagation(); onToggle && onToggle(); }}
      title={hint}
      style={{
        position:'relative', display:'inline-flex', alignItems:'center', gap:3,
        cursor:'pointer', flexShrink:0,
        color: expanded ? C.gold : C.muted,
        fontSize:14, lineHeight:1, userSelect:'none',
      }}>
      <span style={{opacity: expanded?1:0.8}}>🗒️</span>
      {count>1 && <span style={{fontSize:10,opacity:0.7}}>{count}</span>}
    </span>
  );
}

// ─── SESSION NOTE ROW ─────────────────────────────────────────────────────────
// A class/session row that expands inline to reveal its note(s) when the notepad
// icon is tapped. Hoisted to module level (not nested in OrgDetail) so it has a
// stable component identity — a nested definition gets a new identity on every
// parent render, which remounts the row and was swallowing the expand toggle.
// All state is owned by the parent and passed in: `notesList` is the resolved
// notes for this session, `open`/`onToggle` drive expansion.
function SessionNoteRow({ c, notesList, open, onToggle, nav }) {
  const cnt = notesList.length;
  const preview = notesList[0]?.text || '';
  return (
    <div style={{borderBottom:`1px solid ${C.border}`}}>
      <Row onClick={()=>nav('class_detail',{classId:c.id})} style={{borderBottom:'none'}}>
        <div style={{flex:1}}><div style={{color:C.text,fontSize:14,fontWeight:500}}>{c.name}{c.seriesId&&<span style={{color:C.muted,fontSize:11,marginLeft:6}}>↻</span>}</div><div style={{color:C.muted,fontSize:12}}>{fmt(c.date)} · {c.location}</div></div>
        <NoteIndicator count={cnt} expanded={open} previewText={preview} onToggle={onToggle} />
        {c.rate>0&&<div style={{color:C.muted,fontSize:13}}>{fmtMoney(c.rate)}</div>}
      </Row>
      {open && cnt>0 && (
        <div style={{background:C.surf,padding:'10px 20px 12px'}} onClick={e=>e.stopPropagation()}>
          {notesList.map(n=>(
            <div key={n.id} style={{display:'flex',gap:8,padding:'6px 0',color:C.text,fontSize:13,lineHeight:1.6}}>
              <span style={{opacity:0.7,flexShrink:0}}>{n._reflection?'📔':(INTERACTION_KINDS[n.kind]||INTERACTION_KINDS.note).icon}</span>
              <span>{n.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ORG LIST / DETAIL ────────────────────────────────────────────────────────
function OrgList({ orgs, people, classes, orgType, nav, onAdd }) {
  const { orgTypes } = useTypes();
  const isMobile = useIsMobile();
  const isAll = orgType === 'all';
  const m = orgTypes[orgType] || ORG_META[orgType] || { label:'Organisation', color:C.muted, bg:C.surf };
  const list = isAll ? orgs.filter(o=>!isPersonalOrg(o)) : orgs.filter(o=>o.type===orgType);
  const heading = isAll ? 'All Organisations' : `${m.label}s`;
  // On mobile we abbreviate the button to "+ Org" to fit narrow viewports.
  const addLabel = isMobile
    ? (isAll ? 'Org' : (m.label.split(/\s+/).slice(0,1)[0] || 'Org'))
    : (isAll ? 'Organisation' : m.label);
  // Group by type when showing all, so the user can scan by category at a glance.
  const grouped = useMemo(() => {
    if(!isAll) return null;
    const groups = {};
    Object.keys(orgTypes).forEach(k => { groups[k] = []; });
    list.forEach(o => {
      const k = orgTypes[o.type] ? o.type : 'other';
      (groups[k] = groups[k] || []).push(o);
    });
    return groups;
  }, [isAll, list, orgTypes]);

  const renderRow = (org) => {
    const orgMeta = orgTypes[org.type] || ORG_META[org.type] || m;
    const pc=people.filter(p=>p.orgId===org.id).length, cc=classes.filter(c=>c.orgId===org.id).length;

    // Mobile layout: two-column row. Left = initials avatar (vertically centred).
    // Right = stacked info, one field per visible row. Empty fields collapse
    // out — except the people/classes count which is always shown so each card
    // has a consistent footprint and the numbers are scannable.
    if (isMobile) {
      return (
        <Row key={org.id} onClick={()=>nav('org_detail',{orgId:org.id})} style={{padding:'12px 14px',gap:12,alignItems:'flex-start'}}>
          <div style={{width:44,height:44,borderRadius:8,background:orgMeta.bg,border:`1.5px solid ${orgMeta.color}`,display:'flex',alignItems:'center',justifyContent:'center',color:orgMeta.color,fontSize:15,fontWeight:600,flexShrink:0,marginTop:2}}>{initials(org.name)}</div>
          <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:3}}>
            <div style={{color:C.text,fontSize:15,fontWeight:500,lineHeight:1.3}}>{org.name}</div>
            {org.address && <div style={{color:C.muted,fontSize:12,lineHeight:1.4}}>{org.address}</div>}
            {org.contactName && <div style={{color:C.muted,fontSize:12,lineHeight:1.4}}>{org.contactName}</div>}
            <div style={{color:C.muted,fontSize:11,marginTop:2,letterSpacing:'0.3px'}}>
              {pc} {pc===1?'person':'people'} · {cc} {cc===1?'class':'classes'}
            </div>
          </div>
        </Row>
      );
    }

    // Desktop layout (unchanged). Org badge dropped when grouped — the section
    // header already labels the type.
    return (
      <Row key={org.id} onClick={()=>nav('org_detail',{orgId:org.id})}>
        <div style={{width:40,height:40,borderRadius:8,background:orgMeta.bg,border:`1.5px solid ${orgMeta.color}`,display:'flex',alignItems:'center',justifyContent:'center',color:orgMeta.color,fontSize:15,fontWeight:600,flexShrink:0}}>{initials(org.name)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.text,fontSize:15,fontWeight:500,marginBottom:2}}>{org.name}</div>
          <div style={{color:C.muted,fontSize:12}}>{org.address||'—'}</div>
        </div>
        {org.contactName&&<div style={{color:C.muted,fontSize:13}}>{org.contactName}</div>}
        <div style={{display:'flex',gap:7,flexShrink:0,alignItems:'center'}}>
          <span style={{background:C.surf,color:C.muted,fontSize:11,padding:'3px 10px',borderRadius:20}}>{pc} people</span>
          <span style={{background:C.surf,color:C.muted,fontSize:11,padding:'3px 10px',borderRadius:20}}>{cc} classes</span>
        </div>
      </Row>
    );
  };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px'}}>
      <PageHead action={<Btn small={isMobile} onClick={onAdd}>+ {isMobile ? addLabel : `Add ${addLabel}`}</Btn>}>{heading}</PageHead>
      {list.length ? (
        isAll ? (
          // Grouped view: one bordered block per type, with a header label.
          Object.entries(grouped).map(([k, items]) => {
            if(!items.length) return null;
            const gm = orgTypes[k] || ORG_META[k] || m;
            return (
              <div key={k} style={{marginBottom:22}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                  <div style={{color:gm.color,fontSize:11,fontWeight:600,letterSpacing:'1.5px',textTransform:'uppercase'}}>{gm.label}s</div>
                  <div style={{flex:1,height:1,background:C.border,opacity:0.5}} />
                  <div style={{color:C.muted,fontSize:11}}>{items.length}</div>
                </div>
                <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
                  {items.map(renderRow)}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
            {list.map(renderRow)}
          </div>
        )
      ) : <Empty text={`No ${(isAll?'organisation':m.label.toLowerCase())}s yet.`} action="Add one →" onAction={onAdd} />}
    </div>
  );
}

function OrgDetail({ org, people, classes, invoices, notes=[], contactDates=[], nav, backInfo, onEdit, onAddPerson, onAddClass, onCreateInvoice, onEditInvoice, onUpdateInvoiceStatus, onToggleImportant, onClearAction, onReopenNote, onDeleteNote, onUpdateActionDate, onAddContactDate, onUpdateContactDate, onRemoveContactDate }) {
  const isMobile = useIsMobile();
  const { orgTypes, personRoles } = useTypes();
  // Persisted so the org page reopens on the last-viewed tab (sticky, per-device).
  const [tab, setTab] = useLocalStorage('felt.orgDetail.tab', 'people');
  const m = orgTypes[org.type] || ORG_META[org.type] || { label:'Organisation', color:C.muted, bg:C.surf };
  const op=people.filter(p=>p.orgId===org.id);
  const oc=classes.filter(c=>c.orgId===org.id).sort((a,b)=>b.date.localeCompare(a.date));
  const oi=invoices.filter(i=>i.orgId===org.id).sort((a,b)=>b.issueDate.localeCompare(a.issueDate));
  const showInvoices = org.type==='care_home'||org.type==='gym';

  // ── Member notes. There's no org_id on interactions, so an org's notes are
  // derived: every note belonging to one of this org's people. We attach the
  // person (for the "whose note" line + role filtering + click-through) and
  // sort newest-first. booking/payment are transactional, excluded here.
  const memberIds = useMemo(()=>new Set(op.map(p=>p.id)), [op]);
  const memberById = useMemo(()=>Object.fromEntries(op.map(p=>[p.id,p])), [op]);
  const orgNotes = useMemo(()=> notes
    .filter(n => n.personId && memberIds.has(n.personId) && !['booking','payment'].includes(n.kind))
    .map(n => ({ ...n, _person: memberById[n.personId] }))
    .sort((a,b)=>new Date(b.date)-new Date(a.date))
  , [notes, memberIds, memberById]);

  // Role filter for the notes tab — populated dynamically from the roles
  // actually present on this org's members (design decision #26), plus 'all'.
  const [noteRole, setNoteRole] = useState('all');
  const memberRoles = useMemo(()=>[...new Set(op.flatMap(p=>p.roles||[]))].sort(), [op]);
  const roleLabel = r => (personRoles[r]||PERSON_ROLES[r])?.label || r;
  const effectiveRole = (noteRole!=='all' && !memberRoles.includes(noteRole)) ? 'all' : noteRole;
  const visibleNotes = effectiveRole==='all' ? orgNotes : orgNotes.filter(n => (n._person?.roles||[]).includes(effectiveRole));

  // ── Invoice status filter. Chips for 'all' + each status present on this
  // org's invoices (hides empty ones, same idea as the comms chips).
  const [invStatus, setInvStatus] = useState('all');
  const invStatuses = useMemo(()=>[...new Set(oi.map(i=>i.status))], [oi]);
  const effectiveInvStatus = (invStatus!=='all' && !invStatuses.includes(invStatus)) ? 'all' : invStatus;
  const visibleInvoices = effectiveInvStatus==='all' ? oi : oi.filter(i=>i.status===effectiveInvStatus);

  // ── Events grouping for the classes tab: List (flat) / Week / Month.
  const [eventsView, setEventsView] = useState('list');
  // List-view time filter: all | upcoming | past. Keeps the filter row to a
  // single 3-way toggle rather than a chip per period. Only applies to List;
  // the calendars are navigable by period already.
  const [whenFilter, setWhenFilter] = useState('all');
  // What counts as a "note" on a session, for the booking-row indicator:
  //   (1) interaction notes anchored to that class (session_id == classId), and
  //   (2) the session's own reflection (cls.reflection — the Class Log text).
  // Reflection is folded in as a synthetic entry so it renders in the inline
  // expansion exactly like a real note. This is why Chaim's sessions light up:
  // his session content lives in reflections, not as classId-anchored notes.
  const interactionNotesByClass = useMemo(()=>{
    const map = {};
    notes.forEach(n => { if(n.classId && !['booking','payment'].includes(n.kind)) (map[n.classId]||(map[n.classId]=[])).push(n); });
    return map;
  }, [notes]);
  const sessionNotes = (c) => {
    const list = [...(interactionNotesByClass[c.id]||[])];
    if (c.reflection && c.reflection.trim()) {
      list.unshift({ id:`reflection-${c.id}`, kind:'note', text:c.reflection, _reflection:true });
    }
    return list;
  };
  // Calendar state: an anchor date that the Weekly/Monthly views page through.
  // List view ignores it (shows the flat newest-first list).
  const [calAnchor, setCalAnchor] = useState(()=>today());
  // Index this org's classes by date string for O(1) day lookups in the grid.
  const classesByDate = useMemo(()=>{
    const map = {};
    oc.forEach(c=>{ (map[c.date]||(map[c.date]=[])).push(c); });
    // Within a day, order by time so the calendar reads top-to-bottom chronologically.
    Object.values(map).forEach(list=>list.sort((a,b)=>(a.time||'').localeCompare(b.time||'')));
    return map;
  }, [oc]);

  // List view: bundle classes month-by-month (newest month first; oc is already
  // sorted newest-first so insertion order gives us that for free). Respects the
  // when-filter (all/upcoming/past) — today counts as upcoming.
  const listByMonth = useMemo(()=>{
    const todayStr = today();
    const src = whenFilter==='upcoming' ? oc.filter(c=>c.date>=todayStr)
              : whenFilter==='past' ? oc.filter(c=>c.date<todayStr)
              : oc;
    const buckets = new Map(); // 'YYYY-MM' -> { label, items }
    src.forEach(c=>{
      const d = new Date(c.date+'T12:00');
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if(!buckets.has(key)) buckets.set(key, { label: d.toLocaleDateString('en-GB',{month:'long',year:'numeric'}), items: [] });
      buckets.get(key).items.push(c);
    });
    // Upcoming reads more naturally soonest-first (ascending); past/all stay
    // newest-first. Sort the buckets and their items accordingly.
    const entries = [...buckets.entries()];
    if (whenFilter==='upcoming') {
      entries.sort((a,b)=>a[0].localeCompare(b[0]));
      entries.forEach(([,v])=>v.items.sort((a,b)=>a.date.localeCompare(b.date)));
    }
    return entries.map(([key,v])=>({key,...v}));
  }, [oc, whenFilter]);

  // Which booking/class rows are expanded to show their note(s) inline.
  const [expandedNotes, setExpandedNotes] = useState(()=>new Set());
  const toggleExpand = (cid) => setExpandedNotes(s=>{ const n=new Set(s); n.has(cid)?n.delete(cid):n.add(cid); return n; });
  // Calendar note reveal: clicking a pill's 🗒️ selects that class and shows its
  // note(s) in a panel beneath the grid (cells are too small to expand inline).
  // Clicking the same icon again clears it. Toggling calendar view/period clears.
  const [calNoteClassId, setCalNoteClassId] = useState(null);
  const toggleCalNote = (cid) => setCalNoteClassId(prev => prev===cid ? null : cid);

  // A single class as it appears inside a calendar day cell: a compact pill.
  // Pill body click opens the class; the 🗒️ (when the session has notes) instead
  // toggles a note panel below the grid — no navigation, fits the cramped cell.
  const CalEvent = ({ c }) => {
    const hasNotes = sessionNotes(c).length > 0;
    const sel = calNoteClassId===c.id;
    return (
      <div onClick={(e)=>{ e.stopPropagation(); nav('class_detail',{classId:c.id}); }}
        title={`${c.name}${c.time?` · ${fmtTime(c.time)}`:''}${c.location?` · ${c.location}`:''}`}
        style={{background:sel?C.gold+'33':C.goldBg,border:`1px solid ${sel?C.gold:C.gold+'55'}`,borderRadius:4,padding:'2px 5px',marginBottom:3,cursor:'pointer',display:'flex',alignItems:'center',gap:4,overflow:'hidden'}}>
        {c.time && <span style={{color:C.gold,fontSize:9,fontWeight:600,flexShrink:0}}>{fmtTime(c.time)}</span>}
        <span style={{color:C.text,fontSize:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</span>
        {hasNotes && <span onClick={(e)=>{ e.stopPropagation(); toggleCalNote(c.id); }} title="Show note" style={{marginLeft:'auto',fontSize:9,flexShrink:0,cursor:'pointer',opacity:sel?1:0.85}}>🗒️</span>}
      </div>
    );
  };

  // Note panel shown beneath the calendar grid for the currently-selected class.
  const CalNotePanel = () => {
    if (!calNoteClassId) return null;
    const c = oc.find(x=>x.id===calNoteClassId);
    if (!c) return null;
    const sn = sessionNotes(c);
    if (!sn.length) return null;
    return (
      <div style={{marginTop:14,background:C.surf,border:`1px solid ${C.gold}55`,borderRadius:8,padding:'12px 16px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{display:'flex',alignItems:'baseline',gap:8,minWidth:0}}>
            <span style={{color:C.text,fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</span>
            <span style={{color:C.muted,fontSize:11,flexShrink:0}}>{fmt(c.date)}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
            <span style={{color:C.blue,fontSize:11,cursor:'pointer'}} onClick={()=>nav('class_detail',{classId:c.id})}>Open class →</span>
            <span style={{color:C.muted,fontSize:14,cursor:'pointer',lineHeight:1}} onClick={()=>setCalNoteClassId(null)} title="Close">×</span>
          </div>
        </div>
        {sn.map(n=>(
          <div key={n.id} style={{display:'flex',gap:8,padding:'5px 0',color:C.text,fontSize:13,lineHeight:1.6}}>
            <span style={{opacity:0.7,flexShrink:0}}>{n._reflection?'📔':(INTERACTION_KINDS[n.kind]||INTERACTION_KINDS.note).icon}</span>
            <span>{n.text}</span>
          </div>
        ))}
      </div>
    );
  };

  const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // WEEKLY calendar: 7 day-columns (Mon–Sun) anchored to calAnchor's week.
  const WeekCalendar = () => {
    const start = startOfWeek(calAnchor);
    const days = Array.from({length:7},(_,i)=>addDays(start,i));
    const label = `${new Date(days[0]+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${new Date(days[6]+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
    const count = days.reduce((s,d)=>s+(classesByDate[d]?.length||0),0);
    return (
      <div>
        <CalNav label={label} count={count} onPrev={()=>setCalAnchor(addDays(calAnchor,-7))} onNext={()=>setCalAnchor(addDays(calAnchor,7))} onToday={()=>setCalAnchor(today())} />
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6}}>
          {days.map((d,i)=>{
            const isToday = d===today();
            const dayClasses = classesByDate[d]||[];
            return (
              <div key={d} style={{border:`1px solid ${isToday?C.gold+'88':C.border}`,borderRadius:6,minHeight:120,padding:6,background:isToday?C.goldBg:C.card}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
                  <span style={{color:C.muted,fontSize:9,fontWeight:600,letterSpacing:'0.5px'}}>{DOW[i]}</span>
                  <span style={{color:isToday?C.gold:C.text,fontSize:14,fontWeight:isToday?600:400,fontFamily:"'Cormorant Garamond',serif"}}>{new Date(d+'T12:00').getDate()}</span>
                </div>
                {dayClasses.map(c=><CalEvent key={c.id} c={c} />)}
              </div>
            );
          })}
        </div>
        <CalNotePanel />
      </div>
    );
  };

  // MONTHLY calendar: classic 6-row × 7-col grid for calAnchor's month, with
  // leading/trailing days from adjacent months dimmed.
  const MonthCalendar = () => {
    const anchor = new Date(calAnchor+'T12:00');
    const year = anchor.getFullYear(), month = anchor.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = startOfWeek(first.toISOString().slice(0,10));
    const cells = Array.from({length:42},(_,i)=>addDays(gridStart,i));
    const label = anchor.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const count = oc.filter(c=>{ const d=new Date(c.date+'T12:00'); return d.getFullYear()===year && d.getMonth()===month; }).length;
    const prevMonth = ()=>{ const d=new Date(year,month-1,1); setCalAnchor(d.toISOString().slice(0,10)); };
    const nextMonth = ()=>{ const d=new Date(year,month+1,1); setCalAnchor(d.toISOString().slice(0,10)); };
    return (
      <div>
        <CalNav label={label} count={count} onPrev={prevMonth} onNext={nextMonth} onToday={()=>setCalAnchor(today())} />
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,marginBottom:4}}>
          {DOW.map(d=><div key={d} style={{textAlign:'center',color:C.muted,fontSize:9,fontWeight:600,letterSpacing:'0.5px',padding:'2px 0'}}>{d}</div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
          {cells.map(d=>{
            const dd = new Date(d+'T12:00');
            const inMonth = dd.getMonth()===month;
            const isToday = d===today();
            const dayClasses = classesByDate[d]||[];
            return (
              <div key={d} style={{border:`1px solid ${isToday?C.gold+'88':C.border}`,borderRadius:6,minHeight:84,padding:5,background:isToday?C.goldBg:(inMonth?C.card:'transparent'),opacity:inMonth?1:0.4}}>
                <div style={{color:isToday?C.gold:C.text,fontSize:12,fontWeight:isToday?600:400,marginBottom:3,textAlign:'right'}}>{dd.getDate()}</div>
                {dayClasses.slice(0,3).map(c=><CalEvent key={c.id} c={c} />)}
                {dayClasses.length>3 && <div style={{color:C.muted,fontSize:9,paddingLeft:2}}>+{dayClasses.length-3} more</div>}
              </div>
            );
          })}
        </div>
        <CalNotePanel />
      </div>
    );
  };

  // Shared calendar navigator (‹ label › + "Today" + count).
  const CalNav = ({ label, count, onPrev, onNext, onToday }) => (
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
      <button onClick={onPrev} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'4px 10px',lineHeight:1,fontFamily:"'Jost',sans-serif"}}>‹</button>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,color:C.text,fontWeight:600,minWidth:150}}>{label}</div>
      <button onClick={onNext} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'4px 10px',lineHeight:1,fontFamily:"'Jost',sans-serif"}}>›</button>
      <button onClick={onToday} style={{background:C.goldBg,border:`1px solid ${C.gold}88`,color:C.gold,cursor:'pointer',borderRadius:6,fontSize:12,padding:'4px 11px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>Today</button>
      <div style={{flex:1}} />
      <div style={{color:C.muted,fontSize:12}}>{count} class{count!==1?'es':''}</div>
    </div>
  );

  const tabList = [{id:'people',label:`People (${op.length})`},{id:'classes',label:`Classes (${oc.length})`},{id:'notes',label:`Notes (${orgNotes.length})`}];
  if(showInvoices) tabList.push({id:'invoices',label:`Invoices (${oi.length})`});
  // Mobile tab metadata (icon + short name + count), in the same order as tabList.
  const mobileTabs = [
    {id:'people',  icon:'👤', name:'People',  count:op.length},
    {id:'classes', icon:'📅', name:'Classes', count:oc.length},
    {id:'notes',   icon:'💬', name:'Notes',   count:orgNotes.length},
  ];
  if(showInvoices) mobileTabs.push({id:'invoices', icon:'🧾', name:'Invoices', count:oi.length});
  // Guard: a persisted tab may be invalid for this org (e.g. 'invoices' on an
  // org that doesn't bill). Fall back to People so the body never renders blank.
  useEffect(() => { if(!tabList.some(t=>t.id===tab)) setTab('people'); }, [tab, showInvoices]);
  // Org Info card collapse — persisted per-device. Collapsed → header (badge +
  // name) only; body hidden. Mirrors the contact card on PersonDetail.
  const [infoOpen, setInfoOpen] = useLocalStorage('felt.orgDetail.infoOpen', true);
  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px'}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={<Btn small={isMobile} variant="secondary" onClick={onEdit}>Edit</Btn>}>{org.name}</PageHead>
      <div style={{display:'grid',gridTemplateColumns: isMobile ? '1fr' : '260px 1fr',gap: isMobile ? 14 : 24}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,alignSelf:'start',overflow:'hidden'}}>
          <div onClick={()=>setInfoOpen(v=>!v)}
            style={{position: isMobile ? 'static' : 'sticky',top: isMobile?97:0,zIndex:4,background:C.card,display:'flex',alignItems:'center',gap:10,padding:'14px 20px',cursor:'pointer',borderBottom: infoOpen?`1px solid ${C.border}`:'none'}}>
            <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:6,alignItems:'flex-start'}}>
              <OrgBadge type={org.type} />
              {!infoOpen && <div style={{color:C.text,fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{org.name}</div>}
            </div>
            <span aria-hidden="true" style={{color:C.muted,fontSize:12,flexShrink:0,transition:'transform 0.18s',transform:infoOpen?'rotate(0deg)':'rotate(-90deg)',display:'inline-block'}}>▾</span>
          </div>
          {infoOpen && <div style={{padding:'12px 20px 20px'}}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {org.contactName&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>CONTACT</div><div style={{color:C.text,fontSize:14}}>{org.contactName}</div></div>}
            {org.address&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>ADDRESS</div><div style={{color:C.text,fontSize:13}}>{org.address}</div></div>}
            {org.phone&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>PHONE</div><div style={{color:C.text,fontSize:13}}>{org.phone}</div></div>}
            {org.email&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>EMAIL</div><div style={{color:C.gold,fontSize:13}}>{org.email}</div></div>}
            {org.website&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>WEBSITE</div><a href={/^https?:\/\//i.test(org.website)?org.website:`https://${org.website}`} target="_blank" rel="noopener noreferrer" style={{color:C.blue,fontSize:13,textDecoration:'none',wordBreak:'break-all'}}>{org.website}</a></div>}
          </div>
          {org.notes&&<div style={{borderTop:`1px solid ${C.border}`,marginTop:16,paddingTop:14,color:C.muted,fontSize:13,lineHeight:1.6}}>{org.notes}</div>}
          </div>}
        </div>
        <ContactDatesCard anchor={{orgId: org.id}} contactDates={contactDates}
          onAdd={onAddContactDate} onUpdate={onUpdateContactDate} onRemove={onRemoveContactDate} />
        <div>
          {isMobile ? (
            <MobileTabBar topOffset={97} tabs={mobileTabs} active={tab} onChange={setTab} />
          ) : (
            <Tabs tabs={tabList} active={tab} onChange={setTab} />
          )}
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
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,gap:12,flexWrap:'wrap'}}>
              {/* List (flat) / Weekly + Monthly (calendar) toggle */}
              <div style={{display:'flex',gap:6}}>
                {[['list','List'],['week','Weekly'],['month','Monthly']].map(([v,l])=>{
                  const active=eventsView===v;
                  return <button key={v} onClick={()=>setEventsView(v)} style={{background:active?C.goldBg:'transparent',color:active?C.gold:C.muted,border:`1px solid ${active?C.gold+'88':C.border}`,borderRadius:4,fontSize:11,fontWeight:500,letterSpacing:'0.3px',padding:'4px 12px',cursor:'pointer',fontFamily:"'Jost',sans-serif"}}>{l}</button>;
                })}
                {/* When filter — only meaningful for the List view */}
                {eventsView==='list' && <span style={{width:1,background:C.border,margin:'2px 2px'}} />}
                {eventsView==='list' && [['all','All'],['upcoming','Upcoming'],['past','Past']].map(([v,l])=>{
                  const active=whenFilter===v;
                  return <button key={v} onClick={()=>setWhenFilter(v)} style={{background:active?C.goldBg:'transparent',color:active?C.gold:C.muted,border:`1px solid ${active?C.gold+'88':C.border}`,borderRadius:4,fontSize:11,fontWeight:500,letterSpacing:'0.3px',padding:'4px 12px',cursor:'pointer',fontFamily:"'Jost',sans-serif"}}>{l}</button>;
                })}
              </div>
              <Btn small onClick={onAddClass}>+ Add Class</Btn>
            </div>
            {oc.length ? (
              eventsView==='list' ? (
                listByMonth.length ? (
                <div style={{display:'flex',flexDirection:'column',gap:18}}>
                  {listByMonth.map(g=>(
                    <div key={g.key}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                        <span style={{color:C.gold,fontSize:12,fontWeight:600,letterSpacing:'0.5px'}}>{g.label}</span>
                        <span style={{flex:1,height:1,background:C.border}} />
                        <span style={{color:C.muted,fontSize:11}}>{g.items.length} {g.items.length===1?'class':'classes'}</span>
                      </div>
                      <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
                        {g.items.map(c=><SessionNoteRow key={c.id} c={c} notesList={sessionNotes(c)} open={expandedNotes.has(c.id)} onToggle={()=>toggleExpand(c.id)} nav={nav} />)}
                      </div>
                    </div>
                  ))}
                </div>
                ) : <Empty text={whenFilter==='upcoming'?'No upcoming classes':whenFilter==='past'?'No past classes':'No classes logged yet'} />
              ) : eventsView==='week' ? <WeekCalendar /> : <MonthCalendar />
            ):<Empty text="No classes logged yet" />}
          </>}
          {tab==='notes'&&<>
            {/* Role filter — slices member notes by Felt Body role (design #26) */}
            {orgNotes.length>0 && memberRoles.length>0 && (
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
                {['all',...memberRoles].map(r=>{
                  const active=effectiveRole===r;
                  const count = r==='all' ? orgNotes.length : orgNotes.filter(n=>(n._person?.roles||[]).includes(r)).length;
                  const meta = r==='all' ? null : (personRoles[r]||PERSON_ROLES[r]);
                  return <button key={r} onClick={()=>setNoteRole(r)} style={{background:active?(meta?meta.bg:C.surf):'transparent',color:active?(meta?meta.color:C.text):C.muted,border:`1px solid ${active?(meta?meta.color+'88':C.border):C.border}`,borderRadius:4,fontSize:11,fontWeight:500,letterSpacing:'0.3px',padding:'4px 10px',cursor:'pointer',fontFamily:"'Jost',sans-serif",display:'inline-flex',alignItems:'center',gap:5}}>
                    <span>{r==='all'?'All':roleLabel(r)}</span><span style={{opacity:0.55,fontSize:10}}>{count}</span>
                  </button>;
                })}
              </div>
            )}
            {visibleNotes.length ? (
              <div>
                {visibleNotes.map(n=>(
                  <div key={n.id}>
                    {/* Whose note — clickable through to the contact */}
                    <div onClick={()=>nav('person_detail',{personId:n.personId})} style={{display:'flex',alignItems:'center',gap:8,margin:'2px 0 4px',cursor:'pointer'}}>
                      <Avatar name={n._person?.name||'?'} size={22} role={n._person?primaryRole(n._person):'other'} />
                      <span style={{color:C.muted,fontSize:11}}>{n._person?.name||'Unknown'} · {fmt(n.date)}</span>
                    </div>
                    <NoteCard note={n}
                      onToggleImportant={onToggleImportant}
                      onClearAction={onClearAction}
                      onReopenNote={onReopenNote}
                      onUpdateActionDate={onUpdateActionDate}
                      onDelete={onDeleteNote}
                      onClick={()=>nav('person_detail',{personId:n.personId,highlightNoteId:n.id})} />
                  </div>
                ))}
              </div>
            ):<Empty text={orgNotes.length? 'No notes for this role' : 'No notes from members yet'} />}
          </>}
          {tab==='invoices'&&<>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,gap:12,flexWrap:'wrap'}}>
              {/* Status filter chips — 'all' + statuses present on this org */}
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {['all',...invStatuses].map(s=>{
                  const active=effectiveInvStatus===s;
                  const sm = s==='all' ? null : (INV_STATUS[s]||INV_STATUS.draft);
                  const count = s==='all' ? oi.length : oi.filter(i=>i.status===s).length;
                  return <button key={s} onClick={()=>setInvStatus(s)} style={{background:active?(sm?sm.bg:C.surf):'transparent',color:active?(sm?sm.color:C.text):C.muted,border:`1px solid ${active?(sm?sm.color+'88':C.border):C.border}`,borderRadius:4,fontSize:11,fontWeight:500,letterSpacing:'0.3px',padding:'4px 10px',cursor:'pointer',fontFamily:"'Jost',sans-serif",display:'inline-flex',alignItems:'center',gap:5}}>
                    <span>{s==='all'?'All':sm.label}</span><span style={{opacity:0.55,fontSize:10}}>{count}</span>
                  </button>;
                })}
              </div>
              <Btn small onClick={onCreateInvoice}>+ Create Invoice</Btn>
            </div>
            {visibleInvoices.length?<>
              <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
              {visibleInvoices.map(inv=>{
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
              </div>
              {/* Totals reflect the current filter. Outstanding = anything not paid. */}
              <div style={{display:'flex',justifyContent:'flex-end',gap:24,marginTop:12,padding:'0 4px'}}>
                {(() => {
                  const sum = visibleInvoices.reduce((s,i)=>s+(i.total||0),0);
                  const outstanding = visibleInvoices.filter(i=>i.status!=='paid').reduce((s,i)=>s+(i.total||0),0);
                  return (<>
                    {outstanding>0 && outstanding!==sum && <div style={{color:C.muted,fontSize:13}}>Outstanding <span style={{color:C.text,fontWeight:500,marginLeft:6}}>{fmtMoney(outstanding)}</span></div>}
                    <div style={{color:C.muted,fontSize:13}}>{effectiveInvStatus==='all'?'Total':INV_STATUS[effectiveInvStatus]?.label} <span style={{color:C.gold,fontWeight:600,marginLeft:6,fontSize:15}}>{fmtMoney(sum)}</span></div>
                  </>);
                })()}
              </div>
            </>:<Empty text={oi.length? 'No invoices with this status' : 'No invoices yet'} />}
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── PEOPLE LIST / DETAIL ────────────────────────────────────────────────────
function PeopleList({ people, orgs, personType, nav, onAdd, onMerge, households=[], householdMembers=[], recentPersonIds=[] }) {
  const { personRoles } = useTypes();
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  // Recent Contacts mode: filter by the recents list and preserve its order
  // (most-recently-viewed first). Dead ids are silently dropped via find().
  // Other modes keep the existing role-based filter plus the personal-only hide.
  const isRecent = personType === 'recent';
  const baseList = isRecent
    ? recentPersonIds.map(id => people.find(p => p.id === id)).filter(Boolean)
    : people.filter(p => personType==='all' ? !isPersonalOnly(p) : p.roles.includes(personType));
  const list = baseList.filter(p=>!q||p.name.toLowerCase().includes(q.toLowerCase())||(p.email||'').toLowerCase().includes(q.toLowerCase()));
  const title = isRecent
    ? 'Recent Contacts'
    : (personType==='all' ? 'All Contacts' : ((personRoles[personType]||PERSON_ROLES[personType])?.label+'s' || personType));
  const toggleSel = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const canMerge = selected.size === 2;
  const startMerge = () => {
    if (!canMerge || !onMerge) return;
    const [a, b] = [...selected].map(id => people.find(p=>p.id===id)).filter(Boolean);
    if (a && b) onMerge(a, b);
    exitSelect();
  };

  // Pre-build personId → household-name lookup once. A person can be in
  // several households (the multi-household feature); we show the first one
  // here for the list summary — the detail page is where the full picture
  // belongs.
  const householdByPerson = useMemo(() => {
    const map = new Map();
    householdMembers.forEach(hm => {
      if (!map.has(hm.personId)) {
        const h = households.find(x => x.id === hm.householdId);
        if (h) map.set(hm.personId, h.name);
      }
    });
    return map;
  }, [households, householdMembers]);

  const action = selectMode ? (
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      <span style={{color:C.muted,fontSize:12}}>{selected.size} selected{canMerge?'':' (pick 2 to merge)'}</span>
      <Btn variant="ghost" small onClick={exitSelect}>Cancel</Btn>
      <Btn small={isMobile} onClick={startMerge} disabled={!canMerge}>Merge{isMobile?'':' selected'}</Btn>
    </div>
  ) : (
    <div style={{display:'flex',gap:8}}>
      <Btn variant="ghost" small={isMobile} onClick={()=>setSelectMode(true)}>Select</Btn>
      {!isRecent && <Btn small={isMobile} onClick={onAdd}>+ {isMobile ? 'Person' : 'Add Person'}</Btn>}
    </div>
  );
  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px'}}>
      <PageHead action={action}>{title}</PageHead>
      <div style={{marginBottom:16}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name or email..."
          style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:14,padding:'9px 14px',width: isMobile ? '100%' : 300,fontFamily:"'Jost',sans-serif",outline:'none'}} />
      </div>
      {list.length ? (
        <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
          {list.map(p=>{
            const org = orgs.find(o=>o.id===p.orgId);
            const householdName = householdByPerson.get(p.id);
            const isSel = selected.has(p.id);
            const onRowClick = selectMode ? (()=>toggleSel(p.id)) : (()=>nav('person_detail',{personId:p.id}));

            // Mobile: stacked fields, one per line. Each line only renders if
            // the underlying value exists. Role badges compact to first-letter
            // initials so several still fit on a phone-width row.
            if (isMobile) {
              return (
                <Row key={p.id} onClick={onRowClick} style={{padding:'12px 14px',gap:12,alignItems:'flex-start',...(selectMode && isSel ? {background:C.green+'18'} : {})}}>
                  {selectMode && (
                    <input type="checkbox" checked={isSel} onChange={()=>toggleSel(p.id)} onClick={e=>e.stopPropagation()}
                      style={{marginTop:8,cursor:'pointer',width:16,height:16,flexShrink:0}} />
                  )}
                  <Avatar name={p.name} size={40} role={primaryRole(p)} />
                  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:3}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                      <div style={{color:C.text,fontSize:14,fontWeight:500,lineHeight:1.3}}>{p.name}</div>
                      <div style={{width:7,height:7,borderRadius:'50%',background:p.status==='active'?C.green:p.status==='interested'?C.gold:C.muted,flexShrink:0}} />
                    </div>
                    {p.email   && <div style={{color:C.muted,fontSize:12,lineHeight:1.4,wordBreak:'break-word'}}>{p.email}</div>}
                    {p.phone   && <div style={{color:C.muted,fontSize:12,lineHeight:1.4}}>{p.phone}</div>}
                    {p.address && <div style={{color:C.muted,fontSize:12,lineHeight:1.4}}>{p.address}</div>}
                    {householdName && <div style={{color:C.muted,fontSize:12,lineHeight:1.4,fontStyle:'italic'}}>⌂ {householdName}</div>}
                    {org && <div style={{color:C.muted,fontSize:12,lineHeight:1.4}}>{org.name}</div>}
                    {p.roles && p.roles.length > 0 && (
                      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:4}}>
                        {p.roles.map(r=><RoleBadge key={r} role={r} compact />)}
                      </div>
                    )}
                  </div>
                </Row>
              );
            }

            // Desktop layout: unchanged.
            return (
              <Row key={p.id} onClick={onRowClick} style={selectMode && isSel ? {background:C.green+'18'} : undefined}>
                {selectMode && (
                  <input type="checkbox" checked={isSel} onChange={()=>toggleSel(p.id)} onClick={e=>e.stopPropagation()}
                    style={{marginRight:4,cursor:'pointer',width:16,height:16}} />
                )}
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
        </div>
      ) : <Empty text={isRecent && !q ? 'No contacts viewed yet — open a contact to start building your recents list.' : 'No results'} />}
    </div>
  );
}

// ─── HOUSEHOLD MODAL ──────────────────────────────────────────────────────────
// Reached from the HOUSEHOLD card on PersonDetail. Two modes in one component:
//   - Create mode (household=null): name a new household; `person` becomes the
//     first member. Reachable even when the contact already belongs to other
//     households — a person can be in several (e.g. a child across two homes).
//   - Manage mode (household set): rename, add members (person picker +
//     relationship), change each member's relationship inline, remove members,
//     delete the whole household (armed-confirm).
// Multi-household is supported: the add-member picker only excludes people
// already in THIS household, and relationship labels are per-household (stored
// on the junction row). Create mode also offers a subtle "add to an existing
// household" link → join sub-screen (pick a household the person isn't in yet).
function HouseholdModal({ person, household, roster, allPeople, households, householdMembers, orgs, onClose, onCreateHousehold, onRenameHousehold, onDeleteHousehold, onAddHouseholdMember, onCreatePersonForHousehold, onUpdateMemberRelationship, onRemoveHouseholdMember, nav }) {
  const [name, setName] = useState(household?.name || `${person.name.split(' ').slice(-1)[0]} Household`);
  const [founderRel, setFounderRel] = useState('adult');
  const [busy, setBusy] = useState(false);
  // Add-member sub-form state (only used when a household exists)
  const [addPersonId, setAddPersonId] = useState('');
  const [addRel, setAddRel] = useState('child');
  const [addBusy, setAddBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "+ Add new contact" sub-mode: when set, we show AddPersonForm and, on save,
  // create the person + add them to this household with `newContactRel`. The
  // chosen relationship is captured before opening the form so the new contact
  // lands with the right label.
  const [addingNew, setAddingNew] = useState(false);
  const [newContactRel, setNewContactRel] = useState('child');
  // Join-existing sub-mode (reached via a subtle link on the create screen):
  // pick an existing household this person isn't already in, choose a
  // relationship, and link them via onAddHouseholdMember.
  const [joinMode, setJoinMode] = useState(false);
  const [joinHouseholdId, setJoinHouseholdId] = useState('');
  const [joinRel, setJoinRel] = useState('adult');
  const [joinBusy, setJoinBusy] = useState(false);
  // Households the person is NOT already a member of (the only ones worth joining).
  const personHouseholdIds = new Set(
    (householdMembers || []).filter(m => m.personId === person.id).map(m => m.householdId)
  );
  const joinableHouseholds = (households || [])
    .filter(h => !personHouseholdIds.has(h.id))
    .sort((a,b) => a.name.localeCompare(b.name));

  // People eligible to be added to THIS household: not deleted, and not already
  // a member of this specific household. A person CAN belong to multiple
  // households, so we no longer exclude people who are in some other household —
  // only those already on this household's roster.
  const inThisHousehold = new Set(
    (householdMembers || [])
      .filter(m => household && m.householdId === household.id)
      .map(m => m.personId)
  );
  const addable = (allPeople || [])
    .filter(p => !inThisHousehold.has(p.id))
    .sort((a,b) => a.name.localeCompare(b.name));

  const relOpts = RELATIONSHIP_KEYS.map(k => ({ v:k, l:RELATIONSHIP_LABELS[k] }));

  const doCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try { await onCreateHousehold(trimmed, person.id, founderRel); onClose(); }
    catch { setBusy(false); }
  };
  const doJoin = async () => {
    if (!joinHouseholdId || joinBusy) return;
    setJoinBusy(true);
    try { await onAddHouseholdMember(joinHouseholdId, person.id, joinRel); onClose(); }
    catch { setJoinBusy(false); }
  };
  const doRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === household.name) return;
    await onRenameHousehold(household.id, trimmed);
  };
  const doAddMember = async () => {
    if (!addPersonId || addBusy) return;
    setAddBusy(true);
    try {
      await onAddHouseholdMember(household.id, addPersonId, addRel);
      setAddPersonId(''); setAddRel('child');
    } catch { /* surfaced via onError */ }
    setAddBusy(false);
  };

  // ── Create mode (no household yet) ──────────────────────────────────────────
  if (!household) {
    // Join-existing sub-screen, reached via the subtle link below the create form.
    if (joinMode) {
      return (
        <Modal title="Join a household" onClose={onClose}>
          <div style={{color:C.muted,fontSize:12,marginBottom:18,lineHeight:1.5}}>
            Add <strong style={{color:C.text}}>{person.name}</strong> to an existing household. They'll keep any other households they belong to.
          </div>
          {joinableHouseholds.length ? (
            <>
              <FI label="HOUSEHOLD" value={joinHouseholdId} onChange={setJoinHouseholdId}
                opts={[{v:'',l:'Select a household…'}, ...joinableHouseholds.map(h=>({v:h.id,l:h.name}))]} />
              <FI label={`${person.name.toUpperCase()}'S RELATIONSHIP`} value={joinRel} onChange={setJoinRel} opts={relOpts} />
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginTop:8}}>
                <span style={{color:C.blue,fontSize:12,cursor:'pointer'}} onClick={()=>setJoinMode(false)}>← Create new instead</span>
                <div style={{display:'flex',gap:10}}>
                  <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
                  <Btn onClick={doJoin} disabled={joinBusy || !joinHouseholdId}>{joinBusy?'Joining…':'Join household'}</Btn>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{color:C.muted,fontSize:13,marginBottom:16}}>There are no other households to join yet.</div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
                <Btn variant="secondary" onClick={()=>setJoinMode(false)}>← Back</Btn>
              </div>
            </>
          )}
        </Modal>
      );
    }
    return (
      <Modal title="Create household" onClose={onClose}>
        <div style={{color:C.muted,fontSize:12,marginBottom:18,lineHeight:1.5}}>
          A household groups related contacts so you can see them together. <strong style={{color:C.text}}>{person.name}</strong> will be the first member — you can add others afterwards.
        </div>
        <FI label="HOUSEHOLD NAME" value={name} onChange={setName} />
        <FI label={`${person.name.toUpperCase()}'S RELATIONSHIP`} value={founderRel} onChange={setFounderRel} opts={relOpts} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginTop:8}}>
          {joinableHouseholds.length > 0
            ? <span style={{color:C.blue,fontSize:12,cursor:'pointer'}} onClick={()=>setJoinMode(true)}>or add to an existing household</span>
            : <span />}
          <div style={{display:'flex',gap:10}}>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn onClick={doCreate} disabled={busy || !name.trim()}>{busy?'Creating…':'Create household'}</Btn>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Add-new-contact sub-mode (only reachable from manage mode) ───────────────
  // Renders AddPersonForm. On save, the parent creates the person AND links them
  // to this household with the relationship picked before opening the form.
  if (addingNew && household) {
    return (
      <AddPersonForm
        orgs={orgs}
        onSave={async (p) => { await onCreatePersonForHousehold(household.id, p, newContactRel); }}
        onClose={() => setAddingNew(false)}
      />
    );
  }

  // ── Manage mode (household exists) ──────────────────────────────────────────
  return (
    <Modal title={`Household: ${household.name}`} onClose={onClose} wide>
      {/* Rename */}
      <div style={{marginBottom:18}}>
        <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>HOUSEHOLD NAME</label>
        <div style={{display:'flex',gap:8}}>
          <input value={name} onChange={e=>setName(e.target.value)} onBlur={doRename}
            style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
        </div>
        <div style={{color:C.muted,fontSize:10,marginTop:4,fontStyle:'italic'}}>Saves when you click away.</div>
      </div>

      {/* Members */}
      <div style={{marginBottom:18}}>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>MEMBERS ({roster.length})</div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {roster.map(({membership, person:mp}) => {
            const isSelf = mp.id === person.id;
            return (
              <div key={membership.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:C.card,border:`1px solid ${C.border}`,borderRadius:6}}>
                <div style={{flex:1,minWidth:0}}>
                  <div onClick={isSelf?undefined:()=>{onClose();nav('person_detail',{personId:mp.id});}}
                    style={{color:isSelf?C.text:C.blue,fontSize:13,fontWeight:500,cursor:isSelf?'default':'pointer',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {mp.name}{isSelf && <span style={{color:C.muted,fontSize:11,fontStyle:'italic'}}> · this contact</span>}
                  </div>
                </div>
                <select value={membership.relationship} onChange={e=>onUpdateMemberRelationship(membership.id, e.target.value)}
                  style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:5,color:C.text,fontSize:12,padding:'5px 7px',fontFamily:"'Jost',sans-serif"}}>
                  {relOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                <ConfirmBtn idleLabel="Remove" onConfirm={()=>onRemoveHouseholdMember(membership.id)} title="Remove from household" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Add member */}
      <div style={{marginBottom:18,borderTop:`1px solid ${C.border}`,paddingTop:16}}>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>ADD A MEMBER</div>
        {addable.length > 0 && (
          <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap',marginBottom:10}}>
            <div style={{flex:'2 1 200px',minWidth:0}}>
              <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>EXISTING CONTACT</label>
              <select value={addPersonId} onChange={e=>setAddPersonId(e.target.value)}
                style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
                <option value="">— select contact —</option>
                {addable.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{flex:'1 1 120px'}}>
              <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>RELATIONSHIP</label>
              <select value={addRel} onChange={e=>setAddRel(e.target.value)}
                style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
                {relOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <Btn onClick={doAddMember} disabled={!addPersonId || addBusy}>{addBusy?'Adding…':'Add'}</Btn>
          </div>
        )}
        {/* Add a brand-new contact straight into this household. Always
            available — even when every existing contact is already housed.
            The relationship picked here is applied when the new person saves. */}
        <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div style={{flex:'1 1 120px'}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>NEW CONTACT'S RELATIONSHIP</label>
            <select value={newContactRel} onChange={e=>setNewContactRel(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
              {relOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <Btn variant="ghost" onClick={()=>setAddingNew(true)}>+ Add new contact</Btn>
        </div>
      </div>

      {/* Delete household */}
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <ConfirmBtn idleLabel="Delete household"
          armedLabel="Delete entire household?"
          onConfirm={()=>{ onDeleteHousehold(household.id); onClose(); }}
          title="Removes the household and unlinks all members. The contacts themselves are not deleted." />
        <Btn variant="secondary" onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );
}

// ─── CONTACT DATES CARD ───────────────────────────────────────────────────────
// Editable list of extra dated events (anniversaries etc.) for a person OR an
// org. Pass exactly one of personId / orgId. Recurring dates surface on the
// personal-mode Dashboard's upcoming panel; one-off dates are just stored here.
// Fields per row: date, label (free text), recurring toggle, optional note.
// Handlers come from the parent (server-confirmed create, optimistic update/
// delete). Rows sort by upcoming occurrence (recurring) then raw date.
function ContactDatesCard({ anchor, contactDates, onAdd, onUpdate, onRemove }) {
  const mine = useMemo(() => {
    const list = contactDates.filter(d =>
      anchor.personId ? d.personId === anchor.personId : d.orgId === anchor.orgId);
    return list.slice().sort((a, b) => {
      const ia = contactDateInfo(a.date, a.recurring);
      const ib = contactDateInfo(b.date, b.recurring);
      const da = ia ? ia.days : 99999;
      const db = ib ? ib.days : 99999;
      if (da !== db) return da - db;
      return (a.date || '').localeCompare(b.date || '');
    });
  }, [contactDates, anchor]);

  const blank = { label: '', date: '', recurring: true, note: '' };
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(blank);
  const [busy, setBusy] = useState(false);

  const canSave = (d) => d.label.trim() && d.date;

  const saveNew = async () => {
    if (!canSave(draft) || busy) return;
    setBusy(true);
    try {
      await onAdd({ ...anchor, label: draft.label.trim(), date: draft.date, recurring: draft.recurring, note: draft.note.trim() });
      setDraft(blank); setAdding(false);
    } finally { setBusy(false); }
  };
  const startEdit = (d) => { setEditId(d.id); setEditDraft({ label: d.label, date: d.date, recurring: d.recurring, note: d.note || '' }); };
  const saveEdit = () => {
    if (!canSave(editDraft)) return;
    onUpdate(editId, { ...anchor, label: editDraft.label.trim(), date: editDraft.date, recurring: editDraft.recurring, note: editDraft.note.trim() });
    setEditId(null);
  };

  const DateForm = ({ d, setD, onSave, onCancel, saveLabel }) => (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 14px',marginBottom:8}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
        <input type="date" value={d.date} onChange={e=>setD({...d,date:e.target.value})}
          style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 10px',color:C.text,fontSize:13,fontFamily:"'Jost',sans-serif"}} />
        <input value={d.label} onChange={e=>setD({...d,label:e.target.value})} placeholder="Label (e.g. Wedding, Met)"
          style={{flex:1,minWidth:140,background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 10px',color:C.text,fontSize:13,fontFamily:"'Jost',sans-serif"}} />
      </div>
      <input value={d.note} onChange={e=>setD({...d,note:e.target.value})} placeholder="Note (optional)"
        style={{width:'100%',background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 10px',color:C.text,fontSize:13,fontFamily:"'Jost',sans-serif",marginBottom:8}} />
      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <label style={{display:'flex',alignItems:'center',gap:6,color:C.muted,fontSize:12,cursor:'pointer'}}>
          <input type="checkbox" checked={d.recurring} onChange={e=>setD({...d,recurring:e.target.checked})} style={{accentColor:C.gold}} />
          Repeats every year
        </label>
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <Btn variant="secondary" small onClick={onCancel}>Cancel</Btn>
          <Btn small onClick={onSave} disabled={!canSave(d)}>{saveLabel}</Btn>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:12,padding:'16px 18px',marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',marginBottom:12}}>
        <div style={{color:C.muted,fontSize:11,letterSpacing:'1.5px',textTransform:'uppercase',flex:1}}>Dates & anniversaries</div>
        {!adding && <button onClick={()=>{ setAdding(true); setDraft(blank); }} style={{background:'none',border:'none',color:C.gold,cursor:'pointer',fontSize:12,fontFamily:"'Jost',sans-serif"}}>+ Add date</button>}
      </div>

      {adding && <DateForm d={draft} setD={setDraft} onSave={saveNew} onCancel={()=>{ setAdding(false); setDraft(blank); }} saveLabel="Add" />}

      {mine.length === 0 && !adding && (
        <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'2px 0'}}>No dates yet.</div>
      )}

      {mine.map(d => {
        if (editId === d.id) return <DateForm key={d.id} d={editDraft} setD={setEditDraft} onSave={saveEdit} onCancel={()=>setEditId(null)} saveLabel="Save" />;
        const info = contactDateInfo(d.date, d.recurring);
        const soon = info && info.days >= 0 && info.days <= 14;
        let when = '';
        if (info) {
          if (info.recurring) when = info.days === 0 ? 'today' : `in ${info.days} ${info.days===1?'day':'days'}`;
          else if (info.days === 0) when = 'today';
          else when = info.days > 0 ? `in ${info.days} ${info.days===1?'day':'days'}` : `${Math.abs(info.days)} ${Math.abs(info.days)===1?'day':'days'} ago`;
        }
        return (
          <div key={d.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'9px 0',borderBottom:`1px solid ${C.border}44`}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:C.text,fontSize:14}}>
                {d.recurring ? '↻ ' : ''}{d.label}
                {info && info.recurring && info.years > 0 && <span style={{color:C.muted,fontSize:12}}> · {info.years} {info.years===1?'yr':'yrs'}</span>}
              </div>
              <div style={{color:C.muted,fontSize:12,marginTop:2}}>
                {fmt(d.date)}{when && <span style={{color:soon?C.gold:C.muted}}> · {when}</span>}
              </div>
              {d.note && <div style={{color:C.muted,fontSize:12,marginTop:3,fontStyle:'italic'}}>{d.note}</div>}
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0}}>
              <button onClick={()=>startEdit(d)} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'3px 8px',fontFamily:"'Jost',sans-serif"}}>Edit</button>
              <ConfirmBtn idleLabel="Remove" onConfirm={()=>onRemove(d.id)} title="Remove this date" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PersonDetail({ person, org, pNotes, pClasses, attendance, packages, classes, notes=[], orgs, nav, backInfo, highlightNoteId, people, households, householdMembers, contactDates=[], onCreateHousehold, onRenameHousehold, onDeleteHousehold, onAddHouseholdMember, onCreatePersonForHousehold, onUpdateMemberRelationship, onRemoveHouseholdMember, onAddContactDate, onUpdateContactDate, onRemoveContactDate, onAddNote, onSendEmail, onEdit, onAddPackage, onEditPackage, onUseSession, onReturnSession, onToggleImportant, onClearAction, onReopenNote, onDeleteNote, onUpdateActionDate, onEditNote, onBook }) {
  const isMobile = useIsMobile();  const [addKind, setAddKind] = useState(null);  // null | 'note' | 'call' | 'email' | 'meeting'
  const [menuOpen, setMenuOpen] = useState(false);  // controls the "+ Log ▾" dropdown
  const menuRef = useRef(null);
  const [composeOpen, setComposeOpen] = useState(false);  // adhoc email compose modal
  // Active right-column tab. Persisted so the page reopens on the last-viewed
  // tab (sticky across navigations/sessions, per-device). On mobile a fourth
  // 'bookings' tab joins the row; on desktop bookings live in the left column.
  const [tab, setTab] = useLocalStorage('felt.personDetail.tab', 'notes');
  const [flashId, setFlashId] = useState(null);
  const [filterKind, setFilterKind] = useState('all');
  // Which booking rows are expanded to show their session note(s) inline.
  const [bookingNotesOpen, setBookingNotesOpen] = useState(()=>new Set());
  const toggleBookingNotes = (cid) => setBookingNotesOpen(s=>{ const n=new Set(s); n.has(cid)?n.delete(cid):n.add(cid); return n; });
  // Notes shown on a booking row: interaction notes anchored to that session
  // (session_id == classId), plus the session's own reflection (Class Log text),
  // folded in as a synthetic entry so it renders inline like a note. Reflection
  // is why a private session with written-up content lights up even when no
  // classId-anchored interaction note exists.
  const classNotes = (cls) => {
    const cid = cls.id;
    const list = notes.filter(n => n.classId===cid && !['booking','payment'].includes(n.kind));
    if (cls.reflection && cls.reflection.trim()) {
      list.unshift({ id:`reflection-${cid}`, kind:'note', text:cls.reflection, _reflection:true });
    }
    return list;
  };
  // If the active filter points at a kind with no items (e.g. the last call
  // was deleted and its chip vanished), fall back to showing all — otherwise
  // the user is stranded on an empty list with no chip to click back to.
  const effectiveFilter = (filterKind!=='all' && !pNotes.some(n => (n.kind||'note')===filterKind)) ? 'all' : filterKind;
  const visibleNotes = effectiveFilter==='all' ? pNotes : pNotes.filter(n => (n.kind||'note')===effectiveFilter);
  const impNotes = visibleNotes.filter(n=>n.important), regNotes = visibleNotes.filter(n=>!n.important);

  // ── Household derivation. A contact may belong to MULTIPLE households (the
  // junction table supports it). myMemberships = all this person's junction rows;
  // myHouseholds = the groups they belong to (sorted by name). The card shows
  // one household at a time via a tab selector (activeHouseholdId).
  const myMemberships = (householdMembers || []).filter(m => m.personId === person.id);
  const myHouseholds = myMemberships
    .map(m => (households || []).find(h => h.id === m.householdId))
    .filter(Boolean)
    .sort((a,b) => a.name.localeCompare(b.name));
  const [activeHouseholdId, setActiveHouseholdId] = useState(null);
  // Keep the active selection valid as households are added/removed: default to
  // the first, and fall back if the active one disappears (e.g. left/deleted).
  useEffect(() => {
    if (myHouseholds.length === 0) { if(activeHouseholdId!==null) setActiveHouseholdId(null); return; }
    if (!activeHouseholdId || !myHouseholds.some(h => h.id === activeHouseholdId)) {
      setActiveHouseholdId(myHouseholds[0].id);
    }
  }, [myHouseholds.map(h=>h.id).join(','), activeHouseholdId]);
  const activeHousehold = myHouseholds.find(h => h.id === activeHouseholdId) || myHouseholds[0] || null;
  // Roster (members + their relationship + person record) for the active household.
  const householdRoster = activeHousehold
    ? (householdMembers || [])
        .filter(m => m.householdId === activeHousehold.id)
        .map(m => ({ membership: m, person: (people || []).find(p => p.id === m.personId) }))
        .filter(x => x.person)
        .sort((a,b) => a.person.name.localeCompare(b.person.name))
    : [];
  // Household modal state: null | { mode:'create' } | { mode:'manage', householdId }
  const [householdModal, setHouseholdModal] = useState(null);
  // The household now lives as a line inside the contact card (both mobile and
  // desktop): collapsed it shows just the name; tapping reveals the roster,
  // the +household/Manage controls, and (when multiple) the household tabs.
  const [householdExpanded, setHouseholdExpanded] = useState(false);
  // Contact Info card collapse — persisted per-device so the card reopens in
  // its last state. Collapsed → header (avatar + name) only; the body and the
  // household line are hidden.
  const [infoOpen, setInfoOpen] = useLocalStorage('felt.personDetail.infoOpen', true);
  const pPkgs=packages.filter(pk=>pk.personId===person.id);
  // Payments tab data: three sources merged into one chronological list —
  //   • drop-in payments  (attendance.paymentStatus==='paid', has paidAmount)
  //   • package purchases (packages with a purchase date / amount)
  //   • unpaid-but-owed   (attendance.paymentStatus==='unpaid' on a class with a
  //                         rate > 0, i.e. money outstanding for a session)
  // Package-funded sessions aren't listed individually here — they're covered by
  // the package purchase row (the lump payment); listing each deduction too would
  // double-count money. Each entry has a stable id so it can expand inline.
  const pAttendance = attendance.filter(a => a.personId === person.id);
  const pPayments = useMemo(() => {
    const rows = [];
    pAttendance.forEach(a => {
      const cls = classes.find(c => c.id === a.classId);
      if (!cls) return;
      if (a.paymentStatus === 'paid') {
        rows.push({ id:`drop_${a.id}`, kind:'drop_in', date:cls.date, amount:a.paidAmount ?? null,
          title:cls.name, classId:cls.id, status:'paid' });
      } else if (a.paymentStatus !== 'package') {
        // unpaid (or any non-package, non-paid status) — owed iff the class has a rate
        const owed = (cls.paymentModel !== 'org') ? (cls.rate || 0) : 0;
        if (owed > 0) {
          rows.push({ id:`owed_${a.id}`, kind:'owed', date:cls.date, amount:owed,
            title:cls.name, classId:cls.id, status:'unpaid' });
        }
      }
    });
    pPkgs.forEach(pk => {
      if (pk.datePurchased || pk.amountPaid) {
        rows.push({ id:`pkg_${pk.id}`, kind:'package', date:pk.datePurchased, amount:pk.amountPaid ?? null,
          title:pk.name, packageId:pk.id, paidVia:pk.paidVia, status:'paid' });
      }
    });
    return rows.sort((x,y)=> new Date(y.date||0) - new Date(x.date||0));
  }, [pAttendance, pPkgs, classes]);
  const paidTotal = pPayments.filter(r=>r.status==='paid').reduce((s,r)=>s+(r.amount||0),0);
  const owedTotal = pPayments.filter(r=>r.status==='unpaid').reduce((s,r)=>s+(r.amount||0),0);
  const [expandedPays, setExpandedPays] = useState(()=>new Set());
  const togglePay = (id) => setExpandedPays(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  // Packages collapse by default — summary only (header + progress bar). Click expands
  // to reveal linked sessions, manual offset controls, and notes. After 5 packages,
  // the list itself becomes scrollable (mirrors the class-history cap pattern).
  const [expandedPkgs, setExpandedPkgs] = useState(()=>new Set());
  const togglePkg = (id) => setExpandedPkgs(prev => {
    const next = new Set(prev);
    if(next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Bookings list, shared between the desktop left-column card and the mobile
  // tab. `scroll` caps height + scrolls (desktop card); off-mobile the tab body
  // grows naturally. Logic is identical to the previous inline render.
  const bookingsList = (scroll) => (
    pClasses.length ? (
      <div style={scroll ? {maxHeight:304,overflowY:'auto',paddingRight:4} : undefined}>
        {pClasses.map(c=>{
          const att=attendance.find(a=>a.classId===c.id&&a.personId===person.id);
          // Light payment-status hint. Jesse is undecided on showing this —
          // to remove it, delete the `payInfo`/`payHint` lines and the
          // {payHint} span below; nothing else depends on them.
          const ps = att?.paymentStatus || 'unpaid';
          const payInfo = ps==='paid' ? {t:'paid', c:C.green} : ps==='package' ? {t:'pkg', c:C.blue} : {t:'unpaid', c:C.muted};
          const payHint = <span style={{fontSize:10,color:payInfo.c,opacity:0.85,letterSpacing:'0.3px'}}>{payInfo.t}</span>;
          const cn = classNotes(c);
          const open = bookingNotesOpen.has(c.id);
          return (<div key={c.id}>
            <div onClick={()=>nav('class_detail',{classId:c.id})} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:open?'none':`1px solid ${C.border}`,cursor:'pointer'}}><div><div style={{color:C.text,fontSize:13}}>{c.name}</div><div style={{color:C.muted,fontSize:11}}>{fmt(c.date)}</div></div><div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}><NoteIndicator count={cn.length} expanded={open} previewText={cn[0]?.text||''} onToggle={()=>toggleBookingNotes(c.id)} />{payHint}<div title={att?.attended?'Attended':'Did not attend'} style={{width:8,height:8,borderRadius:'50%',background:att?.attended?C.green:C.red}} /></div></div>
            {open && cn.length>0 && (
              <div style={{background:C.surf,borderBottom:`1px solid ${C.border}`,padding:'8px 10px 10px',marginBottom:0}} onClick={e=>e.stopPropagation()}>
                {cn.map(n=>(
                  <div key={n.id} style={{display:'flex',gap:7,padding:'4px 0',color:C.text,fontSize:12,lineHeight:1.55}}>
                    <span style={{opacity:0.7,flexShrink:0}}>{n._reflection?'📔':(INTERACTION_KINDS[n.kind]||INTERACTION_KINDS.note).icon}</span>
                    <span>{n.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>);
        })}
      </div>
    ) : <div style={{color:C.muted,fontSize:13}}>No bookings yet</div>
  );

  // Household block — rendered as a line inside the contact card, beneath the
  // person notes, on both mobile and desktop. Collapsed: "HOUSEHOLD  <name>"
  // with a chevron. Expanded in place: reveals +household/Manage controls, the
  // household tab row (when in more than one), and the roster. Tapping the line
  // toggles. The whole thing is hidden when the contact card is collapsed.
  const householdBlock = () => (
    <div style={{borderTop:`1px solid ${C.border}`,marginTop:14,paddingTop:12}}>
      {/* Tappable summary line */}
      <div onClick={()=>setHouseholdExpanded(v=>!v)}
        style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,cursor:'pointer'}}>
        <div style={{minWidth:0}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:3}}>{myHouseholds.length>1?'HOUSEHOLDS':'HOUSEHOLD'}</div>
          <div style={{color:C.text,fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            {activeHousehold ? (myHouseholds.length>1 ? `${myHouseholds.length} households` : activeHousehold.name) : <span style={{color:C.muted,fontWeight:400}}>Not in a household</span>}
          </div>
        </div>
        <span aria-hidden="true" style={{color:C.muted,fontSize:11,flexShrink:0,transition:'transform 0.18s',transform:householdExpanded?'rotate(0deg)':'rotate(-90deg)',display:'inline-block'}}>▾</span>
      </div>
      {/* Expanded body */}
      {householdExpanded && (
        <div style={{marginTop:12}}>
          {/* +household / Manage controls */}
          <div style={{display:'flex',alignItems:'center',gap:12,justifyContent:'flex-end',marginBottom:10}}>
            {myHouseholds.length>0 && <span style={{color:C.muted,fontSize:11,cursor:'pointer'}} onClick={(e)=>{e.stopPropagation();setHouseholdModal({mode:'create'});}} title="Create another household">+ household</span>}
            {activeHousehold && <span style={{color:C.muted,fontSize:11,cursor:'pointer'}} onClick={(e)=>{e.stopPropagation();setHouseholdModal({mode:'manage',householdId:activeHousehold.id});}}>Manage</span>}
          </div>
          {/* Tab row — only when the contact is in more than one household */}
          {myHouseholds.length>1 && (
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
              {myHouseholds.map(h=>{
                const active=h.id===activeHousehold?.id;
                return <button key={h.id} onClick={()=>setActiveHouseholdId(h.id)} style={{background:active?C.goldBg:'transparent',color:active?C.gold:C.muted,border:`1px solid ${active?C.gold+'88':C.border}`,borderRadius:4,fontSize:11,fontWeight:500,letterSpacing:'0.3px',padding:'4px 10px',cursor:'pointer',fontFamily:"'Jost',sans-serif",maxWidth:140,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{h.name}</button>;
              })}
            </div>
          )}
          {activeHousehold ? (
            householdRoster.length > 1 ? (
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {householdRoster.map(({membership, person:mp}) => {
                  const isSelf = mp.id === person.id;
                  const b = mp.dateOfBirth ? birthdayInfo(mp.dateOfBirth) : null;
                  return (
                    <div key={membership.id}
                      onClick={isSelf ? undefined : ()=>nav('person_detail',{personId:mp.id})}
                      style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'7px 0',borderBottom:`1px solid ${C.border}`,cursor:isSelf?'default':'pointer'}}>
                      <div style={{minWidth:0}}>
                        <div style={{color:isSelf?C.muted:C.blue,fontSize:13,fontWeight:isSelf?400:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                          {mp.name}{isSelf && <span style={{color:C.muted,fontSize:11,fontStyle:'italic'}}> · this contact</span>}
                        </div>
                        <div style={{color:C.muted,fontSize:11}}>
                          {RELATIONSHIP_LABELS[membership.relationship] || 'Other'}
                          {b && <span style={{color:b.days<=30?C.gold:C.muted,marginLeft:6}}>· {b.label}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{color:C.muted,fontSize:13}}>Just this contact so far. <span style={{color:C.blue,cursor:'pointer'}} onClick={()=>setHouseholdModal({mode:'manage',householdId:activeHousehold.id})}>Add someone →</span></div>
            )
          ) : (
            <Btn small onClick={()=>setHouseholdModal({mode:'create'})}>+ Create household</Btn>
          )}
        </div>
      )}
    </div>
  );

  // When arriving with a highlightNoteId, switch to notes tab, scroll the note
  // into view, flash for ~1.6s. Uses block:'nearest' (not 'center') so we
  // scroll the *minimum* needed: a note already on-screen doesn't move, and a
  // note below the fold is brought just into view rather than yanked to the
  // middle of the viewport — which previously pushed the back button far out
  // of reach and felt like the page was stuck. We also only scroll when the
  // note is actually outside the viewport, so short contacts don't jump at all.
  useEffect(()=>{
    if(!highlightNoteId) return;
    setTab('notes');
    setFlashId(highlightNoteId);
    const t1 = setTimeout(()=>{
      const el = document.querySelector(`[data-note-id="${highlightNoteId}"]`);
      if(el){
        const r = el.getBoundingClientRect();
        const offscreen = r.top < 0 || r.bottom > window.innerHeight;
        if(offscreen) el.scrollIntoView({behavior:'smooth', block:'nearest'});
      }
    }, 80);
    const t2 = setTimeout(()=>setFlashId(null), 1800);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  }, [highlightNoteId]);

  // Close the "+ Log" dropdown when the user clicks outside it or hits Escape.
  useEffect(()=>{
    if(!menuOpen) return;
    const onDoc = (e) => {
      if(menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if(e.key==='Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <>
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px',maxWidth:940}}>
      <PageHead sticky back={backInfo?.label} onBack={backInfo?.onBack} action={<><Btn small={isMobile} onClick={onBook}>+ Book</Btn><Btn small={isMobile} variant="secondary" onClick={onEdit}>Edit</Btn></>}>{person.name}</PageHead>
      <div style={{display:'grid',gridTemplateColumns: isMobile ? '1fr' : '280px 1fr',gap: isMobile ? 14 : 24}}>
        <div>
          {/* Contact Info card — collapsible to a header (avatar + name). Header
              is sticky so it stays reachable while the body/tabs scroll. The
              household now lives inside this card as a line beneath the notes. */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14,overflow:'hidden'}}>
            <div onClick={()=>setInfoOpen(v=>!v)}
              style={{position: isMobile ? 'static' : 'sticky',top: isMobile?97:0,zIndex:4,background:C.card,display:'flex',alignItems:'center',gap:12,padding:'16px 20px',cursor:'pointer',borderBottom: infoOpen?`1px solid ${C.border}`:'none'}}>
              <Avatar name={person.name} size={infoOpen?50:38} role={primaryRole(person)} />
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.text,fontSize:16,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{person.name}</div>
                {infoOpen && <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>{person.roles.map(r=><RoleBadge key={r} role={r} />)}</div>}
              </div>
              <span aria-hidden="true" style={{color:C.muted,fontSize:12,flexShrink:0,transition:'transform 0.18s',transform:infoOpen?'rotate(0deg)':'rotate(-90deg)',display:'inline-block'}}>▾</span>
            </div>
            {infoOpen && <div style={{padding:'12px 20px 20px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {(person.emails?.length > 0 || person.email) && <div>
                <div style={{color:C.muted,fontSize:10,marginBottom:2}}>EMAIL{(person.emails?.length||0) > 1 ? 'S' : ''}</div>
                {person.emails?.length > 0 ? (
                  <div style={{display:'flex',flexDirection:'column',gap:3}}>
                    {[...person.emails].sort((a,b)=>(b.isPrimary?1:0)-(a.isPrimary?1:0)).map(e => (
                      <div key={e.id} style={{display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{color:C.gold,fontSize:13,wordBreak:'break-all'}}>{e.email}</span>
                        {e.isPrimary && person.emails.length > 1 && <span style={{color:C.gold+'aa',fontSize:9,letterSpacing:'0.5px'}}>PRIMARY</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{color:C.gold,fontSize:13}}>{person.email}</div>
                )}
              </div>}
              {person.phone&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>PHONE</div><div style={{color:C.text,fontSize:13}}>{person.phone}</div></div>}
              {person.website&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>WEBSITE</div><a href={/^https?:\/\//i.test(person.website)?person.website:`https://${person.website}`} target="_blank" rel="noopener noreferrer" style={{color:C.blue,fontSize:13,textDecoration:'none',wordBreak:'break-all'}}>{person.website}</a></div>}
              {person.address&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>ADDRESS</div><div style={{color:C.text,fontSize:13}}>{person.address}</div></div>}
              {person.dateOfBirth&&(()=>{const b=birthdayInfo(person.dateOfBirth);return <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>DATE OF BIRTH</div><div style={{color:C.text,fontSize:13}}>{person.dateOfBirth}{b&&<span style={{color:b.days<=30?C.gold:C.muted,fontSize:12,marginLeft:8}}>· {b.label}</span>}</div></div>;})()}
              {org&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>ORGANISATION</div><div style={{color:C.blue,fontSize:13,cursor:'pointer'}} onClick={()=>nav('org_detail',{orgId:org.id})}>{org.name}</div></div>}
              {/* STATUS & SOURCE: desktop only — on mobile they crowd out
                  the genuinely useful contact details (email/phone). Still
                  editable via the Edit screen on any device. */}
              {!isMobile && <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>STATUS</div><div style={{color:person.status==='active'?C.green:person.status==='interested'?C.gold:C.muted,fontSize:13,fontWeight:500}}>{person.status}</div></div>}
              {!isMobile && <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>SOURCE</div><SourceTag source={person.source} /></div>}
            </div>
            {person.notes&&<div style={{borderTop:`1px solid ${C.border}`,marginTop:14,paddingTop:12,color:C.muted,fontSize:13,lineHeight:1.6}}>{person.notes}</div>}
            {/* HOUSEHOLD — in-card line, beneath notes, expandable in place. */}
            {householdBlock()}
            </div>}
          </div>
          <ContactDatesCard anchor={{personId: person.id}} contactDates={contactDates}
            onAdd={onAddContactDate} onUpdate={onUpdateContactDate} onRemove={onRemoveContactDate} />
          {/* Bookings now lives in the right-column tab row on both mobile and
              desktop (Comms · Bookings · Packages · Payments). The old desktop
              left-column card was removed to avoid duplication. */}
        </div>
        <div>
          {isMobile ? (
            <MobileTabBar topOffset={97} active={tab} onChange={setTab} tabs={[
              {id:'notes',    icon:'💬', name:'Comms',    count:pNotes.length},
              {id:'bookings', icon:'📅', name:'Bookings', count:pClasses.length},
              {id:'packages', icon:'🎟', name:'Packages', count:pPkgs.length},
              {id:'payments', icon:'💷', name:'Payments', count:pPayments.length},
            ]} />
          ) : (
            <Tabs tabs={[{id:'notes',label:`Comms (${pNotes.length})`},{id:'bookings',label:`Bookings (${pClasses.length})`},{id:'packages',label:`Packages (${pPkgs.length})`},{id:'payments',label:`Payments (${pPayments.length})`}]} active={tab} onChange={setTab} />
          )}
          {tab==='bookings'&&<>
            {bookingsList(false)}
          </>}
          {tab==='notes'&&<>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:12,flexWrap:'wrap'}}>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {(() => {
                  // Comms kinds only — booking/payment are transactional and will
                  // live in their own list (Phase 7), so they're excluded here.
                  // We also hide any chip with zero items so the bar stays short:
                  // only 'All' plus kinds actually present on this contact show.
                  const COMMS_KINDS = ['note','call','email','meeting','form'];
                  const chips = ['all', ...COMMS_KINDS.filter(k => pNotes.some(n => (n.kind||'note')===k))];
                  return chips.map(k => {
                    const active = effectiveFilter === k;
                    const meta = k==='all' ? null : INTERACTION_KINDS[k];
                    const label = k==='all' ? 'All' : meta.label + 's';
                    const icon = k==='all' ? '◯' : meta.icon;
                    const count = k==='all' ? pNotes.length : pNotes.filter(n=>(n.kind||'note')===k).length;
                    return (
                      <button key={k} onClick={()=>setFilterKind(k)} title={label} style={{
                        background: active ? (meta?meta.bg:C.surf) : 'transparent',
                        color: active ? (meta?meta.color:C.text) : C.muted,
                        border: `1px solid ${active ? (meta?meta.color+'88':C.border) : C.border}`,
                        borderRadius:4, fontSize:11, fontWeight:500, letterSpacing:'0.3px',
                        padding:'4px 10px', cursor:'pointer',
                        fontFamily:"'Jost',sans-serif",
                        display:'inline-flex', alignItems:'center', gap:5,
                      }}>
                        <span style={{fontSize:11,lineHeight:1}}>{icon}</span>
                        <span data-chip-label>{label}</span>
                        <span style={{opacity:0.55,fontSize:10}}>{count}</span>
                      </button>
                    );
                  });
                })()}
              </div>
              {/* "+ Log ▾" dropdown — click to open menu, click an item to open
                  the form for that kind. Closes on outside-click or Escape (see
                  useEffect above). Hidden while the form itself is open. */}
              {addKind === null && (
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <Btn small variant="ghost" onClick={()=>setComposeOpen(true)} title={person.email ? `Email ${person.email}` : 'No primary email — set one before sending'}>
                    ✉ Send email
                  </Btn>
                  <div ref={menuRef} style={{position:'relative'}}>
                  <Btn small onClick={()=>setMenuOpen(v=>!v)}>
                    + Log <span style={{opacity:0.6,marginLeft:3,display:'inline-block',transition:'transform 0.15s',transform:menuOpen?'rotate(180deg)':'rotate(0deg)'}}>▾</span>
                  </Btn>
                  {menuOpen && (
                    <div style={{
                      position:'absolute', top:'calc(100% + 4px)', right:0,
                      background:C.card, border:`1px solid ${C.border}`,
                      borderRadius:6, padding:4, minWidth:150, zIndex:10,
                      display:'flex', flexDirection:'column', gap:2,
                      boxShadow:'0 4px 12px rgba(0,0,0,0.35)',
                    }}>
                      {Object.entries(INTERACTION_KINDS).map(([k, meta]) => (
                        <button key={k} onClick={()=>{ setAddKind(k); setMenuOpen(false); }}
                          style={{
                            background:'transparent', border:'none', color:C.text,
                            padding:'8px 12px', borderRadius:4, cursor:'pointer',
                            fontSize:13, fontFamily:"'Jost',sans-serif",
                            display:'flex', alignItems:'center', gap:10,
                            textAlign:'left',
                            transition:'background 0.12s, color 0.12s',
                          }}
                          onMouseEnter={e=>{
                            e.currentTarget.style.background = meta.bg;
                            e.currentTarget.style.color = meta.color;
                          }}
                          onMouseLeave={e=>{
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = C.text;
                          }}>
                          <span style={{fontSize:14,lineHeight:1}}>{meta.icon}</span>
                          <span style={{flex:1}}>{meta.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                </div>
              )}
            </div>
            {addKind&&<NoteForm personId={person.id} classId={null} kind={addKind} onSave={n=>{onAddNote(n);setAddKind(null);}} onCancel={()=>setAddKind(null)} />}
            {impNotes.length>0&&<><div style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'1px',marginBottom:8,marginTop:4}}>⚑ IMPORTANT</div>{impNotes.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} onReopenNote={onReopenNote} onUpdateActionDate={onUpdateActionDate} onDelete={onDeleteNote} onClick={onEditNote?()=>onEditNote(n):undefined} highlight={flashId===n.id} />)}{regNotes.length>0&&<div style={{borderTop:`1px solid ${C.border}`,margin:'18px 0',opacity:0.4}} />}</>}
            {regNotes.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} onReopenNote={onReopenNote} onUpdateActionDate={onUpdateActionDate} onDelete={onDeleteNote} onClick={onEditNote?()=>onEditNote(n):undefined} highlight={flashId===n.id} />)}
            {visibleNotes.length===0&&!addKind&&<Empty text={effectiveFilter==='all' ? 'No comms yet' : `No ${INTERACTION_KINDS[effectiveFilter].label.toLowerCase()}s logged yet`} />}
          </>}
          {tab==='packages'&&<>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}><Btn small onClick={onAddPackage}>+ Add Package</Btn></div>
            {pPkgs.length?(
              // Scroll container kicks in past 5 packages — same pattern as the
              // class-history cap on the info card. Height roughly fits 5
              // collapsed cards plus a hint of the next one.
              <div style={pPkgs.length>5 ? {maxHeight:670,overflowY:'auto',paddingRight:4} : undefined}>
            {pPkgs.map(pk=>{
              const linkedAtt = attendance.filter(a => a.packageId === pk.id);
              const linkedCount = linkedAtt.length;
              const totalUsed = (pk.sessionsUsed || 0) + linkedCount;
              const remaining = pk.type==='monthly_unlimited' ? Infinity : (pk.type==='drop_in' ? Math.max(0,(pk.totalSessions||1)-totalUsed) : Math.max(0, pk.totalSessions - totalUsed));
              const pct = isCountlessPkg(pk.type) ? 100 : Math.round((remaining/pk.totalSessions)*100);
              const pkColor = PKG_TYPES[pk.type]?.color || C.muted;
              const isExpended = remaining<=0;
              return (
                <div key={pk.id} style={{background:C.card,border:`1px solid ${isExpended?C.border:pkColor+'55'}`,borderRadius:8,padding:'16px 20px',marginBottom:12}}>
                  {/* Summary: clicking anywhere in this block toggles expansion.
                      Edit button stops propagation so it doesn't also toggle. */}
                  <div onClick={()=>togglePkg(pk.id)} style={{cursor:'pointer'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:isCountlessPkg(pk.type)?0:10,gap:12}}>
                      <div><div style={{color:C.text,fontSize:15,fontWeight:500}}>{pk.name}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{PKG_TYPES[pk.type]?.label} · {fmt(pk.datePurchased)}{pk.expiresAt && <> · <span style={{color: pk.expiresAt < today() ? C.red : C.muted}}>{pk.expiresAt < today() ? 'expired' : 'expires'} {fmt(pk.expiresAt)}</span></>}</div></div>
                      <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                        <div style={{textAlign:'right'}}><div style={{color:C.gold,fontSize:14,fontWeight:500}}>£{pk.amountPaid}</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{PAY_VIA[pk.paidVia]||pk.paidVia}</div></div>
                        <button onClick={(e)=>{e.stopPropagation();onEditPackage(pk.id);}}
                          style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'3px 9px',fontFamily:"'Jost',sans-serif",flexShrink:0}}>
                          Edit
                        </button>
                        <span aria-hidden="true" style={{color:C.muted,fontSize:11,lineHeight:'22px',transition:'transform 0.18s',transform:expandedPkgs.has(pk.id)?'rotate(0deg)':'rotate(-90deg)',display:'inline-block'}}>▾</span>
                      </div>
                    </div>
                    {pk.type==='monthly_unlimited'&&(
                      <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                        <span style={{color:pkColor,fontSize:13,fontWeight:600,letterSpacing:'0.3px'}}>∞ unlimited</span>
                        <span style={{color:C.muted,fontSize:11}}>· {totalUsed} attended</span>
                      </div>
                    )}
                    {!isCountlessPkg(pk.type)&&(
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <div style={{flex:1,height:5,background:C.surf,borderRadius:3,overflow:'hidden'}}><div style={{width:`${pct}%`,height:'100%',background:isExpended?C.red:pkColor,borderRadius:3,transition:'width 0.3s'}} /></div>
                        <div style={{color:isExpended?C.red:pkColor,fontSize:14,fontWeight:600,minWidth:80,textAlign:'right'}}>{remaining}/{pk.totalSessions} left</div>
                      </div>
                    )}
                  </div>
                  {/* Expanded details: linked sessions, manual offset, notes */}
                  {expandedPkgs.has(pk.id) && <>
                  {!isCountlessPkg(pk.type)&&<>
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
                  {pk.type==='monthly_unlimited'&&linkedAtt.length>0&&(
                    <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                      <div style={{color:C.muted,fontSize:10,letterSpacing:'0.4px',marginBottom:7}}>ATTENDED THIS PERIOD · {linkedCount}</div>
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
                  {pk.notes&&<div style={{color:C.muted,fontSize:12,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>{pk.notes}</div>}
                  </>}
                </div>
              );
            })}
            </div>
            ):<Empty text="No packages yet" />}
          </>}
          {tab==='payments'&&<>
            {/* Summary line: money in vs outstanding. */}
            <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:120,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px'}}>
                <div style={{color:C.muted,fontSize:10,letterSpacing:'0.4px',marginBottom:3}}>RECEIVED</div>
                <div style={{color:C.green,fontSize:18,fontWeight:600}}>{fmtMoney(paidTotal)}</div>
              </div>
              <div style={{flex:1,minWidth:120,background:C.card,border:`1px solid ${owedTotal>0?C.red+'55':C.border}`,borderRadius:8,padding:'10px 14px'}}>
                <div style={{color:C.muted,fontSize:10,letterSpacing:'0.4px',marginBottom:3}}>OUTSTANDING</div>
                <div style={{color:owedTotal>0?C.red:C.muted,fontSize:18,fontWeight:600}}>{fmtMoney(owedTotal)}</div>
              </div>
            </div>
            {pPayments.length ? (
              <div style={pPayments.length>8 ? {maxHeight:560,overflowY:'auto',paddingRight:4} : undefined}>
                {pPayments.map(r => {
                  const meta = r.kind==='package' ? {label:'Package', icon:'🎟', color:C.blue}
                             : r.kind==='drop_in' ? {label:'Drop-in', icon:'💷', color:C.green}
                             : {label:'Owed', icon:'⚠', color:C.red};
                  const open = expandedPays.has(r.id);
                  return (
                    <div key={r.id} style={{background:C.card,border:`1px solid ${r.status==='unpaid'?C.red+'44':C.border}`,borderRadius:8,marginBottom:8,overflow:'hidden'}}>
                      <div onClick={()=>togglePay(r.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',cursor:'pointer'}}>
                        <span style={{fontSize:14,width:18,textAlign:'center',flexShrink:0}}>{meta.icon}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:C.text,fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.title}</div>
                          <div style={{color:C.muted,fontSize:11}}>{meta.label}{r.date?` · ${fmt(r.date)}`:''}</div>
                        </div>
                        <div style={{color:r.status==='unpaid'?C.red:C.gold,fontSize:14,fontWeight:600,flexShrink:0}}>
                          {r.amount!=null ? fmtMoney(r.amount) : '—'}
                        </div>
                        <span aria-hidden="true" style={{color:C.muted,fontSize:11,transition:'transform 0.18s',transform:open?'rotate(0deg)':'rotate(-90deg)',display:'inline-block',flexShrink:0}}>▾</span>
                      </div>
                      {open && (
                        <div style={{padding:'0 14px 12px 44px',borderTop:`1px solid ${C.border}`}}>
                          <div style={{display:'flex',flexDirection:'column',gap:6,paddingTop:10}}>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}>
                              <span style={{color:C.muted}}>Status</span>
                              <span style={{color:r.status==='unpaid'?C.red:C.green,fontWeight:500}}>{r.status==='unpaid'?'Outstanding':'Paid'}</span>
                            </div>
                            {r.paidVia && (
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}>
                                <span style={{color:C.muted}}>Method</span>
                                <span style={{color:C.text}}>{PAY_VIA[r.paidVia]||r.paidVia}</span>
                              </div>
                            )}
                            {r.classId && (
                              <div onClick={()=>nav('class_detail',{classId:r.classId})}
                                style={{color:C.blue,fontSize:12,cursor:'pointer',marginTop:2}}>
                                Open session →
                              </div>
                            )}
                            {r.packageId && (
                              <div onClick={()=>{ setTab('packages'); }}
                                style={{color:C.blue,fontSize:12,cursor:'pointer',marginTop:2}}>
                                View package →
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <Empty text="No payments recorded yet" />}
          </>}
        </div>
      </div>
      {householdModal && (() => {
        // create mode → pass household=null (modal shows its create form).
        // manage mode → resolve the specific household + its roster.
        const isCreate = householdModal.mode === 'create';
        const targetHousehold = isCreate ? null : (households||[]).find(h => h.id === householdModal.householdId) || null;
        const targetRoster = targetHousehold
          ? (householdMembers||[]).filter(m=>m.householdId===targetHousehold.id)
              .map(m=>({membership:m, person:(people||[]).find(p=>p.id===m.personId)}))
              .filter(x=>x.person).sort((a,b)=>a.person.name.localeCompare(b.person.name))
          : [];
        return (
          <HouseholdModal
            person={person}
            household={targetHousehold}
            roster={targetRoster}
            allPeople={people}
            households={households}
            householdMembers={householdMembers}
            orgs={orgs}
            onClose={()=>setHouseholdModal(null)}
            onCreateHousehold={onCreateHousehold}
            onRenameHousehold={onRenameHousehold}
            onDeleteHousehold={onDeleteHousehold}
            onAddHouseholdMember={onAddHouseholdMember}
            onCreatePersonForHousehold={onCreatePersonForHousehold}
            onUpdateMemberRelationship={onUpdateMemberRelationship}
            onRemoveHouseholdMember={onRemoveHouseholdMember}
            nav={nav}
          />
        );
      })()}
    </div>
    {composeOpen && (
      <SendEmailModal
        person={person}
        onSend={onSendEmail}
        onClose={()=>setComposeOpen(false)}
      />
    )}
    </>
  );
}

// ─── CLASSES LIST / DETAIL ────────────────────────────────────────────────────
function ClassList({ classes, orgs, series, attendance, nav, onAdd }) {
  const isMobile = useIsMobile();
  // Default sort puts upcoming classes first (soonest at the top), then past ones in
  // reverse chronological order. Lots of classes get unwieldy fast — letting the user
  // toggle filters/groupings makes scanning manageable.
  const [filter, setFilter] = useState('upcoming'); // 'all' | 'upcoming' | 'past' | 'today'
  const [groupBy, setGroupBy] = useState('date'); // 'date' | 'org' | 'none'
  const [search, setSearch] = useState('');
  const t = today();

  const baseFiltered = useMemo(() => {
    let list = classes;
    if(filter === 'upcoming') list = list.filter(c => c.date >= t);
    else if(filter === 'past') list = list.filter(c => c.date < t);
    else if(filter === 'today') list = list.filter(c => c.date === t);
    if(search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.location||'').toLowerCase().includes(q));
    }
    return list;
  }, [classes, filter, search, t]);

  // Sort: upcoming asc (soonest first), past desc (most recent first); 'all' splits both
  const sorted = useMemo(() => {
    const upcoming = baseFiltered.filter(c => c.date >= t).sort((a,b) => {
      if(a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time||'').localeCompare(b.time||'');
    });
    const past = baseFiltered.filter(c => c.date < t).sort((a,b) => {
      if(a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.time||'').localeCompare(a.time||'');
    });
    if(filter === 'past') return past;
    if(filter === 'upcoming' || filter === 'today') return upcoming;
    return [...upcoming, ...past];
  }, [baseFiltered, filter, t]);

  // Group sorted list into named buckets. Headers get rendered between groups.
  const groups = useMemo(() => {
    if(groupBy === 'none') return [{ key:'all', label:null, items:sorted }];
    if(groupBy === 'org') {
      const byOrg = {};
      sorted.forEach(c => {
        const key = c.orgId || 'no_org';
        const label = c.orgId ? (orgs.find(o=>o.id===c.orgId)?.name || 'Unknown org') : 'Personal / no org';
        if(!byOrg[key]) byOrg[key] = { key, label, items:[] };
        byOrg[key].items.push(c);
      });
      return Object.values(byOrg);
    }
    // groupBy === 'date' — week / month buckets
    // Monday-anchored week boundaries (UK convention)
    const weekStartStr = startOfWeek(t);
    const nextWeekStart = addDays(weekStartStr, 7);
    const twoWeekStart = addDays(weekStartStr, 14);
    const buckets = new Map();
    sorted.forEach(c => {
      let key, label;
      if(c.date < t) {
        // Past: bucket by month
        const d = new Date(c.date+'T12:00');
        key = `past_${d.getFullYear()}_${d.getMonth()}`;
        label = d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
      } else if(c.date === t) {
        key = 'today'; label = 'Today';
      } else if(c.date < nextWeekStart) {
        key = 'this_week'; label = 'This week';
      } else if(c.date < twoWeekStart) {
        key = 'next_week'; label = 'Next week';
      } else {
        const d = new Date(c.date+'T12:00');
        key = `m_${d.getFullYear()}_${d.getMonth()}`;
        label = d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
      }
      if(!buckets.has(key)) buckets.set(key, { key, label, items:[] });
      buckets.get(key).items.push(c);
    });
    return Array.from(buckets.values());
  }, [sorted, groupBy, orgs, t]);

  const FilterPill = ({ value, label, count }) => (
    <button onClick={()=>setFilter(value)}
      style={{background:filter===value?C.goldBg:C.surf,border:`1px solid ${filter===value?C.gold+'aa':C.border}`,color:filter===value?C.gold:C.muted,cursor:'pointer',borderRadius:20,fontSize:12,padding:'4px 11px',fontFamily:"'Jost',sans-serif",fontWeight:filter===value?600:400,letterSpacing:'0.3px'}}>
      {label}{count!==undefined?` · ${count}`:''}
    </button>
  );

  const counts = useMemo(()=>({
    upcoming: classes.filter(c=>c.date>=t).length,
    today: classes.filter(c=>c.date===t).length,
    past: classes.filter(c=>c.date<t).length,
    all: classes.length,
  }), [classes, t]);

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px'}}>
      <PageHead action={<>
        <Btn variant="secondary" small onClick={()=>nav('week_view')}>Week view</Btn>
        <Btn small={isMobile} onClick={onAdd}>+ {isMobile ? 'Class' : 'Add Class'}</Btn>
      </>}>All Classes</PageHead>

      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18,flexWrap:'wrap'}}>
        <FilterPill value="upcoming" label="Upcoming" count={counts.upcoming} />
        <FilterPill value="today" label="Today" count={counts.today} />
        <FilterPill value="past" label="Past" count={counts.past} />
        <FilterPill value="all" label="All" count={counts.all} />
        <div style={{flex:1}} />
        <input type="text" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'5px 10px',fontFamily:"'Jost',sans-serif",outline:'none',width:160}} />
        <select value={groupBy} onChange={e=>setGroupBy(e.target.value)}
          style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'5px 10px',fontFamily:"'Jost',sans-serif",outline:'none',cursor:'pointer'}}>
          <option value="date">Group by date</option>
          <option value="org">Group by organisation</option>
          <option value="none">No grouping</option>
        </select>
      </div>

      {sorted.length ? (
        groups.map(g => (
          <div key={g.key} style={{marginBottom:22}}>
            {g.label && (
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <div style={{color:C.gold,fontSize:11,fontWeight:600,letterSpacing:'1.5px',textTransform:'uppercase'}}>{g.label}</div>
                <div style={{flex:1,height:1,background:C.border,opacity:0.5}} />
                <div style={{color:C.muted,fontSize:11}}>{g.items.length}</div>
              </div>
            )}
            <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
              {g.items.map(c=>{
                const org=orgs.find(o=>o.id===c.orgId), att=attendance.filter(a=>a.classId===c.id), present=att.filter(a=>a.attended).length;
                const ser=series.find(s=>s.id===c.seriesId);
                const kindKey = classKindKey(c, org);
                const tracksPay = c.paymentModel === 'per_person' || c.paymentModel === 'private';
                const unpaidCount = tracksPay ? att.filter(a => a.attended && (!a.paymentStatus || a.paymentStatus === 'unpaid')).length : 0;
                const timeLbl = fmtTime(c.time);
                return (
                  <Row key={c.id} onClick={()=>nav('class_detail',{classId:c.id})}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <div style={{color:C.text,fontSize:14,fontWeight:500}}>{c.name}</div>
                        {ser&&<span style={{color:C.muted,fontSize:11,background:C.surf,padding:'1px 7px',borderRadius:10}}>↻ {RECURRENCE[ser.recurrence]||ser.recurrence}</span>}
                      </div>
                      <div style={{color:C.muted,fontSize:12,marginTop:2}}>{fmt(c.date)}{timeLbl?` · ${timeLbl}`:''} · {c.location}</div>
                    </div>
                    <KindBadge kindKey={kindKey} />
                    {unpaidCount>0 && (
                      <span style={{background:'#2a1313',color:C.red,fontSize:11,fontWeight:600,padding:'2px 9px',borderRadius:20,letterSpacing:'0.4px',flexShrink:0}}>{unpaidCount} unpaid</span>
                    )}
                    {att.length>0 && (
                      <span style={{background:C.surf,color:C.muted,fontSize:11,padding:'3px 10px',borderRadius:20,flexShrink:0}}>{present}/{att.length} attended</span>
                    )}
                  </Row>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <Empty text={search ? `No classes match "${search}"` : (filter==='upcoming'?'No upcoming classes':filter==='past'?'No past classes':'No classes logged yet')} />
      )}
    </div>
  );
}

function ClassDetail({ cls, org, people, attendance, notes, series, forms, packages, nav, backInfo, onToggle, onAddNote, onAddToRegister, onEdit, onToggleImportant, onClearAction, onReopenNote, onDeleteNote, onUpdateActionDate, onUpdateClass, onSetPayment, onDeleteClass, onRemoveFromRegister }) {
  const isMobile = useIsMobile();  const [expanded, setExpanded] = useState(null); // { type:'note'|'payment', personId }
  // Privacy mode for in-class teaching: by default we hide rates and payment amounts so
  // a client glancing at the screen doesn't see what we charge. Toggle in the header.
  const [showMoney, setShowMoney] = useLocalStorage('fbc.classDetail.showMoney', false);
  const reg = attendance.filter(a=>a.classId===cls.id).map(a=>({...a,person:people.find(p=>p.id===a.personId)})).filter(a=>a.person);
  const ser = series.find(s=>s.id===cls.seriesId);
  const kindKey = classKindKey(cls, org);
  const isOrgBilled = cls.paymentModel === 'org';
  const tracksPayment = cls.paymentModel === 'per_person' || cls.paymentModel === 'private';
  const canDelete = reg.length === 0 || cls.paymentModel === 'private';
  // Private sessions are 1:1 by definition — if they need deleting, the attendance
  // row goes with them. Other class types still require an empty register so we
  // don't accidentally drop the attendance history of multiple people.

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
        if(pk) totalPkgValue += packagePerSessionValue(pk, attendance);
      } else {
        unpaid++;
      }
    });
    return { unpaid, paid, viaPackage, totalCash, totalPkgValue, totalRevenue: totalCash + totalPkgValue };
  }, [reg, tracksPayment, packages, attendance]);

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px',maxWidth:920}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={<>
        <Btn variant="secondary" small onClick={()=>setShowMoney(v=>!v)} title={showMoney?'Hide payment info':'Show payment info'}>{showMoney?'Hide £':'Show £'}</Btn>
        <Btn variant="secondary" small={isMobile} onClick={onEdit}>Edit</Btn>
      </>}>{cls.name}</PageHead>
      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        <KindBadge kindKey={kindKey} />
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.text,fontSize:13}}>
          {fmt(cls.date)}{fmtTime(cls.time) ? ` · ${fmtTime(cls.time)}` : ''}{cls.duration ? ` · ${cls.duration}min` : ''}
        </div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.text,fontSize:13}}>{cls.location}</div>
        {org&&<div onClick={()=>nav('org_detail',{orgId:org.id})} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.blue,fontSize:13,cursor:'pointer'}}>{org.name}</div>}
        {ser&&<div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.muted,fontSize:13}}>↻ {RECURRENCE[ser.recurrence]} series</div>}
        {showMoney && cls.rate>0 && <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',color:C.gold,fontSize:13}}>{fmtMoney(cls.rate)}{isOrgBilled?'/session':' drop-in'}</div>}
      </div>

      {showMoney && paymentSummary && (paymentSummary.paid + paymentSummary.viaPackage + paymentSummary.unpaid > 0) && (
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
          const status = r.paymentStatus || (tracksPayment ? 'unpaid' : null);          return (
            <div key={personId}>
              <Row>
                <Avatar name={person.name} size={34} role={primaryRole(person)} />
                <div style={{flex:1,cursor:'pointer',minWidth:0}} onClick={()=>nav('person_detail',{personId})}>
                  <div style={{color:C.text,fontSize:14}}>{person.name}</div>
                  <div style={{display:'flex',gap:4,marginTop:3,flexWrap:'wrap',alignItems:'center'}}>{person.roles.map(role=><RoleBadge key={role} role={role} />)}{hasImp&&<span style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'0.5px',marginLeft:4}}>⚑ IMPORTANT NOTE</span>}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:9,flexWrap:'wrap',justifyContent:'flex-end'}}>
                  {tracksPayment && showMoney && (
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
                  {showMoney && onRemoveFromRegister && (
                    <ConfirmBtn idleLabel="Remove" armedLabel="Yes, remove"
                      title="Remove from register — clears this class from their history. The class itself is kept."
                      onConfirm={()=>{ setExpanded(null); onRemoveFromRegister(attId); }} />
                  )}
                </div>
              </Row>
              {noteOpen&&(<div style={{background:C.surf,borderTop:`1px solid ${C.border}`,padding:'16px 20px 16px 68px'}}>{pn.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} onReopenNote={onReopenNote} onUpdateActionDate={onUpdateActionDate} onDelete={onDeleteNote} />)}<NoteForm personId={personId} classId={cls.id} onSave={n=>{onAddNote(n);}} onCancel={()=>setExpanded(null)} /></div>)}
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

      {showMoney && canDelete && onDeleteClass && (
        <div style={{marginTop:32,paddingTop:18,borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div style={{color:C.muted,fontSize:12,flex:1,minWidth:200}}>
            {reg.length === 0
              ? 'This session has no register entries — safe to remove if it was created in error.'
              : `Deleting this private session will also remove the booking${reg.length>1?'s':''} and any linked payment record.`}
          </div>
          <ConfirmBtn idleLabel="Delete session" armedLabel="Yes, delete"
            onConfirm={()=>onDeleteClass(cls.id)} />
        </div>
      )}
    </div>
  );
}

// ─── WEEK VIEW ────────────────────────────────────────────────────────────────
// Sunday-Saturday timetable. Classes with a time get positioned in the grid by
// their time-of-day; classes without a time appear in a stacked "all-day" row
// at the top of each column. Action-by notes for the week appear underneath.
function WeekView({ classes, orgs, notes, people, nav, backInfo, onAddClass, onUpdateActionDate, onClearAction, onToggleImportant }) {
  const isMobile = useIsMobile();
  const t = today();
  // Anchor the week to Monday (UK convention).
  const initialAnchor = useMemo(() => startOfWeek(t), [t]);
  const [anchor, setAnchor] = useState(initialAnchor);
  const days = useMemo(() => Array.from({length:7}, (_,i) => addDays(anchor, i)), [anchor]);
  const weekEnd = days[6];

  const weekClasses = useMemo(() =>
    classes.filter(c => c.date >= anchor && c.date <= weekEnd),
    [classes, anchor, weekEnd]);
  // Action notes for this week — only active (non-completed) ones surface here.
  const weekActionNotes = useMemo(() =>
    notes.filter(n => n.actionDate && !n.completed && n.actionDate >= anchor && n.actionDate <= weekEnd)
      .sort((a,b) => a.actionDate.localeCompare(b.actionDate)),
    [notes, anchor, weekEnd]);

  // Grid resolution: 30-minute slots ("2 columns per hour"). 6:30am-9pm by default.
  // Auto-extends in both directions if any timed class falls outside.
  const SLOT_MIN = 30;
  const SLOT_HEIGHT = 16; // px per 30-min slot — compact vertical spacing for at-a-glance scanning
  const DEFAULT_START = 6*60 + 30;
  const DEFAULT_END = 21*60;
  const { gridStart, gridEnd } = useMemo(() => {
    let s = DEFAULT_START, e = DEFAULT_END;
    weekClasses.forEach(c => {
      const m = timeToMin(c.time);
      if(m === null) return;
      const dur = c.duration || 60;
      const startSlot = Math.floor(m / SLOT_MIN) * SLOT_MIN;
      const endSlot = Math.ceil((m + dur) / SLOT_MIN) * SLOT_MIN;
      if(startSlot < s) s = startSlot;
      if(endSlot > e) e = endSlot;
    });
    return { gridStart: s, gridEnd: e };
  }, [weekClasses]);
  const totalSlots = (gridEnd - gridStart) / SLOT_MIN;
  const gridHeight = totalSlots * SLOT_HEIGHT;

  // Position a timed class block. Height reflects duration in 30-min units.
  const classBlock = (c) => {
    const startMin = timeToMin(c.time);
    if(startMin === null) return null;
    const duration = c.duration || 60;
    const top = ((startMin - gridStart) / SLOT_MIN) * SLOT_HEIGHT;
    const height = Math.max(SLOT_HEIGHT - 2, (duration / SLOT_MIN) * SLOT_HEIGHT - 2);
    return { top, height };
  };

  const dayLabel = (dateStr, idx) => {
    const d = new Date(dateStr+'T12:00');
    const dow = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][idx];
    const isToday = dateStr === t;
    return { dow, day: d.getDate(), isToday };
  };

  const monthLabel = (() => {
    const a = new Date(anchor+'T12:00');
    const e = new Date(weekEnd+'T12:00');
    if(a.getMonth() === e.getMonth()) {
      return a.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    }
    const aMonth = a.toLocaleDateString('en-GB',{month:'short'});
    const eMonth = e.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
    return `${aMonth} – ${eMonth}`;
  })();

  // Build the multi-line tooltip shown on hover (native title attribute).
  const tooltipFor = (c) => {
    const lines = [c.name];
    const tl = fmtTime(c.time);
    if(tl) lines.push(`${tl} · ${c.duration || 60} min`);
    if(c.location) lines.push(c.location);
    const cOrg = orgs.find(o => o.id === c.orgId);
    if(cOrg) lines.push(cOrg.name);
    if(c.seriesId) lines.push('↻ recurring series');
    return lines.join('\n');
  };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px'}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={
        <Btn small onClick={()=>onAddClass && onAddClass(t)}>+ Class</Btn>
      }>Week View</PageHead>

      {/* Week navigator */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,flexWrap:'wrap'}}>
        <button onClick={()=>setAnchor(addDays(anchor,-7))}
          style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'4px 10px',lineHeight:1,fontFamily:"'Jost',sans-serif"}}>‹</button>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:C.text,fontWeight:600,minWidth:180}}>{monthLabel}</div>
        <button onClick={()=>setAnchor(addDays(anchor,7))}
          style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'4px 10px',lineHeight:1,fontFamily:"'Jost',sans-serif"}}>›</button>
        {anchor !== initialAnchor && (
          <button onClick={()=>setAnchor(initialAnchor)}
            style={{background:C.goldBg,border:`1px solid ${C.gold}88`,color:C.gold,cursor:'pointer',borderRadius:6,fontSize:12,padding:'4px 11px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>This week</button>
        )}
        <div style={{flex:1}} />
        <div style={{color:C.muted,fontSize:12}}>{weekClasses.length} class{weekClasses.length!==1?'es':''}</div>
      </div>

      {/* Header row of day names */}
      <div style={{display:'grid',gridTemplateColumns:'56px repeat(7, 1fr)',marginBottom:8}}>
        <div />
        {days.map((d,i) => {
          const lbl = dayLabel(d, i);
          return (
            <div key={d} style={{textAlign:'center',padding:'6px 4px'}}>
              <div style={{color:lbl.isToday?C.gold:C.muted,fontSize:10,fontWeight:600,letterSpacing:'1.5px'}}>{lbl.dow}</div>
              <div style={{
                color:lbl.isToday?C.gold:C.text,
                fontSize:18,fontWeight:lbl.isToday?600:400,
                fontFamily:"'Cormorant Garamond',serif",
                marginTop:2,
              }}>{lbl.day}</div>
            </div>
          );
        })}
      </div>

      {/* Untimed (all-day) row — shown only if any class in the week has no time set */}
      {weekClasses.some(c => !timeToMin(c.time)) && (
        <div style={{display:'grid',gridTemplateColumns:'56px repeat(7, 1fr)',borderBottom:`1px solid ${C.border}`,marginBottom:6}}>
          <div style={{color:C.muted,fontSize:9,letterSpacing:'1.2px',padding:'6px 4px',textAlign:'right',fontWeight:600}}>UNTIMED</div>
          {days.map(d => {
            const items = weekClasses.filter(c => c.date === d && !timeToMin(c.time));
            return (
              <div key={d} style={{padding:'4px',display:'flex',flexDirection:'column',gap:3,minHeight:30}}>
                {items.map(c => {
                  const cOrg = orgs.find(o=>o.id===c.orgId);
                  const kk = classKindKey(c, cOrg);
                  const meta = KIND_META[kk] || { color:C.gold };
                  return (
                    <div key={c.id} onClick={()=>nav('class_detail',{classId:c.id})}
                      style={{background:C.card,border:`1px solid ${meta.color}55`,borderLeft:`3px solid ${meta.color}`,borderRadius:4,padding:'3px 6px',cursor:'pointer',fontSize:11,color:C.text,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                      title={tooltipFor(c)}>
                      {c.name}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Time grid */}
      <div style={{display:'grid',gridTemplateColumns:'56px repeat(7, 1fr)',position:'relative',border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
        {/* Hour-label column — labels appear at full hours; half-hour gridlines are subtle */}
        <div style={{position:'relative',height:gridHeight,borderRight:`1px solid ${C.border}`,background:C.bg}}>
          {Array.from({length: totalSlots}, (_, i) => {
            const minute = gridStart + i * SLOT_MIN;
            const isFullHour = minute % 60 === 0;
            if(!isFullHour) return null;
            const h = Math.floor(minute / 60);
            const display = h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`;
            return (
              <div key={i} style={{position:'absolute',top:i*SLOT_HEIGHT,right:6,color:C.muted,fontSize:10,letterSpacing:'0.5px'}}>
                {display}
              </div>
            );
          })}
          {/* Show start time at the very top if it's a half-hour (e.g. 6:30) */}
          {gridStart % 60 !== 0 && (() => {
            const h = Math.floor(gridStart / 60);
            const m = gridStart % 60;
            const display = `${h===0?12:h>12?h-12:h}:${m.toString().padStart(2,'0')}${h<12?'am':'pm'}`;
            return <div style={{position:'absolute',top:0,right:6,color:C.muted,fontSize:9,letterSpacing:'0.3px',opacity:0.7}}>{display}</div>;
          })()}
        </div>
        {/* Day columns */}
        {days.map((d,i) => {
          const lbl = dayLabel(d, i);
          const dayItems = weekClasses.filter(c => c.date === d && timeToMin(c.time) !== null);
          return (
            <div key={d} style={{position:'relative',height:gridHeight,borderRight:i<6?`1px solid ${C.border}`:'none',background:lbl.isToday?C.goldBg+'22':'transparent'}}>
              {/* Half-hourly gridlines: full lines on the hour, subtle lines on the half */}
              {Array.from({length: totalSlots}, (_, j) => {
                const minute = gridStart + j * SLOT_MIN;
                const isFullHour = minute % 60 === 0;
                return (
                  <div key={j} style={{
                    position:'absolute', top:j*SLOT_HEIGHT, left:0, right:0,
                    height:1, background:C.border,
                    opacity: isFullHour ? 0.45 : 0.18,
                  }} />
                );
              })}
              {/* Today indicator line at current time */}
              {lbl.isToday && (() => {
                const now = new Date();
                const nowMin = now.getHours()*60 + now.getMinutes();
                const yMin = nowMin - gridStart;
                if(yMin < 0 || yMin > (gridEnd - gridStart)) return null;
                return <div style={{position:'absolute',top:(yMin/SLOT_MIN)*SLOT_HEIGHT,left:0,right:0,height:2,background:C.red,zIndex:2,boxShadow:`0 0 4px ${C.red}99`}} />;
              })()}
              {/* Class blocks — name + venue only, time/details on hover */}
              {dayItems.map(c => {
                const block = classBlock(c);
                if(!block) return null;
                const cOrg = orgs.find(o=>o.id===c.orgId);
                const kk = classKindKey(c, cOrg);
                const meta = KIND_META[kk] || { color:C.gold };
                // With 16px slots, a 30-min class is 16px (single line) and 60-min is 32px (two lines).
                // Compact mode hides venue and reduces padding so the name still reads.
                const compact = block.height < 28;
                return (
                  <div key={c.id} onClick={()=>nav('class_detail',{classId:c.id})}
                    style={{
                      position:'absolute', top:block.top, height:block.height, left:3, right:3,
                      background: meta.color+'22',
                      border:`1px solid ${meta.color}66`,
                      borderLeft:`3px solid ${meta.color}`,
                      borderRadius:4, padding: compact ? '1px 6px' : '2px 6px',
                      cursor:'pointer', overflow:'hidden',
                      fontFamily:"'Jost',sans-serif",
                      transition:'all 0.12s',
                      display:'flex', flexDirection:'column', justifyContent: compact ? 'center' : 'flex-start',
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.background=meta.color+'33';e.currentTarget.style.zIndex=3;}}
                    onMouseLeave={e=>{e.currentTarget.style.background=meta.color+'22';e.currentTarget.style.zIndex=1;}}
                    title={tooltipFor(c)}>
                    <div style={{color:C.text,fontSize:11,fontWeight:500,lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
                    {!compact && c.location && (
                      <div style={{color:C.muted,fontSize:10,marginTop:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.location}</div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Action-by notes for this week */}
      {weekActionNotes.length > 0 && (
        <div style={{marginTop:32}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,color:C.gold,marginBottom:14,fontWeight:600}}>
            Action this week
            <span style={{color:C.muted,fontSize:13,fontWeight:400,marginLeft:8,fontFamily:"'Jost',sans-serif"}}>· {weekActionNotes.length} item{weekActionNotes.length!==1?'s':''}</span>
          </div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
            {weekActionNotes.map((n,i) => {
              const p = people.find(pp=>pp.id===n.personId);
              const overdue = n.actionDate < t;
              const dueToday = n.actionDate === t;
              const accent = overdue ? C.red : dueToday ? C.gold : C.blue;
              return (
                <div key={n.id} onClick={()=>nav('person_detail',{personId:n.personId,highlightNoteId:n.id})}
                  style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',borderBottom:i<weekActionNotes.length-1?`1px solid ${C.border}`:'none',cursor:'pointer',background:C.card,transition:'background 0.12s'}}
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

// ─── MONTH VIEW (global) ──────────────────────────────────────────────────────
// A whole-practice month calendar — every org's classes in a classic 6×7 grid.
// Sits under Week View in the nav. Pills are colour-coded by class kind and open
// the class on click; days overflow to "+N more". Mirrors WeekView's header and
// Monday-start convention, and the OrgDetail MonthCalendar's grid mechanics.
function MonthView({ classes, orgs, nav, backInfo, onAddClass }) {
  const isMobile = useIsMobile();
  const t = today();
  const [anchor, setAnchor] = useState(() => t); // any date inside the shown month
  const a = new Date(anchor+'T12:00');
  const year = a.getFullYear(), month = a.getMonth();
  const monthLabel = a.toLocaleDateString('en-GB',{month:'long',year:'numeric'});

  // 6 weeks × 7 days starting from the Monday on/before the 1st.
  const gridStart = useMemo(() => startOfWeek(new Date(year, month, 1).toISOString().slice(0,10)), [year, month]);
  const cells = useMemo(() => Array.from({length:42}, (_,i) => addDays(gridStart, i)), [gridStart]);

  const byDate = useMemo(() => {
    const map = {};
    classes.forEach(c => { (map[c.date]||(map[c.date]=[])).push(c); });
    Object.values(map).forEach(list => list.sort((x,y)=>(x.time||'').localeCompare(y.time||'')));
    return map;
  }, [classes]);
  const monthCount = classes.filter(c => { const d=new Date(c.date+'T12:00'); return d.getFullYear()===year && d.getMonth()===month; }).length;

  const DOW = isMobile ? ['M','T','W','T','F','S','S'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const prevMonth = () => setAnchor(new Date(year, month-1, 1).toISOString().slice(0,10));
  const nextMonth = () => setAnchor(new Date(year, month+1, 1).toISOString().slice(0,10));

  // Jump to that calendar week. Week-view doesn't take an anchor date arg as
  // a routing param right now (it derives from `today()`), so on mobile-tap
  // it'll snap to the current week. TODO: thread an `anchorDate` view param
  // through WeekView so this is a true "show me this week" jump.
  const goToWeek = () => nav('week_view');

  // Pill renders differently on mobile (time-only, more compact) vs desktop
  // (time + name). Both stop propagation so taps land on the pill, not the
  // surrounding cell's add-class handler.
  const Pill = ({ c }) => {
    const cOrg = orgs.find(o => o.id === c.orgId);
    const kk = classKindKey(c, cOrg);
    const color = (KIND_META[kk] || { color:C.gold }).color;
    const tip = [c.name, fmtTime(c.time)?`${fmtTime(c.time)} · ${c.duration||60} min`:null, c.location, cOrg?.name].filter(Boolean).join('\n');
    const timeLbl = fmtTime(c.time) || '—';
    if (isMobile) {
      // Time-only pill: just the start time, colour-coded by kind. Tight padding
      // because mobile cells are narrow and we want several pills to fit.
      return (
        <div onClick={(e)=>{ e.stopPropagation(); nav('class_detail',{classId:c.id}); }} title={tip}
          style={{background:color+'22',borderLeft:`2px solid ${color}`,borderRadius:3,padding:'1px 3px',marginBottom:2,cursor:'pointer',color,fontSize:10,fontWeight:600,letterSpacing:'0.2px',lineHeight:1.3,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
          {timeLbl}
        </div>
      );
    }
    return (
      <div onClick={(e)=>{ e.stopPropagation(); nav('class_detail',{classId:c.id}); }} title={tip}
        style={{background:color+'22',borderLeft:`2px solid ${color}`,borderRadius:3,padding:'1px 4px',marginBottom:2,cursor:'pointer',display:'flex',alignItems:'center',gap:4,overflow:'hidden'}}>
        {c.time && <span style={{color,fontSize:9,fontWeight:600,flexShrink:0}}>{fmtTime(c.time)}</span>}
        <span style={{color:C.text,fontSize:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</span>
      </div>
    );
  };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px'}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={
        <Btn small onClick={()=>onAddClass && onAddClass(t)}>+ Class</Btn>
      }>Month View</PageHead>

      <div style={{display:'flex',alignItems:'center',gap:isMobile?6:10,marginBottom:isMobile?12:18,flexWrap:'wrap'}}>
        <button onClick={prevMonth} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'4px 10px',lineHeight:1,fontFamily:"'Jost',sans-serif"}}>‹</button>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?17:20,color:C.text,fontWeight:600,minWidth:isMobile?140:180}}>{monthLabel}</div>
        <button onClick={nextMonth} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'4px 10px',lineHeight:1,fontFamily:"'Jost',sans-serif"}}>›</button>
        <button onClick={()=>nav('week_view')} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:12,padding:'4px 11px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>Week view</button>
        {(year!==new Date(t+'T12:00').getFullYear() || month!==new Date(t+'T12:00').getMonth()) && (
          <button onClick={()=>setAnchor(t)} style={{background:C.goldBg,border:`1px solid ${C.gold}88`,color:C.gold,cursor:'pointer',borderRadius:6,fontSize:12,padding:'4px 11px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>This month</button>
        )}
        <div style={{flex:1}} />
        <div style={{color:C.muted,fontSize:12}}>{monthCount} class{monthCount!==1?'es':''}</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,marginBottom:4}}>
        {DOW.map((d,i)=><div key={i} style={{textAlign:'center',color:C.muted,fontSize:10,fontWeight:600,letterSpacing:'0.5px',padding:'2px 0'}}>{d}</div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:isMobile?2:5}}>
        {cells.map(d=>{
          const dd = new Date(d+'T12:00');
          const inMonth = dd.getMonth()===month;
          const isToday = d===t;
          const dayClasses = byDate[d]||[];
          const maxPills = isMobile ? 3 : 4;
          return (
            <div key={d} onClick={()=>onAddClass && onAddClass(d)}
              style={{
                border:`1px solid ${isToday?C.gold+'88':C.border}`,
                borderRadius:6,
                minHeight: isMobile ? 64 : 104,
                padding: isMobile ? 3 : 6,
                background:isToday?C.goldBg:(inMonth?C.card:'transparent'),
                opacity:inMonth?1:0.4,
                cursor:'pointer',
              }}>
              {/* Date number — tappable on mobile to jump to that calendar week.
                  stopPropagation prevents the cell's add-class handler firing. */}
              <div
                onClick={isMobile ? (e)=>{ e.stopPropagation(); goToWeek(); } : undefined}
                style={{
                  color:isToday?C.gold:C.text,
                  fontSize:12,
                  fontWeight:isToday?600:400,
                  marginBottom: isMobile ? 2 : 4,
                  textAlign:'right',
                  cursor: isMobile ? 'pointer' : 'inherit',
                  // Subtle hint that the date is tappable on mobile.
                  textDecoration: isMobile ? 'underline' : 'none',
                  textDecorationStyle: isMobile ? 'dotted' : undefined,
                  textDecorationColor: isMobile ? (isToday?C.gold:C.muted)+'66' : undefined,
                }}>
                {dd.getDate()}
              </div>
              {dayClasses.slice(0,maxPills).map(c=><Pill key={c.id} c={c} />)}
              {dayClasses.length>maxPills && <div style={{color:C.muted,fontSize:9,paddingLeft:2}}>+{dayClasses.length-maxPills}</div>}
            </div>
          );
        })}
      </div>
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
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,color:C.gold,fontWeight:600}}>Session log</div>
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
  const isMobile = useIsMobile();
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
  const removeMessage = (f) => {
    const used = usageCount(f.id);
    return used>0
      ? `Used in ${used} class${used>1?'es':''} — those tags will be cleared but classes remain.`
      : null;
  };

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px',maxWidth:760}}>
      <PageHead action={!adding && <Btn small={isMobile} onClick={()=>setAdding(true)}>+ {isMobile ? 'Form' : 'Add Form'}</Btn>}>Forms</PageHead>
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
                      <ConfirmBtn idleLabel="Remove" armedLabel="Confirm"
                        title={removeMessage(f) || undefined}
                        onConfirm={()=>onRemove(f.id)} />
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
  const isMobile = useIsMobile();
  const sorted=[...invoices].sort((a,b)=>b.issueDate.localeCompare(a.issueDate));
  const total = invoices.reduce((s,i)=>s+(i.total||0),0);
  const outstanding = invoices.filter(i=>i.status!=='paid').reduce((s,i)=>s+(i.total||0),0);
  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px'}}>
      <PageHead action={<Btn small={isMobile} onClick={onAdd}>+ {isMobile ? 'Invoice' : 'Create Invoice'}</Btn>}>Invoices</PageHead>
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
  const isMobile = useIsMobile();
  const sm=INV_STATUS[inv.status]||INV_STATUS.draft;
  const [showPrint, setShowPrint] = useState(false);
  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px',maxWidth:760}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={<>
        <Btn variant="secondary" small onClick={()=>downloadInvoiceHtml(inv, org)} title="Download as HTML — open in any browser to print or Save as PDF">↓ Download</Btn>
        <Btn variant="secondary" small={isMobile} onClick={()=>setShowPrint(true)}>Print / PDF</Btn>
        <Btn variant="secondary" small={isMobile} onClick={onEdit}>Edit</Btn>
      </>}>{inv.invoiceNumber}</PageHead>
      {showPrint && <PrintInvoiceOverlay inv={inv} org={org} onClose={()=>setShowPrint(false)} />}
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
        <div style={{background:C.goldBg,border:`1px solid ${C.gold}33`,borderRadius:6,padding:'16px 18px',marginBottom:20}}>
          <div style={{color:C.gold,fontSize:10,fontWeight:600,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10}}>Payment — Bank Transfer</div>
          <div style={{display:'grid',gridTemplateColumns:'130px 1fr',rowGap:5,columnGap:10,fontSize:13}}>
            <div style={{color:C.muted}}>Account name</div><div style={{color:C.text}}>{BANK_DETAILS.accountName}</div>
            <div style={{color:C.muted}}>Bank</div><div style={{color:C.text}}>{BANK_DETAILS.bank}</div>
            <div style={{color:C.muted}}>Sort code</div><div style={{color:C.text,fontFamily:'monospace',letterSpacing:'0.5px'}}>{BANK_DETAILS.sortCode}</div>
            <div style={{color:C.muted}}>Account number</div><div style={{color:C.text,fontFamily:'monospace',letterSpacing:'0.5px'}}>{BANK_DETAILS.accountNumber}</div>
            <div style={{color:C.muted}}>Reference</div><div style={{color:C.text,fontFamily:'monospace',letterSpacing:'0.5px'}}>{inv.invoiceNumber}</div>
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
  // App mode: 'client' (default) shows the client CRM; 'personal' shows the
  // personal record system (Sienna World, Neighbours — friends/teachers/etc).
  // UI lens only — one data store. Personal contacts carry the personal_contact
  // role; personal orgs are type 'personal'. Switching mode filters what's shown
  // and pre-tags new records, but does not partition the data.
  const [mode, setMode] = useLocalStorage('fbc.mode', 'client');
  const [orgs, setOrgs] = useState(SEED.orgs);
  const [people, setPeople] = useState(SEED.people);
  const [series, setSeries] = useState(SEED.series);
  const [classes, setClasses] = useState(SEED.classes);
  const [attendance, setAttendance] = useState(SEED.attendance);
  const [notes, setNotes] = useState(SEED.notes);
  const [packages, setPackages] = useState(SEED.packages);
  // Package templates: canonical package definitions used to prefill AddPackageForm
  // and (Phase 7) the Stripe webhook. Managed via PackageTemplatesView.
  const [packageTemplates, setPackageTemplates] = useState([]);
  const [invoices, setInvoices] = useState(SEED.invoices);
  const [forms, setForms] = useState(SEED.forms);
  // Projects: top-level "your work" entity (distinct from contacts/orgs). Holds
  // project todos via interactions.project_id. status is 'active' | 'done'.
  const [projects, setProjects] = useState([]);
  // User-defined org categories (Insurance, Banks, etc.) and contact roles, persisted alongside data.
  const [customOrgTypes, setCustomOrgTypes] = useState([]);
  const [customPersonRoles, setCustomPersonRoles] = useState([]);
  // Junction rows linking people to organisations in working/staff roles
  // (primary contact, billing contact, etc.). Distinct from people.orgId which
  // models residency. Loaded eagerly, surfaced via OrgDetail in Batch 2.
  const [orgContacts, setOrgContacts] = useState([]);
  // Households: lightweight people<->people groupings (families, couples, a
  // child and their parents). households = the group rows; householdMembers =
  // the junction (householdId, personId, relationship). Surfaced via a card on
  // PersonDetail. No billing/class weight — visibility only.
  const [households, setHouseholds] = useState([]);
  const [householdMembers, setHouseholdMembers] = useState([]);
  // Contact dates: extra dated events (anniversaries etc.) on a person OR an org.
  // Loaded eagerly; surfaced on PersonDetail/OrgDetail (editable card) and the
  // personal-mode Dashboard birthdays+anniversaries panel. Birthdays stay on
  // people.date_of_birth — these are the "multiple extra dates" layer.
  const [contactDates, setContactDates] = useState([]);
  // App config from the settings table — keyed object (e.g. settings.my_addresses
  // is an array of operator email addresses). Loaded eagerly so inbox-assign
  // and any other settings-aware flows have it on the first interaction.
  const [settings, setSettings] = useState({});
  // Mobile nav state (Phase 1: basic hamburger button + modal nav for small screens)
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Mobile accordion expand/contract toggle, persisted per-device so the user's
  // last choice survives a refresh. Contracted (false) = section titles always
  // visible, one open panel claims remaining viewport. Expanded (true) = all
  // sections open, page scrolls. Only renders the toggle on views that opt in
  // (currently Dashboard).
  const [mobileExpandAll, setMobileExpandAll] = useLocalStorage('fbc.mobile.expandAll', false);
  // Recent Contacts: last 20 personIds visited (most-recent first). Updated by
  // a useEffect that watches view changes. Persisted per-device so the list
  // survives refresh. Surfaced in the sidebar above "All Contacts", and as a
  // view (PeopleList with personType='recent').
  const [recentPersonIds, setRecentPersonIds] = useLocalStorage('fbc.recentPersonIds', []);
  const [modal, setModal] = useState(null);
  // Loading + error state for the initial bulk fetch
  const [loadStatus, setLoadStatus] = useState('loading');  // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('');

  // Memoized merged maps go into the context so badges, dropdowns, and avatars
  // see custom types automatically without prop-drilling.
  const orgTypes = useMemo(() => buildOrgTypes(customOrgTypes), [customOrgTypes]);
  const personRoles = useMemo(() => buildPersonRoles(customPersonRoles), [customPersonRoles]);
  const typesValue = useMemo(() => ({ orgTypes, personRoles }), [orgTypes, personRoles]);

  // Single bulk fetch on mount. Auth is guaranteed by the AuthGate wrapper.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await data.loadAll();
        if (cancelled) return;
        setOrgs(all.orgs);
        setPeople(all.people);
        setSeries(all.series);
        setClasses(all.classes);
        setAttendance(all.attendance);
        setNotes(all.notes);
        setPackages(all.packages);
        setInvoices(all.invoices);
        setForms(all.forms);
        setCustomOrgTypes(all.customOrgTypes);
        setCustomPersonRoles(all.customPersonRoles);
        setOrgContacts(all.orgContacts);
        setHouseholds(all.households || []);
        setHouseholdMembers(all.householdMembers || []);
        setContactDates(all.contactDates || []);
        setSettings(all.settings || {});
        setProjects(all.projects || []);
        setPackageTemplates(all.packageTemplates || []);
        setLoadStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setLoadError(e.message || String(e));
        setLoadStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Inbox / comms polling ─────────────────────────────────────────────
  // The inbound Worker (Phase 8 Half A, A4) writes to the `interactions`
  // table directly from Cloudflare — it never touches React state. Without
  // some form of pull, newly-logged emails don't appear in the CRM until
  // the user hits refresh, which is poor UX (they sit in the database with
  // no indication anything happened).
  //
  // Design choices:
  //   - Poll just the interactions table, not loadAll(). Cheaper (one query
  //     vs 16) and zero risk of clobbering in-flight edits in other state
  //     arrays. The Worker only writes here, so this is the only state that
  //     can change without user action.
  //   - 60s cadence. Picked to be "fast enough that BCC-to-log feels live"
  //     and "slow enough that keep-alive / Supabase budget never feels it".
  //   - Visibility-gated: skip the poll when the tab is hidden (background
  //     tab, minimised window). Picks back up immediately on visibility
  //     change. Saves cycles, plays nicely with battery on laptops.
  //   - Wait for initial load to complete (loadStatus === 'ready') before
  //     starting the poller. No point fighting with the initial fetch.
  //   - Skip the poll while a modal is open. The user might be editing a
  //     note right now; replacing the array under them would feel jumpy.
  //     They'll pick up changes when they close the modal anyway.
  //
  // No-op if Supabase is unreachable: the data.notes.list() call throws,
  // we swallow it (just log to console) and try again next tick. The user
  // doesn't see anything; the next successful poll catches up.
  const POLL_INTERVAL_MS = 60_000;
  // Use a ref to read the latest `modal` value inside the interval callback
  // without re-creating the interval every time the modal opens/closes.
  const modalOpenRef = useRef(false);
  useEffect(() => { modalOpenRef.current = !!modal; }, [modal]);

  // Recent Contacts tracker. When the user lands on a person_detail view,
  // push that personId to the front of the recents list (dedupe, cap 20).
  // Persisted via useLocalStorage above so the list survives refresh and is
  // available on next load. Deletions/merges are handled passively: dead
  // ids stay in the array but PeopleList silently drops them when rendering.
  useEffect(() => {
    if (view.name !== 'person_detail' || !view.personId) return;
    const id = view.personId;
    setRecentPersonIds(ids => {
      if (ids[0] === id) return ids; // already most-recent, no-op
      return [id, ...ids.filter(x => x !== id)].slice(0, 20);
    });
  }, [view.name, view.personId]);

  useEffect(() => {
    if (loadStatus !== 'ready') return;
    let cancelled = false;

    const pollOnce = async () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      if (modalOpenRef.current) return;
      try {
        const fresh = await data.notes.list();
        if (cancelled) return;
        setNotes(fresh);
      } catch (e) {
        // Soft-fail: log and try again next tick. Worker rows will still
        // appear on the next successful poll, or on next manual refresh.
        console.warn('[CRM] notes poll failed:', e?.message || e);
      }
    };

    const id = setInterval(pollOnce, POLL_INTERVAL_MS);

    // Fire an immediate poll when the tab regains visibility — covers the
    // common case of "I switched back to the CRM, show me what I missed"
    // without having to wait up to 60s for the next tick.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') pollOnce();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadStatus]);

  // Generic error reporter for mutations. Logs to console and surfaces an alert.
  // A nicer toast UI can come later — alert keeps it visible and unmissable for now.
  const onError = (label) => (err) => {
    console.error(`[CRM] ${label} failed:`, err);
    alert(`${label} failed: ${err.message || err}\n\nYour change wasn't saved. Try again, or refresh.`);
  };

  const nav = (name, params={}) => {
    const next = { name, ...params };
    setHistory(h => {
      const cur = h[h.length-1];
      if (JSON.stringify(cur) === JSON.stringify(next)) return h;
      return [...h, next];
    });
  };
  const goBack = () => setHistory(h => h.length > 1 ? h.slice(0, -1) : h);
  // Switch between client and personal record systems. Resets navigation to the
  // dashboard so we never land on a section (e.g. Finance) that the new mode
  // doesn't surface, and clears history so Back doesn't cross the boundary.
  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    setHistory([{ name:'dashboard' }]);
  };
// Compute a smart back label from the previous entry in the history stack
  const backInfo = useMemo(() => {
    if (history.length < 2) return null;
    const prev = history[history.length - 2];
    let label = 'Back';
    switch (prev.name) {
      case 'dashboard': label = 'Dashboard'; break;
      case 'inbox': label = 'Inbox'; break;
      case 'threads': label = 'Threads'; break;
      case 'comms_log': label = 'Recent Activity'; break;
      case 'package_templates': label = 'Package Templates'; break;
      case 'web_activity': label = 'Web Activity'; break;
      case 'projects': label = 'Projects'; break;
      case 'households': label = 'Households'; break;
      case 'birthdays': label = 'Birthdays'; break;
      case 'project_detail': {
        const pr = projects.find(p => p.id === prev.projectId);
        label = pr ? pr.name : 'Project';
        break;
      }
      case 'classes': label = 'All Classes'; break;
      case 'week_view': label = 'Week View'; break;
      case 'month_view': label = 'Month View'; break;
      case 'forms_list': label = 'Forms'; break;
      case 'invoices': label = 'Invoices'; break;
      case 'people':
        if (prev.personType === 'all') label = 'All Contacts';
        else if (prev.personType === 'recent') label = 'Recent Contacts';
        else {
          const role = personRoles[prev.personType] || PERSON_ROLES[prev.personType];
          label = role ? role.label + 's' : 'People';
        }
        break;
      case 'org_list':
        if (prev.orgType === 'all') label = 'All Organisations';
        else {
          const ot = orgTypes[prev.orgType] || ORG_META[prev.orgType];
          label = (ot?.label || 'Organisation') + 's';
        }
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
  }, [history, orgs, people, classes, invoices, orgTypes, personRoles]);
  const close = () => setModal(null);

  // ─── Mutation handlers ─────────────────────────────────────────────────────
  // Pattern: each handler awaits the data layer, then updates local state with
  // the server-confirmed row (which has the real UUID and any DB-side defaults).
  // Quick toggles use optimistic updates with no rollback — failures are rare
  // and the next loadAll() will reconcile.

  // ── Organisations
  const addOrg = (o) => data.orgs.create(o)
    .then(saved => setOrgs(p => [...p, saved]))
    .catch(onError('Add organisation'));
  const updateOrg = (id, patch) => data.orgs.update(id, patch)
    .then(saved => setOrgs(p => p.map(x => x.id === id ? saved : x)))
    .catch(onError('Update organisation'));

  // ── People
  const addPerson = (p) => data.people.create(p)
    .then(saved => setPeople(prev => [...prev, saved]))
    .catch(onError('Add person'));
  const updatePerson = (id, patch) => data.people.update(id, patch)
    .then(saved => setPeople(prev => prev.map(x => x.id === id ? saved : x)))
    .catch(onError('Update person'));

  // Merge two contacts. Server-side merge_people() does the heavy lifting in a
  // single transaction (FK reassignment + master patch + audit row + hard-delete
  // of loser). Locally we have to fix up FOUR React state arrays:
  //   - people: replace master, drop loser
  //   - attendance / notes / packages: re-point personId from loser to master
  // org_contacts is server-only state (we don't keep a top-level array of them
  // in React; the OrgDetail re-fetches when needed).
  const mergePeople = async (masterId, loserId, masterPatch) => {
    try {
      const savedMaster = await data.people.merge(masterId, loserId, masterPatch);
      setPeople(prev => prev
        .filter(p => p.id !== loserId)
        .map(p => p.id === masterId ? savedMaster : p));
      setAttendance(prev => prev.map(a => a.personId === loserId ? { ...a, personId: masterId } : a));
      setNotes(prev => prev.map(n => n.personId === loserId ? { ...n, personId: masterId } : n));
      setPackages(prev => prev.map(pk => pk.personId === loserId ? { ...pk, personId: masterId } : pk));
    } catch (e) {
      onError('Merge contacts')(e);
      throw e;  // let the form keep busy-state clean
    }
  };

  // ── Households (people<->people groupings)
  // Server-confirmed updates on the create/add paths (we need the real UUID);
  // optimistic-local on relationship change and removal (cheap, reconciled by
  // the next loadAll). All four mutate the households/householdMembers arrays.

  // Create a new household AND add the founding member in one user action.
  // Returns the new household so callers can chain (e.g. close the modal).
  const createHousehold = async (name, founderPersonId, founderRelationship) => {
    try {
      const h = await data.households.create({ name });
      setHouseholds(prev => [...prev, h]);
      const m = await data.householdMembers.create({
        householdId: h.id, personId: founderPersonId, relationship: founderRelationship || 'other',
      });
      setHouseholdMembers(prev => [...prev, m]);
      return h;
    } catch (e) { onError('Create household')(e); throw e; }
  };
  const renameHousehold = async (id, name) => {
    try {
      const saved = await data.households.update(id, { name });
      setHouseholds(prev => prev.map(h => h.id === id ? saved : h));
    } catch (e) { onError('Rename household')(e); }
  };
  // Hard delete. Cascade clears member rows server-side; mirror that locally.
  const deleteHousehold = async (id) => {
    try {
      await data.households.delete(id);
      setHouseholds(prev => prev.filter(h => h.id !== id));
      setHouseholdMembers(prev => prev.filter(m => m.householdId !== id));
    } catch (e) { onError('Delete household')(e); }
  };
  const addHouseholdMember = async (householdId, personId, relationship) => {
    try {
      const m = await data.householdMembers.create({ householdId, personId, relationship: relationship || 'other' });
      setHouseholdMembers(prev => [...prev, m]);
      return m;
    } catch (e) { onError('Add household member')(e); throw e; }
  };
  const updateMemberRelationship = (id, relationship) => {
    // Optimistic-local + fire-and-forget (matches attendance/note toggles).
    setHouseholdMembers(prev => prev.map(m => m.id === id ? { ...m, relationship } : m));
    data.householdMembers.updateRelationship(id, relationship).catch(onError('Update relationship'));
  };
  const removeHouseholdMember = (id) => {
    setHouseholdMembers(prev => prev.filter(m => m.id !== id));
    data.householdMembers.delete(id).catch(onError('Remove from household'));
  };
  // Chained "+ Add new contact" from the household modal: create the person,
  // then immediately add them to the household with the chosen relationship —
  // mirrors the add-person-to-register chain. Updates both people and
  // householdMembers state. Returns nothing; the modal closes its sub-form on
  // success and the new member appears in the roster.
  const createPersonForHousehold = async (householdId, personData, relationship) => {
    try {
      const savedPerson = await data.people.create(personData);
      setPeople(prev => [...prev, savedPerson]);
      const m = await data.householdMembers.create({
        householdId, personId: savedPerson.id, relationship: relationship || 'other',
      });
      setHouseholdMembers(prev => [...prev, m]);
    } catch (e) { onError('Add new contact to household')(e); }
  };

  // ── Contact dates (anniversaries / dated events on a person OR an org)
  // create returns a real row (needs the server-minted id for later edits), so
  // it's server-confirmed. update/delete are optimistic-local + fire-and-forget.
  // The caller passes exactly one of personId/orgId on the payload.
  const addContactDate = async (d) => {
    try {
      const saved = await data.contactDates.create(d);
      setContactDates(prev => [...prev, saved]);
      return saved;
    } catch (e) { onError('Add date')(e); }
  };
  const updateContactDate = (id, d) => {
    setContactDates(prev => prev.map(x => x.id === id ? { ...x, ...d } : x));
    data.contactDates.update(id, d)
      .then(saved => setContactDates(prev => prev.map(x => x.id === id ? saved : x)))
      .catch(onError('Update date'));
  };
  const removeContactDate = (id) => {
    setContactDates(prev => prev.filter(x => x.id !== id));
    data.contactDates.delete(id).catch(onError('Remove date'));
  };

  // ── People emails (junction CRUD)
  // Each call fires immediately and patches the local people array so the UI
  // (PersonDetail info card, AddPersonForm) reflects the new state without
  // a full re-fetch. The form components return the saved row so they can
  // update their own local state too.
  const addPersonEmail = async (personId, payload) => {
    try {
      const saved = await data.peopleEmails.add(personId, payload);
      setPeople(prev => prev.map(p => {
        if (p.id !== personId) return p;
        // If we just added a primary, demote previous primary in local state
        const nextList = saved.isPrimary
          ? p.emails.map(e => ({...e, isPrimary:false}))
          : p.emails.slice();
        const emails = [...nextList, saved];
        const primary = emails.find(e => e.isPrimary) || emails[0];
        return { ...p, emails, email: primary?.email || '' };
      }));
      return saved;
    } catch (e) { onError('Add email')(e); }
  };
  const setPersonPrimaryEmail = async (emailId, personId) => {
    try {
      await data.peopleEmails.setPrimary(emailId, personId);
      setPeople(prev => prev.map(p => {
        if (p.id !== personId) return p;
        const emails = p.emails.map(e => ({...e, isPrimary: e.id===emailId}));
        const primary = emails.find(e => e.isPrimary);
        return { ...p, emails, email: primary?.email || p.email };
      }));
    } catch (e) { onError('Set primary email')(e); }
  };
  const deletePersonEmail = async (emailId, personId) => {
    try {
      await data.peopleEmails.delete(emailId, personId);
      setPeople(prev => prev.map(p => {
        if (p.id !== personId) return p;
        const target = p.emails.find(e => e.id === emailId);
        const remaining = p.emails.filter(e => e.id !== emailId);
        // If the deleted email was primary, promote the oldest remaining (mirrors data layer)
        if (target?.isPrimary && remaining.length) {
          remaining[0] = { ...remaining[0], isPrimary: true };
        }
        const primary = remaining.find(e => e.isPrimary) || remaining[0];
        return { ...p, emails: remaining, email: primary?.email || '' };
      }));
    } catch (e) { onError('Delete email')(e); }
  };

  // ── Notes (interactions)
  const addNote = (n) => data.notes.create(n)
    .then(saved => setNotes(p => [...p, saved]))
    .catch(onError('Add note'));
  // Adhoc outbound email. data.email.send goes via form-worker /send-email
  // which writes the outbound interaction row server-side and returns it
  // mapped to JSX shape, so we splice into local notes state immediately
  // rather than waiting on the 60s poll. Throws propagate up to the
  // SendEmailModal so it can render the error inline (without alert + close).
  const sendEmail = async ({ personId, subject, body, threadId, inReplyTo }) => {
    const res = await data.email.send({ personId, subject, body, threadId, inReplyTo });
    if (res.note) setNotes(p => [...p, res.note]);
    return res;
  };
  const toggleNoteImportant = (id) => {
    // Optimistic: flip locally, then sync. Find current value for the patch.
    const cur = notes.find(n => n.id === id);
    if (!cur) return;
    setNotes(p => p.map(n => n.id === id ? { ...n, important: !n.important } : n));
    data.notes.patch(id, { important: !cur.important }).catch(onError('Toggle important'));
  };
  // "Done" means completed (kept in history). Reopen path lets the user un-complete.
  const clearNoteAction = (id) => {
    const completedAt = today();
    setNotes(p => p.map(n => n.id === id ? { ...n, completed: true, completedAt } : n));
    data.notes.patch(id, { completed: true, completedAt }).catch(onError('Complete note'));
  };
  const reopenNote = (id) => {
    setNotes(p => p.map(n => n.id === id ? { ...n, completed: false, completedAt: null } : n));
    data.notes.patch(id, { completed: false, completedAt: null }).catch(onError('Reopen note'));
  };
  const deleteNote = (id) => {
    setNotes(p => p.filter(n => n.id !== id));  // optimistic
    data.notes.delete(id).catch(onError('Delete note'));
  };
  const updateNoteAction = (id, newDate) => {
    setNotes(p => p.map(n => n.id === id ? { ...n, actionDate: newDate || null } : n));
    data.notes.patch(id, { actionDate: newDate || null }).catch(onError('Update action date'));
  };
  // Text-only edit (inline todo editing in ProjectDetail). Optimistic-local +
  // fire-and-forget, matching updateNoteAction. No-op on empty.
  const updateNoteText = (id, newText) => {
    const text = (newText || '').trim();
    if (!text) return;
    setNotes(p => p.map(n => n.id === id ? { ...n, text } : n));
    data.notes.patch(id, { text }).catch(onError('Update note text'));
  };
  // Mark a thread (or a single unthreaded email) as read. Called by ThreadsView
  // when a thread is opened. Optimistic-local + fire-and-forget, matching the
  // other note handlers. For a real thread we stamp every unread row sharing
  // the threadId; for a solo email (no threadId) we stamp just that row by id.
  const markThreadRead = (threadId, soloId) => {
    const stamp = new Date().toISOString();
    if (threadId) {
      setNotes(p => p.map(n => (n.threadId === threadId && !n.readAt) ? { ...n, readAt: stamp } : n));
      data.notes.markThreadRead(threadId).catch(onError('Mark thread read'));
    } else if (soloId) {
      setNotes(p => p.map(n => n.id === soloId ? { ...n, readAt: stamp } : n));
      data.notes.markRead(soloId).catch(onError('Mark read'));
    }
  };
  // Web Activity read-state. Mirrors markThreadRead: optimistic-local +
  // fire-and-forget. markWebEventRead stamps one row (row clicked); the bulk
  // form stamps every currently-unread web event ("Mark all read").
  const markWebEventRead = (id) => {
    const stamp = new Date().toISOString();
    setNotes(p => p.map(n => n.id === id && !n.readAt ? { ...n, readAt: stamp } : n));
    data.notes.markRead(id).catch(onError('Mark read'));
  };
  const markAllWebEventsRead = () => {
    const stamp = new Date().toISOString();
    const ids = notes.filter(n => isWebEvent(n) && !n.readAt).map(n => n.id);
    if (ids.length === 0) return;
    setNotes(p => p.map(n => ids.includes(n.id) ? { ...n, readAt: stamp } : n));
    data.notes.markManyRead(ids).catch(onError('Mark all read'));
  };

  // Full-form edit from EditNoteForm. The form returns a UI-shape note;
  // notes.patch now consumes the same shape (via notePatchToDb in mappers),
  // so we pass the touched fields straight through. Pattern matches the
  // other note handlers: optimistic-local + fire-and-forget.
  // Excluded from the patch: id, date, completed, completedAt (managed by
  // create/complete/reopen paths, not edit), personId, classId (immutable).
  const updateNote = (id, edited) => {
    const patch = {
      text: edited.text,
      important: edited.important,
      actionDate: edited.actionDate || null,
      kind: edited.kind || 'note',
      direction: edited.direction || null,
      subject: edited.subject || '',  // notePatchToDb normalises '' → null
      durationMins: edited.durationMins ?? null,
    };
    setNotes(p => p.map(n => n.id === id ? { ...n, ...patch } : n));
    data.notes.patch(id, patch).catch(onError('Update note'));
  };

  // ─── Projects ──────────────────────────────────────────────────────────
  // Server-confirmed create/update (return the saved row, splice into state).
  // setProjectStatus is the list-view toggle; data.projects.setStatus stamps
  // completed_at server-side. All three follow the orgs/people handler shape.
  const addProject = (p) => data.projects.create({ isPersonal: mode === 'personal', ...p })
    .then(saved => { setProjects(prev => [saved, ...prev]); return saved; })
    .catch(onError('Add project'));
  const updateProject = (id, p) => {
    const prev = projects.find(x => x.id === id);
    return data.projects.update(id, p, prev?.status || null)
      .then(saved => { setProjects(prevList => prevList.map(x => x.id === id ? saved : x)); return saved; })
      .catch(onError('Update project'));
  };
  const setProjectStatus = (id, status) => {
    // Optimistic flip; reconcile from the server-confirmed row.
    setProjects(prev => prev.map(x => x.id === id
      ? { ...x, status, completedAt: status === 'done' ? today() : null } : x));
    data.projects.setStatus(id, status)
      .then(saved => setProjects(prev => prev.map(x => x.id === id ? saved : x)))
      .catch(onError('Update project status'));
  };

  // Inbox → assign an unlinked interaction to a real person. Two-step server
  // operation (patch row, optionally insert new email) is wrapped by
  // data.notes.assignToPerson. We update local state from the returned
  // canonical shapes so the UI stays in sync with the DB. Server-confirmed,
  // not optimistic — assignment is rare enough that the slight latency is
  // fine, and rolling back two coupled writes if one fails is messy.
  const assignNoteToPerson = async (noteId, personId, addEmailIfNew) => {
    try {
      const myAddresses = settings.my_addresses || [];
      const { note, addedEmail } = await data.notes.assignToPerson(
        noteId, personId, { addEmailIfNew, myAddresses });
      // Reconcile the note (now has personId set).
      setNotes(p => p.map(n => n.id === noteId ? note : n));
      // If an email was added, splice it into the target person's emails array.
      if (addedEmail) {
        setPeople(p => p.map(person =>
          person.id === personId
            ? { ...person, emails: [...(person.emails || []), addedEmail] }
            : person));
      }
    } catch (err) {
      onError('Assign to contact')(err);
    }
  };
  
  // ── Classes (sessions). Field updates from the class detail page (reflection, formsWorked, etc.)
  const updateClassFields = (classId, fields) => {
    setClasses(p => p.map(c => c.id === classId ? { ...c, ...fields } : c));
    data.classes.patch(classId, fields).catch(onError('Update class'));
  };
  
  // ── Forms (yoga_forms)
  const addForm = (name) => data.forms.create({ name, position: forms.length })
    .then(saved => setForms(p => [...p, saved]))
    .catch(onError('Add form'));
  const updateForm = (id, name) => {
    setForms(p => p.map(f => f.id === id ? { ...f, name } : f));
    data.forms.update(id, { name, position: forms.find(f => f.id === id)?.position ?? 0 })
      .catch(onError('Update form'));
  };
  const removeForm = (id) => {
    setForms(p => p.filter(f => f.id !== id));
    data.forms.delete(id).catch(onError('Remove form'));
  };
  const moveForm = (id, dir) => {
    const i = forms.findIndex(f => f.id === id); if (i < 0) return;
    const j = i + dir; if (j < 0 || j >= forms.length) return;
    const next = [...forms]; [next[i], next[j]] = [next[j], next[i]];
    setForms(next);
    data.forms.reorder(next).catch(onError('Reorder forms'));
  };

  // ── Attendance
  const toggleAtt = (classId, personId) => {
    const ex = attendance.find(a => a.classId === classId && a.personId === personId);
    if (ex) {
      const next = { ...ex, attended: !ex.attended };
      setAttendance(prev => prev.map(a => a.id === ex.id ? next : a));
      data.attendance.update(ex.id, next).catch(onError('Toggle attendance'));
    } else {
      // No row exists yet — create one. Wait for the server-assigned UUID.
      data.attendance.create({ classId, personId, attended: true })
        .then(saved => setAttendance(prev => [...prev, saved]))
        .catch(onError('Add attendance'));
    }
  };
  const setAttendancePayment = (attId, patch) => {
    // Local merge (mirrors the original behaviour that drops cleared fields)
    setAttendance(prev => prev.map(a => {
      if (a.id !== attId) return a;
      const next = { ...a, ...patch };
      if (patch.paymentStatus === 'paid') { delete next.packageId; }
      else if (patch.paymentStatus === 'package') { delete next.paidAmount; }
      else if (patch.paymentStatus === 'unpaid') { delete next.packageId; delete next.paidAmount; }
      return next;
    }));
    data.attendance.setPayment(attId, patch).catch(onError('Set payment'));
  };
  // Remove a person from a class register. Hard delete on the attendance row;
  // the class itself is untouched. Optimistic + fire-and-forget, matches toggleAtt.
  const removeFromRegister = (attId) => {
    setAttendance(prev => prev.filter(a => a.id !== attId));
    data.attendance.delete(attId).catch(onError('Remove from register'));
  };

  // ── Classes + series
  const handleAddClass = async (f) => {
    const paymentModel = f.paymentModel || (f.orgId ? 'org' : 'per_person');
    const duration = parseInt(f.duration) || 60;
    try {
      if (f.recurrence && f.recurrence !== 'one_off') {
        // Series: create the series row first, then bulk-insert the instances.
        // Booking fields are stored ON the series row so generateSeriesClasses
        // reads them straight off seriesRow — and so future "top up" runs
        // inherit them without re-entry.
        const seriesRow = await data.series.create({
          name: f.name, recurrence: f.recurrence, location: f.location,
          orgId: f.orgId || null, startDate: f.date, time: f.time || '',
          duration, rate: parseFloat(f.rate) || 0, paymentModel,
          isBookable: f.isBookable ?? false, capacity: f.capacity, publicBlurb: f.publicBlurb || '',
          joinUrl: f.joinUrl || '', bookingInfo: f.bookingInfo || '',
        });
        setSeries(p => [...p, seriesRow]);
        const instances = generateSeriesClasses(seriesRow, parseInt(f.repeatCount) || 12);
        const created = await data.classes.createMany(instances);
        setClasses(p => [...p, ...created]);
      } else {
        const created = await data.classes.create({
          name: f.name, date: f.date, time: f.time || '', duration,
          location: f.location, orgId: f.orgId || null, seriesId: null,
          rate: parseFloat(f.rate) || 0, paymentModel,
          isBookable: f.isBookable ?? false, capacity: f.capacity, publicBlurb: f.publicBlurb || '',
          joinUrl: f.joinUrl || '', bookingInfo: f.bookingInfo || '',
        });
        setClasses(p => [...p, created]);
      }
    } catch (e) {
      onError('Add class')(e);
    }
  };

  const handleEditClass = async (cls, updated, scope) => {
    const duration = parseInt(updated.duration) || 60;
    try {
      if (scope === 'this') {
        const saved = await data.classes.update(cls.id, { ...cls, ...updated, duration, seriesId: cls.seriesId });
        setClasses(p => p.map(c => c.id === cls.id ? saved : c));
      } else {
        // "this and future" — patch every session in this series from this date forward.
        const patch = {
          name: updated.name, time: updated.time || '', duration,
          location: updated.location, orgId: updated.orgId || null,
          rate: parseFloat(updated.rate) || cls.rate,
          paymentModel: updated.paymentModel || cls.paymentModel,
          date: cls.date, seriesId: cls.seriesId,  // bulk update doesn't change date/series
          isBookable: updated.isBookable ?? false,
          capacity: updated.capacity,
          publicBlurb: updated.publicBlurb || '',
          joinUrl: updated.joinUrl || '',
          bookingInfo: updated.bookingInfo || '',
        };
        const updatedRows = await data.classes.updateFutureInSeries(cls.seriesId, cls.date, patch);
        // Merge the patched fields back into local state for affected rows
        const updatedById = Object.fromEntries(updatedRows.map(r => [r.id, r]));
        setClasses(p => p.map(c => updatedById[c.id] || c));
        // Also update the series itself
        const seriesPatch = {
          name: updated.name, time: updated.time || '', duration,
          location: updated.location, orgId: updated.orgId || null,
          rate: parseFloat(updated.rate) || 0,
          paymentModel: updated.paymentModel || 'per_person',
          recurrence: series.find(s => s.id === cls.seriesId)?.recurrence || 'weekly',
          startDate: series.find(s => s.id === cls.seriesId)?.startDate || cls.date,
          rateType: series.find(s => s.id === cls.seriesId)?.rateType || 'per_class',
          isBookable: updated.isBookable ?? false,
          capacity: updated.capacity,
          publicBlurb: updated.publicBlurb || '',
          joinUrl: updated.joinUrl || '',
          bookingInfo: updated.bookingInfo || '',
        };
        const savedSeries = await data.series.update(cls.seriesId, seriesPatch);
        setSeries(p => p.map(s => s.id === cls.seriesId ? savedSeries : s));
      }
    } catch (e) {
      onError('Edit class')(e);
    }
  };

  // Delete a class. Normal classes require an empty register (so we don't lose
  // attendance history for multiple people). Private sessions can be deleted
  // even with a register entry — the attendance row gets cascade-deleted.
  // Notes pointing at the class get their classId nulled by the DB
  // (FK ON DELETE SET NULL on interactions).
  const handleDeleteClass = (classId) => {
    const cls = classes.find(c => c.id === classId);
    if (!cls) return false;
    const attRows = attendance.filter(a => a.classId === classId);
    const hasRegister = attRows.length > 0;
    const isPrivate = cls.paymentModel === 'private';
    if (hasRegister && !isPrivate) return false;

    // Optimistic local removal so the UI updates instantly
    setAttendance(p => p.filter(a => a.classId !== classId));
    setClasses(p => p.filter(c => c.id !== classId));
    setNotes(p => p.map(n => n.classId === classId ? { ...n, classId: null } : n));

    // Cascade-delete attendance rows first (in case the FK lacks ON DELETE CASCADE),
    // then delete the session itself. Fire-and-forget — the next loadAll() reconciles
    // any partial failures.
    (async () => {
      try {
        if (hasRegister) {
          await Promise.all(attRows.map(a => data.attendance.delete(a.id)));
        }
        await data.classes.delete(classId);
      } catch (e) {
        onError('Delete class')(e);
      }
    })();
    return true;
  };

  // ── Packages
  const addPackage = (pk) => data.packages.create(pk)
    .then(saved => setPackages(p => [...p, saved]))
    .catch(onError('Add package'));
  const updatePackage = (id, pk) => data.packages.update(id, pk)
    .then(saved => setPackages(p => p.map(x => x.id === id ? saved : x)))
    .catch(onError('Update package'));
  // Hard-delete. EditPackageForm gates the button on totalUsed===0, so by
  // the time we get here the row has no manual offset and no linked attendance.
  const deletePackage = (id) => {
    setPackages(p => p.filter(x => x.id !== id));
    data.packages.hardDelete(id).catch(onError('Delete package'));
  };
  const adjustSessionsUsed = (id, delta) => {
    const pk = packages.find(x => x.id === id);
    if (!pk) return;
    const next = Math.max(0, Math.min(pk.totalSessions, pk.sessionsUsed + delta));
    setPackages(p => p.map(x => x.id === id ? { ...x, sessionsUsed: next } : x));
    data.packages.setSessionsUsed(id, next).catch(onError('Update package'));
  };

  // ── Package templates
  const addTemplate = (t) => data.packageTemplates.create(t)
    .then(saved => setPackageTemplates(p => [...p, saved]))
    .catch(onError('Add template'));
  const updateTemplate = (id, t) => data.packageTemplates.update(id, t)
    .then(saved => setPackageTemplates(p => p.map(x => x.id === id ? saved : x)))
    .catch(onError('Update template'));
  const setTemplateActive = (id, active) => {
    setPackageTemplates(p => p.map(x => x.id === id ? { ...x, active } : x));
    data.packageTemplates.setActive(id, active).catch(onError('Update template'));
  };
  const deleteTemplate = (id) => {
    setPackageTemplates(p => p.filter(x => x.id !== id));
    data.packageTemplates.hardDelete(id).catch(onError('Delete template'));
  };

  // ── Invoices
  const addInvoice = (inv) => data.invoices.create(inv)
    .then(saved => setInvoices(p => [...p, saved]))
    .catch(onError('Create invoice'));
  const updateInvoice = (id, inv) => data.invoices.update(id, inv)
    .then(saved => setInvoices(p => p.map(x => x.id === id ? saved : x)))
    .catch(onError('Update invoice'));
  const setInvoiceStatus = (id, status) => {
    setInvoices(p => p.map(x => x.id === id ? { ...x, status } : x));
    data.invoices.setStatus(id, status).catch(onError('Set invoice status'));
  };

  // ── Custom types
  const addOrgType = (t) => data.customOrgTypes.create(t)
    .then(saved => setCustomOrgTypes(prev => [...prev, saved]))
    .catch(onError('Add org type'));
  const addPersonRole = (t) => data.customPersonRoles.create(t)
    .then(saved => setCustomPersonRoles(prev => [...prev, saved]))
    .catch(onError('Add person role'));

  // Remove a custom org/person type, but only if nothing currently uses it.
  const handleRemoveOrgType = (key) => {
    const inUse = orgs.some(o => o.type === key);
    if (inUse) return false;
    setCustomOrgTypes(prev => prev.filter(t => t.key !== key));
    data.customOrgTypes.delete(key).catch(onError('Remove org type'));
    return true;
  };
  const handleRemovePersonRole = (key) => {
    const inUse = people.some(p => (p.roles || []).includes(key));
    if (inUse) return false;
    setCustomPersonRoles(prev => prev.filter(t => t.key !== key));
    data.customPersonRoles.delete(key).catch(onError('Remove person role'));
    return true;
  };

  // Sign-out helper passed to the sidebar
  const signOut = () => supabase.auth.signOut();

  // Render the loading / error overlays before the main UI
  if (loadStatus === 'loading') {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
        background:C.bg,color:C.muted,fontFamily:"'Jost',sans-serif",fontSize:13}}>
        Loading your data…
      </div>
    );
  }
  if (loadStatus === 'error') {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
        background:C.bg,padding:20,fontFamily:"'Jost',sans-serif"}}>
        <div style={{maxWidth:480,background:C.card,border:`1px solid ${C.red}66`,borderRadius:8,padding:24}}>
          <div style={{color:C.red,fontSize:14,fontWeight:600,marginBottom:10}}>Couldn't load data</div>
          <div style={{color:C.muted,fontSize:12,lineHeight:1.6,marginBottom:14}}>{loadError}</div>
          <button onClick={()=>window.location.reload()}
            style={{background:C.gold,color:C.bg,border:'none',borderRadius:4,padding:'8px 16px',
              fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'Jost',sans-serif"}}>
            Reload
          </button>
        </div>
      </div>
    );
  }

  const renderModal = () => {
    if(!modal) return null;
    switch(modal.type){
      case 'add_org': return <AddOrgForm defaultType={modal.orgType==='all'?undefined:modal.orgType} onSave={addOrg} onClose={close} />;
      case 'edit_org': return <AddOrgForm existing={modal.org} onSave={o=>updateOrg(modal.org.id, o)} onClose={close} />;
      case 'add_person': return <AddPersonForm orgs={orgs} defaultType={modal.personType} defaultOrgId={modal.orgId} onSave={addPerson} onClose={close} onAddPersonRole={addPersonRole} customPersonRoles={customPersonRoles} />;
      case 'edit_person': return <AddPersonForm existing={modal.person} orgs={orgs}
        onSave={p=>updatePerson(modal.person.id, p)}
        onEmailAdd={addPersonEmail}
        onEmailDelete={deletePersonEmail}
        onEmailSetPrimary={setPersonPrimaryEmail}
        onAddPersonRole={addPersonRole}
        customPersonRoles={customPersonRoles}
        onClose={close} />;
      case 'merge_people': return <MergePeopleForm personA={modal.personA} personB={modal.personB} orgs={orgs} onMerge={mergePeople} onClose={close} />;
      case 'edit_note': return <EditNoteForm note={modal.note} onSave={n=>updateNote(modal.note.id, n)} onClose={close} />;
      case 'add_org_type': return <AddTypeForm kind="org"
        existingKeys={[...Object.keys(ORG_META), ...customOrgTypes.map(t=>t.key)]}
        onSave={addOrgType}
        onClose={close} />;
      case 'add_person_role': return <AddTypeForm kind="person"
        existingKeys={[...Object.keys(PERSON_ROLES), ...customPersonRoles.map(t=>t.key)]}
        onSave={addPersonRole}
        onClose={close} />;
      case 'add_class': return <AddClassForm orgs={orgs} defaultOrgId={modal.orgId} defaultDate={modal.date} onSave={handleAddClass} onClose={close} />;
      case 'edit_class': {
        const cls=modal.cls;
        if(cls.seriesId) return <EditSeriesClassForm cls={cls} orgs={orgs} onSaveThis={u=>handleEditClass(cls,u,'this')} onSaveFuture={u=>handleEditClass(cls,u,'future')} onClose={close} />;
        return <AddClassForm existing={cls} orgs={orgs} onSave={u=>handleEditClass(cls, u, 'this')} onClose={close} />;
      }
      case 'add_to_register': {
        const cls=classes.find(c=>c.id===modal.classId);
        return <AddToRegisterForm people={people} classId={modal.classId} existing={attendance.filter(a=>a.classId===modal.classId).map(a=>a.personId)} attendance={attendance} classes={classes} cls={cls}
          onSave={(cid,pid)=>data.attendance.create({classId:cid,personId:pid,attended:false})
            .then(saved=>setAttendance(p=>[...p,saved])).catch(onError('Add to register'))}
          onAddNew={()=>setModal({type:'add_person_to_register', classId: modal.classId})}
          onClose={close} />;
      }
      case 'add_person_to_register': {
        // Chained flow from AddToRegisterForm: create the person, then immediately
        // create an attendance row for them on this class. Modal closes synchronously
        // when AddPersonForm calls onClose(); the async work continues in the background
        // and updates state when it resolves.
        return <AddPersonForm orgs={orgs}
          onAddPersonRole={addPersonRole}
          customPersonRoles={customPersonRoles}
          onSave={async (p) => {
            try {
              const savedPerson = await data.people.create(p);
              setPeople(prev => [...prev, savedPerson]);
              const savedAtt = await data.attendance.create({
                classId: modal.classId, personId: savedPerson.id, attended: false,
              });
              setAttendance(prev => [...prev, savedAtt]);
            } catch (e) { onError('Add new contact to register')(e); }
          }}
          onClose={close} />;
      }
      case 'add_package': return <AddPackageForm personId={modal.personId} onSave={addPackage} onClose={close} templates={packageTemplates} />;
      case 'edit_package': {
        const pk = packages.find(x => x.id === modal.packageId);
        if(!pk) return null;
        const linkedCount = attendance.filter(a => a.packageId === pk.id).length;
        return <EditPackageForm
          pkg={pk}
          linkedCount={linkedCount}
          onSave={u => updatePackage(pk.id, u)}
          onDelete={() => deletePackage(pk.id)}
          onClose={close} />;
      }
      case 'add_template': return <PackageTemplateForm onSave={addTemplate} onClose={close} />;
      case 'edit_template': {
        const t = packageTemplates.find(x => x.id === modal.templateId);
        if(!t) return null;
        return <PackageTemplateForm existing={t} onSave={u => updateTemplate(t.id, u)} onClose={close} />;
      }
      case 'book': {
        const person = people.find(p => p.id === modal.personId);
        if(!person) return null;
        return <BookForPersonForm
          person={person}
          classes={classes}
          orgs={orgs}
          attendance={attendance}
          onAddToRegister={async (classId)=>{
            try {
              const saved = await data.attendance.create({classId, personId: person.id, attended: false});
              setAttendance(p => [...p, saved]);
              close();
              nav('class_detail', { classId });
            } catch (e) { onError('Add to register')(e); }
          }}
          onCreatePrivate={()=>{
            setModal({ type:'book_create_private', personId: person.id });
          }}
          onClose={close} />;
      }
      case 'book_create_private': {
        const person = people.find(p => p.id === modal.personId);
        if(!person) return null;
        return <AddClassForm
          orgs={orgs}
          packages={packages}
          allAttendance={attendance}
          bookingFor={{ personId: person.id, name: person.name, defaultSessionRate: person.defaultSessionRate }}
          defaultPaymentModel="private"
          onSave={async (f) => {
            try {
              const created = await data.classes.create({
                name: f.name, date: f.date, time: f.time||'',
                duration: parseInt(f.duration)||60, location: f.location,
                orgId: f.orgId || null, seriesId: null,
                rate: parseFloat(f.rate) || 0,
                paymentModel: f.paymentModel || 'private',
              });
              setClasses(p => [...p, created]);
              // paymentChoice (if present) carries { paymentStatus, paidAmount?, packageId? }
              // from the inline private-session payment picker in AddClassForm.
              const att = await data.attendance.create({
                classId: created.id, personId: person.id, attended: false,
                ...(f.paymentChoice || {}),
              });
              setAttendance(p => [...p, att]);
              close();
              nav('class_detail', { classId: created.id });
            } catch (e) { onError('Book private session')(e); }
          }}
          onClose={close} />;
      }
      case 'create_invoice': return <CreateInvoiceForm orgs={orgs} classes={classes} invoices={invoices} onSave={addInvoice} onClose={close} />;
      case 'edit_invoice': return <CreateInvoiceForm existing={modal.inv} orgs={orgs} classes={classes} invoices={invoices} onSave={inv=>updateInvoice(modal.inv.id, inv)} onClose={close} />;
      default: return null;
    }
  };


  const renderView = () => {
    const { name, orgId, orgType, personType, personId, classId, invoiceId, highlightNoteId } = view;
    switch(name){
      case 'dashboard':
        if (mode === 'personal') return <PersonalDashboard people={people} orgs={orgs}
          households={households} householdMembers={householdMembers} contactDates={contactDates}
          projects={projects} nav={nav} />;
        return <Dashboard orgs={orgs} people={people} classes={classes} attendance={attendance} notes={notes} packages={packages} invoices={invoices} projects={projects} nav={nav}
        onAddClass={(date)=>setModal({type:'add_class', date})}
        onCompleteNote={clearNoteAction}
        onReopenNote={reopenNote}
        onAddTodo={addNote}
        onMarkWebRead={markWebEventRead} />;
      case 'inbox': return <InboxView notes={notes} people={people}
        attendance={attendance} classes={classes}
        onAssign={assignNoteToPerson}
        onDiscard={deleteNote} />;
      case 'comms_log': return <RecentActivityView notes={notes} people={people} classes={classes} orgs={orgs} attendance={attendance} packages={packages} projects={projects} nav={nav} />;
      case 'package_templates': return <PackageTemplatesView templates={packageTemplates} nav={nav}
        onAdd={()=>setModal({type:'add_template'})}
        onEdit={(id)=>setModal({type:'edit_template',templateId:id})}
        onSetActive={setTemplateActive}
        onDelete={deleteTemplate} />;
      case 'web_activity': return <WebActivityView notes={notes} people={people} nav={nav}
        onMarkRead={markWebEventRead} onMarkAllRead={markAllWebEventsRead} />;
      case 'projects': return <ProjectsView projects={projects} notes={notes} nav={nav} mode={mode}
        onAddProject={addProject} onSetStatus={setProjectStatus} />;
      case 'project_detail': {
        const project = projects.find(p => p.id === view.projectId); if(!project) return <Empty text="Not found" />;
        return <ProjectDetail project={project} notes={notes} people={people} nav={nav} backInfo={backInfo}
          onAddTodo={addNote}
          onCompleteNote={clearNoteAction}
          onReopenNote={reopenNote}
          onDeleteNote={deleteNote}
          onUpdateActionDate={updateNoteAction}
          onUpdateNoteText={updateNoteText}
          onSetStatus={setProjectStatus}
          onUpdateProject={updateProject} />;
      }
      case 'threads': return <ThreadsView notes={notes} people={people} nav={nav} onMarkThreadRead={markThreadRead} initialThreadKey={view.threadKey} onSendEmail={sendEmail} />;
      case 'birthdays': return <BirthdaysView people={people} orgs={orgs} nav={nav} />;
      case 'households': return <HouseholdsList households={households} householdMembers={householdMembers} people={people} nav={nav} />;
      case 'org_list': return <OrgList orgs={orgs} people={people} classes={classes} orgType={orgType} nav={nav} onAdd={()=>setModal({type:'add_org',orgType})} />;
      case 'org_detail': {
        const org=orgs.find(o=>o.id===orgId); if(!org) return <Empty text="Not found" />;
        return <OrgDetail org={org} people={people} classes={classes} invoices={invoices} notes={notes} contactDates={contactDates} nav={nav} backInfo={backInfo}
          onEdit={()=>setModal({type:'edit_org',org})}
          onAddPerson={()=>setModal({type:'add_person',orgId,personType:org.type==='care_home'?'resident':'website_student'})}
          onAddClass={()=>setModal({type:'add_class',orgId})}
          onCreateInvoice={()=>setModal({type:'create_invoice',orgId})}
          onEditInvoice={inv=>setModal({type:'edit_invoice',inv})}
          onToggleImportant={toggleNoteImportant}
          onClearAction={clearNoteAction}
          onReopenNote={reopenNote}
          onDeleteNote={deleteNote}
          onUpdateActionDate={updateNoteAction}
          onAddContactDate={addContactDate}
          onUpdateContactDate={updateContactDate}
          onRemoveContactDate={removeContactDate}
          onUpdateInvoiceStatus={setInvoiceStatus} />;
      }
      case 'people': return <PeopleList people={people} orgs={orgs} personType={personType} nav={nav} mode={mode} households={households} householdMembers={householdMembers} recentPersonIds={recentPersonIds} onAdd={()=>setModal({type:'add_person',personType: personType==='all'?'private_client':personType, ...(mode==='personal'?{orgId: orgs.find(o=>o.type==='personal')?.id}:{})})} onMerge={(a,b)=>setModal({type:'merge_people',personA:a,personB:b})} />;
      case 'person_detail': {
        const person=people.find(p=>p.id===personId); if(!person) return <Empty text="Not found" />;
        const org=orgs.find(o=>o.id===person.orgId);
        const pn=notes.filter(n=>n.personId===person.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
        const pc=attendance.filter(a=>a.personId===person.id).map(a=>classes.find(c=>c.id===a.classId)).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
        return <PersonDetail person={person} org={org} pNotes={pn} pClasses={pc} attendance={attendance} packages={packages} classes={classes} notes={notes} orgs={orgs} nav={nav} backInfo={backInfo} highlightNoteId={highlightNoteId}
          people={people} households={households} householdMembers={householdMembers} contactDates={contactDates}
          onCreateHousehold={createHousehold}
          onRenameHousehold={renameHousehold}
          onDeleteHousehold={deleteHousehold}
          onAddHouseholdMember={addHouseholdMember}
          onCreatePersonForHousehold={createPersonForHousehold}
          onUpdateMemberRelationship={updateMemberRelationship}
          onRemoveHouseholdMember={removeHouseholdMember}
          onAddContactDate={addContactDate}
          onUpdateContactDate={updateContactDate}
          onRemoveContactDate={removeContactDate}
          onAddNote={addNote}
          onSendEmail={sendEmail}
          onToggleImportant={toggleNoteImportant}
          onClearAction={clearNoteAction}
          onReopenNote={reopenNote}
          onDeleteNote={deleteNote}
          onUpdateActionDate={updateNoteAction}
          onEditNote={(note)=>setModal({type:'edit_note', note})}
          onEdit={()=>setModal({type:'edit_person',person})}
          onAddPackage={()=>setModal({type:'add_package',personId})}
          onEditPackage={(packageId)=>setModal({type:'edit_package',packageId})}
          onBook={()=>setModal({type:'book',personId})}
          onUseSession={id=>adjustSessionsUsed(id, +1)}
          onReturnSession={id=>adjustSessionsUsed(id, -1)} />;
      }
      case 'classes': return <ClassList classes={classes} orgs={orgs} series={series} attendance={attendance} nav={nav} onAdd={()=>setModal({type:'add_class'})} />;
      case 'week_view': return <WeekView classes={classes} orgs={orgs} notes={notes} people={people} nav={nav} backInfo={backInfo}
        onAddClass={(date)=>setModal({type:'add_class', date})}
        onUpdateActionDate={updateNoteAction}
        onClearAction={clearNoteAction}
        onToggleImportant={toggleNoteImportant} />;
      case 'month_view': return <MonthView classes={classes} orgs={orgs} nav={nav} backInfo={backInfo}
        onAddClass={(date)=>setModal({type:'add_class', date})} />;
      case 'forms_list': return <FormsList forms={forms} classes={classes} onAdd={addForm} onUpdate={updateForm} onRemove={removeForm} onMove={moveForm} />;
      case 'class_detail': {
        const cls=classes.find(c=>c.id===classId); if(!cls) return <Empty text="Not found" />;
        const org=orgs.find(o=>o.id===cls.orgId);
        return <ClassDetail cls={cls} org={org} people={people} attendance={attendance} notes={notes} series={series} forms={forms} packages={packages} nav={nav} backInfo={backInfo}
          onToggle={toggleAtt} onAddNote={addNote}
          onToggleImportant={toggleNoteImportant}
          onClearAction={clearNoteAction}
          onReopenNote={reopenNote}
          onDeleteNote={deleteNote}
          onUpdateActionDate={updateNoteAction}
          onUpdateClass={updateClassFields}
          onSetPayment={setAttendancePayment}
          onRemoveFromRegister={removeFromRegister}
          onAddToRegister={()=>setModal({type:'add_to_register',classId})}
          onDeleteClass={(cid)=>{
            const ok = handleDeleteClass(cid);
            if(ok) goBack();
          }}
          onEdit={()=>setModal({type:'edit_class',cls})} />;
      }
      case 'invoices': return <InvoiceList invoices={invoices} orgs={orgs} nav={nav} onAdd={()=>setModal({type:'create_invoice'})} />;
      case 'invoice_detail': {
        const inv=invoices.find(i=>i.id===invoiceId); if(!inv) return <Empty text="Not found" />;
        const org=orgs.find(o=>o.id===inv.orgId);
        return <InvoiceDetail inv={inv} org={org} nav={nav} backInfo={backInfo}
          onEdit={()=>setModal({type:'edit_invoice',inv})}
          onStatusChange={st=>setInvoiceStatus(inv.id, st)} />;
      }
      default: return null;
    }
  };

  // showExpandToggle: only Dashboard currently has accordion sections that the
  // toggle controls. Hold the list of qualifying views in one place so it's
  // easy to add more later.
  const mobileExpandToggleViews = new Set(['dashboard']);
  const showExpandToggle = mobileExpandToggleViews.has(view.name);
  const mobileUIValue = {
    onMobileNavOpen: ()=>setMobileNavOpen(true),
    expandAll: mobileExpandAll,
    setExpandAll: setMobileExpandAll,
    showExpandToggle,
  };

  return (
    <TypesContext.Provider value={typesValue}>
    <MobileUIContext.Provider value={mobileUIValue}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500;600&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2a4a37;border-radius:2px}input,select,textarea{outline:none}input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.5)}@media(max-width:767px){[data-desktop-sidebar]{display:none !important}[data-chip-label]{display:none !important}[data-desktop-only]{display:none !important}}@media(min-width:768px){[data-mobile-only]{display:none !important}}`}</style>
      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:C.bg,fontFamily:"'Jost',sans-serif",color:C.text,position:'relative'}}>
        {/* Desktop sidebar: hidden on mobile via CSS media query */}
        <div data-desktop-sidebar>
          <Sidebar view={view} nav={nav} invoices={invoices} notes={notes} projects={projects}
            customOrgTypes={customOrgTypes}
            customPersonRoles={customPersonRoles}
            orgs={orgs} people={people}
            onAddOrgType={()=>setModal({type:'add_org_type'})}
            onAddPersonRole={()=>setModal({type:'add_person_role'})}
            onRemoveOrgType={handleRemoveOrgType}
            onRemovePersonRole={handleRemovePersonRole}
            onSignOut={signOut} mode={mode} onSwitchMode={switchMode} onAddPersonalOrg={()=>setModal({type:"add_org",orgType:"personal"})} />
        </div>

        {/* Main content area. The hamburger now lives inside MobileHeader (rendered
            by each view via PageHead), so we no longer need a floating button here. */}
        <main style={{flex:1,display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
          {/* Render the current view */}
          <div style={{flex:1,overflowY:'auto',overflowX:'hidden',minHeight:0}}>{renderView()}</div>
        </main>

        {/* Mobile nav modal (lightbox): shows nav in modal on small screens */}
        {mobileNavOpen && (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',zIndex:100,display:'flex',alignItems:'flex-start'}}>
            {/* Sidebar component in the modal */}
            <div style={{width:'min(80vw, 280px)',height:'100%',overflowY:'auto',background:C.sbg,boxShadow:'-2px 0 12px rgba(0,0,0,0.5)'}}>
              <Sidebar view={view} nav={nav} invoices={invoices} notes={notes} projects={projects}
                customOrgTypes={customOrgTypes}
                customPersonRoles={customPersonRoles}
                orgs={orgs} people={people}
                onAddOrgType={()=>{ setMobileNavOpen(false); setModal({type:'add_org_type'}); }}
                onAddPersonRole={()=>{ setMobileNavOpen(false); setModal({type:'add_person_role'}); }}
                onRemoveOrgType={handleRemoveOrgType}
                onRemovePersonRole={handleRemovePersonRole}
                onSignOut={signOut} mode={mode} onSwitchMode={switchMode} onAddPersonalOrg={()=>setModal({type:"add_org",orgType:"personal"})} />
            </div>
            {/* Backdrop click closes the modal */}
            <div onClick={()=>setMobileNavOpen(false)} style={{flex:1,height:'100%'}} />
          </div>
        )}

        {modal&&renderModal()}
      </div>
    </MobileUIContext.Provider>
    </TypesContext.Provider>
  );
}

