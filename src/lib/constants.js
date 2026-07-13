// constants.js — pure config/data extracted from FeltBodyCRM.jsx
// No React dependency. Contexts and hooks live in helpers.jsx.

// The Felt Body's own sending/receiving addresses. Used to exclude ourselves
// from reply-all recipient derivation and (in the log-worker, where this list
// is duplicated as MY_ADDRESSES) to determine message direction. Keep the
// three copies in sync: here, log-worker index.js, settings.my_addresses.
export const OWN_EMAIL_ADDRESSES = [
  'jesse@thefeltbody.com',
  'info@thefeltbody.com',
  'hello@thefeltbody.com',
  'log@thefeltbody.com',
];

export const SEED = {
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

// Theme system: two palettes sharing one shape. C is the live token object —
// every component reads C.x at render time, so swapping C's values via
// applyTheme(mode) + a full re-render (mode is App state) re-skins the whole
// app without touching any call site. Values are mutated with Object.assign so
// hex+alpha concatenation (C.gold+'88') keeps working — do NOT convert these
// to CSS variables.
export const THEME_BUSINESS = {
  bg:'#0c1c13', sbg:'#091409', surf:'#122018', card:'#192c1f',
  border:'#243b2b', gold:'#c9a84c', goldBg:'#1b2813',
  text:'#f0ece4', muted:'#698a78', active:'#1c3224',
  green:'#4db879', red:'#c97070', blue:'#6ba3d4', purple:'#a07fd4',
};
// Personal mode: the forest theme inverted to light. Same token shape, but the
// lightness ladder flips — cards lift above the background, inputs sit as
// slightly deeper wells, sidebar is a step deeper than the canvas. Gold and
// the semantic status colours are darkened variants of the business values so
// they hold contrast as text on pale backgrounds (the originals were tuned
// for light-on-dark).
export const THEME_PERSONAL = {
  bg:'#e9f1e8', sbg:'#dce8db', surf:'#dfeadd', card:'#f6faf4',
  border:'#c3d6c2', gold:'#9a7c2a', goldBg:'#f0ead0',
  text:'#1e2b21', muted:'#5c7a66', active:'#d8e7d6',
  green:'#2f8f57', red:'#b54f4f', blue:'#3d76a8', purple:'#7a55b8',
};
export const C = { ...THEME_BUSINESS };
// Idempotent; safe to call at the top of App's render body so the palette is
// in place before any JSX below evaluates C.x.
export const applyTheme = (mode) => {
  Object.assign(C, mode === 'personal' ? THEME_PERSONAL : THEME_BUSINESS);
};
export const ORG_META = {
  care_home:{ label:'Care Home', color:'#4db879', bg:'#132413' },
  gym:{ label:'Gym', color:'#6ba3d4', bg:'#131d2a' },
  other:{ label:'Organisation', color:'#c9a84c', bg:'#1b2213' },
  personal:{ label:'Personal', color:'#c98fd4', bg:'#241328' },
};
// Care home outreach pipeline (organisations.outreach_stage). null/unset means
// "not part of the outreach campaign" — this only applies to orgs Jesse has
// actively added as a Balance & Vitality prospect. Ordered roughly by how far
// along the pipeline each stage sits, cold -> converted.
export const CARE_HOME_STAGES = {
  to_contact:{ label:'To Contact', color:'#8a94a3', bg:'#1c1f24' },
  attempting:{ label:'Attempting', color:'#6ba3d4', bg:'#131d2a' },
  awaiting_callback:{ label:'Awaiting Callback', color:'#c9a84c', bg:'#1b2213' },
  taster_booked:{ label:'Taster Booked', color:'#a07fd4', bg:'#1a1428' },
  nurture:{ label:'Nurture', color:'#6ab86a', bg:'#132413' },
  converted:{ label:'Converted', color:'#4db879', bg:'#0f2318' },
};
export const PERSON_ROLES = {
  resident:{ label:'Resident', color:'#4db879', bg:'#132413' },
  private_client:{ label:'Private Client', color:'#a07fd4', bg:'#1a1428' },
  website_student:{ label:'Student', color:'#6ba3d4', bg:'#131d2a' },
  tt_prospect:{ label:'TT Prospect', color:'#c9a84c', bg:'#1b2213' },
  care_prospect:{ label:'Care Home Lead', color:'#4db879', bg:'#132413' },
  retreat_interest:{ label:'Retreat Interest', color:'#c97070', bg:'#2a1313' },
  workshop_interest:{ label:'Workshop Interest', color:'#6ab86a', bg:'#132413' },
  bodywork_interest:{ label:'Bodywork Interest', color:'#a07fd4', bg:'#1a1428' },
  personal_contact:{ label:'Personal Contact', color:'#c98fd4', bg:'#241328' },
};
export const SOURCES = {
  'thefeltbody.com':{ label:'thefeltbody.com', icon:'⬡' },
  'jessesaunders.net':{ label:'jessesaunders.net', icon:'⬡' },
  'manual':{ label:'Manual entry', icon:'✎' },
  'referral':{ label:'Referral', icon:'◎' },
  'workshop':{ label:'Workshop signup', icon:'▦' },
  'class_signup':{ label:'Class signup', icon:'▦' },
  'social_media':{ label:'Social media', icon:'◉' },
  'other':{ label:'Other', icon:'◇' },
};
export const PKG_TYPES = {
  drop_in:{ label:'Drop-in', color:'#6ba3d4' },
  monthly_unlimited:{ label:'Monthly Unlimited', color:'#d48fc0' },
  class_package:{ label:'Class Package', color:'#4db879' },
  private_block:{ label:'Private Block', color:'#a07fd4' },
  retreat:{ label:'Retreat', color:'#c97070' },
  workshop:{ label:'Workshop', color:'#c9a84c' },
  other:{ label:'Other', color:'#698a78' },
};
// Which class payment models each package type can be used against
export const PKG_COMPATIBILITY = {
  drop_in:       ['per_person', 'private'],  // single-use, flexible
  monthly_unlimited: ['per_person'],          // group classes, never depletes
  class_package: ['per_person'],              // group classes only
  private_block: ['private'],                 // private 1-1 only
  retreat:       ['per_person'],
  workshop:      ['per_person'],
  other:         ['per_person', 'private'],   // flexible
};
export const PAY_VIA = {
  stripe_tfb:'Stripe (TFB)', stripe_js:'Stripe (JS.net)', cash:'Cash',
  bank_transfer:'Bank Transfer', paypal:'PayPal', other:'Other',
};
export const RECURRENCE = {
  one_off:'One-off', weekly:'Weekly', biweekly:'Every 2 weeks', monthly:'Monthly',
};
export const PAYMENT_MODELS = {
  org:        { label:'Organisation pays' },
  per_person: { label:'Each attendee pays' },
  private:    { label:'Private (one person)' },
};
export const KIND_META = {
  care_class:      { label:'CareClass',       color:'#4db879', bg:'#132413' },
  gym_class:       { label:'GymClass',        color:'#6ba3d4', bg:'#131d2a' },
  org_class:       { label:'Class (org)',     color:'#c9a84c', bg:'#1b2213' },
  class:           { label:'Class',           color:'#c9a84c', bg:'#1b2213' },
  private_session: { label:'Private Session', color:'#a07fd4', bg:'#1a1428' },
};
export const PAYMENT_STATUS = {
  unpaid:  { label:'Unpaid',  color:'#c97070', bg:'#2a1313', icon:'!' },
  paid:    { label:'Paid',    color:'#4db879', bg:'#132413', icon:'£' },
  package: { label:'Package', color:'#a07fd4', bg:'#1a1428', icon:'◫' },
};
export const INV_STATUS = {
  draft:{ label:'Draft', color:'#698a78', bg:'#1a2a20' },
  sent:{ label:'Sent', color:'#6ba3d4', bg:'#131d2a' },
  paid:{ label:'Paid', color:'#4db879', bg:'#132413' },
};
export const BANK_DETAILS = {
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
export const INTERACTION_KINDS = {
  note:    { label:'Note',    icon:'📝', color:'#8a9aa3', bg:'#1a2226' },
  call:    { label:'Call',    icon:'📞', color:'#4db879', bg:'#132413' },
  email:   { label:'Email',   icon:'✉️',  color:'#6ba3d4', bg:'#131d2a' },
  meeting: { label:'Meeting', icon:'💬', color:'#a07fd4', bg:'#1a1428' },
  form:    { label:'Form',    icon:'📋', color:'#d49966', bg:'#2a1d10' },
  booking: { label:'Booking', icon:'📅', color:'#7fc4b8', bg:'#13282a' },
  payment: { label:'Payment', icon:'💷', color:'#c9a84c', bg:'#1b2213' },
  // Diary entries (kind='diary'): calendar items whose title lives in `subject`
  // and whose body (`text`) is usually empty. Surfaced in Comms only under their
  // own filter chip — excluded from the default 'All' view to avoid clutter.
  diary:   { label:'Diary',   icon:'📔', color:'#6ba3d4', bg:'#131d2a' },
};

// Household member relationship labels. Keys match the DB CHECK constraint on
// household_members.relationship (adult/child/partner/parent/guardian/friend/
// grandparent/other). Used for the relationship picker and the member rows on
// the PersonDetail household card.
// EDIT THIS if the home household is renamed: the Personal Dashboard shows the
// one household whose name EXACTLY matches this string (case-insensitive,
// trimmed). Exact match — not substring — because other households may share
// the "Osmington" address word; only the home household is named precisely this.
export const HOME_HOUSEHOLD_NAME = '10 Osmington';

// The owner's own contact row in `people`. Diary entries default their linked
// contact to this so interactions_anchored is always satisfied. Single-install
// config — if the owner's contact row ever changes, update here only.
export const SELF_PERSON_ID = '5974b9b3-1aa2-4a33-947f-ea0425a7f5c5';

// ─── Diary calendar layers (personal mode) ──────────────────────────────────
// Personal-mode diary entries belong to one named layer via the `calendar`
// text column on interactions (DB default 'mine'). The colour here drives the
// block accent in Week/Month views; each layer is independently show/hide-able
// via a useLocalStorage visibility map. 'mine' keeps the legacy personal-blue
// so every pre-existing diary entry looks unchanged after migration.
//
// This is the single source of truth for the layer set. Adding a fourth layer
// is a one-line edit here + the key in DIARY_CALENDAR_KEYS — no migration,
// because the column is free-text and code owns the valid values.
//
// Colours chosen to stay distinct when stacked: blue (Mine, legacy), purple
// (Sienna, matches the private-client family), amber (Rosie), rose (Scarlett),
// slate (Luna). Teal is
// deliberately avoided — it's already the web_booking provenance marker.
export const DIARY_CALENDARS = {
  mine:   { label: 'Jesse',  color: C.blue,    bg: '#131d2a' },
  sienna: { label: 'Sienna', color: '#a07fd4', bg: '#1a1428' },
  rosie:  { label: 'Rosie',  color: '#d49966', bg: '#2a1d10' },
  scarlett: { label: 'Scarlett', color: '#cf6f8f', bg: '#2a1018' },
  luna:     { label: 'Luna',     color: '#7f8fa6', bg: '#14181f' },
};
// Render/iteration order for pickers, toggles and copy-to menus.
export const DIARY_CALENDAR_KEYS = ['mine','sienna','rosie','scarlett','luna'];
// ── Multi-tag calendars ──────────────────────────────────────────────────
// The `calendar` column optionally carries SEVERAL layer keys, comma-
// separated ('rosie,scarlett') — one interaction row can sit on multiple
// diaries. calKeys() is the single parse point every consumer goes through:
//   - the FIRST key is the PRIMARY and drives block/chip colour + stacking
//   - visibility is any-match: an entry shows if ANY tagged layer is on
//   - unknown / empty / legacy values resolve to ['mine'] so nothing ever
//     renders colourless or vanishes
// The share worker duplicates these rules (its LAYERS map + per-key
// validation) — keep in sync if the semantics change.
export const calKeys = (calendar) => {
  const ks = String(calendar || '').split(',').map(s => s.trim()).filter(k => DIARY_CALENDARS[k]);
  return ks.length ? ks : ['mine'];
};
// Human label for a calendar value: 'Rosie' or 'Rosie + Scarlett'.
export const calLabel = (calendar) =>
  calKeys(calendar).map(k => DIARY_CALENDARS[k].label).join(' + ');
// Resolve a calendar value's colour from its PRIMARY (first) key, falling
// back to legacy personal-blue so nothing ever renders colourless.
export const diaryCalColor = (key) => (DIARY_CALENDARS[calKeys(key)[0]]?.color || C.blue);
// Multi-tag "rainbow" stripe: equal vertical segments of every tagged
// layer's colour, as a hard-stop gradient. null for single-key values —
// callers keep their plain solid/dashed border in that case.
export const calStripe = (calendar) => {
  const ks = calKeys(calendar);
  if (ks.length < 2) return null;
  const n = ks.length;
  const stops = ks.map((k, i) =>
    `${DIARY_CALENDARS[k].color} ${((i / n) * 100).toFixed(2)}% ${(((i + 1) / n) * 100).toFixed(2)}%`
  ).join(', ');
  return `linear-gradient(to bottom, ${stops})`;
};
// Style fragment for the stripe. Spread into a block/chip's style AFTER its
// border properties: the gradient paints in the background layer and shows
// through a transparent left border (background-origin: border-box paints
// under the border, so no extra DOM and the dashed edges stay untouched).
// No-op ({}) for single-tag entries. Only call for on-mode personal entries —
// off-mode grey and business gold stay single-colour.
export const calStripeStyle = (calendar, widthPx = 3) => {
  const g = calStripe(calendar);
  return g ? {
    borderLeft: `${widthPx}px solid transparent`,
    backgroundImage: g,
    backgroundSize: `${widthPx}px 100%`,
    backgroundRepeat: 'no-repeat',
    backgroundOrigin: 'border-box',
    backgroundClip: 'border-box',
  } : {};
};

export const RELATIONSHIP_LABELS = {
  adult:       'Adult',
  child:       'Child',
  partner:     'Partner',
  parent:      'Parent',
  guardian:    'Guardian',
  friend:      'Friend',
  grandparent: 'Grandparent',
  other:       'Other',
};
export const RELATIONSHIP_KEYS = ['adult','child','partner','parent','guardian','friend','grandparent','other'];

// ─── CUSTOM TYPES INFRASTRUCTURE ──────────────────────────────────────────────
// Built-in org types and person roles can be extended at runtime by the user.
// Custom types are persisted and merged with the built-ins everywhere via TypesContext.
export const TYPE_PALETTE = [
  { color:'#4db879', bg:'#132413' }, // green
  { color:'#6ba3d4', bg:'#131d2a' }, // blue
  { color:'#c9a84c', bg:'#1b2213' }, // gold
  { color:'#a07fd4', bg:'#1a1428' }, // purple
  { color:'#c97070', bg:'#2a1313' }, // red
  { color:'#6ab86a', bg:'#132413' }, // mint
  { color:'#d49966', bg:'#2a1d10' }, // amber
  { color:'#7fc4b8', bg:'#13282a' }, // teal
];
export const TYPE_ICONS = ['◇','⌂','◎','▦','⬡','◈','◉','⊙','◍','◫','▣','⌬','✦','◆','▲','●'];

// Roles/types shown as quick-jump items in the sidebar's expanded section.
// 'resident' is a real role used in badges/avatars but isn't a sidebar shortcut
// (residents are reached via their care home org). Same for 'other' org category —
// keep it in the merged map and as a sidebar item, just at the bottom of built-ins.
export const ORG_SIDEBAR_TYPES = ['care_home','gym','other'];
export const PERSON_SIDEBAR_ROLES = ['private_client','website_student','tt_prospect','care_prospect','retreat_interest','workshop_interest','bodywork_interest'];
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
export const CLIENT_ROLES = ['private_client','website_student','tt_prospect','care_prospect','retreat_interest','workshop_interest','bodywork_interest','resident'];

// PERSONAL_PARENT: the role-parent key that files a contact into the Personal
// Record System. Any role parented to this counts as personal — letting you
// organise the personal side with sub-roles (Family, Friends, …) instead of a
// single flat tag. personRoles is the runtime merged map (key -> { parentKey }).
export const PERSONAL_PARENT = 'personal';

// Does this person carry any role whose parent is `personal`?
// Falls back to the legacy `personal_contact` tag so it works before/after the
// re-parent migration. personRoles may be omitted (legacy-only check).
export const hasPersonalRole = (p, personRoles) => {
  const roles = p.roles || [];
  if (roles.includes('personal_contact')) return true;
  if (!personRoles) return false;
  return roles.some(r => (personRoles[r]?.parentKey || null) === PERSONAL_PARENT);
};

// isPersonalOnly: personal AND not also a client. Dual-membership preserved —
// a personal contact who's also a client is NOT personal-only and stays in
// client views. Pass personRoles to get parent-aware behaviour.
export const isPersonalOnly = (p, personRoles) => {
  const roles = p.roles || [];
  return hasPersonalRole(p, personRoles) && !roles.some(r => CLIENT_ROLES.includes(r));
};
export const isPersonalOrg = o => o.type === 'personal';
