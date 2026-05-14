// Data access layer. Single concern: translate between Supabase tables and the
// JSX object shape via the mappers, and surface clean async functions.
//
// Pattern: every mutation returns the saved row in JSX shape. Callers wait for
// the return, then update local React state with the server-confirmed value.
// This makes IDs always real (gen_random_uuid from the DB), avoids the "what if
// the optimistic update conflicts with a server change" problem, and keeps the
// component-level code simple.
//
// Read paths use the active_* views where they exist (organisations, people,
// invoices, interactions) so soft-deleted rows are filtered out automatically.
// Write paths target the base tables. Deletes set deleted_at = now() on tables
// with soft-delete (organisations, people, invoices, interactions, packages,
// package_uses); hard-delete on the rest (attendance, sessions, yoga_forms,
// series, person_roles, custom type tables).

import { supabase } from './supabase.js';
import {
  orgFromDb, orgToDb,
  personFromDb, personToDb,
  seriesFromDb, seriesToDb,
  classFromDb, classToDb, classPatchToDb,
  attendanceFromDb, attendanceToDb,
  noteFromDb, noteToDb,
  packageFromDb, packageToDb,
  invoiceFromDb, invoiceToDb, lineItemToDb,
  formFromDb, formToDb,
  customOrgTypeFromDb, customOrgTypeToDb,
  customPersonRoleFromDb, customPersonRoleToDb,
} from './mappers.js';;

// Throw on any Supabase error so callers (and React error boundaries) see
// failures clearly instead of silently getting empty results.
const ok = ({ data, error }) => {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
};

// ─── Initial bulk load ───────────────────────────────────────────────────────
// One call after auth. Issues all queries in parallel; returns the eleven
// arrays the JSX expects, plus the customOrgTypes and customPersonRoles arrays.
//
// Two joins happen in JS rather than the DB:
//   1. person_roles -> person.roles[]   (group rows by person_id)
//   2. invoice_line_items -> invoice.lineItems[]   (group rows by invoice_id)
// Both are simple and run on small data volumes (<1000 rows in production for
// a single-practitioner CRM).

export async function loadAll() {
  const [
    orgRows,
    personRows,
    personRoleRows,
    seriesRows,
    sessionRows,
    attendanceRows,
    interactionRows,
    packageRows,
    invoiceRows,
    lineItemRows,
    formRows,
    orgTypeMetaRows,
    personRoleMetaRows,
  ] = await Promise.all([
    supabase.from('active_organisations').select('*').order('name').then(ok),
    supabase.from('active_people').select('*').order('name').then(ok),
    supabase.from('person_roles').select('person_id, role_key').then(ok),
    supabase.from('series').select('*').order('start_date', { ascending: false }).then(ok),
    supabase.from('sessions').select('*').order('date', { ascending: false }).then(ok),
    supabase.from('attendance').select('*').then(ok),
    supabase.from('interactions').select('*').is('deleted_at', null)
      .order('date', { ascending: false }).then(ok),
    supabase.from('packages_with_usage').select('*').is('deleted_at', null)
      .order('date_purchased', { ascending: false }).then(ok),
    supabase.from('active_invoices').select('*')
      .order('issue_date', { ascending: false }).then(ok),
    supabase.from('invoice_line_items').select('*').then(ok),
    supabase.from('yoga_forms').select('*').order('position').then(ok),
    supabase.from('org_type_meta').select('*').eq('is_builtin', false)
      .order('created_at').then(ok),
    supabase.from('person_role_meta').select('*').eq('is_builtin', false)
      .order('created_at').then(ok),
  ]);

  // Group person_roles by person_id -> array of role keys
  const rolesByPerson = personRoleRows.reduce((acc, r) => {
    (acc[r.person_id] ||= []).push(r.role_key);
    return acc;
  }, {});

  // Group line items by invoice_id
  const linesByInvoice = lineItemRows.reduce((acc, r) => {
    (acc[r.invoice_id] ||= []).push(r);
    return acc;
  }, {});

  return {
    orgs: orgRows.map(orgFromDb),
    people: personRows.map((r) => personFromDb(r, rolesByPerson[r.id] || [])),
    series: seriesRows.map(seriesFromDb),
    classes: sessionRows.map(classFromDb),
    attendance: attendanceRows.map(attendanceFromDb),
    notes: interactionRows.map(noteFromDb),
    packages: packageRows.map(packageFromDb),
    invoices: invoiceRows.map((r) => invoiceFromDb(r, linesByInvoice[r.id] || [])),
    forms: formRows.map(formFromDb),
    customOrgTypes: orgTypeMetaRows.map(customOrgTypeFromDb),
    customPersonRoles: personRoleMetaRows.map(customPersonRoleFromDb),
  };
}

