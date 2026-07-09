// Mappers: DB row shape <-> JSX object shape.
//
// The schema and the React UI grew in parallel and diverge in a few spots:
//   - DB columns are snake_case; UI uses camelCase
//   - All org FKs use `org_id` (normalised 2026-05-19 from previous drift
//     where sessions/payments used `organisation_id`)
//   - DB stores person source as flat columns `source_channel` + `source_detail`;
//     UI expects `source: { channel, detail }`
//   - DB has a `person_roles` junction table; UI expects `person.roles[]` as a string array
//   - DB has `invoice_line_items` as a separate table; UI expects `invoice.lineItems[]`
//   - The DB renamed classes -> sessions and notes -> interactions; UI still uses the
//     original names (the user-facing language is "classes" and "notes"). Mappers
//     translate at the boundary so the rest of the JSX never sees the new names.
//
// All mappers are pure functions. Read direction is `*FromDb`, write direction is `*ToDb`.

// ─── Organisations ───────────────────────────────────────────────────────────

export const orgFromDb = (row) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  address: row.address || '',
  phone: row.phone || '',
  email: row.email || '',
  website: row.website || '',
  contactName: row.contact_name || '',
  notes: row.notes || '',
  invoiceCounter: row.invoice_counter ?? 0,
  // Care home outreach pipeline — null on any org that isn't an active
  // Balance & Vitality prospect. See constants.js CARE_HOME_STAGES.
  outreachStage: row.outreach_stage || null,
  // Single mutable "when to act next" pointer — meaning depends on
  // outreachStage: call-by date while cold, the taster date once booked,
  // next check-in once in nurture. See CARE_HOME_STAGES doc comment.
  nextContactDate: row.next_contact_date || null,
});

export const orgToDb = (o) => ({
  name: o.name,
  type: o.type || 'other',
  address: o.address || null,
  phone: o.phone || null,
  email: o.email || null,
  website: o.website || null,
  contact_name: o.contactName || null,
  notes: o.notes || null,
  outreach_stage: o.outreachStage || null,
  next_contact_date: o.nextContactDate || null,
});

// ─── People ──────────────────────────────────────────────────────────────────

// Roles come from a separate query against person_roles; caller passes them in.
// Emails come from people_emails (junction table); caller passes them in.
//   - `emails`: array of {id, email, isPrimary, source, createdAt}
//   - `email`: convenience derived field — the primary email (or first email,
//     or '') so existing read sites that look at person.email keep working.
//     For writes, use the data.peopleEmails module directly.
export const personFromDb = (row, roles = [], emails = []) => {
  const mappedEmails = emails.map(emailFromDb);
  const primary = mappedEmails.find(e => e.isPrimary) || mappedEmails[0];
  return {
    id: row.id,
    name: row.name,
    email: primary?.email || row.primary_email || '',
    emails: mappedEmails,
    phone: row.phone || '',
    website: row.website || '',
    address: row.address || '',
    // date_of_birth is a DATE column; Postgres returns 'YYYY-MM-DD'. Keep '' when
    // null so the date input stays blank and controlled.
    dateOfBirth: row.date_of_birth || '',
    orgId: row.org_id || null,
    status: row.status || 'active',
    source: {
      channel: row.source_channel || 'manual',
      detail: row.source_detail || '',
    },
    notes: row.notes || '',
    roles: roles.length ? roles : ['private_client'],  // safety default
    doNotEmail: row.do_not_email ?? false,
    isActiveStudent: row.is_active_student ?? false,
    defaultSessionRate: row.default_session_rate !== null && row.default_session_rate !== undefined
      ? Number(row.default_session_rate)
      : '',
    rateNotes: row.rate_notes || '',
  };
};

// people.email no longer exists as a column. Emails are managed separately via
// the people_emails table (see data.peopleEmails). personToDb writes only the
// person row's own fields.
export const personToDb = (p) => ({
  name: p.name,
  phone: p.phone || null,
  website: p.website || null,
  address: p.address || null,
  // empty string from the date input → null (Postgres DATE rejects '')
  date_of_birth: p.dateOfBirth ? String(p.dateOfBirth).trim() || null : null,
  org_id: p.orgId || null,
  status: p.status || 'active',
  source_channel: p.source?.channel || 'manual',
  source_detail: p.source?.detail || null,
  notes: p.notes || null,
  do_not_email: p.doNotEmail ?? false,
  is_active_student: p.isActiveStudent ?? false,
  default_session_rate: numOrNull(p.defaultSessionRate),
  rate_notes: p.rateNotes ? String(p.rateNotes).trim() || null : null,
});

