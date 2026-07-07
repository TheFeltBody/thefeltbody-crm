import { useEffect, useMemo, useRef, useState } from "react";
import { C, INTERACTION_KINDS, KIND_META, ORG_META, PAYMENT_STATUS, PERSON_ROLES, SOURCES } from "../lib/constants.js";
import { addDays, fmt, initials, labelAbbrev, primaryRole, smartSortPeople, today, useIsMobile, useMobileUI, useTypes } from "../lib/helpers.jsx";

export const RoleBadge = ({ role, compact }) => {
  const { personRoles } = useTypes();
  const m = personRoles[role] || PERSON_ROLES[role] || { label:role, color:C.muted, bg:C.surf };
  const text = compact ? labelAbbrev(m.label) : m.label;
  return <span title={compact ? m.label : undefined} style={{background:m.bg,color:m.color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{text}</span>;
};

export const OrgBadge = ({ type }) => {
  const { orgTypes } = useTypes();
  const m = orgTypes[type] || ORG_META[type] || { label:type, color:C.muted, bg:C.surf };
  return <span style={{background:m.bg,color:m.color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{m.label}</span>;
};

export const KindBadge = ({ kindKey, small }) => {
  const m = KIND_META[kindKey] || KIND_META.class;
  return <span style={{background:m.bg,color:m.color,fontSize:small?9:10,fontWeight:600,padding:small?'2px 7px':'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{m.label}</span>;
};

export const PaymentBadge = ({ status, small, compact }) => {
  if(!status) return null;
  const m = PAYMENT_STATUS[status]; if(!m) return null;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,background:m.bg,color:m.color,border:`1px solid ${m.color}55`,fontSize:small?10:11,fontWeight:600,padding:small?'2px 7px':'2px 9px',borderRadius:20,letterSpacing:'0.4px',whiteSpace:'nowrap'}}>
      <span style={{fontWeight:700}}>{m.icon}</span>{!compact && m.label}
    </span>
  );
};

export const Avatar = ({ name, size=36, role }) => {
  const { personRoles } = useTypes();
  const meta = personRoles[role] || PERSON_ROLES[role];
  const color = meta?.color || C.green;
  const bg = meta?.bg || '#132413';
  return <div style={{width:size,height:size,borderRadius:'50%',background:bg,border:`1.5px solid ${color}`,display:'flex',alignItems:'center',justifyContent:'center',color,fontSize:size*0.36,fontWeight:600,flexShrink:0}}>{initials(name)}</div>;
};

export const NoteCard = ({ note, onToggleImportant, onClearAction, onReopenNote, onUpdateActionDate, onDelete, onClick, onAddToCalendar, onReply, onReplyAll, onOpenThread, highlight, dimReason }) => {
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
  // Email context line: who this email actually involved. Group sends carry
  // the full recipient set in raw_headers.to_list/cc_list (written by the
  // forms-worker fan-out) — show "to A, B · cc C" so the card doesn't read
  // like a 1:1 email when it wasn't. Inbound shows the sender; plain
  // outbound falls back to the row's own to_email.
  const isEmail = note.kind === 'email';
  const rh = (isEmail && note.rawHeaders) || {};
  const fmtAddrs = (arr) => (arr || []).map(a => a?.name || a?.email || '').filter(Boolean).join(', ');
  const emailLine = !isEmail ? '' : (note.direction === 'inbound'
    ? (note.fromEmail ? `from ${note.fromEmail}` : '')
    : ((Array.isArray(rh.to_list) && rh.to_list.length)
        ? `to ${fmtAddrs(rh.to_list)}${Array.isArray(rh.cc_list) && rh.cc_list.length ? ` · cc ${fmtAddrs(rh.cc_list)}` : ''}`
        : (note.toEmail ? `to ${note.toEmail}` : '')));
  // Time-of-day for email cards. interactions.date is a date-only column by
  // schema design, so the clock comes from created_at — accurate for emails
  // because both workers insert at send/arrival time. Suppressed when the
  // created_at date-part disagrees with the row's date (backdated manual
  // logs, timezone straddle): a wrong time is worse than no time.
  const emailTime = (() => {
    if (!isEmail || !note.createdAt) return '';
    const d = new Date(note.createdAt);
    if (isNaN(d.getTime())) return '';
    const localDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (localDay !== note.date) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })();
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
        // Leaves room for the sticky PageHead so a scrolled-to note never
        // tucks under it. Harmless on views without a sticky header.
        scrollMarginTop: 90,
      }
      }>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap'}}>
        {(() => {
          const k = INTERACTION_KINDS[note.kind] || INTERACTION_KINDS.note;
          return (
            <span title={k.label} style={{fontSize:13,lineHeight:1,opacity:0.85}}>
              {k.icon}
            </span>
          );
        })()}
        {isEmail && note.direction && (
          <span style={{color: note.direction === 'inbound' ? C.blue : C.gold, fontSize:9, fontWeight:700, letterSpacing:'0.6px', textTransform:'uppercase', opacity:0.85}}>
            {note.direction === 'inbound' ? '↓ Received' : '↑ Sent'}
          </span>
        )}
        {emailLine && (
          <span style={{color:C.muted,fontSize:11,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}} title={emailLine}>
            {emailLine}
          </span>
        )}
        {note.important && !completed && (
          <span style={{color:C.gold,fontSize:10,fontWeight:700,letterSpacing:'1px'}}>⚑ IMPORTANT</span>
        )}
      </div>
      
      {note.subject && (
        <div style={{color:textColor,fontSize:14,fontWeight:600,lineHeight:1.5,marginBottom:note.text?3:0,opacity:completed?0.75:1}}>{note.subject}</div>
      )}
      {note.text && (
        <div style={{color:textColor,fontSize:14,lineHeight:1.7,opacity:completed?0.75:1}}>{note.text}</div>
      )}
      {!note.subject && !note.text && (
        <div style={{color:C.muted,fontSize:13,fontStyle:'italic',opacity:0.7}}>(no details)</div>
      )}

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
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6,gap:8,flexWrap:'wrap'}}>
        <div style={{color:C.muted,fontSize:12,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}} onClick={e=>e.stopPropagation()}>
          <span>{fmt(note.date)}{emailTime && <span style={{opacity:0.8}}> · {emailTime}</span>}</span>
          {isEmail && onReply && (
            <button onClick={() => onReply(note)}
              style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif"}}
              onMouseEnter={e=>{e.currentTarget.style.color=C.gold;e.currentTarget.style.borderColor=C.gold+'88';}}
              onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.borderColor=C.border;}}>
              ↩ Reply
            </button>
          )}
          {isEmail && onReplyAll && (
            <button onClick={() => onReplyAll(note)} title="Reply to everyone on this conversation"
              style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif"}}
              onMouseEnter={e=>{e.currentTarget.style.color=C.gold;e.currentTarget.style.borderColor=C.gold+'88';}}
              onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.borderColor=C.border;}}>
              ↩ Reply all
            </button>
          )}
          {isEmail && onOpenThread && (
            <button onClick={() => onOpenThread(note)} title="Open the full conversation in Threads"
              style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif"}}
              onMouseEnter={e=>{e.currentTarget.style.color=C.gold;e.currentTarget.style.borderColor=C.gold+'88';}}
              onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.borderColor=C.border;}}>
              Open thread ↗
            </button>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}} onClick={e=>e.stopPropagation()}>
          {/* Add-to-calendar: promotes a note into a diary entry (opens the diary
              modal prefilled from this note). Hidden for entries that are already
              diary blocks, and only shown where the parent wires the handler. */}
          {onAddToCalendar && note.kind !== 'diary' && (
            <button onClick={()=>onAddToCalendar(note)}
              title="Add to calendar — creates a diary entry from this note"
              style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'2px 9px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.4px'}}
              onMouseEnter={e=>{e.currentTarget.style.color=C.gold;e.currentTarget.style.borderColor=C.gold+'88';}}
              onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.borderColor=C.border;}}>
              🗓 Calendar
            </button>
          )}
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

