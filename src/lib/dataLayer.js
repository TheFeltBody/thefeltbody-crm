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
  noteFromDb, noteToDb, notePatchToDb,
  packageFromDb, packageToDb,
  packageTemplateFromDb, packageTemplateToDb,
  invoiceFromDb, invoiceToDb, lineItemToDb,
  formFromDb, formToDb,
  customOrgTypeFromDb, customOrgTypeToDb,
  customPersonRoleFromDb, customPersonRoleToDb,
  roleParentFromDb, roleParentToDb,
  orgContactFromDb, orgContactToDb,
  householdFromDb, householdToDb,
  householdMemberFromDb, householdMemberToDb,
  contactDateFromDb, contactDateToDb,
  emailFromDb, emailToDb,
  settingFromDb,
  projectFromDb, projectToDb,
  fileFromDb, fileToDb,
} from './mappers.js';;

// Throw on any Supabase error so callers (and React error boundaries) see
// failures clearly instead of silently getting empty results.
const ok = ({ data, error }) => {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
};

// Fetch ALL rows past PostgREST's 1000-row cap by paging with .range().
// PostgREST returns at most 1000 rows per request regardless of how many match,
// so an unbounded .select() silently truncates once a table crosses 1000 rows —
// dropped rows simply never reach the client (e.g. a person past row 1000 loads
// with no role and falls back to the default). We loop with .range() until a
// short page signals the end. `tweak` applies any per-page filters/ordering
// (needed for the view-backed reads that order/filter).
async function fetchAll(table, columns = '*', tweak = null) {
  const PAGE = 1000;
  let from = 0;
  let out = [];
  for (;;) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (tweak) q = tweak(q);
    const rows = await q.then(ok);
    out = out.concat(rows);
    if (rows.length < PAGE) break;   // last (short) page reached
    from += PAGE;
  }
  return out;
}

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
    personEmailRows,
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
    builtinRoleMetaRows,
    orgContactRows,
    householdRows,
    householdMemberRows,
    contactDateRows,
    settingRows,
    projectRows,
    packageTemplateRows,
    fileRows,
    roleParentRows,
  ] = await Promise.all([
    supabase.from('active_organisations').select('*').order('name').then(ok),
    // Ranged reads: these tables cross (or are near) PostgREST's 1000-row cap.
    // Plain .select() would silently drop rows past 1000 — see fetchAll above.
    fetchAll('active_people', '*', q => q.order('name')),
    fetchAll('person_roles', 'person_id, role_key'),
    fetchAll('people_emails', '*', q => q.order('created_at')),
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
    supabase.from('person_role_meta').select('*').eq('is_builtin', true)
      .order('key').then(ok),
    supabase.from('org_contacts').select('*').order('created_at').then(ok),
    supabase.from('households').select('*').order('name').then(ok),
    supabase.from('household_members').select('*').order('created_at').then(ok),
    supabase.from('contact_dates').select('*').order('date').then(ok),
    supabase.from('settings').select('*').then(ok),
    supabase.from('projects').select('*').order('created_at', { ascending: false }).then(ok),
    supabase.from('package_templates').select('*').order('position').then(ok),
    supabase.from('active_files').select('*').order('created_at', { ascending: false }).then(ok),
    supabase.from('role_parents').select('*').order('position').then(ok),
  ]);

  // Group person_roles by person_id -> array of role keys
  const rolesByPerson = personRoleRows.reduce((acc, r) => {
    (acc[r.person_id] ||= []).push(r.role_key);
    return acc;
  }, {});

  // Group people_emails by person_id -> array of email rows (raw, mapper handles shape)
  const emailsByPerson = personEmailRows.reduce((acc, r) => {
    (acc[r.person_id] ||= []).push(r);
    return acc;
  }, {});

  // Group line items by invoice_id
  const linesByInvoice = lineItemRows.reduce((acc, r) => {
    (acc[r.invoice_id] ||= []).push(r);
    return acc;
  }, {});

  // Reshape settings rows into a plain object keyed by setting name, so
  // consumers can do `state.settings.my_addresses` rather than searching
  // an array. Each value is already-parsed jsonb (Supabase returns parsed
  // JSON for jsonb columns). Missing keys are simply absent — consumers
  // should fall back to a sensible default.
  const settingsByKey = settingRows.reduce((acc, r) => {
    acc[r.key] = r.value;
    return acc;
  }, {});

  return {
    orgs: orgRows.map(orgFromDb),
    people: personRows.map((r) =>
      personFromDb(r, rolesByPerson[r.id] || [], emailsByPerson[r.id] || [])),
    series: seriesRows.map(seriesFromDb),
    classes: sessionRows.map(classFromDb),
    attendance: attendanceRows.map(attendanceFromDb),
    notes: interactionRows.map(noteFromDb),
    packages: packageRows.map(packageFromDb),
    invoices: invoiceRows.map((r) => invoiceFromDb(r, linesByInvoice[r.id] || [])),
    forms: formRows.map(formFromDb),
    customOrgTypes: orgTypeMetaRows.map(customOrgTypeFromDb),
    customPersonRoles: personRoleMetaRows.map(customPersonRoleFromDb),
    // Built-in roles that have been edited (label/colour) live as is_builtin=true
    // rows in person_role_meta. They override the hardcoded PERSON_ROLES seed via
    // buildPersonRoles. Kept separate from customPersonRoles so the sidebar/merge
    // logic, which treats that array as "user-created roles only", is undisturbed.
    builtinPersonRoles: builtinRoleMetaRows.map(customPersonRoleFromDb),
    roleParents: roleParentRows.map(roleParentFromDb),
    orgContacts: orgContactRows.map(orgContactFromDb),
    households: householdRows.map(householdFromDb),
    householdMembers: householdMemberRows.map(householdMemberFromDb),
    contactDates: contactDateRows.map(contactDateFromDb),
    settings: settingsByKey,
    projects: projectRows.map(projectFromDb),
    packageTemplates: packageTemplateRows.map(packageTemplateFromDb),
    files: fileRows.map(fileFromDb),
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

// ─── People (with role + email junction handling) ────────────────────────────
// Roles are managed atomically with the person row: on create/update we
// insert/delete person_roles entries to match the array. Same approach for
// emails (people_emails): on create we seed initial emails if provided.
// Subsequent email edits go through the data.peopleEmails module so the UI
// can add/remove/star without round-tripping the whole person.

// Internal helper — fetch all emails for a person and return as raw rows
// (the personFromDb mapper handles the shape conversion).
async function _fetchEmailsForPerson(personId) {
  const rows = await supabase.from('people_emails')
    .select('*').eq('person_id', personId).order('created_at').then(ok);
  return rows;
}

export const people = {
  async create(p) {
    const row = await supabase.from('people').insert(personToDb(p))
      .select().single().then(ok);
    if (p.roles?.length) {
      await supabase.from('person_roles').insert(
        p.roles.map((role_key) => ({ person_id: row.id, role_key }))
      ).then(ok);
    }
    // Seed emails. Accepts either p.emails (preferred — array of {email, isPrimary, source})
    // or a legacy single p.email string (backfill convenience).
    let seedEmails = [];
    if (Array.isArray(p.emails) && p.emails.length) {
      seedEmails = p.emails
        .map(e => ({ ...e, personId: row.id }))
        .filter(e => (e.email || '').trim());
    } else if (typeof p.email === 'string' && p.email.trim()) {
      seedEmails = [{ personId: row.id, email: p.email.trim(), isPrimary: true, source: 'manual' }];
    }
    // Force exactly one primary if we have any emails (first one wins if no flag set)
    if (seedEmails.length) {
      const hasPrimary = seedEmails.some(e => e.isPrimary);
      if (!hasPrimary) seedEmails[0].isPrimary = true;
      await supabase.from('people_emails').insert(seedEmails.map(emailToDb)).then(ok);
    }
    const emailRows = seedEmails.length ? await _fetchEmailsForPerson(row.id) : [];
    return personFromDb(row, p.roles || [], emailRows);
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
    // Emails are managed separately via data.peopleEmails — we just re-read
    // the current set so the caller gets a fully-shaped person back.
    const emailRows = await _fetchEmailsForPerson(id);
    return personFromDb(row, p.roles || [], emailRows);
  },
  delete: (id) => softDelete('people', id),

  // Merge two contacts. Calls the merge_people() Postgres function which runs
  // the whole thing in a single transaction: reassigns FKs from loser to
  // master across attendance/interactions/packages/org_contacts/people_emails,
  // applies the masterPatch to the master row, writes a merge_audit row, and
  // hard-deletes the loser. person_roles are unioned into the master (roles the
  // master already has are skipped); the loser's own rows cascade-delete.
  //
  // masterPatch keys must match DB column names (snake_case). The function
  // whitelists the allowed columns server-side; extra keys are ignored.
  //
  // Returns the updated master row in JSX shape (roles + emails preserved
  // post-merge — the merged email list now includes the union of both
  // contacts' addresses, with primary deferred to the user via the UI).
  async merge(masterId, loserId, masterPatch = {}) {
    const row = await supabase.rpc('merge_people', {
      p_master_id: masterId,
      p_loser_id: loserId,
      p_master_patch: masterPatch,
    }).then(ok);
    if (!row) throw new Error('merge_people returned no row');
    const [roleRows, emailRows] = await Promise.all([
      supabase.from('person_roles').select('role_key').eq('person_id', masterId).then(ok),
      _fetchEmailsForPerson(masterId),
    ]);
    return personFromDb(row, roleRows.map(r => r.role_key), emailRows);
  },
};

// ─── People emails (junction CRUD) ───────────────────────────────────────────
// One row per (person, address). Up to one row per person can be is_primary=true
// (enforced by a partial unique index). Adds/removes/star changes via this
// module; subsequent updates to the person row don't touch emails.

export const peopleEmails = {
  // Add a new email. If isPrimary is true (or this is the person's first
  // email), set is_primary=true and clear it on any existing siblings.
  async add(personId, { email, isPrimary = false, source = 'manual' } = {}) {
    const trimmed = (email || '').trim();
    if (!trimmed) throw new Error('peopleEmails.add: empty email');
    // Find existing emails to decide whether this is the first (auto-primary).
    const existing = await _fetchEmailsForPerson(personId);
    const wantPrimary = isPrimary || existing.length === 0;
    if (wantPrimary && existing.some(r => r.is_primary)) {
      await supabase.from('people_emails')
        .update({ is_primary: false })
        .eq('person_id', personId).eq('is_primary', true).then(ok);
    }
    const row = await supabase.from('people_emails')
      .insert(emailToDb({ personId, email: trimmed, isPrimary: wantPrimary, source }))
      .select().single().then(ok);
    return emailFromDb(row);
  },

  // Mark a specific email as the primary one for this person. Clears the flag
  // on any other email belonging to the same person first.
  async setPrimary(emailId, personId) {
    await supabase.from('people_emails')
      .update({ is_primary: false })
      .eq('person_id', personId).then(ok);
    const row = await supabase.from('people_emails')
      .update({ is_primary: true })
      .eq('id', emailId).select().single().then(ok);
    return emailFromDb(row);
  },

  // Delete an email row. If it was primary and other emails exist, promote
  // the oldest remaining one to primary so the person never ends up with
  // emails but no primary.
  async delete(emailId, personId) {
    const target = await supabase.from('people_emails')
      .select('*').eq('id', emailId).single().then(ok);
    await supabase.from('people_emails').delete().eq('id', emailId).then(ok);
    if (target?.is_primary) {
      const remaining = await supabase.from('people_emails')
        .select('id').eq('person_id', personId)
        .order('created_at').limit(1).then(ok);
      if (remaining.length) {
        await supabase.from('people_emails')
          .update({ is_primary: true })
          .eq('id', remaining[0].id).then(ok);
      }
    }
  },

  // Refetch the full list for a person — useful after a multi-step UI flow.
  async list(personId) {
    const rows = await _fetchEmailsForPerson(personId);
    return rows.map(emailFromDb);
  },
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
    if (patch.orgId !== undefined) propagatePatch.org_id = patch.orgId || null;
    if (patch.rate !== undefined) propagatePatch.rate = parseFloat(patch.rate) || 0;
    if (patch.paymentModel !== undefined) propagatePatch.payment_model = patch.paymentModel || 'per_person';
    if (patch.isBookable !== undefined) propagatePatch.is_bookable = patch.isBookable;
    if (patch.capacity !== undefined) {
      const cap = patch.capacity;
      const n = (cap === '' || cap === null || cap === undefined) ? null : parseInt(cap);
      propagatePatch.capacity = (n === null || isNaN(n)) ? null : n;
    }
    if (patch.publicBlurb !== undefined) propagatePatch.public_blurb = patch.publicBlurb || null;
    if (patch.joinUrl !== undefined) propagatePatch.join_url = patch.joinUrl ? String(patch.joinUrl).trim() || null : null;
    if (patch.bookingInfo !== undefined) propagatePatch.booking_info = patch.bookingInfo ? String(patch.bookingInfo).trim() || null : null;

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
  // List all sessions. Mirrors the read shape in loadAll(). Used by the
  // booking poller (App component, ~60s interval) so register/derived activity
  // catches up after a website booking without a hard refresh.
  async list() {
    const rows = await supabase.from('sessions').select('*')
      .order('date', { ascending: false }).then(ok);
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
      dbPatch.paid_via = patch.paidVia ?? null;
      dbPatch.paid_date = patch.paidDate ?? null;
      dbPatch.package_id = null;
    } else if (patch.paymentStatus === 'package') {
      dbPatch.package_id = patch.packageId;
      dbPatch.paid_amount = null;
      dbPatch.paid_via = null;
      dbPatch.paid_date = null;
    } else {
      dbPatch.package_id = null;
      dbPatch.paid_amount = null;
      dbPatch.paid_via = null;
      dbPatch.paid_date = null;
    }
    const row = await supabase.from('attendance').update(dbPatch)
      .eq('id', id).select().single().then(ok);
    return attendanceFromDb(row);
  },
  async delete(id) {
    await supabase.from('attendance').delete().eq('id', id).then(ok);
  },
  // List all attendance rows. Mirrors loadAll(). Used by the booking poller
  // so a website booking's register entry appears without a hard refresh.
  async list() {
    const rows = await supabase.from('attendance').select('*').then(ok);
    return rows.map(attendanceFromDb);
  },
};

