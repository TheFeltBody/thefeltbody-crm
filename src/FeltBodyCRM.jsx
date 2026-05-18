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
const INTERACTION_KINDS = {
  note:    { label:'Note',    icon:'📝', color:'#8a9aa3', bg:'#1a2226' },
  call:    { label:'Call',    icon:'📞', color:'#4db879', bg:'#132413' },
  email:   { label:'Email',   icon:'✉️',  color:'#6ba3d4', bg:'#131d2a' },
  meeting: { label:'Meeting', icon:'💬', color:'#a07fd4', bg:'#1a1428' },
};

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

// Roles/types shown as quick-jump items in the sidebar's expanded section.
// 'resident' is a real role used in badges/avatars but isn't a sidebar shortcut
// (residents are reached via their care home org). Same for 'other' org category —
// keep it in the merged map and as a sidebar item, just at the bottom of built-ins.
const ORG_SIDEBAR_TYPES = ['care_home','gym','other'];
const PERSON_SIDEBAR_ROLES = ['private_client','website_student','tt_prospect','retreat_interest','workshop_interest'];

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
const fmt = d => d ? new Date(d+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
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
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
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
  }));
};

// ─── MICRO COMPONENTS ─────────────────────────────────────────────────────────
const RoleBadge = ({ role }) => {
  const { personRoles } = useTypes();
  const m = personRoles[role] || PERSON_ROLES[role] || { label:role, color:C.muted, bg:C.surf };
  return <span style={{background:m.bg,color:m.color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{m.label}</span>;
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
      }
      }>
        <div style={{display:'flex',alignItems:'centre',gap:10,marginBottom:6,flexWrap:'wrap'}}>
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
const SecHead = ({ children }) => <div style={{color:C.muted,fontSize:9.5,fontWeight:600,letterSpacing:'1.8px',textTransform:'uppercase',padding:'18px 20px 7px',opacity:0.7}}>{children}</div>;
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
const Modal = ({ title, onClose, children, wide, xwide }) => (
  <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
    <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:12,padding:28,width:xwide?860:wide?580:480,maxHeight:'90vh',overflowY:'auto'}}>
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