// ─── Helper for soft-delete (mark deleted_at) ────────────────────────────────
const softDelete = async (table, id) => {
  await supabase.from(table).update({ deleted_at: new Date().toISOString() })
    .eq('id', id).then(ok);
};

// ─── Organisations ───────────────────────────────────────────────────────────
// Reads use active_organisations view; writes target the organisations table.
// Soft-delete sets deleted_at; the view filters it out on next load.

export const orgs = {
  async create(o) {
    const row = await supabase.from('organisations').insert(orgToDb(o))
      .select().single().then(ok);
    return orgFromDb(row);
  },
  async update(id, o) {
    const row = await supabase.from('organisations').update(orgToDb(o))
      .eq('id', id).select().single().then(ok);
    return orgFromDb(row);
  },
  delete: (id) => softDelete('organisations', id),
};

// ─── People (with role junction handling) ────────────────────────────────────
// Roles are managed atomically with the person row: on create/update we
// insert/delete person_roles entries to match the array. Two queries instead
// of one, but keeps the UI's roles-as-array model intact.

export const people = {
  async create(p) {
    const row = await supabase.from('people').insert(personToDb(p))
      .select().single().then(ok);
    if (p.roles?.length) {
      await supabase.from('person_roles').insert(
        p.roles.map((role_key) => ({ person_id: row.id, role_key }))
      ).then(ok);
    }
    return personFromDb(row, p.roles || []);
  },
  async update(id, p) {
    const row = await supabase.from('people').update(personToDb(p))
      .eq('id', id).select().single().then(ok);
    // Replace role set: delete all then re-insert. Cheaper and simpler than diffing.
    await supabase.from('person_roles').delete().eq('person_id', id).then(ok);
    if (p.roles?.length) {
      await supabase.from('person_roles').insert(
        p.roles.map((role_key) => ({ person_id: id, role_key }))
      ).then(ok);
    }
    return personFromDb(row, p.roles || []);
  },
  delete: (id) => softDelete('people', id),
};

// ─── Series ──────────────────────────────────────────────────────────────────
export const series = {
  async create(s) {
    const row = await supabase.from('series').insert(seriesToDb(s))
      .select().single().then(ok);
    return seriesFromDb(row);
  },
  async update(id, s) {
    const row = await supabase.from('series').update(seriesToDb(s))
      .eq('id', id).select().single().then(ok);
    return seriesFromDb(row);
  },
  async delete(id) {
    await supabase.from('series').delete().eq('id', id).then(ok);
  },
};