// ─── People emails ───────────────────────────────────────────────────────────
// Junction table: N emails per person, one marked primary. Used directly by
// data.peopleEmails CRUD and joined into personFromDb at load time.

export const emailFromDb = (row) => ({
  id: row.id,
  personId: row.person_id,
  email: row.email,
  isPrimary: row.is_primary ?? false,
  source: row.source || '',
  createdAt: row.created_at,
});

export const emailToDb = (e) => ({
  person_id: e.personId,
  email: (e.email || '').trim(),
  is_primary: e.isPrimary ?? false,
  source: e.source || null,
});

// Coerce a value to a number or null. Used for nullable numeric columns where
// the form may hand us '' (empty input), null, undefined, or an actual number.
// Postgres rejects '' for numeric, so we must convert to null. Whitespace-only
// strings are also treated as null. parseFloat handles strings like '40' or '40.5'.
const numOrNull = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const trimmed = String(v).trim();
  if (trimmed === '') return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
};

// ─── Series ──────────────────────────────────────────────────────────────────

export const seriesFromDb = (row) => ({
  id: row.id,
  name: row.name,
  recurrence: row.recurrence,
  location: row.location || '',
  orgId: row.org_id || null,
  startDate: row.start_date,
  time: row.time_of_day ? String(row.time_of_day).slice(0, 5) : '',
  duration: row.duration_mins ?? 60,
  rate: Number(row.rate) || 0,
  rateType: row.rate_type || 'per_class',
  paymentModel: row.payment_model || 'per_person',
  // Booking fields live on the series row so newly generated instances (incl.
  // future "top up" runs) inherit them. classFromDb/classToDb still carry the
  // per-session copies — these are the series-level source of truth.
  isBookable: row.is_bookable ?? false,
  capacity: row.capacity ?? '',          // '' keeps the number input controlled
  publicBlurb: row.public_blurb || '',
  joinUrl: row.join_url || '',
  bookingInfo: row.booking_info || '',
});

export const seriesToDb = (s) => ({
  name: s.name,
  recurrence: s.recurrence || 'weekly',
  location: s.location || null,
  org_id: s.orgId || null,
  start_date: s.startDate,
  time_of_day: s.time || null,
  duration_mins: parseInt(s.duration) || 60,
  rate: parseFloat(s.rate) || 0,
  rate_type: s.rateType || 'per_class',
  payment_model: s.paymentModel || 'per_person',
  is_bookable: s.isBookable ?? false,
  capacity: numOrNull(s.capacity),       // NULL = uncapped
  public_blurb: s.publicBlurb ? String(s.publicBlurb).trim() || null : null,
  join_url: s.joinUrl ? String(s.joinUrl).trim() || null : null,
  booking_info: s.bookingInfo ? String(s.bookingInfo).trim() || null : null,
});

// ─── Sessions (UI: "classes") ────────────────────────────────────────────────
// Note: sessions table uses `organisation_id` (long form), unlike most other tables.
// Note: sessions has `start_time`/`duration_minutes`, not `time_of_day`/`duration_mins`.
// `forms_worked` is a jsonb array of form IDs the class worked on; `reflection` is
// free-text written by Jesse after the class. Both are nullable.

export const classFromDb = (row) => ({
  id: row.id,
  name: row.name,
  date: row.date,
  time: row.start_time ? String(row.start_time).slice(0, 5) : '',
  duration: row.duration_minutes ?? 60,
  location: row.location || '',
  orgId: row.org_id || null,   
  seriesId: row.series_id || null,
  rate: Number(row.rate) || 0,
  paymentModel: row.payment_model || 'per_person',
  notes: row.notes || '',
  reflection: row.reflection || '',
  reflectionStarred: row.reflection_starred ?? false,
  formsWorked: Array.isArray(row.forms_worked) ? row.forms_worked : [],
  isBookable: row.is_bookable ?? false,
  capacity: row.capacity ?? '',
  publicBlurb: row.public_blurb || '',
  joinUrl: row.join_url || '',
  bookingInfo: row.booking_info || '',
});

