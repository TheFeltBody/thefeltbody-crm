import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BANK_DETAILS, ORG_META, PERSON_ROLES } from "./constants.js";

// helpers.jsx — contexts, hooks, pure helpers, invoice rendering
// extracted from FeltBodyCRM.jsx

export const TypesContext = createContext({ orgTypes: ORG_META, personRoles: PERSON_ROLES });
export const useTypes = () => useContext(TypesContext);

// Mobile UI context: lets any header/view access the hamburger toggle without
// prop-drilling. Also exposes a per-view `expandAll` toggle state (Dashboard
// accordion expand/contract) so MobileHeader can render a toggle button next
// to the page title.
export const MobileUIContext = createContext({
  onMobileNavOpen: () => {},
  expandAll: false,
  setExpandAll: () => {},
  showExpandToggle: false,  // only true on views that have accordion sections
});
export const useMobileUI = () => useContext(MobileUIContext);

// Merge built-ins (ALL of them, so badges/avatars keep working) with custom types.
// Custom types are appended in the order they were created.
export const buildOrgTypes = (custom=[]) => {
  const merged = {};
  Object.entries(ORG_META).forEach(([k,v]) => { merged[k] = { ...v, _builtin:true }; });
  custom.forEach(t => { merged[t.key] = { label:t.label, color:t.color, bg:t.bg, icon:t.icon, _builtin:false }; });
  return merged;
};
export const buildPersonRoles = (custom=[], builtinOverrides=[]) => {
  const merged = {};
  Object.entries(PERSON_ROLES).forEach(([k,v]) => { merged[k] = { ...v, parentKey:null, _builtin:true }; });
  // Apply user edits to built-in roles (label/colour/parent) over the seed.
  builtinOverrides.forEach(t => { if (merged[t.key]) merged[t.key] = { label:t.label, color:t.color, bg:t.bg, parentKey:t.parentKey||null, _builtin:true }; });
  custom.forEach(t => { merged[t.key] = { label:t.label, color:t.color, bg:t.bg, parentKey:t.parentKey||null, _builtin:false }; });
  return merged;
};

export const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

