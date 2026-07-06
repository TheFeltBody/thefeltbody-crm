import { useEffect, useMemo, useRef, useState } from "react";
import { C, INTERACTION_KINDS, INV_STATUS, ORG_META, PAYMENT_STATUS, PAY_VIA, PERSON_ROLES, PKG_COMPATIBILITY, PKG_TYPES, RECURRENCE, RELATIONSHIP_KEYS, RELATIONSHIP_LABELS } from "../lib/constants.js";
import { addDays, birthdayInfo, classKindKey, contactDateInfo, fmt, fmtDayMonth, fmtMoney, fmtTime, isCountlessPkg, packagePerSessionValue, packageRemaining, primaryRole, startOfWeek, today, useIsMobile, useLocalStorage, useTypes } from "../lib/helpers.jsx";
import { Avatar, Btn, ConfirmBtn, Empty, FI, KindBadge, MobileTabBar, Modal, NoteCard, OrgBadge, PageHead, RoleBadge, Row, SourceTag, Tabs } from "./primitives.jsx";
import { AddPersonForm, NoteForm, SendEmailModal } from "./forms.jsx";
import { ClassLog } from "./views.jsx";

export function ProjectDetail({ project, notes, people, nav, backInfo,
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

  // Copy open to-dos to clipboard as a bulleted list — project name as a heading,
  // one "• " line per open item, due date appended inline when set. Brief
  // "Copied" confirmation on the button via copied state.
  const [copied, setCopied] = useState(false);
  const copyOpenTodos = async () => {
    const lines = openTodos.map(t =>
      `• ${t.text}${t.actionDate ? ` (due ${t.actionDate})` : ''}`
    );
    const text = `${project.name}\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable — no-op */ }
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
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            {openTodos.length > 0 && (
              <Btn variant="ghost" small onClick={copyOpenTodos}>{copied ? 'Copied ✓' : 'Copy'}</Btn>
            )}
            {isDone
              ? <Btn variant="ghost" small onClick={()=>onSetStatus(project.id,'active')}>Reopen</Btn>
              : <Btn variant="secondary" small onClick={()=>onSetStatus(project.id,'done')}>Mark done</Btn>}
          </div>
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

export function NoteIndicator({ count, expanded, onToggle, previewText }) {
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

export function SessionNoteRow({ c, notesList, open, onToggle, nav }) {
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

export function OrgDetail({ org, people, classes, invoices, notes=[], contactDates=[], nav, backInfo, onEdit, onAddPerson, onAddClass, onCreateInvoice, onEditInvoice, onUpdateInvoiceStatus, onAddToCalendar, onToggleImportant, onClearAction, onReopenNote, onDeleteNote, onUpdateActionDate, onAddContactDate, onUpdateContactDate, onRemoveContactDate }) {
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
        <div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,alignSelf:'start',overflow:'hidden',marginBottom:14}}>
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
        </div>
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
                      onAddToCalendar={onAddToCalendar}
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

export function HouseholdModal({ person, household, roster, allPeople, households, householdMembers, orgs, onClose, onCreateHousehold, onRenameHousehold, onDeleteHousehold, onAddHouseholdMember, onCreatePersonForHousehold, onUpdateMemberRelationship, onRemoveHouseholdMember, nav }) {
  const [name, setName] = useState(household?.name || `${person.name.split(' ').slice(-1)[0]} Household`);
  const [founderRel, setFounderRel] = useState('adult');
  const [busy, setBusy] = useState(false);
  // Add-member sub-form state (only used when a household exists)
  const [addPersonId, setAddPersonId] = useState('');
  const [addRel, setAddRel] = useState('child');
  const [addBusy, setAddBusy] = useState(false);
  const [addQuery, setAddQuery] = useState(''); // search filter for the existing-contact picker
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
  // Search-filtered subset of `addable` for the existing-contact picker. Matches
  // name or email. If the currently-selected person drops out of the filter,
  // the select simply shows them not-listed; we keep addPersonId so a stray
  // keystroke doesn't silently clear a deliberate selection.
  const addableFiltered = (() => {
    const needle = addQuery.trim().toLowerCase();
    if (!needle) return addable;
    return addable.filter(p =>
      p.name.toLowerCase().includes(needle) || (p.email||'').toLowerCase().includes(needle));
  })();

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
              <input value={addQuery} onChange={e=>setAddQuery(e.target.value)} placeholder="Search by name or email…"
                style={{width:'100%',background:C.surf,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif",marginBottom:6}} />
              <select value={addPersonId} onChange={e=>setAddPersonId(e.target.value)} size={addQuery.trim() ? Math.min(6, addableFiltered.length + 1) : 1}
                style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
                <option value="">— select contact —</option>
                {addableFiltered.map(p=><option key={p.id} value={p.id}>{p.name}{p.email?` · ${p.email}`:''}</option>)}
              </select>
              {addQuery.trim() && addableFiltered.length===0 && (
                <div style={{color:C.muted,fontSize:11,marginTop:4,fontStyle:'italic'}}>No contacts match “{addQuery.trim()}”.</div>
              )}
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

// Hoisted to module scope so it keeps a stable component identity across
// parent re-renders. Defining it inside ContactDatesCard gave it a new
// identity on every keystroke (setD → re-render → new fn → remount), which
// blew away focus mid-type — the documented nested-component remount bug.
function DateForm({ d, setD, onSave, onCancel, saveLabel }) {
  const canSave = d.label.trim() && d.date;
  return (
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
          <Btn small onClick={onSave} disabled={!canSave}>{saveLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

export function ContactDatesCard({ anchor, contactDates, onAdd, onUpdate, onRemove }) {
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


export function PersonDetail({ person, org, pNotes, pClasses, attendance, packages, classes, notes=[], forms=[], orgs, nav, backInfo, highlightNoteId, emailTemplates=[], onSaveAsTemplate, people, households, householdMembers, contactDates=[], onCreateHousehold, onRenameHousehold, onDeleteHousehold, onAddHouseholdMember, onCreatePersonForHousehold, onUpdateMemberRelationship, onRemoveHouseholdMember, onAddContactDate, onUpdateContactDate, onRemoveContactDate, onAddNote, onAddToCalendar, onSendEmail, onEdit, onAddPackage, onEditPackage, onUseSession, onReturnSession, onToggleImportant, onClearAction, onReopenNote, onDeleteNote, onUpdateActionDate, onEditNote, onBook }) {
  const isMobile = useIsMobile();  const [addKind, setAddKind] = useState(null);  // null | 'note' | 'call' | 'email' | 'meeting'
  const [menuOpen, setMenuOpen] = useState(false);  // controls the "+ Log ▾" dropdown
  const menuRef = useRef(null);
  const [composeOpen, setComposeOpen] = useState(false);  // adhoc email compose modal
  // Reply-from-record: opens the compose modal pre-threaded onto an email
  // card's conversation. inReplyTo prefers external_id but falls back to
  // raw_headers.brevo_message_id — group fan-out siblings carry null
  // external_id (unique index), yet still know their Message-ID.
  const [replyCtx, setReplyCtx] = useState(null);  // { initialSubject, threadId, inReplyTo, draftKey } | null
  const startReply = (n) => {
    const base = (n.subject || '').replace(/^\s*(re:\s*)+/i, '').trim();
    setReplyCtx({
      initialSubject: base ? `Re: ${base}` : '',
      threadId: n.threadId || undefined,
      inReplyTo: n.externalId || (n.rawHeaders && n.rawHeaders.brevo_message_id) || undefined,
      draftKey: `felt.compose.reply.${n.threadId || n.id}`,
    });
  };
  // Deep-link into ThreadsView with the conversation pre-selected. Gated:
  // ThreadsView only lists threads with at least one inbound message, so the
  // button appears only when the FULL notes array (not just this person's
  // rows — another participant's reply counts) shows the thread is live.
  // Solo inbound emails (no thread_id) deep-link via their solo key.
  const liveThreadIds = useMemo(() => new Set(
    notes.filter(n => n.kind === 'email' && n.direction === 'inbound' && n.threadId)
      .map(n => n.threadId)), [notes]);
  const openThread = (n) => nav('threads', { threadKey: n.threadId ? `t:${n.threadId}` : `solo:${n.id}` });
  const canOpenThread = (n) => n.kind === 'email' &&
    ((n.threadId && liveThreadIds.has(n.threadId)) || (!n.threadId && n.direction === 'inbound'));
  // Active right-column tab. Persisted so the page reopens on the last-viewed
  // tab (sticky across navigations/sessions, per-device). On mobile a fourth
  // 'bookings' tab joins the row; on desktop bookings live in the left column.
  const [tab, setTab] = useLocalStorage('felt.personDetail.tab', 'notes');
  const [flashId, setFlashId] = useState(null);
  const [filterKind, setFilterKind] = useState('all');
  // Which booking rows are expanded to show their session note(s) inline.
  const [bookingNotesOpen, setBookingNotesOpen] = useState(()=>new Set());
  // Bookings tab quick-filter: all | past | future. `today` counts as future
  // (an appointment later today is still upcoming). Persisted per-device so the
  // tab reopens on the last-used filter.
  const [bookingWhen, setBookingWhen] = useLocalStorage('felt.personDetail.bookingWhen', 'all');
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
  // Forms worked in a given class, resolved to their names (read-only display
  // on the Bookings tab — editing forms worked stays on the class detail page's
  // ClassLog). Missing/deleted form ids are silently dropped.
  const formsById = useMemo(() => Object.fromEntries(forms.map(f => [f.id, f])), [forms]);
  const classForms = (cls) => (cls.formsWorked || []).map(id => formsById[id]).filter(Boolean);
  // If the active filter points at a kind with no items (e.g. the last call
  // was deleted and its chip vanished), fall back to showing all — otherwise
  // the user is stranded on an empty list with no chip to click back to.
  // Comms shows human communication only — booking/payment interaction rows are
  // transactional (the booking already appears in the Bookings tab, derived from
  // attendance), so they're filtered out here to keep the comms feed uncluttered.
  // The chip bar already excludes these kinds; this makes the rendered list match.
  // Diary entries (kind='diary') are also excluded from the default/'All' view —
  // they're calendar items, mostly title-only, and would clutter the record.
  // They're reachable via their own Diary chip (diaryNotes below).
  const commsNotes = pNotes.filter(n => !['booking','payment','diary'].includes(n.kind));
  const diaryNotes = pNotes.filter(n => n.kind === 'diary');
  // Diary is a valid filter target even though it's not in commsNotes. For every
  // other kind, validity is checked against commsNotes.
  const filterValid = filterKind==='all'
    || (filterKind==='diary' ? diaryNotes.length>0 : commsNotes.some(n => (n.kind||'note')===filterKind));
  const effectiveFilter = filterValid ? filterKind : 'all';
  const visibleNotes = effectiveFilter==='all' ? commsNotes
    : effectiveFilter==='diary' ? diaryNotes
    : commsNotes.filter(n => (n.kind||'note')===effectiveFilter);
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
  const bookingsList = (scroll) => {
    const todayStr = today();
    // today counts as future — an appointment later today is still upcoming.
    const filtered = bookingWhen==='future' ? pClasses.filter(c=>c.date>=todayStr)
                   : bookingWhen==='past'   ? pClasses.filter(c=>c.date<todayStr)
                   : pClasses;
    // Future reads more naturally soonest-first; all/past stay newest-first
    // (pClasses arrives newest-first from the parent).
    const rows = bookingWhen==='future' ? [...filtered].sort((a,b)=>a.date.localeCompare(b.date)) : filtered;
    const pills = [
      {v:'all',    l:'All',    n:pClasses.length},
      {v:'past',   l:'Past',   n:pClasses.filter(c=>c.date<todayStr).length},
      {v:'future', l:'Future', n:pClasses.filter(c=>c.date>=todayStr).length},
    ];
    return (
      <>
      {pClasses.length > 0 && (
        <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
          {pills.map(p=>{
            const on = bookingWhen===p.v;
            return (
              <button key={p.v} onClick={()=>setBookingWhen(p.v)}
                style={{background:on?C.gold+'22':C.card,border:`1px solid ${on?C.gold:C.border}`,
                  color:on?C.gold:C.muted,cursor:'pointer',borderRadius:20,fontSize:11,
                  padding:'4px 12px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px',
                  transition:'all 0.12s'}}>
                {p.l} <span style={{opacity:0.7}}>{p.n}</span>
              </button>
            );
          })}
        </div>
      )}
      {rows.length ? (
      <div style={scroll ? {maxHeight:304,overflowY:'auto',paddingRight:4} : undefined}>
        {rows.map(c=>{
          const att=attendance.find(a=>a.classId===c.id&&a.personId===person.id);
          // Light payment-status hint. Jesse is undecided on showing this —
          // to remove it, delete the `payInfo`/`payHint` lines and the
          // {payHint} span below; nothing else depends on them.
          const ps = att?.paymentStatus || 'unpaid';
          // Org-billed classes: the organisation is invoiced, so an individual
          // attendee never "owes" — don't show an unpaid/paid hint for them.
          const orgBilled = c.paymentModel === 'org';
          const payInfo = ps==='paid' ? {t:'paid', c:C.green} : ps==='package' ? {t:'pkg', c:C.blue} : {t:'unpaid', c:C.muted};
          const payHint = orgBilled ? null : <span style={{fontSize:10,color:payInfo.c,opacity:0.85,letterSpacing:'0.3px'}}>{payInfo.t}</span>;
          const cn = classNotes(c);
          const cf = classForms(c);
          const open = bookingNotesOpen.has(c.id);
          // Expand toggle now fires on notes OR forms-worked, not notes alone —
          // a session can have forms tagged with no reflection/notes written yet.
          const hasExpandable = cn.length>0 || cf.length>0;
          const previewText = cn[0]?.text || (cf.length ? `Worked: ${cf.map(f=>f.name).join(', ')}` : '');
          // Web-booking badge: true if a booking interaction exists for this
          // person+session that was made online (form-worker writes "via the
          // website" into the booking interaction text). The booking itself is
          // shown here via the derived attendance row; this badge just marks
          // provenance so online self-bookings are distinguishable from manual.
          const webBooked = notes.some(n => n.kind==='booking' && n.classId===c.id
            && (n.personId===person.id || !n.personId)
            && /via the website/i.test(n.text||''));
          return (<div key={c.id}>
            <div onClick={()=>nav('class_detail',{classId:c.id})} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:open?'none':`1px solid ${C.border}`,cursor:'pointer'}}><div><div style={{color:C.text,fontSize:13}}>{c.name}</div><div style={{color:C.muted,fontSize:11}}>{fmt(c.date)}</div></div><div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>{webBooked&&<span title="Booked online via the website" style={{fontSize:9,fontWeight:600,letterSpacing:'0.4px',textTransform:'uppercase',color:INTERACTION_KINDS.booking.color,background:INTERACTION_KINDS.booking.bg,border:`1px solid ${INTERACTION_KINDS.booking.color}33`,borderRadius:4,padding:'2px 6px'}}>🌐 Web</span>}<NoteIndicator count={hasExpandable ? (cn.length||1) : 0} expanded={open} previewText={previewText} onToggle={()=>toggleBookingNotes(c.id)} />{payHint}<div title={att?.attended?'Attended':'Did not attend'} style={{width:8,height:8,borderRadius:'50%',background:att?.attended?C.green:C.red}} /></div></div>
            {open && hasExpandable && (
              <div style={{background:C.surf,borderBottom:`1px solid ${C.border}`,padding:'8px 10px 10px',marginBottom:0}} onClick={e=>e.stopPropagation()}>
                {cf.length>0 && (
                  <div style={{display:'flex',flexWrap:'wrap',gap:5,padding:'4px 0 8px'}}>
                    {cf.map(f=>(
                      <span key={f.id} style={{background:C.goldBg,border:`1px solid ${C.gold}55`,color:C.gold,borderRadius:20,fontSize:11,fontWeight:500,padding:'2px 9px',letterSpacing:'0.2px'}}>{f.name}</span>
                    ))}
                  </div>
                )}
                {cn.map(n=>(
                  <div key={n.id} style={{display:'flex',gap:7,padding:'4px 0',color:C.text,fontSize:12,lineHeight:1.55}}>
                    <span style={{opacity:0.7,flexShrink:0}}>{n._reflection?'📔':(INTERACTION_KINDS[n.kind]||INTERACTION_KINDS.note).icon}</span>
                    <span>{n.text}</span>
                  </div>
                ))}
                <div onClick={()=>nav('class_detail',{classId:c.id})} style={{marginTop:6,color:C.blue,fontSize:11,cursor:'pointer',display:'inline-block'}}>
                  Open session →
                </div>
              </div>
            )}
          </div>);
        })}
      </div>
      ) : <div style={{color:C.muted,fontSize:13}}>{pClasses.length ? `No ${bookingWhen==='past'?'past':'future'} bookings` : 'No bookings yet'}</div>}
      </>
    );
  };

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
              {person.dateOfBirth&&(()=>{const b=birthdayInfo(person.dateOfBirth);return <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>DATE OF BIRTH</div><div style={{color:C.text,fontSize:13}}>{fmtDayMonth(person.dateOfBirth)}{b&&<span style={{color:b.days<=30?C.gold:C.muted,fontSize:12,marginLeft:8}}>· {b.label}</span>}</div></div>;})()}
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
              {id:'notes',    icon:'💬', name:'Comms',    count:commsNotes.length},
              {id:'bookings', icon:'📅', name:'Bookings', count:pClasses.length},
              {id:'packages', icon:'🎟', name:'Packages', count:pPkgs.length},
              {id:'payments', icon:'💷', name:'Payments', count:pPayments.length},
            ]} />
          ) : (
            <Tabs tabs={[{id:'notes',label:`Comms (${commsNotes.length})`},{id:'bookings',label:`Bookings (${pClasses.length})`},{id:'packages',label:`Packages (${pPkgs.length})`},{id:'payments',label:`Payments (${pPayments.length})`}]} active={tab} onChange={setTab} />
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
                  const chips = ['all', ...COMMS_KINDS.filter(k => commsNotes.some(n => (n.kind||'note')===k))];
                  // Diary chip appended last, only when diary entries exist. It's
                  // sourced from diaryNotes (excluded from commsNotes), so 'All'
                  // stays diary-free and Diary isolates them.
                  if (diaryNotes.length > 0) chips.push('diary');
                  return chips.map(k => {
                    const active = effectiveFilter === k;
                    const meta = k==='all' ? null : INTERACTION_KINDS[k];
                    const label = k==='all' ? 'All' : k==='diary' ? 'Diary' : meta.label + 's';
                    const icon = k==='all' ? '◯' : meta.icon;
                    const count = k==='all' ? commsNotes.length
                      : k==='diary' ? diaryNotes.length
                      : commsNotes.filter(n=>(n.kind||'note')===k).length;
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
                      {Object.entries(INTERACTION_KINDS)
                        // Loggable comms kinds only. Booking removed per request;
                        // payment is transactional and diary is created via the
                        // calendar (DiaryModal), so neither is hand-logged here.
                        .filter(([k]) => !['booking','payment','diary'].includes(k))
                        .map(([k, meta]) => (
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
            {impNotes.length>0&&<><div style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'1px',marginBottom:8,marginTop:4}}>⚑ IMPORTANT</div>{impNotes.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} onReopenNote={onReopenNote} onUpdateActionDate={onUpdateActionDate} onDelete={onDeleteNote} onAddToCalendar={onAddToCalendar} onClick={onEditNote?()=>onEditNote(n):undefined} onReply={n.kind==='email'?startReply:undefined} onOpenThread={canOpenThread(n)?openThread:undefined} highlight={flashId===n.id} />)}{regNotes.length>0&&<div style={{borderTop:`1px solid ${C.border}`,margin:'18px 0',opacity:0.4}} />}</>}
            {regNotes.map(n=><NoteCard key={n.id} note={n} onToggleImportant={onToggleImportant} onClearAction={onClearAction} onReopenNote={onReopenNote} onUpdateActionDate={onUpdateActionDate} onDelete={onDeleteNote} onAddToCalendar={onAddToCalendar} onClick={onEditNote?()=>onEditNote(n):undefined} onReply={n.kind==='email'?startReply:undefined} onOpenThread={canOpenThread(n)?openThread:undefined} highlight={flashId===n.id} />)}
            {visibleNotes.length===0&&!addKind&&<Empty text={effectiveFilter==='all' ? 'No comms yet' : effectiveFilter==='diary' ? 'No diary entries' : `No ${INTERACTION_KINDS[effectiveFilter].label.toLowerCase()}s logged yet`} />}
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
    {replyCtx && (
      <SendEmailModal
        person={person}
        org={org}
        people={people}
        templates={emailTemplates}
        onSaveAsTemplate={onSaveAsTemplate}
        onSend={onSendEmail}
        initialSubject={replyCtx.initialSubject}
        threadId={replyCtx.threadId}
        inReplyTo={replyCtx.inReplyTo}
        draftKey={replyCtx.draftKey}
        onClose={()=>setReplyCtx(null)}
      />
    )}
    {composeOpen && (
      <SendEmailModal
        person={person}
        org={org}
        people={people}
        templates={emailTemplates}
        onSaveAsTemplate={onSaveAsTemplate}
        onSend={onSendEmail}
        draftKey={`felt.compose.draft.${person.id}`}
        onClose={()=>setComposeOpen(false)}
      />
    )}
    </>
  );
}

// ─── CLASSES LIST / DETAIL ────────────────────────────────────────────────────

export function ClassDetail({ cls, org, people, attendance, notes, series, forms, packages, nav, backInfo, onToggle, onAddNote, onAddToRegister, onEdit, onToggleImportant, onClearAction, onReopenNote, onDeleteNote, onUpdateActionDate, onUpdateClass, onSetPayment, onDeleteClass, onRemoveFromRegister }) {
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

export function PaymentEditor({ attendance: a, cls, packages, allAttendance, onSave, onCancel }) {
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