// ─── Notes (DB: interactions) ────────────────────────────────────────────────
// Includes both manually-entered notes and machine-ingested communications
// (from the inbound Worker, form submissions, future Brevo webhooks). The
// inbox view consumes rows where person_id IS NULL — these arrive from
// machine paths when sender/recipient doesn't match any existing contact.
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
  // Targeted partial-patch. Takes a UI-shape patch (camelCase keys, e.g.
  // { important: true, actionDate: '2026-06-01' }) and routes through the
  // notePatchToDb mapper so only the touched columns are written. Mirrors
  // classes.patch. Pre-2026-05-19 this took raw DB-shape patches; cleaned
  // up alongside the assignToPerson work in Phase 8 Half A so all callers
  // speak the same shape.
  async patch(id, patch) {
    const row = await supabase.from('interactions').update(notePatchToDb(patch))
      .eq('id', id).select().single().then(ok);
    return noteFromDb(row);
  },
  delete: (id) => softDelete('interactions', id),

  // Bulk soft-delete every diary entry sharing a repeat-group id. Used when the
  // user deletes a "repeat daily ×N" batch as a whole. Mirrors softDelete but
  // keyed on diary_group instead of id, so all N rows go in one update. No-op
  // on a falsy id (a standalone entry has diary_group=null and must never match
  // here — that would wipe every other standalone entry). Returns nothing; the
  // UI removes the rows from local state optimistically.
  async deleteGroup(groupId) {
    if (!groupId) return;
    await supabase.from('interactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('diary_group', groupId).then(ok);
  },

  // Mark every unread message in a thread as read. Called when a thread is
  // opened in ThreadsView. Single bulk update keyed on thread_id; only stamps
  // rows that aren't already read (idempotent, avoids needless writes). No
  // return — the UI splices read_at locally and doesn't need the rows back.
  async markThreadRead(threadId) {
    await supabase.from('interactions')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .is('read_at', null).then(ok);
  },
  // Mark a single (unthreaded) email as read, by row id. Sibling of
  // markThreadRead for solo emails that carry no thread_id.
  async markRead(id) {
    await supabase.from('interactions')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id).then(ok);
  },
  // Bulk "mark all read" for the Web Activity surface. Stamps a set of rows by
  // id in one update; only touches rows still unread (idempotent). No return —
  // the UI splices read_at locally.
  async markManyRead(ids) {
    if (!ids || ids.length === 0) return;
    await supabase.from('interactions')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
      .is('read_at', null).then(ok);
  },

  // List all non-deleted interactions. Mirrors the read shape in loadAll().
  // Used by the inbox poller (App component, ~60s interval) to surface new
  // rows ingested by the inbound Worker without requiring a full page refresh.
  // Cheap single query — one table, one filter, server-side ordering.
  // Returns an array of UI-shape notes (camelCase).
  async list() {
    const rows = await supabase.from('interactions').select('*')
      .is('deleted_at', null)
      .order('date', { ascending: false }).then(ok);
    return rows.map(noteFromDb);
  },

  // Assign an unlinked interaction (person_id IS NULL) to a real person.
  // Used by the inbox UI. Two things happen atomically-from-the-UI's-perspective
  // (two separate awaits, but a partial failure leaves the system in a
  // recoverable state — see comment below):
  //
  //   1. Patch the interaction's person_id to the assignee
  //   2. (Optional, default true) If the relevant address on the row isn't
  //      already on the assignee's people_emails, add it as a non-primary
  //      email. This is the "killer feature" of the inbox — one click both
  //      logs the comm and learns the new address.
  //
  // The address chosen for step 2 depends on direction:
  //   - inbound  → from_email (the sender, who we now know is this person)
  //   - outbound → to_email   (the recipient, ditto)
  // If the address belongs to *us* (in settings.my_addresses), it's skipped —
  // assigning an outbound email to a contact shouldn't add jesse@ as their
  // email.
  //
  // Returns { note, addedEmail } where addedEmail is the new email row if
  // one was created, otherwise null. Caller updates local state from both.
  //
  // Partial-failure note: if step 1 succeeds and step 2 fails, the user
  // sees the row move from inbox to PersonDetail (which is the main thing)
  // but the email isn't captured. They can add it manually from PersonDetail.
  // We don't roll back step 1 because the assignment is the important bit.
  async assignToPerson(noteId, personId, { addEmailIfNew = true, myAddresses = [] } = {}) {
    // Step 1: patch person_id. Read back the full row so we have all the
    // context (kind, direction, from_email, to_email) for step 2.
    const updatedRow = await supabase.from('interactions')
      .update({ person_id: personId })
      .eq('id', noteId).select().single().then(ok);
    const note = noteFromDb(updatedRow);

    if (!addEmailIfNew) return { note, addedEmail: null };

    // Step 2: pick the relevant address based on direction.
    const candidate = note.direction === 'outbound'
      ? note.toEmail
      : note.fromEmail;  // inbound, or null direction (default to from)
    if (!candidate) return { note, addedEmail: null };

    // Normalise for comparison (lowercase, trim) but preserve original case
    // on write — email local-parts are technically case-sensitive per RFC,
    // even though virtually all real-world handlers treat them as not.
    const normalised = candidate.trim().toLowerCase();
    if (!normalised) return { note, addedEmail: null };

    // Skip if this is one of our own addresses (jesse@, info@, log@…).
    // Case-insensitive comparison; settings.my_addresses values are stored
    // lowercase by convention but we normalise both sides defensively.
    const myList = (myAddresses || []).map(a => String(a).trim().toLowerCase());
    if (myList.includes(normalised)) return { note, addedEmail: null };

    // Skip if this person already has this email (case-insensitive). We
    // fetch their current emails fresh rather than trusting whatever state
    // the UI is holding — assignment is rare enough that a round-trip is
    // fine, and it sidesteps a class of stale-state bugs.
    const existing = await _fetchEmailsForPerson(personId);
    if (existing.some(r => String(r.email || '').trim().toLowerCase() === normalised)) {
      return { note, addedEmail: null };
    }

    // Add it as non-primary, source='import' so it's distinguishable from
    // manually-typed addresses in the future (auditable provenance).
    const emailRow = await supabase.from('people_emails')
      .insert(emailToDb({ personId, email: candidate.trim(), isPrimary: false, source: 'import' }))
      .select().single().then(ok);

    return { note, addedEmail: emailFromDb(emailRow) };
  },
};