export const classToDb = (c) => ({
  name: c.name,
  date: c.date,
  start_time: c.time || null,
  duration_minutes: parseInt(c.duration) || 60,
  location: c.location || null,
  org_id: c.orgId || null,
  series_id: c.seriesId || null,
  rate: parseFloat(c.rate) || 0,
  payment_model: c.paymentModel || 'per_person',
  notes: c.notes || null,
  reflection: c.reflection || null,
  reflection_starred: c.reflectionStarred ?? false,
  forms_worked: Array.isArray(c.formsWorked) ? c.formsWorked : [],
  is_bookable: c.isBookable ?? false,
  capacity: numOrNull(c.capacity),
  public_blurb: c.publicBlurb ? String(c.publicBlurb).trim() || null : null,
  join_url: c.joinUrl ? String(c.joinUrl).trim() || null : null,
  booking_info: c.bookingInfo ? String(c.bookingInfo).trim() || null : null,
});

// Partial-patch mapper: only translates keys that are actually present in `patch`.
// Used by data.classes.patch() so untouched columns aren't overwritten.
// Mirrors the shape of classToDb but every field is conditional on its UI key
// being defined in the patch object (so passing { reflection: 'foo' } produces
// { reflection: 'foo' } and nothing else — not a row full of nulls).
export const classPatchToDb = (patch) => {
  const out = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.date !== undefined) out.date = patch.date;
  if (patch.time !== undefined) out.start_time = patch.time || null;
  if (patch.duration !== undefined) out.duration_minutes = parseInt(patch.duration) || 60;
  if (patch.location !== undefined) out.location = patch.location || null;
  if (patch.orgId !== undefined) out.org_id = patch.orgId || null;
  if (patch.seriesId !== undefined) out.series_id = patch.seriesId || null;
  if (patch.rate !== undefined) out.rate = parseFloat(patch.rate) || 0;
  if (patch.paymentModel !== undefined) out.payment_model = patch.paymentModel || 'per_person';
  if (patch.notes !== undefined) out.notes = patch.notes || null;
  if (patch.reflection !== undefined) out.reflection = patch.reflection || null;
  if (patch.reflectionStarred !== undefined) out.reflection_starred = !!patch.reflectionStarred;
  if (patch.formsWorked !== undefined) {
    out.forms_worked = Array.isArray(patch.formsWorked) ? patch.formsWorked : [];
  }
  if (patch.isBookable !== undefined) out.is_bookable = patch.isBookable;
  if (patch.capacity !== undefined) out.capacity = numOrNull(patch.capacity);
  if (patch.publicBlurb !== undefined) out.public_blurb = patch.publicBlurb || null;
  if (patch.joinUrl !== undefined) out.join_url = patch.joinUrl ? String(patch.joinUrl).trim() || null : null;
  if (patch.bookingInfo !== undefined) out.booking_info = patch.bookingInfo ? String(patch.bookingInfo).trim() || null : null;
  return out;
};

// ─── Attendance ──────────────────────────────────────────────────────────────
// DB column `session_id`; UI calls it `classId`.

export const attendanceFromDb = (row) => ({
  id: row.id,
  classId: row.session_id,
  personId: row.person_id,
  attended: row.attended,
  paymentStatus: row.payment_status || 'unpaid',
  packageId: row.package_id || undefined,
  paidAmount: row.paid_amount !== undefined && row.paid_amount !== null
    ? Number(row.paid_amount) : undefined,
  // Payment method for drop-in (paymentStatus==='paid') rows. Null/undefined for
  // legacy rows recorded before this column existed → surfaced as 'Unspecified'.
  paidVia: row.paid_via || undefined,
});

export const attendanceToDb = (a) => {
  const out = {
    session_id: a.classId,
    person_id: a.personId,
    attended: a.attended ?? true,
    payment_status: a.paymentStatus || 'unpaid',
    package_id: a.packageId || null,
  };
  if (a.paidAmount !== undefined) out.paid_amount = a.paidAmount;
  if (a.paidVia !== undefined) out.paid_via = a.paidVia;
  return out;
};

