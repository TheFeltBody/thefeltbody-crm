import { useEffect, useMemo, useState } from "react";
import { BANK_DETAILS, C, CLIENT_ROLES, HOME_HOUSEHOLD_NAME, INTERACTION_KINDS, INV_STATUS, KIND_META, ORG_META, PERSON_ROLES, PKG_TYPES, RECURRENCE, RELATIONSHIP_LABELS, hasPersonalRole, isPersonalOnly, isPersonalOrg } from "../lib/constants.js";
import { PrintInvoiceOverlay, addDays, birthdayInfo, calendarDateEvents, classKindKey, contactDateInfo, currentHourTime, deriveActivity, downloadInvoiceHtml, endOfWeek, fmt, fmtMoney, fmtRel, fmtTime, initials, isBirthdayYearKnown, isCountlessPkg, lastDayOfMonth, primaryRole, startOfWeek, timeToMin, today, useIsMobile, useLocalStorage, useMobileUI, useTypes, webEvents, webUnreadCount } from "../lib/helpers.jsx";
import { Avatar, Btn, ConfirmBtn, Empty, KindBadge, MobileHeader, Modal, PageHead, RoleBadge, Row, SearchSelect, SourceTag, Stat } from "./primitives.jsx";
import { SendEmailModal } from "./forms.jsx";