// ─── Projects ────────────────────────────────────────────────────────────────
// Top-level "your work" entity. owner_id is set DB-side (column default
// auth.uid()) so it's never written here. status is 'active' | 'done'.
// V1 has no archive and no hard-delete UI — delete is a soft-delete via the
// standard helper (projects has a deleted_at column? — NO: V1 schema has no
// deleted_at on projects, so delete is a hard delete here. Kept minimal:
// V1 spec is active|done only, no delete UI, so this is a safety hatch).
export const projects = {
  async create(p) {
    const row = await supabase.from('projects').insert(projectToDb(p))
      .select().single().then(ok);
    return projectFromDb(row);
  },
  // Full update. Stamps completed_at on the active→done transition and clears
  // it on done→active, so the caller only has to send { status }. Pass the
  // current status as prevStatus so we can detect the transition without an
  // extra read; if omitted we still set completed_at correctly for done and
  // leave it alone otherwise.
  async update(id, p, prevStatus = null) {
    const patch = projectToDb(p);
    if (p.status === 'done') {
      // Stamp only when transitioning into done (or when no prevStatus given
      // and completed_at wasn't already supplied).
      if (prevStatus !== 'done' && !p.completedAt) {
        patch.completed_at = new Date().toISOString();
      }
    } else if (p.status === 'active') {
      patch.completed_at = null;  // reopened — clear the stamp
    }
    const row = await supabase.from('projects').update(patch)
      .eq('id', id).select().single().then(ok);
    return projectFromDb(row);
  },
  // Targeted status flip — convenience for the list-view toggle. Avoids
  // round-tripping name/notes. Handles the completed_at stamp the same way.
  async setStatus(id, status) {
    const patch = { status };
    patch.completed_at = status === 'done' ? new Date().toISOString() : null;
    const row = await supabase.from('projects').update(patch)
      .eq('id', id).select().single().then(ok);
    return projectFromDb(row);
  },
  // Hard delete. No deleted_at column on projects in V1 (no soft-delete,
  // no archive per spec). interactions.project_id is a nullable FK with no
  // cascade, so deleting a project with linked todos would FK-error — the UI
  // must not expose delete for non-empty projects (V1 has no delete UI at all;
  // this exists for completeness / console use).
  delete: (id) => supabase.from('projects').delete().eq('id', id).then(ok),
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
  // Hard-delete: used for "created in error" cleanup. UI gates this on
  // totalUsed===0 (no manual offset, no linked attendance). Skips the
  // packages_with_usage view + soft-delete; row is gone for good.
  async hardDelete(id) {
    await supabase.from('packages').delete().eq('id', id).then(ok);
    return id;
  },
  // List all non-deleted packages (with usage). Mirrors loadAll(). Used by the
  // booking poller so a package purchased via the website appears without a
  // hard refresh.
  async list() {
    const rows = await supabase.from('packages_with_usage').select('*')
      .is('deleted_at', null)
      .order('date_purchased', { ascending: false }).then(ok);
    return rows.map(packageFromDb);
  },
};