// ─── Interactions (DB) / "Notes" (UI) ────────────────────────────────────────
// The interactions table holds notes plus other communication kinds (email,
// call, meeting). The UI still uses "note" everywhere because note is the
// dominant kind and was the only kind originally. Other kinds are surfaced
// via the `kind` discriminator + optional direction/subject/duration_mins.
// DB column `session_id`; UI calls it `classId`.
// `subject` returns '' for form-binding convenience; externalId/threadId
// return null (not user-edited). durationMins normalised to number-or-null.

export const noteFromDb = (row) => ({
  id: row.id,
  personId: row.person_id || null,
  classId: row.session_id || null,
  projectId: row.project_id || null,
  text: row.text,
  important: row.important,
  date: row.date,
  actionDate: row.action_date || null,
  completed: row.completed,
  completedAt: row.completed_at || null,
  // Comms-logging fields: kind discriminator + future-proofing
  kind: row.kind || 'note',
  direction: row.direction || null,
  subject: row.subject || '',
  durationMins: row.duration_mins != null ? Number(row.duration_mins) : null,
  // Diary: start time (nullable) + which calendar this belongs to. time pairs
  // with durationMins to render a positioned block in WeekView. isPersonal
  // drives the personal/business calendar split and the greyed off-mode blocks.
  time: row.time || null,
  isPersonal: row.is_personal ?? false,
  // Named diary layer ('mine' / 'sienna' / 'rosie'). DB default 'mine'; only
  // meaningful for kind='diary' rows but harmless on others. Drives the
  // colour-coded calendar layering + show/hide toggles in personal mode.
  calendar: row.calendar || 'mine',
  // Diary repeat-group link. N entries created by one "repeat daily ×N" batch
  // share a UUID here so they can be deleted as a group. null for standalone
  // entries. Also the groundwork for future all-day multi-day events (a span is
  // just N consecutive all-day rows sharing a diary_group).
  diaryGroup: row.diary_group || null,
  externalId: row.external_id || null,
  threadId: row.thread_id || null,
  // Phase 8 Half A additions: raw addresses + ingestion source. fromEmail and
  // toEmail are stored even when person_id is set, so the inbox can show
  // "this came from X" and we keep audit trail post-assignment. source
  // discriminates how the row arrived ('manual' / 'worker' / 'form' / 'brevo').
  fromEmail: row.from_email || '',
  toEmail: row.to_email || '',
  rawHeaders: row.raw_headers || null,
  source: row.source || 'manual',
  // Threads: null = unread (never opened in Threads view). Set server-side
  // by notes.markThreadRead / notes.markRead. Backfilled to now() on migration
  // for all pre-existing email rows so they don't flood as "unread" on deploy.
  readAt: row.read_at || null,
  // created_at surfaced for stable same-day ordering (Threads timeline + Web
  // Activity feed). `date` is day-granularity only; createdAt is the tiebreaker.
  createdAt: row.created_at || null,
});

export const noteToDb = (n) => ({
  person_id: n.personId || null,
  session_id: n.classId || null,
  project_id: n.projectId || null,
  text: n.text,
  important: n.important ?? false,
  date: n.date,
  action_date: n.actionDate || null,
  completed: n.completed ?? false,
  completed_at: n.completedAt || null,
  // Comms-logging fields
  kind: n.kind || 'note',           // DB default is 'note'; belt-and-braces
  direction: n.direction || null,   // null for notes/meetings
  subject: n.subject || null,       // empty string → null on write
  duration_mins: n.durationMins !== undefined && n.durationMins !== null && n.durationMins !== ''
    ? parseInt(n.durationMins) : null,
  // Diary fields
  time: n.time || null,                  // '' / undefined → null
  is_personal: n.isPersonal ?? false,    // DB default false; belt-and-braces
  calendar: n.calendar || 'mine',        // DB default 'mine'; belt-and-braces
  diary_group: n.diaryGroup || null,     // repeat-batch link; null = standalone
  external_id: n.externalId || null,
  thread_id: n.threadId || null,
  // Phase 8 Half A additions
  from_email: n.fromEmail || null,  // empty string → null on write
  to_email: n.toEmail || null,
  raw_headers: n.rawHeaders || null,
  source: n.source || 'manual',     // DB default is 'manual'; belt-and-braces
  read_at: n.readAt || null,        // Threads read-state; null = unread
});

