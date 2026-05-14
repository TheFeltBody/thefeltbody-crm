// Mappers: DB row shape <-> JSX object shape.
//
// The schema and the React UI grew in parallel and diverge in a few spots:
//   - DB columns are snake_case; UI uses camelCase
//   - DB has `org_id` on most tables but `organisation_id` on `payments` and `sessions`
//     (existing schema drift; we normalise both to `orgId` for the UI)
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
  contactName: row.contact_name || '',
  notes: row.notes || '',
  invoiceCounter: row.invoice_counter ?? 0,
});

export const orgToDb = (o) => ({
  name: o.name,
  type: o.type || 'other',
  address: o.address || null,
  phone: o.phone || null,
  email: o.email || null,
  contact_name: o.contactName || null,
  notes: o.notes || null,
});

// ─── People ──────────────────────────────────────────────────────────────────

// Roles come from a separate query against person_roles; caller passes them in.
export const personFromDb = (row, roles = []) => ({
  id: row.id,
  name: row.name,
  email: row.email || '',
  phone: row.phone || '',
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
  defaultSessionRate: row.default_session_rate,
  rateNotes: row.rate_notes,
});

export const personToDb = (p) => ({
  name: p.name,
  email: p.email || null,
  phone: p.phone || null,
  org_id: p.orgId || null,
  status: p.status || 'active',
  source_channel: p.source?.channel || 'manual',
  source_detail: p.source?.detail || null,
  notes: p.notes || null,
  do_not_email: p.doNotEmail ?? false,
  is_active_student: p.isActiveStudent ?? false,
  default_session_rate: p.defaultSessionRate ?? null,
  rate_notes: p.rateNotes ?? null, 
});

// ─── Series ──────────────────────────────────────────────────────────────────

export const seriesFromDb = (row) => ({
  id: row.id,
  name: row.name,
  recurrence: row.recurrence,
  location: row.location || '',
  orgId: row.org_id || null,
  startDate: row.start_date,
  time: row.time_of_day || '',
  duration: row.duration_mins ?? 60,
  rate: Number(row.rate) || 0,
  rateType: row.rate_type || 'per_class',
  paymentModel: row.payment_model || 'per_person',
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
  time: row.start_time || '',
  duration: row.duration_minutes ?? 60,
  location: row.location || '',
  orgId: row.organisation_id || null,
  seriesId: row.series_id || null,
  rate: Number(row.rate) || 0,
  paymentModel: row.payment_model || 'per_person',
  notes: row.notes || '',
  reflection: row.reflection || '',
  formsWorked: Array.isArray(row.forms_worked) ? row.forms_worked : [],
});

export const classToDb = (c) => ({
  name: c.name,
  date: c.date,
  start_time: c.time || null,
  duration_minutes: parseInt(c.duration) || 60,
  location: c.location || null,
  organisation_id: c.orgId || null,
  series_id: c.seriesId || null,
  rate: parseFloat(c.rate) || 0,
  payment_model: c.paymentModel || 'per_person',
  notes: c.notes || null,
  reflection: c.reflection || null,
  forms_worked: Array.isArray(c.formsWorked) ? c.formsWorked : [],
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
  if (patch.orgId !== undefined) out.organisation_id = patch.orgId || null;
  if (patch.seriesId !== undefined) out.series_id = patch.seriesId || null;
  if (patch.rate !== undefined) out.rate = parseFloat(patch.rate) || 0;
  if (patch.paymentModel !== undefined) out.payment_model = patch.paymentModel || 'per_person';
  if (patch.notes !== undefined) out.notes = patch.notes || null;
  if (patch.reflection !== undefined) out.reflection = patch.reflection || null;
  if (patch.formsWorked !== undefined) {
    out.forms_worked = Array.isArray(patch.formsWorked) ? patch.formsWorked : [];
  }
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
  return out;
};

// ─── Notes (UI: "notes") / Interactions (DB) ─────────────────────────────────
// DB column `session_id`; UI calls it `classId`.

export const noteFromDb = (row) => ({
  id: row.id,
  personId: row.person_id || null,
  classId: row.session_id || null,
  text: row.text,
  important: row.important,
  date: row.date,
  actionDate: row.action_date || null,
  completed: row.completed,
  completedAt: row.completed_at || null,
});

export const noteToDb = (n) => ({
  person_id: n.personId || null,
  session_id: n.classId || null,
  text: n.text,
  important: n.important ?? false,
  date: n.date,
  action_date: n.actionDate || null,
  completed: n.completed ?? false,
  completed_at: n.completedAt || null,
});

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
  datePurchased: row.date_purchased,
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
  date_purchased: pk.datePurchased,
  notes: pk.notes || null,
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
});

export const customPersonRoleToDb = (t) => ({
  key: t.key,
  label: t.label,
  color: t.color,
  bg: t.bg,
  is_builtin: false,
});