// ─── Package templates ───────────────────────────────────────────────────────
// Canonical package definitions: prefill source for AddPackageForm and (Phase 7)
// the Stripe webhook. owner_id is set DB-side (default auth.uid()), never
// written here — mirrors projects. Archive via active=false rather than delete
// so historical reporting (and any template_id FK added later) stays intact;
// hardDelete exists for "created in error" cleanup.
export const packageTemplates = {
  async create(t) {
    const row = await supabase.from('package_templates').insert(packageTemplateToDb(t))
      .select().single().then(ok);
    return packageTemplateFromDb(row);
  },
  async update(id, t) {
    const row = await supabase.from('package_templates').update(packageTemplateToDb(t))
      .eq('id', id).select().single().then(ok);
    return packageTemplateFromDb(row);
  },
  // Archive / unarchive — the common "retire a template" action. Keeps the row
  // so anything sold from it stays explainable.
  async setActive(id, active) {
    const row = await supabase.from('package_templates').update({ active })
      .eq('id', id).select().single().then(ok);
    return packageTemplateFromDb(row);
  },
  async hardDelete(id) {
    await supabase.from('package_templates').delete().eq('id', id).then(ok);
    return id;
  },
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
  // Status change is the most common edit — its own targeted method.
  // Stamps paid_date with today's date when moving to 'paid', and clears it
  // on any other status (revert to draft / back to sent) so a re-paid invoice
  // gets a fresh date rather than a stale one.
  async setStatus(id, status) {
    const patch = { status };
    patch.paid_date = status === 'paid' ? new Date().toISOString().slice(0, 10) : null;
    const row = await supabase.from('invoices').update(patch)
      .eq('id', id).select().single().then(ok);
    // Return shape needs lineItems; caller should already have them in state.
    // Returning without lines forces UI to merge the patch instead of replacing wholesale.
    return { id: row.id, status: row.status, paidDate: row.paid_date || null };
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
    // Belt-and-braces owner_id: explicit from the session, in addition to the
    // column DEFAULT auth.uid(). Guards against the default not firing.
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const row = await supabase.from('person_role_meta').insert(customPersonRoleToDb(t, uid))
      .select().single().then(ok);
    return customPersonRoleFromDb(row);
  },
  // Edit an existing role's label/colour/parent. Works for both custom and
  // built-in rows (built-ins are seeded into person_role_meta by migration).
  // Only label/color/bg/parent_key are mutable — never the key or is_builtin.
  // parent_key is written only when the patch carries the property, so a
  // label-only edit never clobbers an existing parent assignment.
  async update(key, patch) {
    const dbPatch = { label: patch.label, color: patch.color, bg: patch.bg };
    if (Object.prototype.hasOwnProperty.call(patch, 'parentKey')) {
      dbPatch.parent_key = patch.parentKey || null;
    }
    const row = await supabase.from('person_role_meta')
      .update(dbPatch)
      .eq('key', key).select().single().then(ok);
    return customPersonRoleFromDb(row);
  },
  async delete(key) {
    await supabase.from('person_role_meta').delete()
      .eq('key', key).eq('is_builtin', false).then(ok);
  },
};