export const SourceTag = ({ source }) => {
  if(!source?.channel) return null;
  const s = SOURCES[source.channel] || { label:source.channel, icon:'◇' };
  return <div style={{display:'flex',alignItems:'center',gap:4}}><span style={{color:C.muted,fontSize:11}}>{s.icon}</span><span style={{color:C.muted,fontSize:12}}>{s.label}{source.detail ? ` — ${source.detail}` : ''}</span></div>;
};

export const Btn = ({ onClick, children, variant='primary', small, disabled }) => {
  const v = { primary:{background:C.gold,color:'#0a1408',border:'none'}, secondary:{background:C.card,color:C.text,border:`1px solid ${C.border}`}, ghost:{background:'none',color:C.muted,border:`1px solid ${C.border}`}, danger:{background:'#2a1313',color:C.red,border:`1px solid ${C.red}44`} };
  return <button onClick={onClick} disabled={disabled} style={{...v[variant],cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.5:1,borderRadius:6,fontFamily:"'Jost',sans-serif",fontSize:small?12:14,fontWeight:500,padding:small?'5px 12px':'8px 18px'}}>{children}</button>;
};

// Two-step confirm button. First click reveals confirm/cancel pair; second click on confirm fires onConfirm.
// We use this instead of window.confirm() because sandboxed iframes (e.g. Claude artifacts) silently block native dialogs.
// `armedLabel` is shown only after the first click; `idleLabel` is the resting state.