// Mobile detection: matches the 767px CSS breakpoint used by data-desktop-sidebar /
// data-hamburger. Components that need to BRANCH STRUCTURALLY (not just style) on
// mobile call this hook. CSS-only adjustments should keep using the existing
// media queries.
export const useIsMobile = () => {
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
export const useLocalStorage = (key, initial) => {
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

export const fmt = d => d ? new Date(d+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
// Relative time for activity-feed rows. Takes a YYYY-MM-DD string and
// resolves to "today", "yesterday", "N days ago", "last week", "N weeks
// ago", falling back to the absolute fmt() for anything older than ~6
// weeks. Used by CommsLogView and the Dashboard RecentActivitySummary.
// Absolute dates remain available via the hover-title on each row.
export const fmtRel = d => {
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
export const fmtTime = t => {
  if(!t || typeof t !== 'string') return null;
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr,10), m = parseInt(mStr,10);
  if(isNaN(h)||isNaN(m)) return null;
  const hh = h===0 ? 12 : h>12 ? h-12 : h;
  const mm = m.toString().padStart(2,'0');
  return `${hh}:${mm}${h<12?'am':'pm'}`;
};

// For pre-filling the time input on new classes — current hour, zeroed minutes.
export const currentHourTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:00`;
};
// Hours-and-minutes -> minutes since midnight. Used to position classes in the week grid.
export const timeToMin = t => {
  if(!t || typeof t !== 'string') return null;
  const [h,m] = t.split(':').map(n=>parseInt(n,10));
  if(isNaN(h)||isNaN(m)) return null;
  return h*60+m;
};
export const fmtMoney = n => typeof n==='number' ? `£${n.toFixed(2).replace(/\.00$/,'')}` : '—';

// Given an ISO date string 'YYYY-MM-DD', return { age, label } where label is a
// human birthday line, e.g. "turns 8 in 12 days" or "today! 🎂". Returns null for
// blank/invalid input so callers can render nothing. Computed at read time — no
// stored age to drift. Uses local date parts to avoid timezone-shift off-by-one.
export const birthdayInfo = (iso) => {
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
export const contactDateInfo = (iso, recurring) => {
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
export const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
// First letter of each word in a label — used by the mobile RoleBadge so the
// compact badges fit on narrow rows. "Private Client" → "PC", "TT Prospect" →
// "TP" (digits/letters from each word's first character), "Student" → "S".
export const labelAbbrev = (label) => String(label || '').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase();
export const today = () => new Date().toISOString().slice(0,10);
export const primaryRole = p => (p.roles && p.roles[0]) || 'other';
export const classKindKey = (cls, org) => {
  if(cls.paymentModel === 'private') return 'private_session';
  if(cls.paymentModel === 'org') {
    if(org?.type === 'care_home') return 'care_class';
    if(org?.type === 'gym') return 'gym_class';
    return 'org_class';
  }
  return 'class';
};
export const packageUsageCount = (pk, attendance) => {
  // Once committed to a package, the credit is consumed — attendance no-show does not refund.
  // User can still set payment back to 'unpaid' to free the credit if they choose to refund.
  const linked = attendance.filter(a => a.packageId === pk.id).length;
  return (pk.sessionsUsed || 0) + linked;
};
export const packageRemaining = (pk, attendance) => {
  // monthly_unlimited never depletes; drop_in is a single paid session (count = totalSessions, typically 1)
  if(pk.type === 'monthly_unlimited') return Infinity;
  return Math.max(0, (pk.totalSessions||0) - packageUsageCount(pk, attendance));
};
// Types that don't show a session-count / depletion UI:
//   drop_in = single session (no countdown), monthly_unlimited = never depletes.
export const isCountlessPkg = (type) => type === 'drop_in' || type === 'monthly_unlimited';
export const packagePerSessionValue = (pk, attendance) => {
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
export const classRevenue = (cls, attendance, packages) => {
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
export const addDays = (dateStr, n) => { const d = new Date(dateStr+'T12:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
// addMonths: calendar-month add (clamps to month length, e.g. Jan 31 +1mo → Feb 28).
export const addMonths = (dateStr, n) => { const d = new Date(dateStr+'T12:00'); const day=d.getDate(); d.setMonth(d.getMonth()+n); if(d.getDate()<day) d.setDate(0); return d.toISOString().slice(0,10); };
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
export const attendancePayLabel = (a, packages) => {
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
export const deriveBookings = (attendance, classes, packages) =>
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
export const derivePackagePurchases = (packages) =>
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
export const deriveActivity = (attendance, classes, packages) => [
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
export const WEB_EVENT_SOURCES = ['form', 'stripe'];
export const isWebEvent = (n) =>
  !n._derived && WEB_EVENT_SOURCES.includes(n.source) && n.direction !== 'outbound';
export const webEvents = (notes) =>
  notes.filter(isWebEvent).sort((a, b) =>
    (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
export const webUnreadCount = (notes) => notes.filter(n => isWebEvent(n) && !n.readAt).length;

// UK convention: weeks run Monday–Sunday. Returns the Monday of the week containing dateStr.
export const startOfWeek = (dateStr) => {
  const d = new Date(dateStr+'T12:00');
  const dow = d.getDay(); // 0=Sun, 1=Mon, … 6=Sat
  const offset = dow === 0 ? -6 : 1 - dow; // distance back to Monday
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0,10);
};
export const endOfWeek = (dateStr) => addDays(startOfWeek(dateStr), 6);
export const lastDayOfMonth = (dateStr) => {
  const d = new Date(dateStr+'T12:00');
  const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return last.toISOString().slice(0,10);
};
export const getOrgInitials = (name) => !name ? '' : name.split(/\s+/).map(w=>w[0]).filter(Boolean).join('').toUpperCase();
export const nextInvoiceNumber = (invoices, orgId, orgs) => {
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
export const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Renders the printable invoice HTML body — used by the inline print overlay.
// Sandboxed iframes (e.g. Claude artifacts) often block window.open / popups,
// so we render this directly into the page and use print CSS to isolate it.
export const renderPrintableInvoice = (inv, org) => {
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
export const PRINT_INVOICE_STYLES = `
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
export const buildStandaloneInvoiceHtml = (inv, org) => {
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
export const downloadInvoiceHtml = (inv, org) => {
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
export function PrintInvoiceOverlay({ inv, org, onClose }) {
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
export const smartSortPeople = (people, attendance, classes, contextSeriesId) => {
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
export const generateSeriesClasses = (series, count=12) => {
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