// ─── Role parents (category layer above person roles) ─────────────────────────
export const roleParents = {
  async create(p) {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const row = await supabase.from('role_parents').insert(roleParentToDb(p, uid))
      .select().single().then(ok);
    return roleParentFromDb(row);
  },
  async update(key, patch) {
    const dbPatch = {};
    if (Object.prototype.hasOwnProperty.call(patch, 'label')) dbPatch.label = patch.label;
    if (Object.prototype.hasOwnProperty.call(patch, 'position')) dbPatch.position = patch.position;
    const row = await supabase.from('role_parents')
      .update(dbPatch)
      .eq('key', key).select().single().then(ok);
    return roleParentFromDb(row);
  },
  async delete(key) {
    // FK on person_role_meta.parent_key is ON DELETE SET NULL — children survive.
    await supabase.from('role_parents').delete().eq('key', key).then(ok);
  },
};

// ─── Org contacts (people <-> orgs working-relationships junction) ───────────
// Hard-delete (no soft-delete needed; junction rows are cheap to recreate).
// DB has a unique (org_id, person_id, role) index, so adding a duplicate
// role for the same person+org will throw — caller should ensure uniqueness
// in the UI or handle the error.

export const orgContacts = {
  async create(oc) {
    const row = await supabase.from('org_contacts').insert(orgContactToDb(oc))
      .select().single().then(ok);
    return orgContactFromDb(row);
  },
  async updateRole(id, role) {
    const row = await supabase.from('org_contacts').update({ role })
      .eq('id', id).select().single().then(ok);
    return orgContactFromDb(row);
  },
  async delete(id) {
    await supabase.from('org_contacts').delete().eq('id', id).then(ok);
  },
};