export const ConfirmBtn = ({ onConfirm, idleLabel, armedLabel='Confirm?', cancelLabel='Cancel', variant='danger', small=true, title }) => {
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

export const Stat = ({ label, value, sub }) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'16px 20px'}}>
    <div style={{color:C.muted,fontSize:11,letterSpacing:'0.5px',marginBottom:6}}>{label}</div>
    <div style={{color:C.text,fontSize:30,fontWeight:600,fontFamily:"'Cormorant Garamond',serif",lineHeight:1}}>{value}</div>
    {sub && <div style={{color:C.muted,fontSize:12,marginTop:5}}>{sub}</div>}
  </div>
);

export const Row = ({ onClick, children, style }) => (
  <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 20px',borderBottom:`1px solid ${C.border}`,cursor:onClick?'pointer':'default',...(style||{})}}
    onMouseEnter={e=>{if(onClick)e.currentTarget.style.background=C.active}}
    onMouseLeave={e=>{e.currentTarget.style.background=(style&&style.background)||'transparent'}}>
    {children}
  </div>
);

export const Empty = ({ text, action, onAction }) => (
  <div style={{textAlign:'center',padding:'48px 20px',color:C.muted,fontSize:14}}>
    {text}{action && <><span> </span><span style={{color:C.gold,cursor:'pointer'}} onClick={onAction}>{action}</span></>}
  </div>
);

export const PageHead = ({ back, onBack, children, action, sticky, subInfo }) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileHeader back={back} onBack={onBack} action={action} subInfo={subInfo}>{children}</MobileHeader>;
  }
  return (
    <div style={{
      display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28,
      ...(sticky ? {
        // Pin the header (back button + title + actions) to the top of the
        // scroll container so it stays reachable on long pages — e.g. a contact
        // with a deep notes history reached via a highlighted note. Negative
        // top margin + matching padding absorbs the wrapper's top padding so the
        // header sits flush at the top edge when stuck. zIndex keeps it above
        // scrolling cards; the bg + border give it a clean edge.
        position:'sticky', top:0, zIndex:5,
        background:C.bg, marginTop:-32, paddingTop:18, paddingBottom:14,
        borderBottom:`1px solid ${C.border}`,
      } : {}),
    }}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        {back && <button onClick={onBack} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',padding:'5px 11px',borderRadius:6,fontSize:13}}>← {back}</button>}
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,color:C.text,letterSpacing:'-0.5px',margin:0}}>{children}</h1>
      </div>
      <div style={{display:'flex',gap:8}}>{action}</div>
    </div>
  );
};

// ─── MOBILE HEADER ────────────────────────────────────────────────────────────
// Two-row sticky header used on all views when viewport ≤ 767px.
//
//   Row 1 (always present):
//     [☰ hamburger] [Title] ............................... [⇕ expand toggle]
//
//   Row 2 (sub-header, only when there's something to show):
//     [← back] ........................ [subInfo (e.g. date)] [actions]
//
// The expand toggle only renders when the current view registers
// `showExpandToggle: true` via MobileUIContext (currently Dashboard only).
// In contracted mode the accordion shows one open section at a time; in
// expanded mode all sections open and the page scrolls normally.

export const MobileHeader = ({ back, onBack, children, action, subInfo }) => {
  const { onMobileNavOpen, expandAll, setExpandAll, showExpandToggle } = useMobileUI();
  const hasSubRow = back || subInfo || action;
  return (
    <div style={{
      position:'sticky', top:0, zIndex:6,
      background:C.bg,
      marginTop:-12, marginLeft:-12, marginRight:-12, marginBottom:14,
      borderBottom:`1px solid ${C.border}`,
    }}>
      {/* Row 1: hamburger + title + expand toggle */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'10px 14px 8px',minHeight:48}}>
        <button onClick={onMobileNavOpen}
          aria-label="Open navigation menu"
          style={{background:'none',border:'none',color:C.text,cursor:'pointer',fontSize:22,padding:'4px 8px',lineHeight:1,flexShrink:0}}>
          ☰
        </button>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,letterSpacing:'-0.3px',margin:0,flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {children}
        </h1>
        {showExpandToggle && (
          <button onClick={()=>setExpandAll(v=>!v)}
            title={expandAll ? 'Collapse — pin section titles to screen' : 'Expand — show all sections, scroll page'}
            aria-label={expandAll ? 'Collapse all sections' : 'Expand all sections'}
            style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:6,fontSize:14,padding:'5px 10px',lineHeight:1,flexShrink:0,fontFamily:"'Jost',sans-serif"}}>
            {expandAll ? '⤓' : '⤒'}
          </button>
        )}
      </div>
      {/* Row 2: sub-header — back / info / action */}
      {hasSubRow && (
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 14px 10px',borderTop:`1px solid ${C.border}44`,flexWrap:'wrap'}}>
          {back ? (
            <button onClick={onBack} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',padding:'4px 9px',borderRadius:6,fontSize:12,fontFamily:"'Jost',sans-serif",flexShrink:0}}>
              ← {back}
            </button>
          ) : <div />}
          <div style={{flex:1}} />
          {subInfo && <div style={{color:C.muted,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0}}>{subInfo}</div>}
          {action && <div style={{display:'flex',gap:6,flexShrink:0}}>{action}</div>}
        </div>
      )}
    </div>
  );
};