export function SidebarCustomTypeItem({ active, indent, label, icon, count, onNav, onDelete, onEdit }) {
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
      {hover && onEdit && !armed && (
        <button onClick={(e)=>{ e.stopPropagation(); onEdit(); }}
          title="Edit"
          style={{background:'none',border:'none',color:C.muted,cursor:'pointer',padding:'2px 5px',fontSize:12,marginLeft:2,opacity:0.6,fontFamily:"'Jost',sans-serif",lineHeight:1}}>
          ✎
        </button>
      )}
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

// Collapsible parent-category header for grouping person roles in the sidebar.
// Open/closed state persists per group (keyed by groupKey) so collapsing a
// category to de-clutter the nav survives navigation and reloads.
function RoleParentGroup({ groupKey, label, count, children, defaultOpen=true }) {
  const [open, setOpen] = useLocalStorage(`felt.nav.rolegroup.${groupKey}`, defaultOpen);
  return (
    <>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:'flex',alignItems:'center',gap:7,padding:'7px 20px 7px 28px',color:C.muted,cursor:'pointer',fontSize:10,fontWeight:600,letterSpacing:'0.6px',textTransform:'uppercase',userSelect:'none'}}>
        <span style={{fontSize:9,width:10,flexShrink:0,transition:'transform 0.12s',transform:open?'rotate(90deg)':'none'}}>▶</span>
        <span style={{flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</span>
        {count>0 && <span style={{opacity:0.6,fontSize:10}}>{count}</span>}
      </div>
      {open && children}
    </>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────

export function Sidebar({ view, nav, invoices, notes, projects=[], customOrgTypes, customPersonRoles, roleParents=[], onAddOrgType, onAddPersonRole, orgs, people, onRemoveOrgType, onRemovePersonRole, onEditPersonRole, onSignOut, mode='client', onSwitchMode, onAddPersonalOrg }) {
  const unpaidInvoices = invoices.filter(i=>i.status!=='paid').length;
  const { personRoles } = useTypes();
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
    (view.name === 'week_view' || view.name === 'month_view') ? (mode === 'personal' ? 'diary' : 'sessions') :
    (view.name === 'classes' || view.name === 'class_detail' || view.name === 'forms_list') ? 'sessions' :
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
      {!isPersonal && <Item name="documents" label="Documents" icon="📎" />}
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
              <Item name="care_home_resources" label="Care Home Resources" icon="📑" indent
                isActive={view.name==='care_home_resources'} />
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
            <>
              <Item name="people" params={{personType:'__personal_all__'}} label="All Personal Contacts" icon="◉" indent />
              {(() => {
                // Sub-roles parented to `personal` become their own filter items,
                // mirroring the client side. Lets you organise the personal side
                // (Family, Friends, Household, …) instead of a single flat tag.
                const personalRoleKeys = Object.keys(personRoles).filter(k =>
                  (personRoles[k]?.parentKey || null) === 'personal');
                return personalRoleKeys.map(key => {
                  const meta = personRoles[key] || {};
                  const isBuiltin = Object.prototype.hasOwnProperty.call(PERSON_ROLES, key);
                  const count = people.filter(p=>(p.roles||[]).includes(key)).length;
                  const active = view.name==='people' && view.personType===key;
                  return <SidebarCustomTypeItem key={key}
                    active={active} indent
                    label={`${meta.label||key}s`} icon="▸" count={count}
                    onNav={()=>nav('people',{personType:key})}
                    onEdit={onEditPersonRole ? ()=>onEditPersonRole(key) : undefined}
                    onDelete={isBuiltin ? undefined : (()=>onRemovePersonRole && onRemovePersonRole(key))} />;
                });
              })()}
              <AddTypeAction onClick={onAddPersonRole} />
            </>
          ) : (
            <>
              <Item name="people" params={{personType:'recent'}} label="Recent Contacts" icon="◷" indent />
              <Item name="people" params={{personType:'all'}} label="All Contacts" icon="◉" indent />
              {(() => {
                // Hand-tuned plurals for the built-in roles; custom roles get a
                // naive "+s". personal_contact is excluded (it's its own section).
                const plural = { private_client:'Private Clients', website_student:'Students', resident:'Residents', tt_prospect:'TT Prospects', retreat_interest:'Retreat Interest', workshop_interest:'Workshop Interest' };
                const labelFor = (key, meta) => plural[key] || `${meta.label||key}s`;
                // Renders one role row. Built-ins (in PERSON_ROLES) are edit-only;
                // custom roles also get delete.
                const renderRole = (key) => {
                  const meta = personRoles[key] || {};
                  const isBuiltin = Object.prototype.hasOwnProperty.call(PERSON_ROLES, key);
                  const count = people.filter(p=>(p.roles||[]).includes(key)).length;
                  const active = view.name==='people' && view.personType===key;
                  return <SidebarCustomTypeItem key={key}
                    active={active} indent
                    label={labelFor(key, meta)} icon="▸" count={count}
                    onNav={()=>nav('people',{personType:key})}
                    onEdit={onEditPersonRole ? ()=>onEditPersonRole(key) : undefined}
                    onDelete={isBuiltin ? undefined : (()=>onRemovePersonRole && onRemovePersonRole(key))} />;
                };
                // All displayable role keys (built-in + custom). Exclude the
                // legacy personal_contact tag AND anything parented to `personal`
                // — those live in the Personal Record System's own section.
                const allKeys = Object.keys(personRoles).filter(k =>
                  k !== 'personal_contact' && (personRoles[k]?.parentKey || null) !== 'personal');
                const byParent = (pk) => allKeys.filter(k => (personRoles[k]?.parentKey || null) === pk);
                const memberCount = (keys) => people.filter(p => (p.roles||[]).some(r => keys.includes(r))).length;
                const orphans = byParent(null);
                return (
                  <>
                    {roleParents.filter(par => par.key !== 'personal').map(par => {
                      const keys = byParent(par.key);
                      if (keys.length === 0) return null; // hide empty categories
                      return (
                        <RoleParentGroup key={par.key} groupKey={par.key} label={par.label} count={memberCount(keys)}>
                          {keys.map(renderRole)}
                        </RoleParentGroup>
                      );
                    })}
                    {/* Uncategorised roles render flat (no header) so nothing is hidden
                        before you've assigned parents. */}
                    {orphans.map(renderRole)}
                  </>
                );
              })()}
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

      {/* Personal-mode diary — reuses the same Week/Month views, which grey the
          opposite (business) calendar when mode==='personal'. */}
      {isPersonal && <SectionToggle label="Diary" sectionKey="diary" />}
      {isPersonal && openSection==='diary' && (
        <>
          <Item name="week_view" label="Week View" icon="▦" indent />
          <Item name="month_view" label="Month View" icon="▥" indent />
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
      {!isPersonal && <Item name="email_templates" label="Email Templates" icon="✉" />}

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

export function QuickTodoModal({ people, projects=[], onSave, onClose }) {
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

export function Dashboard({ orgs, people, classes, attendance, notes, packages, invoices, projects=[], contactDates=[], nav, onAddClass, onCompleteNote, onReopenNote, onAddTodo, onMarkWebRead }) {
  const { personRoles } = useTypes();
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
      key: 'week',
      title: 'This week',
      meta: null,
      action: (
        <button onClick={()=>nav('week_view')}
          style={{background:'none',border:'none',color:C.gold,cursor:'pointer',fontSize:12,padding:0,fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>
          Open →
        </button>
      ),
      body: () => <MiniWeek classes={classes} notes={notes} people={people} contactDates={contactDates} mode="client" nav={nav} />,
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
        <Stat label="All Contacts" value={people.filter(p=>!isPersonalOnly(p, personRoles)).length} sub={`${people.filter(p=>p.status==='active'&&!isPersonalOnly(p, personRoles)).length} active`} />
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

      <div style={{marginTop:32,marginBottom:32}}>
        <MiniWeek classes={classes} notes={notes} people={people} contactDates={contactDates} mode="client" nav={nav} />
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

export function InboxView({ notes, people, attendance, classes, onAssign, onDiscard }) {
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

export function AssignToPersonModal({ note, people, attendance, classes, onClose, onAssign }) {
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

export function WebActivityRow({ note, personName, onOpen, compact }) {
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


export function WebActivityView({ notes, people, nav, onMarkRead, onMarkAllRead }) {
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

export function BirthdaysView({ people, orgs, nav }) {
  const isMobile = useIsMobile();
  const { personRoles } = useTypes();
  const personal = useMemo(() => people.filter(p => hasPersonalRole(p, personRoles)), [people, personRoles]);
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
          <div style={{color:C.muted,fontSize:12,flexShrink:0}}>{isBirthdayYearKnown(p.dateOfBirth) ? p.dateOfBirth : String(p.dateOfBirth).slice(5)}</div>
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

export function ThreadsView({ notes, people, nav, onMarkThreadRead, initialThreadKey, onSendEmail, emailTemplates=[], onSaveAsTemplate }) {
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
      templates={emailTemplates}
      onSaveAsTemplate={onSaveAsTemplate}
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

export function RecentActivityView({ notes, people, classes, orgs, attendance, packages, projects=[], nav }) {
  const isMobile = useIsMobile();
  const { personRoles } = useTypes();
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
    const personIsPersonal = p => isPersonalOnly(p, personRoles);
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

export function HouseholdsList({ households, householdMembers, people, nav, onEditHousehold }) {
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
              {onEditHousehold && members.length > 0 && (
                <button onClick={(e)=>{e.stopPropagation();onEditHousehold(h.id);}}
                  style={{background:'none',border:`1px solid ${C.border}`,color:C.gold,cursor:'pointer',borderRadius:6,fontSize:11,padding:'4px 10px',flexShrink:0,fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>
                  Edit
                </button>
              )}
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

export function PersonalDashboard({ people, orgs, classes=[], households, householdMembers, contactDates, notes=[], projects=[], nav }) {
  const isMobile = useIsMobile();
  const { personRoles } = useTypes();
  // Which home-member rows are expanded to show their recent interactions.
  const [expandedMember, setExpandedMember] = useState(() => new Set());
  const toggleMember = (id) => setExpandedMember(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  // Last 5 interactions (any kind) per person, newest first. Built once over all
  // notes so an expand is a cheap lookup rather than a re-scan per row.
  const recentByPerson = useMemo(() => {
    const map = new Map();
    notes.forEach(n => {
      if (!n.personId) return;
      if (!map.has(n.personId)) map.set(n.personId, []);
      map.get(n.personId).push(n);
    });
    map.forEach(list => list.sort((a,b) => {
      const d = new Date(b.date) - new Date(a.date);
      return d !== 0 ? d : String(b.id).localeCompare(String(a.id));
    }));
    return map;
  }, [notes]);

  // Personal contacts only (mirrors BirthdaysView scoping).
  const personalIds = useMemo(() => new Set(
    people.filter(p => hasPersonalRole(p, personRoles)).map(p => p.id)
  ), [people, personRoles]);
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

      <div style={{marginBottom:18}}>
        <MiniWeek classes={classes} notes={notes} people={people} contactDates={contactDates} mode="personal" nav={nav} />
      </div>

      <Card title={homeHousehold ? homeHousehold.name : 'Household'} onMore={()=>nav('households')}>
        {!homeHousehold ? (
          <Empty text="Home household not found. Create or rename one to match, or browse all households." />
        ) : homeMembers.length === 0 ? (
          <div style={{color:C.muted,fontSize:13,fontStyle:'italic',padding:'4px 0'}}>No members yet.</div>
        ) : homeMembers.map(m => {
          const isOpen = expandedMember.has(m.person.id);
          const recent = (recentByPerson.get(m.person.id) || []).slice(0, 5);
          return (
            <div key={m.id} style={{borderBottom:`1px solid ${C.border}44`}}>
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0'}}>
                <span style={{color:C.muted,fontSize:13,width:16,flexShrink:0}}>◉</span>
                {/* Name → contact */}
                <span onClick={()=>nav('person_detail',{personId:m.person.id})}
                  style={{flex:1,minWidth:0,color:C.text,fontSize:14,cursor:'pointer',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.person.name}</span>
                <span style={{color:C.muted,fontSize:11,flexShrink:0}}>{RELATIONSHIP_LABELS[m.relationship] || 'Other'}</span>
                {/* Right side → expand last 5 interactions */}
                <span onClick={()=>toggleMember(m.person.id)} title={isOpen?'Hide recent notes':'Show recent notes'}
                  style={{color:C.muted,fontSize:12,width:18,flexShrink:0,textAlign:'center',cursor:'pointer',transition:'transform 0.12s',transform:isOpen?'rotate(90deg)':'none'}}>▸</span>
              </div>
              {isOpen && (
                <div style={{padding:'2px 0 10px 26px'}}>
                  {recent.length === 0 ? (
                    <div style={{color:C.muted,fontSize:12,fontStyle:'italic',padding:'4px 0'}}>No notes yet.</div>
                  ) : recent.map(n => {
                    const meta = KIND_META[n.kind] || KIND_META.note || {};
                    const head = (n.subject && n.subject.trim()) ? n.subject.trim() : (n.text || '').trim();
                    return (
                      <div key={n.id} onClick={()=>nav('person_detail',{personId:m.person.id,highlightNoteId:n.id})}
                        style={{display:'flex',gap:8,padding:'6px 0',cursor:'pointer',borderBottom:`1px solid ${C.border}22`}}>
                        <span style={{color:C.muted,fontSize:10,width:62,flexShrink:0,paddingTop:2}}>{fmtRel ? fmtRel(n.date) : n.date}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:C.text,fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{head || <span style={{color:C.muted,fontStyle:'italic'}}>(no content)</span>}</div>
                          <div style={{color:C.muted,fontSize:10,marginTop:1,letterSpacing:'0.3px',textTransform:'uppercase'}}>{meta.label || n.kind}{n.direction?` · ${n.direction}`:''}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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

export function ProjectsView({ projects, notes, nav, onAddProject, onSetStatus, mode='client' }) {
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

export function PackageTemplatesView({ templates, nav, onAdd, onEdit, onSetActive, onDelete }) {
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

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────────
// Manage the canned email bodies surfaced in SendEmailModal's picker. Mirrors
// PackageTemplatesView: active list + collapsible archived section, with
// add/edit/archive/restore/delete. A template is { id, label, subject, body,
// branch, active }. `branch` (optional) lifts a template to the top of the
// picker for matching recipients (currently 'care_home'). Stored as one settings
// row (key 'email_templates', value { templates:[...] }) — the parent handlers
// own the array mutation + persistence; this view is presentational.
export function EmailTemplatesView({ templates, onAdd, onEdit, onSetActive, onDelete }) {
  const isMobile = useIsMobile();
  const [showArchived, setShowArchived] = useState(false);
  const active = templates.filter(t => t.active !== false);
  const archived = templates.filter(t => t.active === false);

  const Card = ({ t }) => {
    const [armed, setArmed] = useState(false);
    const branchLabel = t.branch === 'care_home' ? 'Care home' : (t.branch || '');
    const snippet = String(t.body || '').replace(/\s+/g, ' ').trim().slice(0, 110);
    const on = t.active !== false;
    return (
      <div style={{background:C.card,border:`1px solid ${on?C.gold+'55':C.border}`,borderRadius:8,padding:'14px 16px',display:'flex',alignItems:'flex-start',gap:14}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.text,fontSize:15,fontWeight:500}}>
            {t.label || '(untitled)'}
            {branchLabel && <span style={{color:C.muted,fontSize:11,marginLeft:8,fontWeight:400}}>· {branchLabel}</span>}
          </div>
          {t.subject && <div style={{color:C.muted,fontSize:12,marginTop:3,fontStyle:'italic'}}>“{t.subject}”</div>}
          {snippet && <div style={{color:C.muted,fontSize:12,marginTop:3,lineHeight:1.4}}>{snippet}{t.body && t.body.length>110?'…':''}</div>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <Btn variant="ghost" small onClick={()=>onEdit(t.id)}>Edit</Btn>
          {on
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
        Email Templates
      </PageHead>
      {!isMobile && (
        <p style={{color:C.muted,fontSize:13,marginTop:-12,marginBottom:22,lineHeight:1.5,maxWidth:560}}>
          Canned messages for the compose window. Use <span style={{color:C.text}}>{'{name}'}</span> or <span style={{color:C.text}}>{'{firstName}'}</span> and they’ll fill from the contact; leave [square-bracket] notes for anything you’ll edit by hand.
        </p>
      )}

      {templates.length === 0 ? (
        <Empty text="No email templates yet." action="+ New Template" onAction={onAdd} />
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

export function OrgList({ orgs, people, classes, orgType, nav, onAdd }) {
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


export function PeopleList({ people, orgs, personType, nav, onAdd, onMerge, households=[], householdMembers=[], recentPersonIds=[] }) {
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
    : people.filter(p => {
        if (personType==='all') return !isPersonalOnly(p, personRoles);
        if (personType==='__personal_all__') return hasPersonalRole(p, personRoles);
        return p.roles.includes(personType);
      });
  const list = baseList.filter(p=>!q||p.name.toLowerCase().includes(q.toLowerCase())||(p.email||'').toLowerCase().includes(q.toLowerCase()));
  const title = isRecent
    ? 'Recent Contacts'
    : (personType==='all' ? 'All Contacts'
      : personType==='__personal_all__' ? 'All Personal Contacts'
      : ((personRoles[personType]||PERSON_ROLES[personType])?.label+'s' || personType));
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

export function ClassList({ classes, orgs, series, attendance, nav, onAdd }) {
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


// ─── MINI WEEK (dashboard widget) ─────────────────────────────────────────────
// A compact, read-only week strip for the dashboards. Shows classes + diary as
// small time-grid blocks, greying whichever belongs to the opposite calendar to
// `mode`. Has its own ‹ › week navigation but no add/edit — clicking anywhere in
// the grid (or the header) jumps to the full Week View. Fixed 7am–9pm window
// (no auto-extend) keeps it predictably small; anything outside falls into a
// compact "all-day / off-hours" count rather than stretching the widget.
export function MiniWeek({ classes, notes, people=[], contactDates=[], mode='client', nav }) {
  const t = today();
  const personalMode = mode === 'personal';
  const [offset, setOffset] = useState(0); // weeks from current
  const anchor = useMemo(() => addDays(startOfWeek(t), offset*7), [t, offset]);
  const days = useMemo(() => Array.from({length:7}, (_,i) => addDays(anchor, i)), [anchor]);
  const weekEnd = days[6];

  // Birthdays + anniversaries + one-off dates falling in the visible week.
  // Shown as a compact all-day strip above the time grid (these are date-only,
  // so they don't belong in the timed columns). Same source as the full Week
  // view's DATES row, so the two stay consistent.
  const dateEvents = useMemo(() =>
    calendarDateEvents(people, contactDates, anchor, weekEnd),
    [people, contactDates, anchor, weekEnd]);

  const SLOT_MIN = 30, SLOT_HEIGHT = 9;       // tight vertical scale
  const G_START = 7*60, G_END = 21*60;        // fixed 7am–9pm
  const totalSlots = (G_END - G_START) / SLOT_MIN;
  const gridHeight = totalSlots * SLOT_HEIGHT;

  // Merge classes + diary into one positioned stream. diary flags styling.
  const items = useMemo(() => {
    const out = [];
    classes.forEach(c => {
      if(c.date < anchor || c.date > weekEnd) return;
      const m = timeToMin(c.time); if(m === null) return;
      out.push({ id:'c_'+c.id, date:c.date, min:m, dur:c.duration||60, name:c.name||'', isPersonal:false, diary:false });
    });
    (notes||[]).forEach(n => {
      if(n.kind !== 'diary' || n.date < anchor || n.date > weekEnd) return;
      const m = timeToMin(n.time); if(m === null) return;
      out.push({ id:'d_'+n.id, date:n.date, min:m, dur:n.durationMins||60, name:(n.subject||n.text||''), isPersonal:!!n.isPersonal, diary:true });
    });
    return out;
  }, [classes, notes, anchor, weekEnd]);

  const monthLabel = (() => {
    const a = new Date(anchor+'T12:00'), e = new Date(weekEnd+'T12:00');
    if(a.getMonth()===e.getMonth()) return a.toLocaleDateString('en-GB',{month:'short',day:'numeric'})+' – '+e.getDate();
    return a.toLocaleDateString('en-GB',{month:'short',day:'numeric'})+' – '+e.toLocaleDateString('en-GB',{month:'short',day:'numeric'});
  })();

  const btn = { background:'none', border:`1px solid ${C.border}`, color:C.muted, cursor:'pointer', borderRadius:5, fontSize:12, padding:'2px 7px', lineHeight:1, fontFamily:"'Jost',sans-serif" };

  return (
    <div style={{border:`1px solid ${C.border}`,borderRadius:10,padding:14,background:C.card}}>
      {/* Header: label + week nav + full-view link */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,color:C.text,fontWeight:600,cursor:'pointer'}} onClick={()=>nav('week_view')}>
          {offset===0 ? 'This week' : monthLabel}
        </div>
        <div style={{flex:1}} />
        <button style={btn} onClick={()=>setOffset(o=>o-1)}>‹</button>
        {offset!==0 && <button style={btn} onClick={()=>setOffset(0)}>Today</button>}
        <button style={btn} onClick={()=>setOffset(o=>o+1)}>›</button>
        <button style={{...btn,color:C.gold,borderColor:C.gold+'88'}} onClick={()=>nav('week_view')}>Open ↗</button>
      </div>

      {/* Day-of-week header */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:3}}>
        {days.map((d,i)=>{
          const isToday = d===t;
          const dd = new Date(d+'T12:00');
          return (
            <div key={d} style={{textAlign:'center'}}>
              <div style={{color:isToday?C.gold:C.muted,fontSize:8,fontWeight:600,letterSpacing:'0.5px'}}>{['M','T','W','T','F','S','S'][i]}</div>
              <div style={{color:isToday?C.gold:C.text,fontSize:11,fontWeight:isToday?600:400}}>{dd.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* All-day date strip — birthdays / anniversaries / one-off dates. Only
          renders when at least one event falls in the visible week, so it costs
          no vertical space on empty weeks. Each cell shows the event emoji(s)
          with a native tooltip naming them; clicking jumps to the full view. */}
      {dateEvents.length>0 && (
        <div onClick={()=>nav('week_view')}
          style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:3,cursor:'pointer'}}>
          {days.map(d=>{
            const evs = dateEvents.filter(e => e.date===d);
            const tip = evs.map(e => `${e.emoji} ${e.label}`).join('\n');
            return (
              <div key={d} title={tip||undefined}
                style={{minHeight:13,borderRadius:3,background:evs.length?C.goldBg+'55':'transparent',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:1,overflow:'hidden'}}>
                {evs.slice(0,3).map(e=>(
                  <span key={e.id} style={{fontSize:9,lineHeight:1}}>{e.emoji}</span>
                ))}
                {evs.length>3 && <span style={{fontSize:7,color:C.muted}}>+{evs.length-3}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Mini grid — read-only; clicking jumps to full Week View */}
      <div onClick={()=>nav('week_view')}
        style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,cursor:'pointer'}}>
        {days.map((d,i)=>{
          const isToday = d===t;
          const dayItems = items.filter(it => it.date===d);
          return (
            <div key={d} style={{position:'relative',height:gridHeight,borderRadius:4,background:isToday?C.goldBg+'33':C.bg,border:`1px solid ${C.border}`,overflow:'hidden'}}>
              {dayItems.map(it=>{
                const offMode = it.diary ? (it.isPersonal !== personalMode) : (personalMode); // classes are business; off-mode in personal
                const accent = offMode ? C.muted : (it.diary ? (it.isPersonal?C.blue:C.gold) : C.gold);
                const top = Math.max(0, ((it.min - G_START)/SLOT_MIN)*SLOT_HEIGHT);
                const h = Math.max(8, (it.dur/SLOT_MIN)*SLOT_HEIGHT - 1);
                if(it.min >= G_END || it.min+it.dur <= G_START) return null;
                const tLbl = `${String(Math.floor(it.min/60)).padStart(2,'0')}:${String(it.min%60).padStart(2,'0')}`;
                const sideLbl = it.diary ? (it.isPersonal?'personal':'business') : 'business';
                const tip = `${it.name} · ${fmtTime(tLbl)}${offMode?` · ${sideLbl}`:''}`;
                return (
                  <div key={it.id} title={tip}
                    style={{position:'absolute',top,height:h,left:1,right:1,borderRadius:2,
                      background: offMode ? C.muted+'22' : accent+'2e',
                      borderLeft:`2px ${it.diary?'dashed':'solid'} ${accent}`,
                      opacity: offMode ? 0.7 : 1,
                      overflow:'hidden',padding:'0 2px',
                      display:'flex',alignItems:'center'}}>
                    <span style={{fontSize:7,lineHeight:1,color:offMode?C.muted:C.text,
                      fontStyle:it.diary?'italic':'normal',
                      whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.name}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}


export function WeekView({ classes, orgs, notes, people, contactDates=[], nav, backInfo, mode='client', onAddClass, onAddDiary, onEditDiary, onUpdateActionDate, onClearAction, onToggleImportant }) {
  const isMobile = useIsMobile();
  const t = today();
  const personalMode = mode === 'personal';
  // Anchor the week to Monday (UK convention).
  const initialAnchor = useMemo(() => startOfWeek(t), [t]);
  const [anchor, setAnchor] = useState(initialAnchor);
  const days = useMemo(() => Array.from({length:7}, (_,i) => addDays(anchor, i)), [anchor]);
  const weekEnd = days[6];

  const weekClasses = useMemo(() =>
    classes.filter(c => c.date >= anchor && c.date <= weekEnd),
    [classes, anchor, weekEnd]);
  // Diary entries (kind='diary') normalised into the class-like shape the grid
  // renders, so they flow through the same classBlock positioner and day-column
  // map. __diary flags them for greyed off-mode styling + nav-to-person click.
  const weekDiary = useMemo(() =>
    notes
      .filter(n => n.kind === 'diary' && n.date >= anchor && n.date <= weekEnd)
      .map(n => ({
        id: 'diary_' + n.id,
        __diary: true,
        __noteId: n.id,
        __note: n,
        __personId: n.personId || null,
        __projectId: n.projectId || null,
        name: n.subject || n.text,   // title is the calendar label; fall back to body
        body: n.subject ? (n.text || '') : '',  // longer note for the tooltip (only if distinct from label)
        date: n.date,
        time: n.time || null,
        duration: n.durationMins || 60,
        isPersonal: !!n.isPersonal,
        location: '',
      })),
    [notes, anchor, weekEnd]);
  // Birthdays + anniversaries falling in the visible week, as all-day banner
  // items. Shown in both modes (personal life-admin AND business — a client's
  // birthday is worth a nudge either way). Rendered in the DATES row, not the
  // time grid, since these are date-only events.
  const weekDates = useMemo(() =>
    calendarDateEvents(people, contactDates, anchor, weekEnd),
    [people, contactDates, anchor, weekEnd]);
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
    const scan = (item) => {
      const m = timeToMin(item.time);
      if(m === null) return;
      const dur = item.duration || 60;
      const startSlot = Math.floor(m / SLOT_MIN) * SLOT_MIN;
      const endSlot = Math.ceil((m + dur) / SLOT_MIN) * SLOT_MIN;
      if(startSlot < s) s = startSlot;
      if(endSlot > e) e = endSlot;
    };
    weekClasses.forEach(scan);
    weekDiary.forEach(scan);
    return { gridStart: s, gridEnd: e };
  }, [weekClasses, weekDiary]);
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
        <div style={{display:'flex',gap:8}}>
          {onAddDiary && <Btn small variant="secondary" onClick={()=>onAddDiary(t, currentHourTime())}>+ Diary</Btn>}
          <Btn small onClick={()=>onAddClass && onAddClass(t)}>+ Class</Btn>
        </div>
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

      {/* Birthdays / anniversaries row — all-day banner, both modes. Click → contact. */}
      {weekDates.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'56px repeat(7, 1fr)',borderBottom:`1px solid ${C.border}`,marginBottom:6}}>
          <div style={{color:C.muted,fontSize:9,letterSpacing:'1.2px',padding:'6px 4px',textAlign:'right',fontWeight:600}}>DATES</div>
          {days.map(d => {
            const items = weekDates.filter(e => e.date === d);
            return (
              <div key={d} style={{padding:'4px',display:'flex',flexDirection:'column',gap:3,minHeight:24}}>
                {items.map(e => (
                  <div key={e.id} onClick={()=>e.personId&&nav('person_detail',{personId:e.personId})}
                    title={e.label}
                    style={{background:C.gold+'18',border:`1px solid ${C.gold}55`,borderRadius:4,
                      padding:'3px 6px',cursor:e.personId?'pointer':'default',fontSize:11,color:C.text,
                      lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {e.emoji} {e.label}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

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
          const dayDiary = weekDiary.filter(e => e.date === d && timeToMin(e.time) !== null);
          // Click an empty part of the column → quick-add a diary entry, with the
          // time derived from the click's vertical position (snapped to 30 min).
          const onColumnClick = (ev) => {
            if(!onAddDiary) return;
            // Ignore clicks that landed on a block (they handle their own nav).
            if(ev.target !== ev.currentTarget) return;
            const rect = ev.currentTarget.getBoundingClientRect();
            const y = ev.clientY - rect.top;
            const rawMin = gridStart + Math.floor(y / SLOT_HEIGHT) * SLOT_MIN;
            const hh = String(Math.floor(rawMin / 60)).padStart(2,'0');
            const mm = String(rawMin % 60).padStart(2,'0');
            onAddDiary(d, `${hh}:${mm}`);
          };
          return (
            <div key={d} onClick={onColumnClick}
              style={{position:'relative',height:gridHeight,borderRight:i<6?`1px solid ${C.border}`:'none',background:lbl.isToday?C.goldBg+'22':'transparent',cursor:onAddDiary?'copy':'default'}}>
              {/* Half-hourly gridlines: full lines on the hour, subtle lines on the half */}
              {Array.from({length: totalSlots}, (_, j) => {
                const minute = gridStart + j * SLOT_MIN;
                const isFullHour = minute % 60 === 0;
                return (
                  <div key={j} style={{
                    position:'absolute', top:j*SLOT_HEIGHT, left:0, right:0,
                    height:1, background:C.border,
                    opacity: isFullHour ? 0.45 : 0.18,
                    pointerEvents:'none',
                  }} />
                );
              })}
              {/* Today indicator line at current time */}
              {lbl.isToday && (() => {
                const now = new Date();
                const nowMin = now.getHours()*60 + now.getMinutes();
                const yMin = nowMin - gridStart;
                if(yMin < 0 || yMin > (gridEnd - gridStart)) return null;
                return <div style={{position:'absolute',top:(yMin/SLOT_MIN)*SLOT_HEIGHT,left:0,right:0,height:2,background:C.red,zIndex:2,boxShadow:`0 0 4px ${C.red}99`,pointerEvents:'none'}} />;
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
              {/* Diary blocks — colour by personal(blue)/business(gold); greyed +
                  muted when they belong to the opposite calendar to the current
                  mode, but still clickable through to the linked contact. */}
              {dayDiary.map(e => {
                const block = classBlock(e);
                if(!block) return null;
                const offMode = e.isPersonal !== personalMode;
                const accent = offMode ? C.muted : (e.isPersonal ? C.blue : C.gold);
                const compact = block.height < 28;
                const onClick = () => {
                  if(onEditDiary) onEditDiary(e.__note);
                  else if(e.__personId) nav('person_detail',{personId:e.__personId,highlightNoteId:e.__noteId});
                  else if(e.__projectId) nav('project_detail',{projectId:e.__projectId});
                };
                return (
                  <div key={e.id} onClick={onClick}
                    style={{
                      position:'absolute', top:block.top, height:block.height, left:3, right:3,
                      background: offMode ? C.card : accent+'1e',
                      border:`1px dashed ${accent}${offMode?'55':'88'}`,
                      borderLeft:`3px solid ${accent}`,
                      borderRadius:4, padding: compact ? '1px 6px' : '2px 6px',
                      cursor:'pointer', overflow:'hidden',
                      opacity: offMode ? 0.5 : 1,
                      fontFamily:"'Jost',sans-serif",
                      transition:'all 0.12s',
                      display:'flex', flexDirection:'column', justifyContent: compact ? 'center' : 'flex-start',
                    }}
                    onMouseEnter={ev=>{ev.currentTarget.style.opacity=1;ev.currentTarget.style.zIndex=3;}}
                    onMouseLeave={ev=>{ev.currentTarget.style.opacity=offMode?0.5:1;ev.currentTarget.style.zIndex=1;}}
                    title={`${e.name}${fmtTime(e.time)?` · ${fmtTime(e.time)} · ${e.duration} min`:''}${offMode?` · ${e.isPersonal?'personal':'business'}`:''}${e.body?`\n\n${e.body}`:''}`}>
                    <div style={{color:offMode?C.muted:C.text,fontSize:11,fontWeight:500,lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontStyle:'italic'}}>{e.name}</div>
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

export function MonthView({ classes, orgs, notes, people=[], contactDates=[], nav, backInfo, mode='client', onAddClass, onAddDiary, onEditDiary }) {
  const isMobile = useIsMobile();
  const t = today();
  const personalMode = mode === 'personal';
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
  // Diary entries grouped by date for the month grid.
  const diaryByDate = useMemo(() => {
    const map = {};
    (notes||[]).forEach(n => { if(n.kind==='diary') (map[n.date]||(map[n.date]=[])).push(n); });
    Object.values(map).forEach(list => list.sort((x,y)=>(x.time||'').localeCompare(y.time||'')));
    return map;
  }, [notes]);
  // Birthdays + anniversaries across the visible 6-week grid, grouped by date.
  // Shown as gold banner pills at the top of each day cell, both modes.
  const datesByDate = useMemo(() => {
    const map = {};
    const gridEndCell = cells[cells.length-1];
    calendarDateEvents(people, contactDates, gridStart, gridEndCell)
      .forEach(e => { (map[e.date]||(map[e.date]=[])).push(e); });
    return map;
  }, [people, contactDates, gridStart, cells]);
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

  // Diary pill — italic, dashed accent, greyed when off-mode. Clicking navigates
  // to the linked contact (or project), mirroring WeekView.
  const DiaryPill = ({ n }) => {
    const offMode = !!n.isPersonal !== personalMode;
    const accent = offMode ? C.muted : (n.isPersonal ? C.blue : C.gold);
    const label = n.subject || n.text;       // title is the label
    const body = n.subject ? (n.text || '') : '';  // longer note for tooltip
    const tip = `${label}${fmtTime(n.time)?` · ${fmtTime(n.time)}`:''}${offMode?` · ${n.isPersonal?'personal':'business'}`:''}${body?`\n\n${body}`:''}`;
    const go = (e) => {
      e.stopPropagation();
      if(onEditDiary) onEditDiary(n);
      else if(n.personId) nav('person_detail',{personId:n.personId,highlightNoteId:n.id});
      else if(n.projectId) nav('project_detail',{projectId:n.projectId});
    };
    return (
      <div onClick={go} title={tip}
        style={{background:offMode?'transparent':accent+'18',borderLeft:`2px dashed ${accent}`,borderRadius:3,padding:isMobile?'1px 3px':'1px 4px',marginBottom:2,cursor:'pointer',opacity:offMode?0.55:1,display:'flex',alignItems:'center',gap:4,overflow:'hidden'}}>
        {!isMobile && n.time && <span style={{color:accent,fontSize:9,fontWeight:600,flexShrink:0}}>{fmtTime(n.time)}</span>}
        <span style={{color:offMode?C.muted:C.text,fontSize:10,fontStyle:'italic',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{isMobile ? (fmtTime(n.time)||label) : label}</span>
      </div>
    );
  };

  // Birthday / anniversary pill — gold banner, emoji + label. Click → contact.
  // Not counted against the per-cell pill cap (celebrations are few per day and
  // worth always seeing). On mobile, emoji-only to fit the narrow cell.
  const DatePill = ({ e }) => (
    <div onClick={(ev)=>{ ev.stopPropagation(); if(e.personId) nav('person_detail',{personId:e.personId}); }}
      title={e.label}
      style={{background:C.gold+'18',borderLeft:`2px solid ${C.gold}`,borderRadius:3,
        padding:isMobile?'1px 3px':'1px 4px',marginBottom:2,cursor:e.personId?'pointer':'default',
        display:'flex',alignItems:'center',gap:4,overflow:'hidden'}}>
      <span style={{fontSize:9,flexShrink:0}}>{e.emoji}</span>
      {!isMobile && <span style={{color:C.text,fontSize:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.label}</span>}
    </div>
  );

  return (
    <div style={{padding: isMobile ? '12px 12px 24px' : '32px 36px'}}>
      <PageHead back={backInfo?.label} onBack={backInfo?.onBack} action={
        <div style={{display:'flex',gap:8}}>
          {onAddDiary && <Btn small variant="secondary" onClick={()=>onAddDiary(t)}>+ Diary</Btn>}
          <Btn small onClick={()=>onAddClass && onAddClass(t)}>+ Class</Btn>
        </div>
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
              {(() => {
                const dayDates = datesByDate[d] || [];
                const dayDiary = diaryByDate[d] || [];
                const shownClasses = dayClasses.slice(0, maxPills);
                const remainingSlots = Math.max(0, maxPills - shownClasses.length);
                const shownDiary = dayDiary.slice(0, remainingSlots);
                const overflow = (dayClasses.length - shownClasses.length) + (dayDiary.length - shownDiary.length);
                return (
                  <>
                    {dayDates.map(e=><DatePill key={e.id} e={e} />)}
                    {shownClasses.map(c=><Pill key={c.id} c={c} />)}
                    {shownDiary.map(n=><DiaryPill key={n.id} n={n} />)}
                    {overflow>0 && <div style={{color:C.muted,fontSize:9,paddingLeft:2}}>+{overflow}</div>}
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PAYMENT EDITOR ───────────────────────────────────────────────────────────

export function ClassLog({ cls, forms, onUpdateClass, nav }) {
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

export function FormsList({ forms, classes, onAdd, onUpdate, onRemove, onMove }) {
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

export function InvoiceList({ invoices, orgs, nav, onAdd }) {
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


export function InvoiceDetail({ inv, org, onEdit, onStatusChange, nav, backInfo }) {
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
            {inv.status==='paid'&&inv.paidDate&&<div style={{color:C.green,fontSize:12,marginTop:2}}>Paid: {fmt(inv.paidDate)}</div>}
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
          {inv.status==='paid'&&<div style={{color:C.green,fontSize:14,fontWeight:500,display:'flex',alignItems:'center',gap:6}}>✓ Paid{inv.paidDate&&<span style={{color:C.muted,fontWeight:400}}>· {fmt(inv.paidDate)}</span>}</div>}
          {inv.status!=='draft'&&<Btn variant="ghost" onClick={()=>onStatusChange('draft')}>Revert to Draft</Btn>}
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────