// ─── Households + household members (people <-> people grouping) ─────────────
// Households are hard-deleted (cheap to recreate; no audit need). The
// household_members FK has ON DELETE CASCADE, so deleting a household
// auto-removes its membership rows server-side — no need to clear them first.
// Deleting a person likewise cascades them out of any household.
// household_members has a unique (household_id, person_id) index, so adding the
// same person twice to one household will throw — the UI guards against it, but
// callers should handle the error too.

export const households = {
  async create(h) {
    const row = await supabase.from('households').insert(householdToDb(h))
      .select().single().then(ok);
    return householdFromDb(row);
  },
  async update(id, h) {
    const row = await supabase.from('households').update(householdToDb(h))
      .eq('id', id).select().single().then(ok);
    return householdFromDb(row);
  },
  // Hard delete. Cascade removes household_members rows automatically.
  async delete(id) {
    await supabase.from('households').delete().eq('id', id).then(ok);
  },
};

export const householdMembers = {
  async create(m) {
    const row = await supabase.from('household_members').insert(householdMemberToDb(m))
      .select().single().then(ok);
    return householdMemberFromDb(row);
  },
  async updateRelationship(id, relationship) {
    const row = await supabase.from('household_members').update({ relationship })
      .eq('id', id).select().single().then(ok);
    return householdMemberFromDb(row);
  },
  async delete(id) {
    await supabase.from('household_members').delete().eq('id', id).then(ok);
  },
};

// ─── Contact dates (anniversaries / dated events on a person OR an org) ──────
// owner_id is set DB-side via DEFAULT auth.uid() — do not pass it from the
// client. The contactDateToDb mapper writes exactly one of person_id/org_id;
// the DB CHECK (contact_dates_one_anchor) rejects rows with zero or both.
// Hard delete — these are cheap to recreate and carry no audit need.
export const contactDates = {
  async create(d) {
    const row = await supabase.from('contact_dates').insert(contactDateToDb(d))
      .select().single().then(ok);
    return contactDateFromDb(row);
  },
  async update(id, d) {
    const row = await supabase.from('contact_dates').update(contactDateToDb(d))
      .eq('id', id).select().single().then(ok);
    return contactDateFromDb(row);
  },
  async delete(id) {
    await supabase.from('contact_dates').delete().eq('id', id).then(ok);
  },
};

// ─── Settings (generic key-value store) ──────────────────────────────────────
// Single source of truth for app config editable without code redeploys.
// Loaded eagerly into state.settings on loadAll (as a keyed object). Writes
// go through here when you change something live.
//
// Keys today:
//   'my_addresses' — array of operator email addresses. Consumed by
//     notes.assignToPerson to avoid auto-adding "your own" addresses as new
//     contact emails when triaging the inbox.

