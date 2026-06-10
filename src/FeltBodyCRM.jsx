import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./lib/supabase.js";
import * as data from "./lib/dataLayer.js";
import { C, ORG_META, PERSON_ROLES, SEED } from "./lib/constants.js";
import { MobileUIContext, TypesContext, buildOrgTypes, buildPersonRoles, fmt, generateSeriesClasses, isWebEvent, today, useLocalStorage } from "./lib/helpers.jsx";
import { Empty } from "./components/primitives.jsx";
import { AddClassForm, AddOrgForm, AddPackageForm, AddPersonForm, AddToRegisterForm, AddTypeForm, BookForPersonForm, CreateInvoiceForm, EditNoteForm, EditPackageForm, EditSeriesClassForm, MergePeopleForm, PackageTemplateForm } from "./components/forms.jsx";
import { BirthdaysView, ClassList, Dashboard, FormsList, HouseholdsList, InboxView, InvoiceDetail, InvoiceList, MonthView, OrgList, PackageTemplatesView, PeopleList, PersonalDashboard, ProjectsView, RecentActivityView, Sidebar, ThreadsView, WebActivityView, WeekView } from "./components/views.jsx";
import { ClassDetail, HouseholdModal, OrgDetail, PersonDetail, ProjectDetail } from "./components/details.jsx";
import { CareHomeResourcesView, DocumentsView } from "./components/documents.jsx";