// Partial-patch mapper: only translates keys actually present in `patch`.
// Used by data.notes.patch() so untouched columns aren't overwritten.
// Mirrors notes.patch / classes.patch pattern. Specifically required for
// the unlinked-comms inbox: assignToPerson() patches just person_id without
// nulling out kind/direction/subject/etc.
export const notePatchToDb = (patch) => {
  const out = {};
  if (patch.personId !== undefined) out.person_id = patch.personId || null;
  if (patch.classId !== undefined) out.session_id = patch.classId || null;
  if (patch.projectId !== undefined) out.project_id = patch.projectId || null;
  if (patch.text !== undefined) out.text = patch.text;
  if (patch.important !== undefined) out.important = patch.important;
  if (patch.date !== undefined) out.date = patch.date;
  if (patch.actionDate !== undefined) out.action_date = patch.actionDate || null;
  if (patch.completed !== undefined) out.completed = patch.completed;
  if (patch.completedAt !== undefined) out.completed_at = patch.completedAt || null;
  if (patch.kind !== undefined) out.kind = patch.kind;
  if (patch.direction !== undefined) out.direction = patch.direction || null;
  if (patch.subject !== undefined) out.subject = patch.subject || null;
  if (patch.durationMins !== undefined) {
    out.duration_mins = patch.durationMins !== null && patch.durationMins !== ''
      ? parseInt(patch.durationMins) : null;
  }
  if (patch.externalId !== undefined) out.external_id = patch.externalId || null;
  if (patch.time !== undefined) out.time = patch.time || null;
  if (patch.isPersonal !== undefined) out.is_personal = patch.isPersonal ?? false;
  if (patch.calendar !== undefined) out.calendar = patch.calendar || 'mine';
  if (patch.diaryGroup !== undefined) out.diary_group = patch.diaryGroup || null;
  if (patch.threadId !== undefined) out.thread_id = patch.threadId || null;
  if (patch.fromEmail !== undefined) out.from_email = patch.fromEmail || null;
  if (patch.toEmail !== undefined) out.to_email = patch.toEmail || null;
  if (patch.rawHeaders !== undefined) out.raw_headers = patch.rawHeaders || null;
  if (patch.source !== undefined) out.source = patch.source;
  if (patch.readAt !== undefined) out.read_at = patch.readAt || null;
  return out;
};

// ─── Packages ────────────────────────────────────────────────────────────────
// Read from packages_with_usage view (gives sessions_remaining computed); write to packages base table.

export const packageFromDb = (row) => ({
  id: row.id,
  personId: row.person_id,
  type: row.type,
  name: row.name,
  totalSessions: row.total_sessions ?? 0,
  sessionsUsed: row.sessions_used ?? 0,
  amountPaid: Number(row.amount_paid) || 0,
  paidVia: row.paid_via || 'other',
  // MoveGB-style arrears billing: when set, attendances on this package are
  // billed to an org rather than settled by the person. null = person pays.
  billingOrgId: row.billing_org_id || null,
  datePurchased: row.date_purchased,
  // expires_at is a nullable DATE; '' keeps a date input controlled/blank.
  // null = never expires.
  expiresAt: row.expires_at || '',
  notes: row.notes || '',
  // From the view (will be undefined if loaded from base table):
  totalUsed: row.total_used,
  sessionsRemaining: row.sessions_remaining,
});

export const packageToDb = (pk) => ({
  person_id: pk.personId,
  type: pk.type || 'class_package',
  name: pk.name,
  total_sessions: parseInt(pk.totalSessions) || 0,
  sessions_used: parseInt(pk.sessionsUsed) || 0,
  amount_paid: parseFloat(pk.amountPaid) || 0,
  paid_via: pk.paidVia || 'other',
  // null when the person pays directly; org UUID for arrears billing (e.g. MoveGB)
  billing_org_id: pk.billingOrgId || null,
  date_purchased: pk.datePurchased,
  // empty string from the date input → null (Postgres DATE rejects '')
  expires_at: pk.expiresAt ? String(pk.expiresAt).trim() || null : null,
  notes: pk.notes || null,
});