export const settings = {
  // Read a single setting. Returns the parsed jsonb value, or undefined if
  // the key doesn't exist. Most consumers will prefer reading from
  // state.settings directly — this is for ad-hoc reads outside the loadAll
  // flow (e.g., the inbox-assign action verifying the freshest list).
  async get(key) {
    const rows = await supabase.from('settings').select('*')
      .eq('key', key).limit(1).then(ok);
    if (!rows.length) return undefined;
    return settingFromDb(rows[0]).value;
  },

  // Upsert. Writes the value as jsonb; pass any JSON-serialisable shape.
  // Returns the saved row (settingFromDb shape) so callers can update
  // local state with the server-confirmed value (including updatedAt).
  async set(key, value) {
    const row = await supabase.from('settings')
      .upsert({ key, value }, { onConflict: 'key' })
      .select().single().then(ok);
    return settingFromDb(row);
  },
};

// ─── Files (stored documents / photos) ───────────────────────────────────────
// Manual upload (workflow 1). The binary goes to Supabase Storage; a `files`
// row records the metadata + path + optional anchor. Reads come back via the
// active_files view in loadAll; viewing/downloading uses short-lived signed
// URLs minted on demand (the bucket is private).
//
// Anchor: pass at most one of personId / orgId / interactionId. None = a
// general document. owner_id is set DB-side (default auth.uid()).
//
// Free-tier note: the bucket is capped at 50 MB/object server-side; we also
// soft-guard here. Storage + egress count against the free quota, so prefer
// modest file sizes (compress photos before upload where practical).
const BUCKET = 'client-documents';
const MAX_BYTES = 50 * 1024 * 1024;

// Email attachments (files.store === 'r2') live in the feltbody-attachments
// R2 bucket, written by the log-worker (inbound) and forms-worker (outbound).
// The browser can't touch R2 directly — viewing and deleting go through the
// forms-worker /file/:id endpoints, authenticated with the session JWT (same
// pattern as email.send below).
const FORMS_WORKER_URL = 'https://forms.thefeltbody.com';

// Session JWT header for forms-worker calls. Throws if signed out so callers
// surface a clear message instead of an opaque 401.
async function workerAuthHeaders() {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('Not signed in — refresh and try again.');
  return { 'Authorization': `Bearer ${session.access_token}` };
}