function AddPersonForm({ existing, onSave, onClose, orgs, defaultType, defaultOrgId, onEmailAdd, onEmailDelete, onEmailSetPrimary }) {
  const { personRoles } = useTypes();
  const initRoles = existing?.roles || (defaultType?[defaultType]:['private_client']);
  // Strip `emails` and `email` from form state — managed separately
  const initForm = existing ? (() => { const {emails, email, ...rest} = existing; return rest; })()
    : {name:'',phone:'',website:'',orgId:defaultOrgId||'',status:'active',source:{channel:'manual',detail:''},notes:'',defaultSessionRate:'',rateNotes:''};
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
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>ROLES (select all that apply)</div>
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
        paymentModel: defaultPaymentModel || ''
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
    <Modal title="Add to Register" onClose={onClose} wide>
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
  const fields = ['name','phone','website','notes','orgId','status','defaultSessionRate','rateNotes'];
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
    notes: pkg.notes || '',
  });
  const [armed, setArmed] = useState(false);
  const s = k => v => setF(x=>({...x,[k]:v}));
  const totalUsed = (parseInt(f.sessionsUsed)||0) + linkedCount;
  const totalSessionsNum = parseInt(f.totalSessions)||0;
  const minTotal = Math.max(1, totalUsed);
  const maxOffset = Math.max(0, totalSessionsNum - linkedCount);
  const canDelete = totalUsed === 0;
  const totalTooLow = f.type !== 'drop_in' && totalSessionsNum < totalUsed;
  const offsetTooHigh = f.type !== 'drop_in' && (parseInt(f.sessionsUsed)||0) > maxOffset;
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
      {f.type!=='drop_in'&&(<>
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
      <FI label="DATE PURCHASED" value={f.datePurchased} onChange={s('datePurchased')} type="date" />
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
function Sidebar({ view, nav, invoices, customOrgTypes, customPersonRoles, onAddOrgType, onAddPersonRole, orgs, people, onRemoveOrgType, onRemovePersonRole, onSignOut }) {
  const unpaidInvoices = invoices.filter(i=>i.status!=='paid').length;

  // Auto-expand each section if the current view falls inside it. The user can also
  // toggle manually via the chevron — manual state takes precedence once they touch it.
  const inOrgSection = view.name === 'org_list' || view.name === 'org_detail';
  const inPeopleSection = view.name === 'people' || view.name === 'person_detail';
  const [orgsExpanded, setOrgsExpanded] = useState(true);
  const [peopleExpanded, setPeopleExpanded] = useState(true);
  // When you navigate into a section, make sure it's open so the active sub-item is visible.
  useEffect(()=>{ if(inOrgSection) setOrgsExpanded(true); }, [inOrgSection]);
  useEffect(()=>{ if(inPeopleSection) setPeopleExpanded(true); }, [inPeopleSection]);

  const Item = ({ name, params={}, label, icon, indent, badge, onClick, isActive }) => {
    const active = isActive !== undefined ? isActive : (view.name===name && Object.entries(params).every(([k,v])=>view[k]===v));
    return (
      <div onClick={onClick || (()=>nav(name,params))} style={{display:'flex',alignItems:'center',gap:9,padding:`8px 20px 8px ${indent?28:20}px`,color:active?C.gold:C.muted,background:active?C.active:'transparent',cursor:'pointer',fontSize:13,fontWeight:active?500:400,borderLeft:`2px solid ${active?C.gold:'transparent'}`,transition:'all 0.12s'}}
        onMouseEnter={e=>{if(!active){e.currentTarget.style.color=C.text;e.currentTarget.style.background=C.surf;}}}
        onMouseLeave={e=>{if(!active){e.currentTarget.style.color=C.muted;e.currentTarget.style.background='transparent';}}}>
        <span style={{fontSize:12,opacity:0.7,width:14,flexShrink:0}}>{icon}</span>
        <span style={{flex:1}}>{label}</span>
        {badge>0&&<span style={{background:C.red,color:'#fff',fontSize:10,fontWeight:600,padding:'1px 7px',borderRadius:20,lineHeight:'16px'}}>{badge}</span>}
      </div>
    );
  };

  // Parent item with expand/collapse chevron. Clicking the body navigates to the "all" view;
  // clicking the chevron just toggles expansion without navigating away.
  const ParentItem = ({ name, params, label, icon, expanded, onToggle, badge }) => {
    const active = view.name === name && Object.entries(params).every(([k,v])=>view[k]===v);
    return (
      <div style={{display:'flex',alignItems:'center',padding:`8px 20px`,color:active?C.gold:C.muted,background:active?C.active:'transparent',fontSize:13,fontWeight:active?500:400,borderLeft:`2px solid ${active?C.gold:'transparent'}`,transition:'all 0.12s'}}
        onMouseEnter={e=>{if(!active){e.currentTarget.style.color=C.text;e.currentTarget.style.background=C.surf;}}}
        onMouseLeave={e=>{if(!active){e.currentTarget.style.color=C.muted;e.currentTarget.style.background='transparent';}}}>
        <div onClick={()=>{ nav(name, params); if(!expanded) onToggle(); }} style={{display:'flex',alignItems:'center',gap:9,flex:1,cursor:'pointer',minWidth:0}}>
          <span style={{fontSize:12,opacity:0.7,width:14,flexShrink:0}}>{icon}</span>
          <span style={{flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</span>
          {badge>0&&<span style={{background:C.red,color:'#fff',fontSize:10,fontWeight:600,padding:'1px 7px',borderRadius:20,lineHeight:'16px'}}>{badge}</span>}
        </div>
        <button onClick={(e)=>{ e.stopPropagation(); onToggle(); }}
          aria-label={expanded?'Collapse':'Expand'}
          style={{background:'none',border:'none',color:'inherit',cursor:'pointer',padding:'2px 4px',marginLeft:4,fontSize:10,opacity:0.6,transition:'transform 0.18s',transform:expanded?'rotate(0deg)':'rotate(-90deg)',display:'inline-flex',alignItems:'center'}}>
          ▾
        </button>
      </div>
    );
  };

  // Small "+ Add type" affordance that lives at the end of an expanded sub-list.
  const AddTypeAction = ({ onClick }) => (
    <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:9,padding:'6px 20px 10px 28px',color:C.muted,cursor:'pointer',fontSize:11.5,fontStyle:'italic',opacity:0.75,transition:'all 0.12s'}}
      onMouseEnter={e=>{e.currentTarget.style.color=C.gold;e.currentTarget.style.opacity=1;}}
      onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.opacity=0.75;}}>
      <span style={{fontSize:12,width:14,flexShrink:0}}>+</span>
      <span>Add type…</span>
    </div>
  );

  return (
    <div style={{width:216,background:C.sbg,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0,overflowY:'auto'}}>
      <div style={{padding:'24px 20px 12px'}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:C.gold,letterSpacing:'1.5px',fontWeight:600}}>THE FELT BODY</div>
        <div style={{color:C.muted,fontSize:9,letterSpacing:'3px',marginTop:2,opacity:0.6}}>CLIENT RECORD SYSTEM</div>
      </div>
      <Item name="dashboard" label="Dashboard" icon="◈" />

      <SecHead>Organisations</SecHead>
      <ParentItem name="org_list" params={{orgType:'all'}} label="All Organisations" icon="⛁"
        expanded={orgsExpanded} onToggle={()=>setOrgsExpanded(v=>!v)} />
      {orgsExpanded && (
        <>
          <Item name="org_list" params={{orgType:'care_home'}} label="Care Homes" icon="⌂" indent />
          <Item name="org_list" params={{orgType:'gym'}} label="Gyms" icon="◎" indent />
          <Item name="org_list" params={{orgType:'other'}} label="Other Orgs" icon="◇" indent />
          {customOrgTypes.map(t => {
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

      <SecHead>People</SecHead>
      <ParentItem name="people" params={{personType:'all'}} label="All Contacts" icon="◉"
        expanded={peopleExpanded} onToggle={()=>setPeopleExpanded(v=>!v)} />
      {peopleExpanded && (
        <>
          <Item name="people" params={{personType:'private_client'}} label="Private Clients" icon="▸" indent />
          <Item name="people" params={{personType:'website_student'}} label="Students" icon="▸" indent />
          <Item name="people" params={{personType:'resident'}} label="Residents" icon="▸" indent />
          <Item name="people" params={{personType:'tt_prospect'}} label="TT Prospects" icon="▸" indent />
          <Item name="people" params={{personType:'retreat_interest'}} label="Retreat Interest" icon="▸" indent />
          <Item name="people" params={{personType:'workshop_interest'}} label="Workshop Interest" icon="▸" indent />
          {customPersonRoles.map(t => {
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

      <SecHead>Sessions</SecHead>
      <Item name="week_view" label="Week View" icon="▦" />
      <Item name="classes" label="All Classes" icon="≡" />
      <Item name="forms_list" label="Forms" icon="◍" />
      <SecHead>Finance</SecHead>
      <Item name="invoices" label="Invoices" icon="⬡" badge={unpaidInvoices} />

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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ orgs, people, classes, attendance, notes, packages, invoices, nav, onAddClass, onCompleteNote, onReopenNote }) {
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
        <Stat label="To Do" value={todoCounts.all} sub={(()=>{ const o=notes.filter(n=>n.actionDate&&!n.completed&&n.actionDate<t).length; return o>0?`${o} overdue`:'all on track'; })()} />
        <Stat label="Outstanding" value={fmtMoney(outstanding)} sub={`${invoices.filter(i=>i.status!=='paid').length} invoice${invoices.filter(i=>i.status!=='paid').length!==1?'s':''}`} />
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:28,marginBottom:32}}>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,gap:10,flexWrap:'wrap'}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,color:C.gold,fontWeight:600}}>
              Classes
              {dateLabel && <span style={{color:C.muted,fontSize:13,fontWeight:400,marginLeft:8,fontFamily:"'Jost',sans-serif"}}>· {dateLabel}</span>}
            </div>
            <button onClick={()=>onAddClass && onAddClass(selectedDate)}
              title={`Add class for ${fmt(selectedDate)}`}
              style={{background:C.goldBg,border:`1px solid ${C.gold}88`,color:C.gold,cursor:'pointer',borderRadius:6,fontSize:12,padding:'4px 11px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px',fontWeight:500}}>
              + Class
            </button>
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

      {(todoCounts.all > 0 || todoCounts.completed > 0) && (
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,gap:10,flexWrap:'wrap'}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,color:C.gold,fontWeight:600}}>
              To Do
              <span style={{color:C.muted,fontSize:13,fontWeight:400,marginLeft:8,fontFamily:"'Jost',sans-serif"}}>· {filteredTodos.length} item{filteredTodos.length!==1?'s':''}</span>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
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
        </div>
      )}
    </div>
  );
}