// Cheap change guards for the background poller: only replace a state array
// when its membership actually changed, so quiet ticks don't trigger re-renders
// (or disturb in-flight local edits). Compares length, then the id set.
const sameLen = (a, b) => a.length === b.length;
const sameIds = (a, b) => {
  const ids = new Set(a.map(x => x.id));
  return b.every(x => ids.has(x.id));
};

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
  // Edits to built-in roles (label/colour) — is_builtin=true rows in person_role_meta.
  const [builtinPersonRoles, setBuiltinPersonRoles] = useState([]);
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
  // Stored documents/photos (the `files` table + Supabase Storage). Each row is
  // metadata + a path into the private bucket, optionally anchored to a person /
  // org / interaction. Surfaced via DocumentsView; binaries fetched on demand
  // through short-lived signed URLs.
  const [files, setFiles] = useState([]);
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
  const personRoles = useMemo(() => buildPersonRoles(customPersonRoles, builtinPersonRoles), [customPersonRoles, builtinPersonRoles]);
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
        setBuiltinPersonRoles(all.builtinPersonRoles || []);
        setOrgContacts(all.orgContacts);
        setHouseholds(all.households || []);
        setHouseholdMembers(all.householdMembers || []);
        setContactDates(all.contactDates || []);
        setSettings(all.settings || {});
        setProjects(all.projects || []);
        setPackageTemplates(all.packageTemplates || []);
        setFiles(all.files || []);
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
        // The website pipeline (form worker, later Stripe) writes a real
        // interaction row AND its booking side-effects: an attendance/register
        // entry, and sometimes a packages row. Polling notes alone surfaced the
        // Web Activity event but left the derived Recent Activity / register feed
        // stale until a hard refresh. Pull all four together so deriveActivity()
        // recomputes on the same cadence.
        const [freshNotes, freshClasses, freshAttendance, freshPackages] =
          await Promise.all([
            data.notes.list(),
            data.classes.list(),
            data.attendance.list(),
            data.packages.list(),
          ]);
        if (cancelled) return;
        setNotes(freshNotes);
        // Only replace the other arrays when they've actually changed — avoids
        // re-rendering (and any local edit churn) on every quiet tick.
        setClasses(prev => sameLen(prev, freshClasses) && sameIds(prev, freshClasses) ? prev : freshClasses);
        setAttendance(prev => sameLen(prev, freshAttendance) && sameIds(prev, freshAttendance) ? prev : freshAttendance);
        setPackages(prev => sameLen(prev, freshPackages) && sameIds(prev, freshPackages) ? prev : freshPackages);
      } catch (e) {
        // Soft-fail: log and try again next tick. Worker rows will still
        // appear on the next successful poll, or on next manual refresh.
        console.warn('[CRM] poll failed:', e?.message || e);
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

  // ─── Documents (files + Storage) ────────────────────────────────────────
  // Server-confirmed: uploads return the saved metadata row (with the real DB
  // id) which we splice into state. getFileUrl mints a short-lived signed URL
  // on demand (the bucket is private). removeFile soft-deletes the row and
  // hard-deletes the storage object, then drops it from local state.
  const uploadFile = (file, anchor, label) =>
    data.files.upload(file, anchor, label)
      .then(saved => { setFiles(prev => [saved, ...prev]); return saved; });
      // NOTE: deliberately not .catch'd here — the upload modal surfaces the
      // error inline so the user can retry without losing their selection.
  const getFileUrl = (file) => data.files.signedUrl(file);
  const removeFile = (file) => {
    // Optimistic removal; the row is soft-deleted + object purged server-side.
    setFiles(prev => prev.filter(f => f.id !== file.id));
    return data.files.remove(file).catch(onError('Delete document'));
  };

  // ─── Care home resources (settings-backed) ──────────────────────────────
  // The pitch-PDF link + phone-call scripts live in the settings key-value
  // store under 'care_home_resources' (config, editable without redeploy).
  // Server-confirmed: write the whole object, reconcile local settings from
  // the saved row's value.
  const saveCareHomeResources = (value) =>
    data.settings.set('care_home_resources', value)
      .then(saved => { setSettings(prev => ({ ...prev, care_home_resources: saved.value })); return saved; });

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
  // Edit a role's label/colour. Built-in keys (present in PERSON_ROLES) update
  // the builtinPersonRoles override slice; everything else is a custom role.
  // Optimistic-local then fire to server. The key never changes — only label/bg/color.
  const editPersonRole = (key, patch) => {
    const isBuiltin = Object.prototype.hasOwnProperty.call(PERSON_ROLES, key);
    const next = { key, label: patch.label, color: patch.color, bg: patch.bg };
    if (isBuiltin) {
      setBuiltinPersonRoles(prev => {
        const without = prev.filter(t => t.key !== key);
        return [...without, next];
      });
    } else {
      setCustomPersonRoles(prev => prev.map(t => t.key === key ? { ...t, ...next } : t));
    }
    return data.customPersonRoles.update(key, patch)
      .catch(onError('Edit person role'));
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
      case 'edit_person_role': {
        const m = personRoles[modal.roleKey];
        if(!m) return null;
        return <AddTypeForm kind="person"
          existing={{ key:modal.roleKey, label:m.label, color:m.color, bg:m.bg }}
          onSave={(t)=>editPersonRole(t.key, { label:t.label, color:t.color, bg:t.bg })}
          onClose={close} />;
      }
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
      case 'household_manage': {
        // Opened from the Households view. HouseholdModal is anchored to a
        // contact (uses person.id for the self-marker + create/join paths that
        // manage mode doesn't exercise). With no natural anchor here, we use the
        // first member alphabetically — same sort the modal applies to its roster.
        const h = households.find(x => x.id === modal.householdId);
        if (!h) return null;
        const roster = householdMembers
          .filter(m => m.householdId === h.id)
          .map(m => ({ membership: m, person: people.find(p => p.id === m.personId) }))
          .filter(x => x.person)
          .sort((a,b) => a.person.name.localeCompare(b.person.name));
        const anchor = roster[0]?.person;
        if (!anchor) return null; // empty household — nothing to anchor to
        return <HouseholdModal
          person={anchor}
          household={h}
          roster={roster}
          allPeople={people}
          households={households}
          householdMembers={householdMembers}
          orgs={orgs}
          onClose={close}
          onCreateHousehold={createHousehold}
          onRenameHousehold={renameHousehold}
          onDeleteHousehold={deleteHousehold}
          onAddHouseholdMember={addHouseholdMember}
          onCreatePersonForHousehold={createPersonForHousehold}
          onUpdateMemberRelationship={updateMemberRelationship}
          onRemoveHouseholdMember={removeHouseholdMember}
          nav={nav}
        />;
      }
      default: return null;
    }
  };


  const renderView = () => {
    const { name, orgId, orgType, personType, personId, classId, invoiceId, highlightNoteId } = view;
    switch(name){
      case 'dashboard':
        if (mode === 'personal') return <PersonalDashboard people={people} orgs={orgs}
          households={households} householdMembers={householdMembers} contactDates={contactDates}
          notes={notes} projects={projects} nav={nav} />;
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
      case 'documents': return <DocumentsView files={files} people={people} orgs={orgs}
        onUpload={uploadFile} onGetUrl={getFileUrl} onRemove={removeFile} nav={nav} />;
      case 'care_home_resources': return <CareHomeResourcesView
        resources={settings.care_home_resources} onSave={saveCareHomeResources} nav={nav} />;
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
      case 'households': return <HouseholdsList households={households} householdMembers={householdMembers} people={people} nav={nav} onEditHousehold={(id)=>setModal({type:'household_manage',householdId:id})} />;
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
            onEditPersonRole={(key)=>setModal({type:'edit_person_role',roleKey:key})}
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
                onEditPersonRole={(key)=>{ setMobileNavOpen(false); setModal({type:'edit_person_role',roleKey:key}); }}
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