export const files = {
  // Upload a File/Blob to storage, then insert the metadata row.
  // `file` is a browser File object (from an <input type="file">).
  // `anchor` is { personId?, orgId?, interactionId? } — at most one set.
  // `label` is an optional human description.
  // Returns the saved row in JSX shape (fileFromDb). Throws on any failure;
  // if the storage upload succeeds but the row insert fails, we best-effort
  // remove the orphaned object so we don't leak storage.
  async upload(file, anchor = {}, label = '') {
    if (!file) throw new Error('No file provided.');
    if (file.size > MAX_BYTES) {
      throw new Error(`File is ${(file.size / 1048576).toFixed(1)} MB — the limit is 50 MB.`);
    }

    // Path convention: <anchorKind>/<uuid>-<safeName>. UUID prevents collisions
    // and makes the object key unguessable; the original name is preserved for
    // readability and as the download filename.
    const kind = anchor.personId ? 'person'
      : anchor.orgId ? 'org'
      : anchor.interactionId ? 'interaction'
      : 'general';
    const safeName = (file.name || 'file')
      .replace(/[^\w.\-]+/g, '_')   // strip anything not word/dot/dash
      .replace(/_{2,}/g, '_')
      .slice(0, 120);
    const path = `${kind}/${crypto.randomUUID()}-${safeName}`;

    const up = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`);

    try {
      const row = await supabase.from('files').insert(fileToDb({
        store: 'supabase',
        bucket: BUCKET,
        path,
        filename: file.name || safeName,
        mimeType: file.type || '',
        sizeBytes: file.size,
        label,
        personId: anchor.personId || null,
        orgId: anchor.orgId || null,
        interactionId: anchor.interactionId || null,
      })).select().single().then(ok);
      return fileFromDb(row);
    } catch (e) {
      // Roll back the orphaned object so a failed insert doesn't leak storage.
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      throw e;
    }
  },

  // Point files rows at an interaction after the fact. Used by the note
  // handlers (the row id doesn't exist until the note is created) and safe
  // client-side: the rows were written by the worker with owner_id = the
  // same auth.uid(), so owner-scoped RLS passes.
  async anchorToInteraction(ids, interactionId) {
    if (!Array.isArray(ids) || !ids.length || !interactionId) return;
    await supabase.from('files').update({ interaction_id: interactionId })
      .in('id', ids).then(ok);
  },

  // Upload an email attachment through the forms-worker: R2 object + files
  // row (store='r2', unanchored — /send-email links it to the outbound
  // interaction after the fan-out insert). Raw-body POST, filename travels
  // URI-encoded in X-Filename (headers are ISO-8859-1; real filenames
  // aren't). Server enforces the 25 MB cap and Brevo's extension allowlist;
  // its 400 messages name the file and are modal-displayable as-is.
  async uploadAttachment(file) {
    const headers = await workerAuthHeaders();
    const r = await fetch(`${FORMS_WORKER_URL}/upload-attachment`, {
      method: 'POST',
      headers: {
        ...headers,
        'X-Filename': encodeURIComponent(file.name || 'attachment'),
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });
    let parsed = {};
    try { parsed = await r.json(); } catch { /* non-JSON 5xx */ }
    if (!r.ok) throw new Error(parsed.error || `Upload failed (HTTP ${r.status})`);
    return fileFromDb(parsed.file);
  },

  // Mint a URL for viewing/downloading a stored object. Returns a URL string
  // either way, so call sites don't care where the bytes live:
  //   supabase — short-lived signed URL (`expiresIn` seconds, default 1 hour).
  //   r2       — fetch the bytes from the forms-worker (JWT auth) and return
  //              a blob object URL. expiresIn is ignored; the URL lives until
  //              the caller revokes it or the page unloads. Callers that open
  //              a tab and forget it are fine — a handful of leaked blob URLs
  //              per session is harmless.
  async signedUrl(file, expiresIn = 3600) {
    if (file.store === 'r2') {
      const headers = await workerAuthHeaders();
      const r = await fetch(`${FORMS_WORKER_URL}/file/${file.id}`, { headers });
      if (!r.ok) {
        let msg = `Could not fetch file (HTTP ${r.status})`;
        try { msg = (await r.json()).error || msg; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      const blob = await r.blob();
      return URL.createObjectURL(blob);
    }
    const { data, error } = await supabase.storage
      .from(file.bucket || BUCKET)
      .createSignedUrl(file.path, expiresIn);
    if (error) throw new Error(`Could not create link: ${error.message}`);
    return data.signedUrl;
  },

  // Edit mutable fields (label / anchor). Immutable upload fields are re-sent
  // unchanged via fileToDb. Returns the updated row in JSX shape.
  async update(id, f) {
    const row = await supabase.from('files').update(fileToDb(f))
      .eq('id', id).select().single().then(ok);
    return fileFromDb(row);
  },

  // Remove: soft-delete the metadata row AND hard-delete the storage object.
  // The object is gone for good (no soft-delete on storage); the row is kept
  // with deleted_at set so any FK / audit reference survives, and active_files
  // filters it out on next load. Pass the full file object so we have the path.
  async remove(file) {
    // r2 rows: the browser can't delete R2 objects, so the forms-worker owns
    // the whole removal — it deletes the object AND soft-deletes the row in
    // one call. Throws on failure (row untouched → state stays consistent).
    if (file.store === 'r2') {
      const headers = await workerAuthHeaders();
      const r = await fetch(`${FORMS_WORKER_URL}/file/${file.id}`, {
        method: 'DELETE', headers,
      });
      if (!r.ok) {
        let msg = `Delete failed (HTTP ${r.status})`;
        try { msg = (await r.json()).error || msg; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      return file.id;
    }
    await softDelete('files', file.id);
    // Best-effort object removal — if this fails the row is already hidden;
    // a stray object is harmless and can be swept later.
    await supabase.storage.from(file.bucket || BUCKET).remove([file.path]).catch(() => {});
    return file.id;
  },
};

// Adhoc outbound email via the form-worker /send-email endpoint. Worker handles
// auth (Supabase JWT), primary-email lookup, HTML escaping + \n -> <br>, Brevo
// send (htmlContent direct — no template), and the outbound interaction row
// insert. We just relay the JWT from the current session and parse the result.
//
// Returns { ok, logged, warning, note } where:
//   - ok       — always true if we don't throw
//   - logged   — false when email sent but DB write failed (rare; UI warns)
//   - warning  — human-readable warning string when logged=false, else null
//   - note     — saved interaction row in JSX shape (noteFromDb), or null if
//                the worker couldn't write the row. Caller should append to
//                local notes state so the new email appears immediately
//                without waiting for the 60s poll.
//
// Throws on auth/validation/send failure. Error message is suitable for direct
// display in the compose modal.
export const email = {
  async send({ personId, recipients, subject, body, threadId, inReplyTo, attachmentFileIds }) {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw new Error('Not signed in — refresh and try again.');

    // recipients: optional [{ personId|email, role:'to'|'cc' }] for group
    // sends (reply-all) — the worker treats a bare personId as a one-entry
    // list, so both shapes share one server path. attachmentFileIds: optional
    // ids of files rows previously created via uploadAttachment; the worker
    // validates (existence, store, extension, 15 MB budget) before sending.
    const r = await fetch('https://forms.thefeltbody.com/send-email', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ personId, recipients, subject, body, threadId, inReplyTo, attachmentFileIds }),
    });

    let parsed = {};
    try { parsed = await r.json(); } catch { /* non-JSON 5xx — fall through */ }

    if (!r.ok) {
      const msg = parsed.error || `Send failed (HTTP ${r.status})`;
      const detail = Array.isArray(parsed.details)
        ? ` — ${parsed.details.join(', ')}`
        : (typeof parsed.details === 'string' ? ` — ${parsed.details}` : '');
      throw new Error(msg + detail);
    }

    return {
      ok: true,
      logged: parsed.logged !== false,
      warning: parsed.warning || null,
      note: parsed.interaction ? noteFromDb(parsed.interaction) : null,
      // Group fan-out: one row per recipient. Callers splice ALL of them so
      // the email lands on every participant's record immediately. Falls
      // back to wrapping the single row for a mid-deploy old worker.
      notes: Array.isArray(parsed.interactions)
        ? parsed.interactions.map(noteFromDb)
        : (parsed.interaction ? [noteFromDb(parsed.interaction)] : []),
    };
  },
};