// ─── Classes (DB: sessions) ──────────────────────────────────────────────────
export const classes = {
  async create(c) {
    const row = await supabase.from('sessions').insert(classToDb(c))
      .select().single().then(ok);
    return classFromDb(row);
  },
  // Used by both single-class edit and the "edit this and future" path
  async update(id, c) {
    const row = await supabase.from('sessions').update(classToDb(c))
      .eq('id', id).select().single().then(ok);
    return classFromDb(row);
  },
  // Targeted partial-field update (reflection, forms_worked, etc.) without
  // round-tripping the whole row through classToDb. Mirrors notes.patch.
  // Caller passes UI-shaped keys (reflection, formsWorked, ...); the mapper
  // translates only the keys that are present.
  async patch(id, patch) {
    const row = await supabase.from('sessions').update(classPatchToDb(patch))
      .eq('id', id).select().single().then(ok);
    return classFromDb(row);
  },
  // Bulk update for "edit this and future in series".
  // Conditional keys: only fields actually present in `patch` are propagated.
  // `date`, `notes`, `reflection`, `forms_worked`, `series_id` are deliberately
  // NOT in the whitelist — they're per-instance and must never propagate.
  async updateFutureInSeries(seriesId, fromDate, patch) {
    const propagatePatch = {};
    if (patch.name !== undefined) propagatePatch.name = patch.name;
    if (patch.time !== undefined) propagatePatch.start_time = patch.time || null;
    if (patch.duration !== undefined) propagatePatch.duration_minutes = parseInt(patch.duration) || 60;
    if (patch.location !== undefined) propagatePatch.location = patch.location || null;
    if (patch.orgId !== undefined) propagatePatch.organisation_id = patch.orgId || null;
    if (patch.rate !== undefined) propagatePatch.rate = parseFloat(patch.rate) || 0;
    if (patch.paymentModel !== undefined) propagatePatch.payment_model = patch.paymentModel || 'per_person';

    // Guard: if a caller passes an empty or fully-undefined patch, Supabase would
    // run a no-op update across every future row in the series. Bail early.
    if (Object.keys(propagatePatch).length === 0) return [];

    const rows = await supabase.from('sessions').update(propagatePatch)
      .eq('series_id', seriesId).gte('date', fromDate)
      .select().then(ok);
    return rows.map(classFromDb);
  },
  // Hard delete; FK on attendance is ON DELETE CASCADE so register entries go too.
  // Caller checks "no register entries" before calling, so cascade is a safety net.
  async delete(id) {
    await supabase.from('sessions').delete().eq('id', id).then(ok);
  },
  // Bulk insert for series instance generation
  async createMany(arr) {
    const rows = await supabase.from('sessions').insert(arr.map(classToDb))
      .select().then(ok);
    return rows.map(classFromDb);
  },
};

// ─── Attendance ──────────────────────────────────────────────────────────────
// No soft-delete; attendance toggles freely. The class_detail UI updates rows
// in place; toggling attendance is a single PATCH.

export const attendance = {
  async create(a) {
    const row = await supabase.from('attendance').insert(attendanceToDb(a))
      .select().single().then(ok);
    return attendanceFromDb(row);
  },
  async update(id, a) {
    const row = await supabase.from('attendance').update(attendanceToDb(a))
      .eq('id', id).select().single().then(ok);
    return attendanceFromDb(row);
  },
  // Used when payment status changes — clear fields appropriately
  async setPayment(id, patch) {
    const dbPatch = { payment_status: patch.paymentStatus };
    if (patch.paymentStatus === 'paid') {
      dbPatch.paid_amount = patch.paidAmount ?? 0;
      dbPatch.package_id = null;
    } else if (patch.paymentStatus === 'package') {
      dbPatch.package_id = patch.packageId;
      dbPatch.paid_amount = null;
    } else {
      dbPatch.package_id = null;
      dbPatch.paid_amount = null;
    }
    const row = await supabase.from('attendance').update(dbPatch)
      .eq('id', id).select().single().then(ok);
    return attendanceFromDb(row);
  },
  async delete(id) {
    await supabase.from('attendance').delete().eq('id', id).then(ok);
  },
};

// ─── Notes (DB: interactions) ────────────────────────────────────────────────
export const notes = {
  async create(n) {
    const row = await supabase.from('interactions').insert(noteToDb(n))
      .select().single().then(ok);
    return noteFromDb(row);
  },
  async update(id, n) {
    const row = await supabase.from('interactions').update(noteToDb(n))
      .eq('id', id).select().single().then(ok);
    return noteFromDb(row);
  },
  // Targeted patch for toggle/complete/action-date — avoids round-tripping the whole row
  async patch(id, dbPatch) {
    const row = await supabase.from('interactions').update(dbPatch)
      .eq('id', id).select().single().then(ok);
    return noteFromDb(row);
  },
  delete: (id) => softDelete('interactions', id),
};