// ─── Package templates ───────────────────────────────────────────────────────
// Canonical package definitions. Prefill source for AddPackageForm and (Phase 7)
// the Stripe webhook. owner_id is set DB-side (column default auth.uid()), so
// it's never written from the client — mirrors the projects pattern.
//   - validityDays: integer | null  (null = package never expires)
//   - defaultAmount: number | ''    (list-price prefill; '' when unset)
//   - stripePriceId: string | ''    (populated in Phase 7)
//   - active: bool                  (archived templates hidden from the picker)
export const packageTemplateFromDb = (row) => ({
  id: row.id,
  type: row.type || 'class_package',
  name: row.name,
  totalSessions: row.total_sessions ?? 0,
  defaultAmount: row.default_amount !== null && row.default_amount !== undefined
    ? Number(row.default_amount)
    : '',
  paidVia: row.paid_via || 'stripe_tfb',
  validityDays: row.validity_days ?? null,
  notes: row.notes || '',
  active: row.active ?? true,
  stripePriceId: row.stripe_price_id || '',
  position: row.position ?? 0,
  // Website publishing (online self-serve package sales).
  showOnWebsite: row.show_on_website ?? false,
  publicDescription: row.public_description || '',
  publicSlug: row.public_slug || '',
  createdAt: row.created_at,
});

export const packageTemplateToDb = (t) => ({
  type: t.type || 'class_package',
  name: t.name,
  total_sessions: parseInt(t.totalSessions) || 0,
  default_amount: numOrNull(t.defaultAmount),
  paid_via: t.paidVia || 'stripe_tfb',
  // validity_days: blank/0 from the input → null (never expires)
  validity_days: (t.validityDays === '' || t.validityDays === null || t.validityDays === undefined)
    ? null
    : (parseInt(t.validityDays) || null),
  notes: t.notes || null,
  active: t.active ?? true,
  stripe_price_id: t.stripePriceId ? String(t.stripePriceId).trim() || null : null,
  position: t.position ?? 0,
  // Website publishing. Slug normalised to lowercase kebab; blank → null so the
  // partial unique index (WHERE public_slug IS NOT NULL) ignores unpublished rows.
  show_on_website: t.showOnWebsite ?? false,
  public_description: t.publicDescription ? String(t.publicDescription).trim() || null : null,
  public_slug: t.publicSlug ? String(t.publicSlug).trim().toLowerCase() || null : null,
});

// ─── Invoices + Line Items ───────────────────────────────────────────────────
// Line items live in their own table; loader joins them in.

export const invoiceFromDb = (row, lineItems = []) => ({
  id: row.id,
  orgId: row.org_id,
  invoiceNumber: row.invoice_number,
  issueDate: row.issue_date,
  dueDate: row.due_date,
  status: row.status,
  paidDate: row.paid_date || null,
  notes: row.notes || '',
  total: Number(row.total) || 0,
  lineItems: lineItems
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(lineItemFromDb),
});

export const invoiceToDb = (inv) => ({
  org_id: inv.orgId,
  invoice_number: inv.invoiceNumber,
  issue_date: inv.issueDate,
  due_date: inv.dueDate,
  status: inv.status || 'draft',
  paid_date: inv.paidDate || null,
  notes: inv.notes || null,
  total: parseFloat(inv.total) || 0,
});

export const lineItemFromDb = (row) => ({
  id: row.id,
  description: row.description,
  classIds: Array.isArray(row.session_ids) ? row.session_ids : [],
  qty: Number(row.qty) || 1,
  rate: Number(row.rate) || 0,
  total: Number(row.total) || 0,
});

export const lineItemToDb = (li, invoiceId, position) => ({
  invoice_id: invoiceId,
  description: li.description,
  session_ids: Array.isArray(li.classIds) ? li.classIds : [],
  qty: parseFloat(li.qty) || 1,
  rate: parseFloat(li.rate) || 0,
  // total is GENERATED ALWAYS in the schema — Postgres rejects any write to it
  position: position ?? 0,
});

// ─── Yoga forms (UI: "forms") ────────────────────────────────────────────────

export const formFromDb = (row) => ({
  id: row.id,
  name: row.name,
  notes: row.notes || '',
  position: row.position ?? 0,
});

export const formToDb = (f) => ({
  name: f.name,
  notes: f.notes || null,
  position: f.position ?? 0,
});

// ─── Custom types (org_type_meta + person_role_meta) ─────────────────────────
// JSX uses these for user-defined org categories (Insurance, Banks...) and roles.
// Built-in rows have is_builtin=true and are filtered out — JSX has its own ORG_META
// and PERSON_ROLES constants for built-ins.