// ─── ORG LIST / DETAIL ────────────────────────────────────────────────────────
function OrgList({ orgs, people, classes, orgType, nav, onAdd }) {
  const { orgTypes } = useTypes();
  const isAll = orgType === 'all';
  const m = orgTypes[orgType] || ORG_META[orgType] || { label:'Organisation', color:C.muted, bg:C.surf };
  const list = isAll ? orgs : orgs.filter(o=>o.type===orgType);
  const heading = isAll ? 'All Organisations' : `${m.label}s`;
  const addLabel = isAll ? 'Organisation' : m.label;
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
    return (
      <Row key={org.id} onClick={()=>nav('org_detail',{orgId:org.id})}>
        <div style={{width:40,height:40,borderRadius:8,background:orgMeta.bg,border:`1.5px solid ${orgMeta.color}`,display:'flex',alignItems:'center',justifyContent:'center',color:orgMeta.color,fontSize:15,fontWeight:600,flexShrink:0}}>{initials(org.name)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.text,fontSize:15,fontWeight:500,marginBottom:2}}>{org.name}</div>
          <div style={{color:C.muted,fontSize:12}}>{org.address||'—'}</div>
        </div>
        {org.contactName&&<div style={{color:C.muted,fontSize:13}}>{org.contactName}</div>}
        <div style={{display:'flex',gap:7,flexShrink:0,alignItems:'center'}}>
          {isAll && <OrgBadge type={org.type} />}
          <span style={{background:C.surf,color:C.muted,fontSize:11,padding:'3px 10px',borderRadius:20}}>{pc} people</span>
          <span style={{background:C.surf,color:C.muted,fontSize:11,padding:'3px 10px',borderRadius:20}}>{cc} classes</span>
        </div>
      </Row>
    );
  };

  return (
    <div style={{padding:'32px 36px'}}>
      <PageHead action={<Btn onClick={onAdd}>+ Add {addLabel}</Btn>}>{heading}</PageHead>
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

function OrgDetail({ org, people, classes, invoices, nav, backInfo, onEdit, onAddPerson, onAddClass, onCreateInvoice, onEditInvoice, onUpdateInvoiceStatus }) {
  const { orgTypes } = useTypes();
  const [tab, setTab] = useState('people');
  const m = orgTypes[org.type] || ORG_META[org.type] || { label:'Organisation', color:C.muted, bg:C.surf };
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
            {org.website&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>WEBSITE</div><a href={/^https?:\/\//i.test(org.website)?org.website:`https://${org.website}`} target="_blank" rel="noopener noreferrer" style={{color:C.blue,fontSize:13,textDecoration:'none',wordBreak:'break-all'}}>{org.website}</a></div>}
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
function PeopleList({ people, orgs, personType, nav, onAdd, onMerge }) {
  const { personRoles } = useTypes();
  const [q, setQ] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const list = people.filter(p=>personType==='all'||p.roles.includes(personType)).filter(p=>!q||p.name.toLowerCase().includes(q.toLowerCase())||(p.email||'').toLowerCase().includes(q.toLowerCase()));
  const title = personType==='all'?'All Contacts':((personRoles[personType]||PERSON_ROLES[personType])?.label+'s'||personType);
  const toggleSel = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const canMerge = selected.size === 2;
  const startMerge = () => {
    if (!canMerge || !onMerge) return;
    const [a, b] = [...selected].map(id => people.find(p=>p.id===id)).filter(Boolean);
    if (a && b) onMerge(a, b);
    exitSelect();
  };
  const action = selectMode ? (
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      <span style={{color:C.muted,fontSize:12}}>{selected.size} selected{canMerge?'':' (pick 2 to merge)'}</span>
      <Btn variant="ghost" small onClick={exitSelect}>Cancel</Btn>
      <Btn onClick={startMerge} disabled={!canMerge}>Merge selected</Btn>
    </div>
  ) : (
    <div style={{display:'flex',gap:8}}>
      <Btn variant="ghost" onClick={()=>setSelectMode(true)}>Select</Btn>
      <Btn onClick={onAdd}>+ Add Person</Btn>
    </div>
  );
  return (
    <div style={{padding:'32px 36px'}}>
      <PageHead action={action}>{title}</PageHead>
      <div style={{marginBottom:16}}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name or email..." style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:14,padding:'9px 14px',width:300,fontFamily:"'Jost',sans-serif",outline:'none'}} /></div>
      {list.length?<div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
        {list.map(p=>{
          const org=orgs.find(o=>o.id===p.orgId);
          const isSel = selected.has(p.id);
          const onRowClick = selectMode ? (()=>toggleSel(p.id)) : (()=>nav('person_detail',{personId:p.id}));
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
      </div>:<Empty text="No results" />}
    </div>
  );
}

function PersonDetail({ person, org, pNotes, pClasses, attendance, packages, classes, orgs, nav, backInfo, highlightNoteId, onAddNote, onEdit, onAddPackage, onEditPackage, onUseSession, onReturnSession, onToggleImportant, onClearAction, onReopenNote, onDeleteNote, onUpdateActionDate, onEditNote, onBook }) {  const [addKind, setAddKind] = useState(null);  // null | 'note' | 'call' | 'email' | 'meeting'
  const [menuOpen, setMenuOpen] = useState(false);  // controls the "+ Log ▾" dropdown
  const menuRef = useRef(null);
  const [tab, setTab] = useState('notes');
  const [flashId, setFlashId] = useState(null);
  const [filterKind, setFilterKind] = useState('all');
  const visibleNotes = filterKind==='all' ? pNotes : pNotes.filter(n => (n.kind||'note')===filterKind);
  const impNotes = visibleNotes.filter(n=>n.important), regNotes = visibleNotes.filter(n=>!n.important);
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
              {org&&<div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>ORGANISATION</div><div style={{color:C.blue,fontSize:13,cursor:'pointer'}} onClick={()=>nav('org_detail',{orgId:org.id})}>{org.name}</div></div>}
              <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>STATUS</div><div style={{color:person.status==='active'?C.green:person.status==='interested'?C.gold:C.muted,fontSize:13,fontWeight:500}}>{person.status}</div></div>
              <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>SOURCE</div><SourceTag source={person.source} /></div>
            </div>
            {person.notes&&<div style={{borderTop:`1px solid ${C.border}`,marginTop:14,paddingTop:12,color:C.muted,fontSize:13,lineHeight:1.6}}>{person.notes}</div>}
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'16px 20px'}}>
            <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:12}}>CLASS HISTORY</div>
            {pClasses.length?(
              // Cap at ~8 rows visible (~38px each); scroll for the rest.
              <div style={{maxHeight:304,overflowY:'auto',paddingRight:4}}>
                {pClasses.map(c=>{
                  const att=attendance.find(a=>a.classId===c.id&&a.personId===person.id);
                  return (<div key={c.id} onClick={()=>nav('class_detail',{classId:c.id})} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}><div><div style={{color:C.text,fontSize:13}}>{c.name}</div><div style={{color:C.muted,fontSize:11}}>{fmt(c.date)}</div></div><div style={{width:8,height:8,borderRadius:'50%',background:att?.attended?C.green:C.red}} /></div>);
                })}
              </div>
            ):<div style={{color:C.muted,fontSize:13}}>No classes yet</div>}
          </div>
        </div>
        <div>
          <Tabs tabs={[{id:'notes',label:`Notes (${pNotes.length})`},{id:'packages',label:`Packages (${pPkgs.length})`}]} active={tab} onChange={setTab} />
          {tab==='notes'&&<>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:12,flexWrap:'wrap'}}>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {['all', ...Object.keys(INTERACTION_KINDS)].map(k => {
                  const active = filterKind === k;
                  const meta = k==='all' ? null : INTERACTION_KINDS[k];
                  const label = k==='all' ? 'All' : meta.label + 's';
                  const count = k==='all' ? pNotes.length : pNotes.filter(n=>(n.kind||'note')===k).length;
                  return (
                    <button key={k} onClick={()=>setFilterKind(k)} style={{
                      background: active ? (meta?meta.bg:C.surf) : 'transparent',
                      color: active ? (meta?meta.color:C.text) : C.muted,
                      border: `1px solid ${active ? (meta?meta.color+'88':C.border) : C.border}`,
                      borderRadius:4, fontSize:11, fontWeight:500, letterSpacing:'0.3px',
                      padding:'4px 10px', cursor:'pointer',
                      fontFamily:"'Jost',sans-serif",
                      display:'inline-flex', alignItems:'center', gap:5,
                    }}>
                      {meta && <span style={{fontSize:11,lineHeight:1}}>{meta.icon}</span>}
                      {label}
                      <span style={{opacity:0.55,fontSize:10}}>{count}</span>
                    </button>
                  );
                })}
              </div>
              {/* "+ Log ▾" dropdown — click to open menu, click an item to open
                  the form for that kind. Closes on outside-click or Escape (see
                  useEffect above). Hidden while the form itself is open. */}
              {addKind === null && (
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
              )}
            </div>
            {addKind&&<NoteForm personId={person.id} classId={null} kind={addKind} onSave={n=>{onAddNote(n);setAddKind(null);}} onCancel={()=>setAddKind(null)} />}
            {impNotes.length>0&&<><div style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'1px',marginBottom:8,marginTop:4}}>⚑ IMPORTANT</div>{impNotes.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} onReopenNote={onReopenNote} onUpdateActionDate={onUpdateActionDate} onDelete={onDeleteNote} onClick={onEditNote?()=>onEditNote(n):undefined} highlight={flashId===n.id} />)}{regNotes.length>0&&<div style={{borderTop:`1px solid ${C.border}`,margin:'18px 0',opacity:0.4}} />}</>}
            {regNotes.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} onReopenNote={onReopenNote} onUpdateActionDate={onUpdateActionDate} onDelete={onDeleteNote} onClick={onEditNote?()=>onEditNote(n):undefined} highlight={flashId===n.id} />)}
            {visibleNotes.length===0&&!addKind&&<Empty text={filterKind==='all' ? 'No notes yet' : `No ${INTERACTION_KINDS[filterKind].label.toLowerCase()}s logged yet`} />}
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
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10,gap:12}}>
                    <div><div style={{color:C.text,fontSize:15,fontWeight:500}}>{pk.name}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{PKG_TYPES[pk.type]?.label} · {fmt(pk.datePurchased)}</div></div>
                    <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                      <div style={{textAlign:'right'}}><div style={{color:C.gold,fontSize:14,fontWeight:500}}>£{pk.amountPaid}</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{PAY_VIA[pk.paidVia]||pk.paidVia}</div></div>
                      <button onClick={()=>onEditPackage(pk.id)}
                        style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'3px 9px',fontFamily:"'Jost',sans-serif",flexShrink:0}}>
                        Edit
                      </button>
                    </div>
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
    <div style={{padding:'32px 36px'}}>
      <PageHead action={<>
        <Btn variant="secondary" small onClick={()=>nav('week_view')}>Week view</Btn>
        <Btn onClick={onAdd}>+ Add Class</Btn>
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

function ClassDetail({ cls, org, people, attendance, notes, series, forms, packages, nav, backInfo, onToggle, onAddNote, onAddToRegister, onEdit, onToggleImportant, onClearAction, onReopenNote, onDeleteNote, onUpdateActionDate, onUpdateClass, onSetPayment, onDeleteClass, onRemoveFromRegister }) {  const [expanded, setExpanded] = useState(null); // { type:'note'|'payment', personId }
  // Privacy mode for in-class teaching: by default we hide rates and payment amounts so
  // a client glancing at the screen doesn't see what we charge. Toggle in the header.
  const [showMoney, setShowMoney] = useState(false);
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
        if(pk) totalPkgValue += packagePerSessionValue(pk);
      } else {
        unpaid++;
      }
    });
    return { unpaid, paid, viaPackage, totalCash, totalPkgValue, totalRevenue: totalCash + totalPkgValue };
  }, [reg, tracksPayment, packages]);

  return (
    <div style={{padding:'32px 36px',maxWidth:920}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={<>
        <Btn variant="secondary" small onClick={()=>setShowMoney(v=>!v)} title={showMoney?'Hide payment info':'Show payment info'}>{showMoney?'Hide £':'Show £'}</Btn>
        <Btn variant="secondary" onClick={onEdit}>Edit</Btn>
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
    <div style={{padding:'32px 36px'}}>
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
  const [showPrint, setShowPrint] = useState(false);
  return (
    <div style={{padding:'32px 36px',maxWidth:760}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={<>
        <Btn variant="secondary" small onClick={()=>downloadInvoiceHtml(inv, org)} title="Download as HTML — open in any browser to print or Save as PDF">↓ Download</Btn>
        <Btn variant="secondary" onClick={()=>setShowPrint(true)}>Print / PDF</Btn>
        <Btn variant="secondary" onClick={onEdit}>Edit</Btn>
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
  const [orgs, setOrgs] = useState(SEED.orgs);
  const [people, setPeople] = useState(SEED.people);
  const [series, setSeries] = useState(SEED.series);
  const [classes, setClasses] = useState(SEED.classes);
  const [attendance, setAttendance] = useState(SEED.attendance);
  const [notes, setNotes] = useState(SEED.notes);
  const [packages, setPackages] = useState(SEED.packages);
  const [invoices, setInvoices] = useState(SEED.invoices);
  const [forms, setForms] = useState(SEED.forms);
  // User-defined org categories (Insurance, Banks, etc.) and contact roles, persisted alongside data.
  const [customOrgTypes, setCustomOrgTypes] = useState([]);
  const [customPersonRoles, setCustomPersonRoles] = useState([]);
  // Junction rows linking people to organisations in working/staff roles
  // (primary contact, billing contact, etc.). Distinct from people.orgId which
  // models residency. Loaded eagerly, surfaced via OrgDetail in Batch 2.
  const [orgContacts, setOrgContacts] = useState([]);
  // Mobile nav state (Phase 1: basic hamburger button + modal nav for small screens)
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
        setLoadStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setLoadError(e.message || String(e));
        setLoadStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
// Compute a smart back label from the previous entry in the history stack
  const backInfo = useMemo(() => {
    if (history.length < 2) return null;
    const prev = history[history.length - 2];
    let label = 'Back';
    switch (prev.name) {
      case 'dashboard': label = 'Dashboard'; break;
      case 'classes': label = 'All Classes'; break;
      case 'week_view': label = 'Week View'; break;
      case 'forms_list': label = 'Forms'; break;
      case 'invoices': label = 'Invoices'; break;
      case 'people':
        if (prev.personType === 'all') label = 'All Contacts';
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
    data.notes.patch(id, { completed: true, completed_at: completedAt }).catch(onError('Complete note'));
  };
  const reopenNote = (id) => {
    setNotes(p => p.map(n => n.id === id ? { ...n, completed: false, completedAt: null } : n));
    data.notes.patch(id, { completed: false, completed_at: null }).catch(onError('Reopen note'));
  };
  const deleteNote = (id) => {
    setNotes(p => p.filter(n => n.id !== id));  // optimistic
    data.notes.delete(id).catch(onError('Delete note'));
  };
  const updateNoteAction = (id, newDate) => {
    setNotes(p => p.map(n => n.id === id ? { ...n, actionDate: newDate || null } : n));
    data.notes.patch(id, { action_date: newDate || null }).catch(onError('Update action date'));
  };
  // Full-form edit from EditNoteForm. The form returns a UI-shape note; we
  // translate the editable fields to DB-shape keys here. Pattern matches
  // the other note handlers: optimistic-local + fire-and-forget.
  // Excluded from the patch: id, date, completed, completedAt (managed by
  // create/complete/reopen paths, not edit), personId, classId (immutable).
  const updateNote = (id, edited) => {
    setNotes(p => p.map(n => n.id === id ? {
      ...n,
      text: edited.text,
      important: edited.important,
      actionDate: edited.actionDate || null,
      kind: edited.kind || 'note',
      direction: edited.direction || null,
      subject: edited.subject || '',
      durationMins: edited.durationMins ?? null,
    } : n));
    const dbPatch = {
      text: edited.text,
      important: edited.important,
      action_date: edited.actionDate || null,
      kind: edited.kind || 'note',
      direction: edited.direction || null,
      subject: edited.subject ? edited.subject : null,  // '' → null in DB
      duration_mins: edited.durationMins ?? null,
    };
    data.notes.patch(id, dbPatch).catch(onError('Update note'));
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
        const seriesRow = await data.series.create({
          name: f.name, recurrence: f.recurrence, location: f.location,
          orgId: f.orgId || null, startDate: f.date, time: f.time || '',
          duration, rate: parseFloat(f.rate) || 0, paymentModel,
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
      case 'add_person': return <AddPersonForm orgs={orgs} defaultType={modal.personType} defaultOrgId={modal.orgId} onSave={addPerson} onClose={close} />;
      case 'edit_person': return <AddPersonForm existing={modal.person} orgs={orgs}
        onSave={p=>updatePerson(modal.person.id, p)}
        onEmailAdd={addPersonEmail}
        onEmailDelete={deletePersonEmail}
        onEmailSetPrimary={setPersonPrimaryEmail}
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
      case 'add_package': return <AddPackageForm personId={modal.personId} onSave={addPackage} onClose={close} />;
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
      case 'dashboard': return <Dashboard orgs={orgs} people={people} classes={classes} attendance={attendance} notes={notes} packages={packages} invoices={invoices} nav={nav}
        onAddClass={(date)=>setModal({type:'add_class', date})}
        onCompleteNote={clearNoteAction}
        onReopenNote={reopenNote} />;
      case 'org_list': return <OrgList orgs={orgs} people={people} classes={classes} orgType={orgType} nav={nav} onAdd={()=>setModal({type:'add_org',orgType})} />;
      case 'org_detail': {
        const org=orgs.find(o=>o.id===orgId); if(!org) return <Empty text="Not found" />;
        return <OrgDetail org={org} people={people} classes={classes} invoices={invoices} nav={nav} backInfo={backInfo}
          onEdit={()=>setModal({type:'edit_org',org})}
          onAddPerson={()=>setModal({type:'add_person',orgId,personType:org.type==='care_home'?'resident':'website_student'})}
          onAddClass={()=>setModal({type:'add_class',orgId})}
          onCreateInvoice={()=>setModal({type:'create_invoice',orgId})}
          onEditInvoice={inv=>setModal({type:'edit_invoice',inv})}
          onUpdateInvoiceStatus={setInvoiceStatus} />;
      }
      case 'people': return <PeopleList people={people} orgs={orgs} personType={personType} nav={nav} onAdd={()=>setModal({type:'add_person',personType:personType==='all'?'private_client':personType})} onMerge={(a,b)=>setModal({type:'merge_people',personA:a,personB:b})} />;
      case 'person_detail': {
        const person=people.find(p=>p.id===personId); if(!person) return <Empty text="Not found" />;
        const org=orgs.find(o=>o.id===person.orgId);
        const pn=notes.filter(n=>n.personId===person.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
        const pc=attendance.filter(a=>a.personId===person.id).map(a=>classes.find(c=>c.id===a.classId)).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
        return <PersonDetail person={person} org={org} pNotes={pn} pClasses={pc} attendance={attendance} packages={packages} classes={classes} orgs={orgs} nav={nav} backInfo={backInfo} highlightNoteId={highlightNoteId}
          onAddNote={addNote}
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

  return (
    <TypesContext.Provider value={typesValue}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500;600&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2a4a37;border-radius:2px}input,select,textarea{outline:none}input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.5)}@media(max-width:767px){[data-desktop-sidebar]{display:none !important}}@media(min-width:768px){[data-hamburger]{display:none !important}}`}</style>
      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:C.bg,fontFamily:"'Jost',sans-serif",color:C.text,position:'relative'}}>
        {/* Desktop sidebar: hidden on mobile via CSS media query */}
        <div data-desktop-sidebar>
          <Sidebar view={view} nav={nav} invoices={invoices}
            customOrgTypes={customOrgTypes}
            customPersonRoles={customPersonRoles}
            orgs={orgs} people={people}
            onAddOrgType={()=>setModal({type:'add_org_type'})}
            onAddPersonRole={()=>setModal({type:'add_person_role'})}
            onRemoveOrgType={handleRemoveOrgType}
            onRemovePersonRole={handleRemovePersonRole}
            onSignOut={signOut} />
        </div>

        {/* Main content area with mobile hamburger button */}
        <main style={{flex:1,display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
          {/* Hamburger button: hidden on desktop via CSS media query */}
          <button data-hamburger onClick={()=>setMobileNavOpen(true)}
            style={{background:'none',border:'none',color:C.text,cursor:'pointer',fontSize:20,padding:'16px 20px',position:'absolute',top:0,left:0,zIndex:10,height:52}}
            aria-label="Open navigation menu"
            title="Open navigation menu">
            ☰
          </button>
          {/* Render the current view */}
          <div style={{flex:1,overflowY:'auto',overflowX:'hidden'}}>{renderView()}</div>
        </main>

        {/* Mobile nav modal (lightbox): shows nav in modal on small screens */}
        {mobileNavOpen && (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',zIndex:100,display:'flex',alignItems:'flex-start'}}>
            {/* Sidebar component in the modal */}
            <div style={{width:'min(80vw, 280px)',height:'100%',overflowY:'auto',background:C.sbg,boxShadow:'-2px 0 12px rgba(0,0,0,0.5)'}}>
              <Sidebar view={view} nav={nav} invoices={invoices}
                customOrgTypes={customOrgTypes}
                customPersonRoles={customPersonRoles}
                orgs={orgs} people={people}
                onAddOrgType={()=>{ setMobileNavOpen(false); setModal({type:'add_org_type'}); }}
                onAddPersonRole={()=>{ setMobileNavOpen(false); setModal({type:'add_person_role'}); }}
                onRemoveOrgType={handleRemoveOrgType}
                onRemovePersonRole={handleRemovePersonRole}
                onSignOut={signOut} />
            </div>
            {/* Backdrop click closes the modal */}
            <div onClick={()=>setMobileNavOpen(false)} style={{flex:1,height:'100%'}} />
          </div>
        )}

        {modal&&renderModal()}
      </div>
    </TypesContext.Provider>
  );
}