// ─── Packages ────────────────────────────────────────────────────────────────
export const packages = {
  async create(pk) {
    const row = await supabase.from('packages').insert(packageToDb(pk))
      .select().single().then(ok);
    return packageFromDb(row);
  },
  async update(id, pk) {
    const row = await supabase.from('packages').update(packageToDb(pk))
      .eq('id', id).select().single().then(ok);
    return packageFromDb(row);
  },
  // Quick-action: increment/decrement the manual sessions_used counter.
  // Returns the updated row so the UI can reconcile against any server-side clamping.
  async setSessionsUsed(id, value) {
    const row = await supabase.from('packages').update({ sessions_used: Math.max(0, value) })
      .eq('id', id).select().single().then(ok);
    return packageFromDb(row);
  },
  delete: (id) => softDelete('packages', id),
};

// ─── Invoices + Line Items ───────────────────────────────────────────────────
// Invoice + lines are saved together. On update we delete-all-and-reinsert lines —
// simpler than diffing, and line counts per invoice are small (<20 typically).
// Wrapping these in a transaction would be ideal; PostgREST doesn't support
// multi-statement transactions, so we accept the small inconsistency window.
// In practice, RLS means a partial failure leaves the user looking at a stale
// view that loadAll() corrects on next refresh.

export const invoices = {
  async create(inv) {
    const row = await supabase.from('invoices').insert(invoiceToDb(inv))
      .select().single().then(ok);
    let lines = [];
    if (inv.lineItems?.length) {
      lines = await supabase.from('invoice_line_items').insert(
        inv.lineItems.map((li, i) => lineItemToDb(li, row.id, i))
      ).select().then(ok);
    }
    return invoiceFromDb(row, lines);
  },
  async update(id, inv) {
    const row = await supabase.from('invoices').update(invoiceToDb(inv))
      .eq('id', id).select().single().then(ok);
    await supabase.from('invoice_line_items').delete().eq('invoice_id', id).then(ok);
    let lines = [];
    if (inv.lineItems?.length) {
      lines = await supabase.from('invoice_line_items').insert(
        inv.lineItems.map((li, i) => lineItemToDb(li, id, i))
      ).select().then(ok);
    }
    return invoiceFromDb(row, lines);
  },
  // Status change is the most common edit — its own targeted method
  async setStatus(id, status) {
    const row = await supabase.from('invoices').update({ status })
      .eq('id', id).select().single().then(ok);
    // Return shape needs lineItems; caller should already have them in state.
    // Returning without lines forces UI to merge the patch instead of replacing wholesale.
    return { id: row.id, status: row.status };
  },
  delete: (id) => softDelete('invoices', id),
};

// ─── Forms (DB: yoga_forms) ──────────────────────────────────────────────────
// Hard-delete; small list, no audit need.

export const forms = {
  async create(f) {
    const row = await supabase.from('yoga_forms').insert(formToDb(f))
      .select().single().then(ok);
    return formFromDb(row);
  },
  async update(id, f) {
    const row = await supabase.from('yoga_forms').update(formToDb(f))
      .eq('id', id).select().single().then(ok);
    return formFromDb(row);
  },
  // Reorder: receives the full ordered list, writes new positions.
  // PostgREST batch-update needs an upsert; cheaper to do N updates serially
  // for small lists (typical: <20 forms).
  async reorder(orderedList) {
    await Promise.all(orderedList.map((f, i) =>
      supabase.from('yoga_forms').update({ position: i }).eq('id', f.id).then(ok)
    ));
  },
  async delete(id) {
    await supabase.from('yoga_forms').delete().eq('id', id).then(ok);
  },
};

// ─── Custom org types and person roles ───────────────────────────────────────
// These are stored in *_meta tables with is_builtin flag; we only ever
// create/delete the user-defined (is_builtin=false) ones.

export const customOrgTypes = {
  async create(t) {
    const row = await supabase.from('org_type_meta').insert(customOrgTypeToDb(t))
      .select().single().then(ok);
    return customOrgTypeFromDb(row);
  },
  async delete(key) {
    await supabase.from('org_type_meta').delete()
      .eq('key', key).eq('is_builtin', false).then(ok);
  },
};

export const customPersonRoles = {
  async create(t) {
    const row = await supabase.from('person_role_meta').insert(customPersonRoleToDb(t))
      .select().single().then(ok);
    return customPersonRoleFromDb(row);
  },
  async delete(key) {
    await supabase.from('person_role_meta').delete()
      .eq('key', key).eq('is_builtin', false).then(ok);
  },
};