export const customOrgTypeFromDb = (row) => ({
  key: row.key,
  label: row.label,
  color: row.color,
  bg: row.bg,
  icon: row.icon || '◇',
});

export const customOrgTypeToDb = (t) => ({
  key: t.key,
  label: t.label,
  color: t.color,
  bg: t.bg,
  icon: t.icon || '◇',
  is_builtin: false,
});

export const customPersonRoleFromDb = (row) => ({
  key: row.key,
  label: row.label,
  color: row.color,
  bg: row.bg,
  parentKey: row.parent_key || null,
});

export const customPersonRoleToDb = (t, ownerId) => ({
  key: t.key,
  label: t.label,
  color: t.color,
  bg: t.bg,
  parent_key: t.parentKey || null,
  is_builtin: false,
  // Explicit owner_id (belt-and-braces alongside the column DEFAULT auth.uid()).
  // Only included when supplied so SQL-editor/other callers aren't forced to.
  ...(ownerId ? { owner_id: ownerId } : {}),
});

// Likewise for role parents — set owner explicitly when we have it.
export const roleParentToDb = (p, ownerId) => ({
  key: p.key,
  label: p.label,
  position: p.position ?? 0,
  ...(ownerId ? { owner_id: ownerId } : {}),
});

// ─── Role parents (lookup table; the category layer above person roles) ──────
export const roleParentFromDb = (row) => ({
  key: row.key,
  label: row.label,
  position: row.position ?? 0,
});

// ─── Org contacts (people <-> orgs working-relationships junction) ───────────
// Models WORKING roles a person plays for an organisation (primary/billing/
// admin/other contact). Distinct from people.org_id, which models residency /
// membership. A single person can have multiple rows for the same org with
// different roles. Keys stay snake_case-equivalent and roles are constrained
// at the DB level by a CHECK constraint — see migration.

export const orgContactFromDb = (row) => ({
  id: row.id,
  orgId: row.org_id,
  personId: row.person_id,
  role: row.role || 'other',
  createdAt: row.created_at,
});

export const orgContactToDb = (oc) => ({
  org_id: oc.orgId,
  person_id: oc.personId,
  role: oc.role || 'other',
});

// ─── Households (people <-> people grouping) ─────────────────────────────────
// A household is a lightweight grouping of related people (a family, a couple,
// a child and their parents). Distinct from both people.org_id (membership /
// residency) and org_contacts (working roles for an org). A household carries
// no billing or class weight — it exists purely so related contacts can be
// seen together. Members join through the household_members junction, mirroring
// the org_contacts pattern. The `relationship` is constrained at the DB level
// by a CHECK constraint (see migration): adult/child/partner/parent/guardian/
// friend/grandparent/other.

export const householdFromDb = (row) => ({
  id: row.id,
  name: row.name,
  notes: row.notes || '',
  createdAt: row.created_at,
});

export const householdToDb = (h) => ({
  name: h.name,
  notes: h.notes || null,
});

export const householdMemberFromDb = (row) => ({
  id: row.id,
  householdId: row.household_id,
  personId: row.person_id,
  relationship: row.relationship || 'other',
  createdAt: row.created_at,
});

export const householdMemberToDb = (m) => ({
  household_id: m.householdId,
  person_id: m.personId,
  relationship: m.relationship || 'other',
});

// ─── Contact dates (anniversaries + dated events on people OR orgs) ──────────
// A contact_date is an extra dated event attached to a person or an org —
// distinct from people.date_of_birth (the single birthday, which stays on the
// person row). A row carries free-text `label` ("Wedding", "Met", "Contract
// renewal"), a `date`, and a `recurring` flag (true = repeats annually like an
// anniversary, false = one-off). The DB CHECK enforces exactly one anchor:
// person_id XOR org_id. owner_id defaults to auth.uid() on the DB side, so the
// mapper never writes it (client writes are authenticated). createdAt is
// read-only from the DB.
export const contactDateFromDb = (row) => ({
  id: row.id,
  personId: row.person_id || null,
  orgId: row.org_id || null,
  label: row.label || '',
  date: row.date || '',
  recurring: row.recurring ?? true,
  note: row.note || '',
  createdAt: row.created_at,
});