export const Tabs = ({ tabs, active, onChange }) => (
  <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:20}}>
    {tabs.map(t=>(
      <button key={t.id} onClick={()=>onChange(t.id)} style={{background:'none',border:'none',borderBottom:`2px solid ${active===t.id?C.gold:'transparent'}`,color:active===t.id?C.text:C.muted,cursor:'pointer',padding:'8px 18px',fontSize:14,fontWeight:active===t.id?500:400,fontFamily:"'Jost',sans-serif",marginBottom:-1}}>
        {t.label}
      </button>
    ))}
  </div>
);

// Mobile variant of Tabs. Each tab carries an `icon`, a short `name`, and a
// `count`. Unselected tabs show just icon + count to stay narrow; the selected
// tab also shows its name. All tabs share the row equally (flex:1) so four sit
// comfortably across a phone width. The bar is sticky so it stays reachable as
// the tab body scrolls. `topOffset` accounts for any sticky PageHead above it.

export const MobileTabBar = ({ tabs, active, onChange, topOffset=0 }) => (
  <div style={{position:'sticky',top:topOffset,zIndex:5,background:C.bg,display:'flex',gap:6,padding:'8px 0 10px',marginBottom:14,borderBottom:`1px solid ${C.border}`}}>
    {tabs.map(t=>{
      const on = active===t.id;
      return (
        <button key={t.id} onClick={()=>onChange(t.id)} title={t.name}
          style={{flex:1,minWidth:0,display:'flex',alignItems:'center',justifyContent:'center',gap:5,
            background:on?C.goldBg:'transparent',color:on?C.gold:C.muted,
            border:`1px solid ${on?C.gold+'88':C.border}`,borderRadius:6,
            padding:'7px 6px',cursor:'pointer',fontFamily:"'Jost',sans-serif",
            fontSize:12,fontWeight:on?600:500,lineHeight:1,overflow:'hidden'}}>
          <span style={{fontSize:13,lineHeight:1,flexShrink:0}}>{t.icon}</span>
          {on && <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.name}</span>}
          <span style={{opacity:0.7,fontSize:11,flexShrink:0}}>{t.count}</span>
        </button>
      );
    })}
  </div>
);

// ─── SEARCHABLE SELECT ────────────────────────────────────────────────────────

export function SearchSelect({ people, onSelect, attendance, classes, contextSeriesId, existing=[] }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const sorted = useMemo(() => smartSortPeople(people.filter(p=>!existing.includes(p.id)), attendance, classes, contextSeriesId), [people, attendance, classes, contextSeriesId, existing]);
  const filtered = useMemo(() => {
    if (!q.trim()) return sorted;
    const lq = q.toLowerCase();
    return sorted.filter(p => p.name.toLowerCase().includes(lq) || (p.email||'').toLowerCase().includes(lq));
  }, [sorted, q]);
  useEffect(() => { setTimeout(()=>inputRef.current?.focus(), 50); }, []);
  const clear = () => { setQ(''); inputRef.current?.focus(); };
  return (
    <div>
      <div style={{position:'relative',marginBottom:8}}>
        <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name or email..." style={{width:'100%',background:C.card,border:`1px solid ${C.gold}55`,borderRadius:6,color:C.text,fontSize:14,padding:'9px 34px 9px 12px',fontFamily:"'Jost',sans-serif",boxSizing:'border-box'}} />
        {q!=='' && (
          <button onClick={clear} title="Clear" aria-label="Clear search"
            style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18,lineHeight:1,padding:'2px 6px',fontFamily:"'Jost',sans-serif"}}
            onMouseEnter={e=>e.currentTarget.style.color=C.text}
            onMouseLeave={e=>e.currentTarget.style.color=C.muted}>×</button>
        )}
      </div>
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

export const Modal = ({ title, onClose, children, wide, xwide, topAlign }) => (
  <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:topAlign?'flex-start':'center',justifyContent:'center',zIndex:100,overflowY:'auto'}}>
    <div style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:12,padding:28,width:xwide?860:wide?580:480,maxHeight:topAlign?'none':'90vh',overflowY:topAlign?'visible':'auto',marginTop:topAlign?16:0}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
        <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.text,margin:0}}>{title}</h2>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:22,lineHeight:1}}>×</button>
      </div>
      {children}
    </div>
  </div>
);

export const FI = ({ label, value, onChange, type='text', opts, rows, half }) => (
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