// Writes whichever anchor is set. The caller supplies exactly one of
// personId / orgId; the other resolves to null and the DB CHECK guards it.
export const contactDateToDb = (d) => ({
  person_id: d.personId || null,
  org_id: d.orgId || null,
  label: (d.label || '').trim(),
  // empty string from a date input → null is invalid here (date is NOT NULL),
  // so callers must supply a real date; we still guard the empty case to null
  // to surface a clean DB error rather than writing ''.
  date: d.date ? String(d.date).trim() || null : null,
  recurring: d.recurring ?? true,
  note: d.note ? String(d.note).trim() || null : null,
});

// ─── Settings (generic key-value store) ──────────────────────────────────────
// Single source of truth for app config that needs to be editable without
// a code redeploy. value is jsonb on the DB side, parsed shape on the UI
// side (whatever the consumer expects for that key).
//
// Today's keys:
//   'my_addresses' — array of strings, the operator's own email addresses.
//     Consumed by data.notes.assignToPerson() to skip auto-adding "your own"
//     addresses as new emails on a contact when triaging the inbox.
//
// Future keys: invoice prefix, default rate, signature template, etc.

export const settingFromDb = (row) => ({
  key: row.key,
  value: row.value,
  updatedAt: row.updated_at,
});

export const settingToDb = (s) => ({
  key: s.key,
  value: s.value,
});

// ─── Projects ────────────────────────────────────────────────────────────────
// Top-level "your work" entity. interactions.project_id links todos/notes to a
// project. status is 'active' | 'done'; completed_at stamped app-side on the
// active→done transition (see data.projects.update). owner_id is set DB-side by
// the column default auth.uid(), so it's never written from the client.
export const projectFromDb = (row) => ({
  id: row.id,
  name: row.name,
  status: row.status || 'active',
  notes: row.notes || '',
  isPersonal: row.is_personal ?? false,
  createdAt: row.created_at,
  completedAt: row.completed_at || null,
});

export const projectToDb = (p) => ({
  name: p.name,
  status: p.status || 'active',
  notes: p.notes || null,        // empty string → null on write
  is_personal: p.isPersonal ?? false,
  completed_at: p.completedAt || null,
});

// ─── Files (stored documents / photos) ───────────────────────────────────────
// One row per object in Supabase Storage. The binary lives in the bucket; this
// row is the metadata + pointer (path within the bucket) + optional anchor.
//
// Anchor: zero or one of personId / orgId / interactionId. All-null = a general
// (unattached) document. We do NOT enforce XOR — "general" is legitimate and a
// doc may sensibly relate to both a person and an interaction. The data layer
// sets whichever anchor applies at upload time.
//
// owner_id defaults to auth.uid() DB-side (authenticated client writes), so the
// mapper never writes it — mirrors projects / contact_dates. bucket, path,
// filename, mimeType, sizeBytes are set once at upload and not edited after;
// only `label` and the anchor are mutable via fileToDb. createdAt is read-only.
//
// store ('supabase' | 'r2') says where the BYTES live: 'supabase' = the
// client-documents Storage bucket (manual uploads, signed URLs); 'r2' = the
// feltbody-attachments R2 bucket (email attachments, served/deleted via the
// forms-worker /file/:id endpoints). Set once at creation, like bucket/path.
// Workers write their own rows; this mapper only sees 'r2' rows on read.
export const fileFromDb = (row) => ({
  id: row.id,
  store: row.store || 'supabase',
  bucket: row.bucket || 'client-documents',
  path: row.path,
  filename: row.filename,
  mimeType: row.mime_type || '',
  sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : null,
  label: row.label || '',
  personId: row.person_id || null,
  orgId: row.org_id || null,
  interactionId: row.interaction_id || null,
  createdAt: row.created_at,
});

// Write shape. Used for the initial insert (all fields) and for label/anchor
// edits (the immutable upload fields are simply re-sent unchanged). owner_id
// omitted intentionally — DB default fills it.
export const fileToDb = (f) => ({
  store: f.store || 'supabase',
  bucket: f.bucket || 'client-documents',
  path: f.path,
  filename: f.filename,
  mime_type: f.mimeType || null,
  size_bytes: f.sizeBytes ?? null,
  label: f.label ? String(f.label).trim() || null : null,
  person_id: f.personId || null,
  org_id: f.orgId || null,
  interaction_id: f.interactionId || null,
});
