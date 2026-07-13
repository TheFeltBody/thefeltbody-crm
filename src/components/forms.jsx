import { useEffect, useMemo, useRef, useState } from "react";
import { C, CARE_HOME_STAGES, DIARY_CALENDARS, DIARY_CALENDAR_KEYS, calKeys, INTERACTION_KINDS, PAYMENT_MODELS, PAY_VIA, PERSON_ROLES, PKG_COMPATIBILITY, PKG_TYPES, RECURRENCE, SOURCES, TYPE_ICONS, TYPE_PALETTE } from "../lib/constants.js";
import { addDays, addMonths, BIRTHDAY_NO_YEAR, classKindKey, currentHourTime, fillTemplate, fmt, fmtMoney, isCountlessPkg, makeBirthdayNoYear, nextInvoiceNumber, packageRemaining, parseBirthday, primaryRole, scoreTemplates, today, uid, useTypes } from "../lib/helpers.jsx";
import { Avatar, Btn, FI, KindBadge, Modal, RoleBadge, SearchSelect } from "./primitives.jsx";
import { files as filesApi } from "../lib/dataLayer.js";

export function AddOrgForm({ existing, onSave, onClose, defaultType }) {
  const { orgTypes } = useTypes();
  const [f, setF] = useState(existing || {name:'',type:defaultType||'care_home',address:'',phone:'',email:'',website:'',contactName:'',notes:'',outreachStage:'',nextContactDate:''});
  const s = k => v => setF(x=>({...x,[k]:v}));
  return (
    <Modal title={existing?`Edit: ${existing.name}`:"Add Organisation"} onClose={onClose}>
      <FI label="NAME" value={f.name} onChange={s('name')} />
      <FI label="TYPE" value={f.type} onChange={s('type')} opts={Object.entries(orgTypes).map(([v,m])=>({v,l:m.label}))} />
      {f.type === 'care_home' && (
        <div style={{display:'flex',gap:12}}>
          <FI label="OUTREACH STAGE" half value={f.outreachStage||''} onChange={s('outreachStage')}
            opts={[{v:'',l:'— not tracked —'}, ...Object.entries(CARE_HOME_STAGES).map(([v,m])=>({v,l:m.label}))]} />
          <FI label="NEXT CONTACT DATE" type="date" half value={f.nextContactDate||''} onChange={s('nextContactDate')} />
        </div>
      )}
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


// BirthdayField — date-of-birth entry that supports a known full date OR a
// day-only birthday (month + day, year unknown). The DOB column is a Postgres
// DATE, so the year-less case is stored under the BIRTHDAY_NO_YEAR sentinel
// (see helpers); this component hides that encoding behind a checkbox. When
// "year unknown" is ticked it swaps the native date input for month + day
// selects and emits `0004-MM-DD`; unticked, it's a normal date input.
// Controlled: `value` is the stored ISO string ('' when unset), `onChange`
// receives the next ISO string (or '').
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function BirthdayField({ value, onChange, half }) {
  const parsed = parseBirthday(value);
  const noYear = !!parsed && !parsed.hasYear;
  // Local month/day while in no-year mode, seeded from the stored sentinel.
  const mo = parsed ? parsed.month : '';
  const d  = parsed ? parsed.day : '';
  const daysInMonth = mo ? new Date(2004, mo, 0).getDate() : 31; // 2004 leap year → 29 Feb allowed

  const toggleNoYear = (on) => {
    if (on) {
      // Switch to day-only. Keep month/day if we already have them, else blank.
      if (parsed) onChange(makeBirthdayNoYear(parsed.month, parsed.day));
      else onChange('');  // nothing entered yet; selects start empty
    } else {
      // Switch back to full date. We don't know the year, so clear — the user
      // picks a real date. (Silently inventing a year would be wrong.)
      onChange('');
    }
  };
  const setPart = (nextMo, nextD) => {
    const m2 = nextMo || mo, d2 = nextD || d;
    if (m2 && d2) onChange(makeBirthdayNoYear(m2, d2));
    // If only one part is set we can't form a valid date yet; hold until both.
  };

  return (
    <div style={{flex: half ? '1 1 0' : '1 1 100%'}}>
      <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>DATE OF BIRTH</label>
      {noYear ? (
        <div style={{display:'flex',gap:8}}>
          <select value={mo||''} onChange={e=>setPart(parseInt(e.target.value)||'', null)}
            style={{flex:2,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:mo?C.text:C.muted,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
            <option value="">Month</option>
            {MONTHS.map((name,i)=><option key={i} value={i+1} style={{color:C.text}}>{name}</option>)}
          </select>
          <select value={d||''} onChange={e=>setPart(null, parseInt(e.target.value)||'')}
            style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:d?C.text:C.muted,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}}>
            <option value="">Day</option>
            {Array.from({length:daysInMonth},(_,i)=><option key={i+1} value={i+1} style={{color:C.text}}>{i+1}</option>)}
          </select>
        </div>
      ) : (
        <input type="date" value={value||''} onChange={e=>onChange(e.target.value)}
          style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
      )}
      <label style={{display:'flex',alignItems:'center',gap:7,marginTop:7,cursor:'pointer',color:C.muted,fontSize:12}}>
        <span onClick={()=>toggleNoYear(!noYear)}
          style={{width:15,height:15,borderRadius:4,border:`1px solid ${noYear?C.gold:C.border}`,background:noYear?C.gold:'transparent',display:'inline-flex',alignItems:'center',justifyContent:'center',color:C.bg,fontSize:10,fontWeight:700,flexShrink:0}}>{noYear?'✓':''}</span>
        <span onClick={()=>toggleNoYear(!noYear)}>I don’t know the year</span>
      </label>
    </div>
  );
}


export function AddPersonForm({ existing, onSave, onClose, orgs, defaultType, defaultOrgId, onEmailAdd, onEmailDelete, onEmailSetPrimary, onAddPersonRole, customPersonRoles: customRolesList=[], roleParents=[] }) {
  const { personRoles, orgTypes } = useTypes();
  const [addingRoleType, setAddingRoleType] = useState(false);
  // Active parent filter for the role chips. null = "All".
  const [roleFilter, setRoleFilter] = useState(null);
  // New contacts start with no role pre-selected (canSave blocks saving with
  // zero roles, so the user is nudged to choose). A defaultType — e.g. when
  // adding from a role-filtered list — still pre-selects that one role.
  const initRoles = existing?.roles || (defaultType?[defaultType]:[]);
  // Strip `emails` and `email` from form state — managed separately
  const initForm = existing ? (() => { const {emails, email, ...rest} = existing; return rest; })()
    : {name:'',phone:'',website:'',address:'',dateOfBirth:'',orgId:defaultOrgId||'',status:'active',source:{channel:'manual',detail:''},notes:'',defaultSessionRate:'',rateNotes:''};
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
  // Group orgOptions by type so the picker shows a native <optgroup> header
  // per type (e.g. "Care Home", "Gym") instead of one long flat list — the
  // type doubles as a built-in "select the parent first" scan aid within the
  // same field, no separate type dropdown needed.
  const orgGroups = useMemo(() => {
    const byType = {};
    orgOptions.forEach(o => {
      const key = o.type || 'other';
      (byType[key] ||= []).push(o);
    });
    return Object.entries(byType)
      .sort(([typeA], [typeB]) => {
        if (typeA === 'gym') return -1;
        if (typeB === 'gym') return 1;
        const labelA = orgTypes[typeA]?.label || typeA;
        const labelB = orgTypes[typeB]?.label || typeB;
        return labelA.localeCompare(labelB);
      })
      .map(([type, list]) => ({
        label: orgTypes[type]?.label || type,
        opts: list.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(o=>({v:o.id, l:o.name})),
      }));
  }, [orgOptions, orgTypes]);
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
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px'}}>ROLES (select all that apply)</div>
          {onAddPersonRole && !addingRoleType && <button onClick={()=>setAddingRoleType(true)} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:11,padding:0,fontFamily:"'Jost',sans-serif"}}>+ New role type</button>}
        </div>
        {addingRoleType && onAddPersonRole && (
          <AddTypeForm kind="person"
            existingKeys={[...Object.keys(PERSON_ROLES), ...customRolesList.map(t=>t.key)]}
            parents={roleParents}
            onSave={t => { onAddPersonRole(t).then(saved => { toggleRole(saved.key); }); }}
            onClose={()=>setAddingRoleType(false)} />
        )}
        {roleParents.length > 0 && (() => {
          // Only show a parent chip if at least one role is tagged with it.
          const parentsWithRoles = roleParents.filter(p =>
            Object.values(personRoles).some(m => (m.parentKey||null) === p.key));
          const hasOrphans = Object.values(personRoles).some(m => !m.parentKey);
          if (parentsWithRoles.length === 0) return null;
          const chip = (active, label, onClick) => (
            <button key={label} onClick={onClick}
              style={{background:active?C.gold+'22':'transparent',border:`1px solid ${active?C.gold:C.border}`,color:active?C.gold:C.muted,cursor:'pointer',borderRadius:14,fontSize:10,fontWeight:600,padding:'3px 10px',letterSpacing:'0.4px',textTransform:'uppercase',fontFamily:"'Jost',sans-serif"}}>
              {label}
            </button>
          );
          return (
            <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:8}}>
              {chip(roleFilter===null, 'All', ()=>setRoleFilter(null))}
              {parentsWithRoles.map(p => chip(roleFilter===p.key, p.label, ()=>setRoleFilter(p.key)))}
              {hasOrphans && chip(roleFilter==='__none__', 'Other', ()=>setRoleFilter('__none__'))}
            </div>
          );
        })()}
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {Object.entries(personRoles).filter(([r,m])=>{
            if (roles.includes(r)) return true; // always show selected roles
            if (roleFilter === null) return true;
            if (roleFilter === '__none__') return !m.parentKey;
            return (m.parentKey||null) === roleFilter;
          }).map(([r,m])=>(
            <button key={r} onClick={()=>toggleRole(r)} style={{background:roles.includes(r)?m.bg:C.surf,border:`1px solid ${roles.includes(r)?m.color:C.border}`,color:roles.includes(r)?m.color:C.muted,cursor:'pointer',borderRadius:20,fontSize:11,fontWeight:600,padding:'4px 12px',textTransform:'uppercase',fontFamily:"'Jost',sans-serif"}}>{m.label}</button>
          ))}
        </div>
        {roles.length===0&&<div style={{color:C.red,fontSize:11,marginTop:6}}>Select at least one role</div>}
      </div>
      <FI label={isResident ? "CARE HOME (required for residents)" : "ORGANISATION (optional)"}
        value={f.orgId} onChange={s('orgId')}
        placeholder={{v:'', l: isResident ? '— select care home —' : '— none —'}}
        groups={orgGroups} />
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
      <FI label="ADDRESS" value={f.address||''} onChange={s('address')} />
      <div style={{display:'flex',gap:12}}>
        <BirthdayField value={f.dateOfBirth||''} onChange={s('dateOfBirth')} half />
        <div style={{flex:'1 1 0'}} />
      </div>
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

export function AddTypeForm({ kind, onSave, onClose, existingKeys=[], existing=null, parents=[] }) {
  const isOrg = kind === 'org';
  const isEdit = !!existing;
  const [label, setLabel] = useState(existing?.label || '');
  // Parent category (person roles only). '' = uncategorised.
  const [parentKey, setParentKey] = useState(existing?.parentKey || '');
  // When editing, preselect the palette swatch matching the current colour (fall
  // back to 0 if it's a legacy colour not in the palette).
  const initPalette = existing
    ? Math.max(0, TYPE_PALETTE.findIndex(p => p.color === existing.color))
    : 0;
  const [paletteIdx, setPaletteIdx] = useState(initPalette === -1 ? 0 : initPalette);
  const initIcon = existing?.icon ? Math.max(0, TYPE_ICONS.indexOf(existing.icon)) : 0;
  const [iconIdx, setIconIdx] = useState(initIcon === -1 ? 0 : initIcon);
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
    // Edit keeps the original key (renaming the key would orphan tagged rows);
    // only label/colour (and icon for orgs) change.
    const out = {
      key: isEdit ? existing.key : makeKey(),
      label: trimmed,
      color: palette.color,
      bg: palette.bg,
    };
    if(isOrg) out.icon = TYPE_ICONS[iconIdx];
    else out.parentKey = parentKey || null;
    onSave(out);
    onClose();
  };
  const titleNoun = isOrg ? 'Organisation Type' : 'Contact Type';
  return (
    <Modal title={`${isEdit ? 'Edit' : 'Add'} ${titleNoun}`} onClose={onClose}>
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
      {!isOrg && parents.length > 0 && (
        <FI label="PARENT CATEGORY (optional)" value={parentKey} onChange={setParentKey}
          opts={[{v:'',l:'— none —'}, ...parents.map(p=>({v:p.key,l:p.label}))]} />
      )}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px'}}>PREVIEW</div>
        <span style={{background:TYPE_PALETTE[paletteIdx].bg,color:TYPE_PALETTE[paletteIdx].color,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,letterSpacing:'0.7px',textTransform:'uppercase',whiteSpace:'nowrap'}}>
          {isOrg && <span style={{marginRight:4}}>{TYPE_ICONS[iconIdx]}</span>}{trimmed||'—'}
        </span>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={!trimmed}>{isEdit ? 'Save Changes' : 'Add Type'}</Btn>
      </div>
    </Modal>
  );
}


export function AddClassForm({ existing, onSave, onClose, orgs, defaultOrgId, defaultDate, bookingFor, defaultPaymentModel, packages, allAttendance }) {
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
        paymentModel: defaultPaymentModel || '',
        isBookable: false,
        capacity: '',
        publicBlurb: '',
        joinUrl: '',
        bookingInfo: ''
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
  // Method + date of payment. Date tracks the session date while 'Drop-in' is
  // selected (paid on the day is the norm); both remain editable.
  const [payVia, setPayVia] = useState('cash');
  const [payDate, setPayDate] = useState(f.date || today());

  // Keep amount in sync if user edits the session rate before saving
  useEffect(() => { if(payMode === 'paid') setPayAmount(f.rate ?? ''); }, [f.rate, payMode]);
  // Same pattern for the payment date following the session date
  useEffect(() => { if(payMode === 'paid') setPayDate(f.date || today()); }, [f.date, payMode]);

  const buildPaymentChoice = () => {
    if(!showPaymentPicker) return undefined;
    if(payMode === 'paid') {
      const amt = parseFloat(payAmount);
      return { paymentStatus: 'paid', paidAmount: isNaN(amt) ? 0 : amt, paidVia: payVia, paidDate: payDate || null };
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
            {payMode==='paid' && (
              <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',paddingLeft:23}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{color:C.muted,fontSize:11,letterSpacing:'0.4px'}}>VIA</span>
                  <select value={payVia} onChange={e=>setPayVia(e.target.value)}
                    style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontSize:13,padding:'4px 8px',fontFamily:"'Jost',sans-serif",outline:'none'}}>
                    {Object.entries(PAY_VIA).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{color:C.muted,fontSize:11,letterSpacing:'0.4px'}}>ON</span>
                  <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}
                    style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontSize:13,padding:'3px 8px',fontFamily:"'Jost',sans-serif",outline:'none',colorScheme:'dark'}} />
                </div>
              </div>
            )}
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
      {!bookingFor && effectiveModel === 'per_person' && (
        <div style={{marginTop:8,marginBottom:14,padding:'14px 16px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surf}}>
          <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',color:f.isBookable?C.gold:C.text,fontSize:14}}>
            <input type="checkbox" checked={!!f.isBookable} onChange={e=>s('isBookable')(e.target.checked)} style={{accentColor:C.gold,width:16,height:16}} />
            Publish to website (bookable on thefeltbody.com)
          </label>
          {f.isBookable && (
            <div style={{marginTop:14}}>
              <FI label="CAPACITY PER CLASS (blank = uncapped)" value={f.capacity} onChange={s('capacity')} type="number" />
              <FI label="WEBSITE DESCRIPTION (optional)" value={f.publicBlurb} onChange={s('publicBlurb')} />
              <FI label="JOINING LINK (Zoom / Meet / map — optional)" value={f.joinUrl ?? ''} onChange={s('joinUrl')} placeholder="https://…" />
              <FI label="JOINING NOTES (optional)" value={f.bookingInfo ?? ''} onChange={s('bookingInfo')} />
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                The joining link appears as a button in the booking confirmation email; notes appear beneath it.
              </div>
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                The rate above (£{f.rate||0}) is shown to customers as the per-place price.
                {isNew && f.recurrence && f.recurrence!=='one_off' && ' Applies to every class in this series.'}
                {!isNew && f.recurrence==='linked' && ' Changes here apply to this one class; use “this and future” editing to publish the rest of the series.'}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(f.name.trim()){onSave({...f,paymentModel:effectiveModel,recurrence:bookingFor?'one_off':f.recurrence,paymentChoice:buildPaymentChoice()});onClose();}}}>{existing?'Save':(bookingFor?'Create & Book':'Add Class')}</Btn>
      </div>
    </Modal>
  );
}


export function EditSeriesClassForm({ cls, onSaveThis, onSaveFuture, onExtend, seriesLastDate, recurrence, onClose, orgs }) {
  const [f, setF] = useState({...cls, time: cls.time || '', duration: cls.duration || 60});
  const [extendCount, setExtendCount] = useState('');
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
      {(f.paymentModel||'per_person') === 'per_person' && (
        <div style={{marginTop:8,marginBottom:14,padding:'14px 16px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surf}}>
          <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',color:f.isBookable?C.gold:C.text,fontSize:14}}>
            <input type="checkbox" checked={!!f.isBookable} onChange={e=>s('isBookable')(e.target.checked)} style={{accentColor:C.gold,width:16,height:16}} />
            Publish to website (bookable on thefeltbody.com)
          </label>
          {f.isBookable && (
            <div style={{marginTop:14}}>
              <FI label="CAPACITY PER CLASS (blank = uncapped)" value={f.capacity ?? ''} onChange={s('capacity')} type="number" />
              <FI label="WEBSITE DESCRIPTION (optional)" value={f.publicBlurb ?? ''} onChange={s('publicBlurb')} />
              <FI label="JOINING LINK (Zoom / Meet / map — optional)" value={f.joinUrl ?? ''} onChange={s('joinUrl')} placeholder="https://…" />
              <FI label="JOINING NOTES (optional)" value={f.bookingInfo ?? ''} onChange={s('bookingInfo')} />
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                The rate above (£{f.rate||0}) is shown to customers as the per-place price.
                “Update this class only” publishes just this date; “Update this &amp; future” publishes every class from here on.
              </div>
            </div>
          )}
        </div>
      )}
      {onExtend && (
        <div style={{marginTop:8,marginBottom:14,padding:'14px 16px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surf}}>
          <div style={{color:C.muted,fontSize:11,letterSpacing:'0.5px',marginBottom:6}}>EXTEND SERIES</div>
          <div style={{display:'flex',alignItems:'flex-end',gap:10}}>
            <FI label={`ADD HOW MANY MORE ${(RECURRENCE[recurrence]||recurrence||'').toUpperCase()} CLASSES`} value={extendCount} onChange={setExtendCount} type="number" half />
            <div style={{marginBottom:14}}>
              <Btn variant="secondary" onClick={()=>{const n=parseInt(extendCount)||0;if(n>0){onExtend(n);onClose();}}}>+ Extend</Btn>
            </div>
          </div>
          <div style={{color:C.muted,fontSize:11,marginTop:-6}}>
            New classes are appended after the last scheduled date{seriesLastDate?` (${fmt(seriesLastDate)})`:''}, inheriting the series settings — name, time, rate, bookability — not one-off tweaks made to individual dates.
          </div>
        </div>
      )}
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="secondary" onClick={()=>{onSaveFuture(f);onClose();}}>Update this & future</Btn>
        <Btn onClick={()=>{onSaveThis(f);onClose();}}>Update this class only</Btn>
      </div>
    </Modal>
  );
}


export function AddToRegisterForm({ onSave, onClose, people, classId, existing, attendance, classes, cls, onAddNew }) {
  const [selected, setSelected] = useState(null);
  // Names added this session, kept on-screen so the modal stays open for adding
  // several people in a row. `existing` (from the parent) is captured once at
  // mount via initialExisting so newly-added rows still render correctly until
  // the modal is closed and the parent re-reads attendance.
  const [addedNames, setAddedNames] = useState([]);
  const [addedIds, setAddedIds] = useState(()=>new Set());
  const initialExisting = useRef(existing);
  const available = people.filter(p=>p.status!=='inactive' && !addedIds.has(p.id));

  const handleAdd = () => {
    if (!selected) return;
    onSave(classId, selected.id);
    setAddedNames(prev => [...prev, selected.name]);
    setAddedIds(prev => { const n=new Set(prev); n.add(selected.id); return n; });
    setSelected(null); // clear the picker, keep the modal open for the next person
  };

  return (
    <Modal title="Add to Register" onClose={onClose} wide topAlign>
      <SearchSelect people={available} onSelect={p=>setSelected(p)} attendance={attendance} classes={classes} contextSeriesId={cls?.seriesId} existing={initialExisting.current} />
      {selected && (
        <div style={{marginTop:14,background:C.active,border:`1px solid ${C.gold}55`,borderRadius:6,padding:'10px 14px',display:'flex',alignItems:'center',gap:12}}>
          <Avatar name={selected.name} size={28} role={primaryRole(selected)} />
          <span style={{color:C.text,fontSize:14,flex:1}}>{selected.name}</span>
          <Btn small onClick={handleAdd}>Add to register</Btn>
        </div>
      )}
      {addedNames.length > 0 && (
        <div style={{marginTop:14,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'10px 14px'}}>
          <div style={{color:C.green,fontSize:12,fontWeight:600,marginBottom:6}}>Added · {addedNames.length}</div>
          <div style={{color:C.text,fontSize:13,lineHeight:1.6}}>{addedNames.join(', ')}</div>
        </div>
      )}
      {onAddNew && !selected && (
        <div style={{marginTop:18,paddingTop:16,borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div style={{color:C.muted,fontSize:12}}>Can't find them?</div>
          <Btn variant="ghost" small onClick={onAddNew}>+ Add new contact</Btn>
        </div>
      )}
      <div style={{marginTop:18,paddingTop:16,borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'flex-end'}}>
        <Btn variant="secondary" small onClick={onClose}>{addedNames.length > 0 ? 'Done' : 'Close'}</Btn>
      </div>
    </Modal>
  );
}


export function AddPackageForm({ onSave, onClose, personId, templates=[] }) {
  // Active templates only, in display order. The picker REPLACES the old
  // hardcoded typeDefaults; "— None —" leaves the form at manual defaults so an
  // ad-hoc package can still be entered without a template.
  const activeTemplates = templates.filter(t => t.active);
  const BLANK = {type:'class_package',name:'',totalSessions:10,sessionsUsed:0,amountPaid:'',paidVia:'stripe_tfb',datePurchased:today(),expiresAt:'',notes:''};
  const [templateId, setTemplateId] = useState('');
  const [f, setF] = useState(BLANK);
  const s = k => v => setF(x=>({...x,[k]:v}));

  // Selecting a template prefills every field from the template row. The chosen
  // validity window is captured so the expiry recomputes if the purchase date is
  // later edited; clearing the template stops that auto-recompute.
  const [validityDays, setValidityDays] = useState(null);
  const applyTemplate = (id) => {
    setTemplateId(id);
    if (!id) { setValidityDays(null); setF(BLANK); return; }
    const t = activeTemplates.find(x => x.id === id);
    if (!t) return;
    setValidityDays(t.validityDays ?? null);
    setF(x => ({
      ...x,
      type: t.type,
      name: t.name,
      totalSessions: t.totalSessions,
      amountPaid: t.defaultAmount === '' ? '' : t.defaultAmount,
      paidVia: t.paidVia || 'stripe_tfb',
      notes: t.notes || '',
      // recompute expiry from the (current) purchase date + window
      expiresAt: (t.validityDays && x.datePurchased) ? addDays(x.datePurchased, t.validityDays) : '',
    }));
  };

  // Keep expiry in step with purchase date while a windowed template is active.
  const onDatePurchased = (v) => {
    setF(x => ({
      ...x,
      datePurchased: v,
      expiresAt: (validityDays && v) ? addDays(v, validityDays) : x.expiresAt,
    }));
  };

  const templateOpts = [
    { v:'', l:'— None (manual) —' },
    ...activeTemplates.map(t => ({ v:t.id, l:t.name })),
  ];

  return (
    <Modal title="Add Package / Credits" onClose={onClose} wide>
      <FI label="TEMPLATE" value={templateId} onChange={applyTemplate} opts={templateOpts} />
      <FI label="TYPE" value={f.type} onChange={s('type')} opts={Object.entries(PKG_TYPES).map(([v,m])=>({v,l:m.label}))} />
      <FI label="NAME / DESCRIPTION" value={f.name} onChange={s('name')} />
      {!isCountlessPkg(f.type)&&(<div style={{display:'flex',gap:12}}><FI label="TOTAL SESSIONS" value={f.totalSessions} onChange={v=>s('totalSessions')(parseInt(v)||0)} type="number" half /><FI label="ALREADY USED" value={f.sessionsUsed} onChange={v=>s('sessionsUsed')(parseInt(v)||0)} type="number" half /></div>)}
      <div style={{display:'flex',gap:12}}><FI label="AMOUNT PAID (£)" value={f.amountPaid} onChange={s('amountPaid')} type="number" half /><FI label="PAID VIA" value={f.paidVia} onChange={s('paidVia')} opts={Object.entries(PAY_VIA).map(([v,l])=>({v,l}))} half /></div>
      <div style={{display:'flex',gap:12}}><FI label="DATE PURCHASED" value={f.datePurchased} onChange={onDatePurchased} type="date" half /><FI label="EXPIRES (blank = never)" value={f.expiresAt} onChange={s('expiresAt')} type="date" half /></div>
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
// overrides whichever side was picked. Roles are unioned server-side by
// merge_people() — the master ends up with both contacts' labels (dupes skipped).
//
// All related rows (notes, attendance, packages, payments, org_contacts,
// emails) are combined into the master server-side in a single transaction
// via the merge_people() Postgres function.

export function MergePeopleForm({ personA, personB, orgs, onMerge, onClose }) {
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
  const fields = ['name','phone','website','address','dateOfBirth','notes','orgId','status','defaultSessionRate','rateNotes'];
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
        address: get('address') || null,
        date_of_birth: get('dateOfBirth') || null,
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
        its linked records (notes, sessions, packages, payments, org links, emails, contact type labels) are re-pointed to the master.
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

          {/* ADDRESS */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>ADDRESS</label>
            <input value={get('address')} onChange={e=>setOverride('address')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            <FieldRadio fieldKey="address" valA={personA.address} valB={personB.address} displayA={personA.address} displayB={personB.address} />
          </div>

          {/* DATE OF BIRTH */}
          <div style={{marginBottom:12}}>
            <label style={{display:'block',color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:5}}>DATE OF BIRTH</label>
            <input type="date" value={get('dateOfBirth')||''} onChange={e=>setOverride('dateOfBirth')(e.target.value)}
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,padding:'8px 10px',fontFamily:"'Jost',sans-serif"}} />
            <FieldRadio fieldKey="dateOfBirth" valA={personA.dateOfBirth} valB={personB.dateOfBirth} displayA={personA.dateOfBirth||'—'} displayB={personB.dateOfBirth||'—'} />
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

export function EditPackageForm({ pkg, linkedCount, onSave, onDelete, onClose }) {
  const [f, setF] = useState({
    type: pkg.type,
    name: pkg.name,
    totalSessions: pkg.totalSessions,
    sessionsUsed: pkg.sessionsUsed || 0,
    amountPaid: pkg.amountPaid ?? '',
    paidVia: pkg.paidVia || 'other',
    datePurchased: pkg.datePurchased || today(),
    expiresAt: pkg.expiresAt || '',
    notes: pkg.notes || '',
  });
  const [armed, setArmed] = useState(false);
  const s = k => v => setF(x=>({...x,[k]:v}));
  const totalUsed = (parseInt(f.sessionsUsed)||0) + linkedCount;
  const totalSessionsNum = parseInt(f.totalSessions)||0;
  const minTotal = Math.max(1, totalUsed);
  const maxOffset = Math.max(0, totalSessionsNum - linkedCount);
  const canDelete = totalUsed === 0;
  const totalTooLow = !isCountlessPkg(f.type) && totalSessionsNum < totalUsed;
  const offsetTooHigh = !isCountlessPkg(f.type) && (parseInt(f.sessionsUsed)||0) > maxOffset;
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
      {!isCountlessPkg(f.type)&&(<>
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
      <div style={{display:'flex',gap:12}}><FI label="DATE PURCHASED" value={f.datePurchased} onChange={s('datePurchased')} type="date" half /><FI label="EXPIRES (blank = never)" value={f.expiresAt} onChange={s('expiresAt')} type="date" half /></div>
      {/* Quick-extend: bumps expires_at from its current value (or from today if
          blank) by a fixed step. Just date math written back to the same field. */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginTop:-6,marginBottom:14,flexWrap:'wrap'}}>
        <span style={{color:C.muted,fontSize:11,letterSpacing:'0.5px'}}>EXTEND</span>
        {[{l:'+1 week',fn:d=>addDays(d,7)},{l:'+1 month',fn:d=>addMonths(d,1)},{l:'+3 months',fn:d=>addMonths(d,3)}].map(b=>(
          <button key={b.l} type="button"
            onClick={()=>s('expiresAt')(b.fn(f.expiresAt||today()))}
            style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',borderRadius:4,fontSize:11,padding:'3px 9px',fontFamily:"'Jost',sans-serif"}}
            onMouseEnter={e=>{e.currentTarget.style.color=C.gold;e.currentTarget.style.borderColor=C.gold+'88';}}
            onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.borderColor=C.border;}}>
            {b.l}
          </button>
        ))}
        {f.expiresAt && (
          <button type="button" onClick={()=>s('expiresAt')('')}
            style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:11,fontFamily:"'Jost',sans-serif",textDecoration:'underline',opacity:0.7}}>
            clear
          </button>
        )}
      </div>
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

// PackageTemplateForm — add/edit a package template. Same core fields as a
// package MINUS per-purchase data (sessionsUsed, amountPaid-as-actual, dates).
// Instead: default_amount (list price prefill), validity_days (expiry window in
// days; blank = never expires), active, stripe_price_id (Phase 7).

export function PackageTemplateForm({ existing, onSave, onClose }) {
  const [f, setF] = useState(existing || {
    type:'class_package', name:'', totalSessions:10, defaultAmount:'',
    paidVia:'stripe_tfb', validityDays:'', notes:'', active:true, stripePriceId:'',
    showOnWebsite:false, publicDescription:'', publicSlug:'',
  });
  const s = k => v => setF(x=>({...x,[k]:v}));
  // Auto-suggest a kebab slug from the name while the slug is untouched/blank,
  // so publishing is one click. User can override; once edited we leave it.
  const slugify = (str) => String(str||'').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const valid = f.name.trim().length > 0
    && (!f.showOnWebsite || (slugify(f.publicSlug || f.name).length > 0));
  return (
    <Modal title={existing?`Edit Template: ${existing.name}`:"Add Package Template"} onClose={onClose} wide>
      <FI label="TYPE" value={f.type} onChange={s('type')} opts={Object.entries(PKG_TYPES).map(([v,m])=>({v,l:m.label}))} />
      <FI label="NAME / DESCRIPTION" value={f.name} onChange={s('name')} />
      {!isCountlessPkg(f.type) && (
        <FI label="TOTAL SESSIONS" value={f.totalSessions} onChange={v=>s('totalSessions')(parseInt(v)||0)} type="number" />
      )}
      <div style={{display:'flex',gap:12}}>
        <FI label="DEFAULT PRICE (£)" value={f.defaultAmount} onChange={s('defaultAmount')} type="number" half />
        <FI label="DEFAULT PAID VIA" value={f.paidVia} onChange={s('paidVia')} opts={Object.entries(PAY_VIA).map(([v,l])=>({v,l}))} half />
      </div>
      <FI label="VALIDITY (DAYS — blank = never expires)" value={f.validityDays} onChange={v=>s('validityDays')(v===''?'':(parseInt(v)||''))} type="number" />
      <FI label="NOTES" value={f.notes} onChange={s('notes')} rows={2} />
      {/* Stripe price ID — optional. The webhook prices server-side from the
          template's DEFAULT PRICE, so this is only needed if you later switch to
          pre-created Stripe Prices; safe to leave blank. */}
      <FI label="STRIPE PRICE ID (optional)" value={f.stripePriceId} onChange={s('stripePriceId')} />
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,cursor:'pointer'}} onClick={()=>s('active')(!f.active)}>
        <span style={{width:16,height:16,borderRadius:4,border:`1px solid ${f.active?C.gold:C.border}`,background:f.active?C.gold:'transparent',display:'inline-flex',alignItems:'center',justifyContent:'center',color:C.bg,fontSize:11,fontWeight:700}}>{f.active?'✓':''}</span>
        <span style={{color:C.text,fontSize:13}}>Active (shown in the package picker)</span>
      </div>
      {/* ── Website publishing ──────────────────────────────────────────────
          show_on_website gates the public /packages listing. When ticked, a
          public_slug is required (auto-suggested from the name) and a public
          description can be shown to buyers instead of internal NOTES. */}
      <div style={{borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:14}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:f.showOnWebsite?14:2,cursor:'pointer'}} onClick={()=>{
          const next = !f.showOnWebsite;
          // ticking with no slug yet → seed from the name so it's publish-ready
          setF(x=>({...x, showOnWebsite:next, publicSlug: (next && !x.publicSlug) ? slugify(x.name) : x.publicSlug }));
        }}>
          <span style={{width:16,height:16,borderRadius:4,border:`1px solid ${f.showOnWebsite?C.gold:C.border}`,background:f.showOnWebsite?C.gold:'transparent',display:'inline-flex',alignItems:'center',justifyContent:'center',color:C.bg,fontSize:11,fontWeight:700}}>{f.showOnWebsite?'✓':''}</span>
          <span style={{color:C.text,fontSize:13}}>Sell on website (public /packages page)</span>
        </div>
        {f.showOnWebsite && (
          <>
            <FI label="PUBLIC SLUG (URL — lowercase, kebab-case)" value={f.publicSlug} onChange={v=>s('publicSlug')(slugify(v))} />
            <FI label="PUBLIC DESCRIPTION (shown to buyers; blank = use name)" value={f.publicDescription} onChange={s('publicDescription')} rows={2} />
          </>
        )}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(valid){
          const slug = f.showOnWebsite ? (slugify(f.publicSlug) || slugify(f.name)) : f.publicSlug;
          onSave({...f, totalSessions:parseInt(f.totalSessions)||0, publicSlug:slug});
          onClose();
        }}} disabled={!valid}>{existing?'Save Changes':'Add Template'}</Btn>
      </div>
    </Modal>
  );
}

// EmailTemplateForm — add/edit a canned email body for the compose picker.
// Shape: { id, label, subject, body, branch, active }. `id` is minted on create
// (uid). `branch` is an optional relevance hint: 'care_home' floats the template
// to the top of the picker for care-home recipients; '' (None) keeps definition
// order. The parent owns persistence (writes the whole templates array to the
// settings row); this form just emits the row via onSave.
export function EmailTemplateForm({ existing, onSave, onClose }) {
  const [f, setF] = useState(existing || {
    id: uid(), label:'', subject:'', body:'', branch:'', active:true,
  });
  const s = k => v => setF(x=>({...x,[k]:v}));
  const valid = f.label.trim().length > 0 && f.body.trim().length > 0;
  const branchOpts = [
    { v:'', l:'None (general)' },
    { v:'care_home', l:'Care home (float to top for care-home contacts)' },
  ];
  return (
    <Modal title={existing?`Edit Template: ${existing.label||'(untitled)'}`:"Add Email Template"} onClose={onClose} wide>
      <FI label="TEMPLATE NAME" value={f.label} onChange={s('label')} />
      <FI label="RELEVANCE" value={f.branch} onChange={s('branch')} opts={branchOpts} />
      <FI label="SUBJECT" value={f.subject} onChange={s('subject')} />
      <FI label="BODY" value={f.body} onChange={s('body')} rows={10} />
      <div style={{color:C.muted,fontSize:11,marginTop:-6,marginBottom:14,lineHeight:1.5}}>
        Tokens: <span style={{color:C.text}}>{'{name}'}</span> and <span style={{color:C.text}}>{'{firstName}'}</span> fill from the contact when inserted. Leave [square-bracket] notes for parts you’ll edit by hand each time.
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,cursor:'pointer'}} onClick={()=>s('active')(!f.active)}>
        <span style={{width:16,height:16,borderRadius:4,border:`1px solid ${f.active?C.gold:C.border}`,background:f.active?C.gold:'transparent',display:'inline-flex',alignItems:'center',justifyContent:'center',color:C.bg,fontSize:11,fontWeight:700}}>{f.active?'✓':''}</span>
        <span style={{color:C.text,fontSize:13}}>Active (shown in the compose picker)</span>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{if(valid){onSave({...f,label:f.label.trim()});onClose();}}} disabled={!valid}>{existing?'Save Changes':'Add Template'}</Btn>
      </div>
    </Modal>
  );
}

export const recommendedKindForPerson = (person) => {
  const role = (person.roles || [])[0];
  if(role === 'resident') return 'care_class';
  if(role === 'private_client') return 'private_session';
  if(role === 'website_student') return 'class';
  if(role === 'tt_prospect') return 'class';
  if(role === 'workshop_interest') return 'class';
  if(role === 'retreat_interest') return 'class';
  return 'class';
};


export function BookForPersonForm({ person, classes, orgs, attendance, onAddToRegister, onCreatePrivate, onClose }) {
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


export function BookableClassRow({ cls, orgs, primary, onClick }) {
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


export function CreateInvoiceForm({ onSave, onClose, orgs, classes, invoices, existing }) {
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

export function NoteForm({ personId, classId, kind='note', existing, onSave, onCancel }) {
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

  // Attachments — same rails as email: bytes to R2 via the forms-worker
  // (Supabase storage untouched), ids + names in the note's raw_headers (the
  // AttachmentChips render contract), files rows anchored to the interaction
  // by the parent handler after save. Existing chips come from
  // existing.rawHeaders; removing one is collected into removedIds and
  // executed by the parent AFTER a successful save (transient _-prefixed
  // keys on the note object — noteToDb ignores unknown keys). Per-file cap
  // mirrors the worker's 25 MB; no total budget — that was Brevo's limit,
  // and notes never travel through Brevo.
  const NOTE_ATTACH_MAX = 25 * 1024 * 1024;
  const [attach, setAttach] = useState([]);            // new picks: [{ key, file }]
  const [keptExisting, setKeptExisting] = useState(() => {
    const ids = existing?.rawHeaders?.attachment_file_ids;
    if (!Array.isArray(ids) || !ids.length) return [];
    const names = existing.rawHeaders.attachment_names || [];
    return ids.map((id, i) => ({ id, name: names[i] || 'attachment' }));
  });
  const [removedIds, setRemovedIds] = useState([]);
  const [attBusy, setAttBusy] = useState(false);       // uploading during save
  const [attErr, setAttErr] = useState(null);
  const attUploadedIds = useRef({});                   // key → files-row id (retry cache)
  const attInputRef = useRef(null);
  const attTooBig = attach.filter(a => a.file.size > NOTE_ATTACH_MAX);
  const addNoteFiles = (list) => {
    setAttach(prev => {
      const next = [...prev];
      for (const f of Array.from(list || [])) {
        if (next.some(a => a.file.name === f.name && a.file.size === f.size)) continue;
        next.push({ key: `${f.name}—${f.size}—${Date.now()}`, file: f });
      }
      return next;
    });
  };
  const removeExistingAtt = (id) => {
    setKeptExisting(prev => prev.filter(a => a.id !== id));
    setRemovedIds(prev => [...prev, id]);
  };

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

  const save = async () => {
    if(!text.trim() || attBusy || attTooBig.length) return;
    const note = {
      personId,
      classId,
      text: text.trim(),
      important: imp,
      kind: activeKind,
    };

    // Upload new attachments first (sequential; ids cached across a failed
    // attempt so retry never re-uploads). Any failure keeps the form open
    // with the error inline — nothing saves half-attached.
    let newAtt = [];
    if (attach.length) {
      setAttBusy(true); setAttErr(null);
      try {
        for (const a of attach) {
          if (!attUploadedIds.current[a.key]) {
            const row = await filesApi.uploadAttachment(a.file);
            attUploadedIds.current[a.key] = row.id;
          }
          newAtt.push({ id: attUploadedIds.current[a.key], name: a.file.name });
        }
      } catch (e) {
        setAttErr(e?.message || String(e));
        setAttBusy(false);
        return;
      }
      setAttBusy(false);
    }
    const finalAtt = [...keptExisting, ...newAtt];
    if (isEdit) {
      // Merge into the EXISTING raw_headers so nothing else in there is
      // disturbed (manual-inbound thread ids etc.); strip the keys entirely
      // when the last attachment is removed.
      const merged = { ...(existing.rawHeaders || {}) };
      if (finalAtt.length) {
        merged.attachment_file_ids = finalAtt.map(a => a.id);
        merged.attachment_names = finalAtt.map(a => a.name);
      } else {
        delete merged.attachment_file_ids;
        delete merged.attachment_names;
      }
      note.rawHeaders = Object.keys(merged).length ? merged : null;
      // Transient instructions for the parent handler (never hit the DB):
      note._newAttachmentIds = newAtt.map(a => a.id);
      note._removedAttachmentIds = removedIds;
    } else if (finalAtt.length) {
      note.rawHeaders = {
        attachment_file_ids: finalAtt.map(a => a.id),
        attachment_names: finalAtt.map(a => a.name),
      };
    }
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
      // Manually-logged inbound emails have no Message-ID (they didn't come
      // through the email worker), so without this they'd save with a null
      // thread_id and the Reply button would mint a fresh, unrelated thread —
      // the reply wouldn't group with the original. Mint a synthetic thread_id
      // here so the Reply path has a parent to inherit. 'manual:' prefix marks
      // origin and won't collide with Brevo/inbound Message-IDs.
      if(activeKind === 'email' && note.direction === 'inbound') {
        note.threadId = `manual:${crypto.randomUUID()}`;
      }
    }

    onSave(note);
    // Only reset in add mode — edit mode closes the modal externally and a
    // stale-reset would just flash empty fields between save and unmount.
    if(!isEdit) {
      setText(''); setImp(false); setActionDate('');
      setDirection('outbound'); setSubject(''); setDurationMins('');
      setAttach([]); setAttErr(null); attUploadedIds.current = {};
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

      {/* Attachments: kept-existing chips (edit mode) + new picks + adder. */}
      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginTop:8}}>
        <input ref={attInputRef} type="file" multiple style={{display:'none'}}
          onChange={e => { addNoteFiles(e.target.files); e.target.value = ''; }} />
        <button onClick={() => attInputRef.current?.click()} disabled={attBusy}
          title="Attach files to this entry"
          style={{background:'none',border:`1px solid ${C.border}`,color:C.gold,
            cursor:attBusy ? 'default' : 'pointer',borderRadius:6,fontSize:12,
            padding:'4px 10px',fontFamily:"'Jost',sans-serif"}}>
          📎 Attach
        </button>
        {keptExisting.map(a => (
          <span key={a.id} style={{display:'inline-flex',alignItems:'center',gap:6,
            background:C.surf,border:`1px solid ${C.border}`,color:C.text,
            fontSize:11.5,padding:'3px 10px',borderRadius:14,maxWidth:220}}>
            <span style={{opacity:0.75}}>📎</span>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</span>
            {!attBusy && (
              <span onClick={() => removeExistingAtt(a.id)} title="Remove (deletes the file on save)"
                style={{color:C.muted,cursor:'pointer',fontSize:13,lineHeight:1}}>×</span>
            )}
          </span>
        ))}
        {attach.map(a => (
          <span key={a.key} style={{display:'inline-flex',alignItems:'center',gap:6,
            background:C.surf,border:`1px solid ${a.file.size > NOTE_ATTACH_MAX ? C.red : C.border}`,
            color:C.text,fontSize:11.5,padding:'3px 10px',borderRadius:14,maxWidth:220}}>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.file.name}</span>
            <span style={{color:C.muted,flexShrink:0}}>{(a.file.size / 1048576).toFixed(1)} MB</span>
            {!attBusy && (
              <span onClick={() => setAttach(prev => prev.filter(x => x.key !== a.key))} title="Remove"
                style={{color:C.muted,cursor:'pointer',fontSize:13,lineHeight:1}}>×</span>
            )}
          </span>
        ))}
      </div>
      {attTooBig.length > 0 && (
        <div style={{color:C.gold,fontSize:11,marginTop:6}}>
          ⚠ Over the 25 MB per-file limit: {attTooBig.map(a => a.file.name).join(', ')}
        </div>
      )}
      {attErr && (
        <div style={{marginTop:8,padding:'6px 10px',background:'#3a1f1f',border:'1px solid #6b2e2e',
          borderRadius:6,color:'#e8a4a4',fontSize:12,lineHeight:1.5}}>{attErr}</div>
      )}

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
          <Btn variant="ghost" small onClick={onCancel} disabled={attBusy}>Cancel</Btn>
          <Btn small onClick={save} disabled={attBusy || attTooBig.length > 0}>
            {attBusy ? 'Uploading…' : saveLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// Edit-mode wrapper: drops NoteForm into a Modal with its `existing` prefill.
// Save calls onSave with the full UI-shape note (caller translates to DB patch).

export function EditNoteForm({ note, onSave, onClose }) {
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

// ─── DIARY ENTRY (calendar quick-add) ─────────────────────────────────────────
// Create-only modal for diary entries. A diary entry is an interaction with
// kind='diary' carrying a start time + duration, so it renders as a positioned
// block in WeekView/MonthView alongside classes. The personal/business toggle
// (isPersonal) drives which calendar it appears in and whether it greys out in
// the opposite mode. Person link defaults to the owner's own contact (selfPersonId,
// threaded from the parent) so interactions_anchored is always satisfied — the
// field can be re-pointed to any contact but never left empty (save falls back to
// self). Editing happens on PersonDetail's Comms tab, where diary entries live as
// notes; clicking a block in the calendar navigates there rather than reopening
// this modal. defaultDate/defaultTime are prefilled from the clicked day/slot.
// Diary entry create-or-edit modal. Opened fresh (quick-add from the calendar)
// or populated with `existing` (clicking a diary block re-opens it here — NOT
// the generic note editor, which has no time field and would strip the entry's
// diary-ness). Linkable to a person AND/OR a project, both optional. Anchoring
// safety net: if both are cleared, the entry falls back to the owner's own
// record (selfPersonId) so interactions_anchored is always satisfied. The little
// "open ↗" links jump to the linked record without making the block-click itself
// navigate away.
export function DiaryModal({ people, projects=[], selfPersonId, existing=null, prefill=null, defaultDate, defaultTime, defaultPersonal=false, onSave, onSaveMany, onCopy, onDelete, onDeleteGroup, onClose, nav }) {
  const isEdit = !!existing;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [f, setF] = useState({
    title: existing?.subject || '',
    text: existing?.text || prefill?.text || '',
    date: existing?.date || prefill?.date || defaultDate || today(),
    time: existing?.time || defaultTime || currentHourTime(),
    duration: existing?.durationMins || 60,
    // Display unit for the duration field. Stored value is always minutes; this
    // just lets the user enter "2 hours" instead of "120". Seed to hours when an
    // existing entry is a clean whole-hour, else minutes.
    durationUnit: (existing?.durationMins && existing.durationMins % 60 === 0) ? 'hours' : 'mins',
    isPersonal: existing ? !!existing.isPersonal : (prefill ? !!prefill.isPersonal : defaultPersonal),
    // Which named layer this diary entry belongs to ('mine' / 'sienna' / 'rosie').
    // Only surfaced when isPersonal is true. New entries seed from the prefill
    // (so quick-add from a layer's toggle could pre-pick it later) else 'mine'.
    calendar: existing?.calendar || prefill?.calendar || 'mine',
    personId: existing ? (existing.personId || '') : (prefill?.personId ?? (selfPersonId || '')),
    projectId: existing?.projectId || prefill?.projectId || '',
  });
  const s = k => v => setF(x=>({...x,[k]:v}));
  // "Repeat daily ×N" — only offered when creating (not editing). Creates N
  // consecutive single-day entries sharing one diary_group so they delete as a
  // group. Off by default; count is the TOTAL number of days (incl. the first).
  const [repeat, setRepeat] = useState(false);
  const [repeatDays, setRepeatDays] = useState(3);

  // Resolve the duration field (value + unit) down to stored minutes.
  const durationToMins = () => {
    const v = parseInt(f.duration) || (f.durationUnit === 'hours' ? 1 : 60);
    return f.durationUnit === 'hours' ? v * 60 : v;
  };
  // Add whole days to a YYYY-MM-DD string without timezone drift (string math,
  // same reasoning as the month-nav fix — never round-trip through Date/UTC).
  const addDaysStr = (iso, n) => {
    const [y,m,d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m-1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0,10);
  };

  const save = () => {
    // Title is the calendar label and is required. Body is the optional longer
    // note shown on hover / in this form. (When promoting a note to the calendar
    // the note text seeds the body, so title may start empty — hence we validate
    // on title, and fall back to body if a title-less entry somehow saves.)
    const title = f.title.trim();
    const text = f.text.trim();
    if(!title && !text) return;
    // Anchoring safety net: at least one of person / project must be set, else
    // fall back to self so interactions_anchored passes.
    let personId = f.personId || null;
    const projectId = f.projectId || null;
    if(!personId && !projectId) personId = selfPersonId || null;
    const base = {
      kind: 'diary',
      subject: title || text,   // ensure the calendar always has a label
      text,
      time: f.time || null,
      durationMins: durationToMins(),
      isPersonal: !!f.isPersonal,
      personId,
      projectId,
      calendar: f.calendar || 'mine',
    };
    // Repeat daily ×N (create-only): N consecutive single-day entries sharing one
    // diary_group so they can be deleted together. Guard the count to a sane
    // range. When off (or editing), behave exactly as before — one entry.
    if (!isEdit && repeat && onSaveMany) {
      const n = Math.max(2, Math.min(60, parseInt(repeatDays) || 2));
      const group = crypto.randomUUID();
      const entries = Array.from({length:n}, (_,i) => ({
        ...base,
        date: addDaysStr(f.date, i),
        diaryGroup: group,
      }));
      onSaveMany(entries);
      onClose();
      return;
    }
    const payload = { ...base, date: f.date, diaryGroup: existing?.diaryGroup || null };
    onSave(isEdit ? { ...existing, ...payload } : payload);
    onClose();
  };

  // Copy this entry onto another layer as an INDEPENDENT new entry. Sienna's
  // calendar stays the source of truth for what's happening in her life; copying
  // to Mine or Rosie creates a separate row on the responsibility-holder's layer
  // ("I've got this one") that can later diverge without touching the original.
  // CRITICAL: this must go through onCopy, NOT onSave. In edit mode onSave is
  // bound to the parent's edit/patch handler, which would try to patch by id —
  // a copy has no id and must be a fresh insert. onCopy always routes to the
  // create path. We take current form values so unsaved title/time edits carry
  // across, but never touch the source row.
  const copyTo = (calKey) => {
    if (!onCopy) return;
    const title = f.title.trim();
    const text = f.text.trim();
    if(!title && !text) return;
    let personId = f.personId || null;
    const projectId = f.projectId || null;
    if(!personId && !projectId) personId = selfPersonId || null;
    onCopy({
      kind: 'diary',
      subject: title || text,
      text,
      date: f.date,
      time: f.time || null,
      durationMins: durationToMins(),
      isPersonal: true,        // copies always land on a personal layer
      personId,
      projectId,
      calendar: calKey,
    });
    onClose();
  };

  const jump = (view, params) => { onClose(); nav && nav(view, params); };
  const linkBtn = { background:'none', border:'none', color:C.gold, cursor:'pointer', fontSize:11, padding:0, fontFamily:"'Jost',sans-serif", textDecoration:'underline', marginLeft:8 };

  return (
    <Modal title={isEdit ? 'Edit diary entry' : 'New diary entry'} onClose={onClose}>
      <FI label="TITLE" value={f.title} onChange={s('title')} placeholder="e.g. Dentist, Erica's birthday, Supervision" />
      <FI label="NOTE (optional)" value={f.text} onChange={s('text')} rows={3} placeholder="Longer detail — shows on hover and here when you reopen." />
      <div style={{display:'flex',gap:12}}>
        <FI label="DATE" value={f.date} onChange={s('date')} type="date" half />
        <FI label="TIME" value={f.time} onChange={s('time')} type="time" half />
      </div>
      {/* Duration: a number plus a min/hour unit. Stored value is always minutes
          (durationToMins converts on save); the unit is purely an input grain. */}
      <div>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:6}}>DURATION</div>
        <div style={{display:'flex',gap:8,alignItems:'stretch'}}>
          <input type="number" min="1" value={f.duration}
            onChange={e=>s('duration')(parseInt(e.target.value)||1)}
            style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,
              color:C.text,fontSize:14,padding:'9px 12px',fontFamily:"'Jost',sans-serif"}} />
          <div style={{display:'flex',gap:0,borderRadius:6,overflow:'hidden',border:`1px solid ${C.border}`}}>
            {[{v:'mins',l:'min'},{v:'hours',l:'hr'}].map(u=>{
              const on = f.durationUnit===u.v;
              return (
                <button key={u.v} onClick={()=>{
                  // Convert the displayed number so the real duration is unchanged.
                  if(u.v===f.durationUnit) return;
                  const cur = parseInt(f.duration)||0;
                  if(u.v==='hours') s('duration')(Math.max(1, Math.round(cur/60)));
                  else s('duration')(cur*60);
                  s('durationUnit')(u.v);
                }}
                  style={{padding:'0 16px',cursor:'pointer',fontSize:13,fontFamily:"'Jost',sans-serif",
                    background: on ? C.gold+'22' : C.card, color: on ? C.gold : C.muted, border:'none'}}>
                  {u.l}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Repeat daily ×N — create-only. Makes N consecutive single-day entries
          sharing a group so they delete together. Useful for a multi-day course,
          holiday, or block of cover. Editing an existing entry hides this. */}
      {!isEdit && onSaveMany && (
        <div style={{marginTop:4}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',color:C.muted,fontSize:12}}>
            <input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)} />
            Repeat daily
          </label>
          {repeat && (
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8}}>
              <span style={{color:C.muted,fontSize:12}}>for</span>
              <input type="number" min="2" max="60" value={repeatDays}
                onChange={e=>setRepeatDays(parseInt(e.target.value)||2)}
                style={{width:64,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,
                  color:C.text,fontSize:14,padding:'7px 10px',fontFamily:"'Jost',sans-serif"}} />
              <span style={{color:C.muted,fontSize:12}}>
                days — {f.date} to {addDaysStr(f.date, Math.max(2,Math.min(60,parseInt(repeatDays)||2))-1)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Person link (optional) + jump-out */}
      <div>
        <div style={{display:'flex',alignItems:'center'}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px'}}>LINKED CONTACT</div>
          {f.personId && nav && (
            <button style={linkBtn} onClick={()=>jump('person_detail',{personId:f.personId})}>open ↗</button>
          )}
        </div>
        <FI value={f.personId} onChange={s('personId')}
          opts={[{v:'',l:'— none —'}, ...people.map(p=>({v:p.id,l:p.name}))]} />
      </div>

      {/* Project link (optional) + jump-out */}
      <div>
        <div style={{display:'flex',alignItems:'center'}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px'}}>LINKED PROJECT</div>
          {f.projectId && nav && (
            <button style={linkBtn} onClick={()=>jump('project_detail',{projectId:f.projectId})}>open ↗</button>
          )}
        </div>
        <FI value={f.projectId} onChange={s('projectId')}
          opts={[{v:'',l:'— none —'}, ...projects.map(p=>({v:p.id,l:p.name}))]} />
      </div>

      {/* Personal / business toggle — drives which calendar this shows in. */}
      <div style={{marginTop:4,marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>CALENDAR</div>
        <div style={{display:'flex',gap:8}}>
          {[{v:false,l:'Business',c:C.gold},{v:true,l:'Personal',c:C.blue}].map(opt=>(
            <button key={String(opt.v)} onClick={()=>s('isPersonal')(opt.v)}
              style={{flex:1,padding:'9px 12px',borderRadius:6,cursor:'pointer',fontSize:13,
                fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px',
                background: f.isPersonal===opt.v ? opt.c+'22' : C.card,
                border:`1px solid ${f.isPersonal===opt.v ? opt.c : C.border}`,
                color: f.isPersonal===opt.v ? opt.c : C.muted}}>
              {f.isPersonal===opt.v ? '● ' : '○ '}{opt.l}
            </button>
          ))}
        </div>
      </div>

      {/* Layer picker — only meaningful for personal entries. MULTI-TAG:
          tap several layers to put ONE entry on several diaries (a family
          holiday is one row tagged rosie,scarlett — not four copies). The
          value stays the single `calendar` text column, comma-joined in
          SELECTION ORDER: the first-picked key is the primary and sets the
          block colour. Tapping the last remaining key is a no-op (an entry
          always belongs somewhere). */}
      {f.isPersonal && (
        <div style={{marginTop:4,marginBottom:14}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>WHOSE CALENDAR — TAP SEVERAL TO SHARE ONE ENTRY</div>
          <div style={{display:'flex',gap:8}}>
            {DIARY_CALENDAR_KEYS.map(k=>{
              const cal = DIARY_CALENDARS[k];
              const sel = calKeys(f.calendar);
              const on = sel.includes(k);
              const toggle = () => {
                if (on) {
                  if (sel.length === 1) return; // never leave it layerless
                  s('calendar')(sel.filter(x=>x!==k).join(','));
                } else {
                  s('calendar')([...sel, k].join(','));
                }
              };
              return (
                <button key={k} onClick={toggle}
                  style={{flex:1,padding:'9px 12px',borderRadius:6,cursor:'pointer',fontSize:13,
                    fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px',
                    background: on ? cal.color+'22' : C.card,
                    border:`1px solid ${on ? cal.color : C.border}`,
                    color: on ? cal.color : C.muted}}>
                  {on ? (sel[0]===k ? '● ' : '◉ ') : '○ '}{cal.label}
                </button>
              );
            })}
          </div>
          {calKeys(f.calendar).length > 1 && (
            <div style={{color:C.muted,fontSize:10,marginTop:6,fontStyle:'italic',opacity:0.8}}>
              On {calKeys(f.calendar).length} calendars — first pick ({DIARY_CALENDARS[calKeys(f.calendar)[0]].label}) sets the colour.
            </div>
          )}
        </div>
      )}

      {/* Copy-to — only when editing an existing personal entry. One-click
          duplicate onto another layer as an independent entry (responsibility
          housekeeping). Offers every layer except the one we're already on.
          Closes the modal after copying; the source entry is left untouched. */}
      {isEdit && f.isPersonal && onCopy && (
        <div style={{marginTop:4,marginBottom:14,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:'0.5px',marginBottom:8}}>COPY THIS ENTRY TO</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {DIARY_CALENDAR_KEYS.filter(k=>!calKeys(f.calendar).includes(k)).map(k=>{
              const cal = DIARY_CALENDARS[k];
              return (
                <button key={k} onClick={()=>copyTo(k)}
                  style={{padding:'7px 14px',borderRadius:6,cursor:'pointer',fontSize:12,
                    fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px',
                    background:C.card, border:`1px solid ${cal.color}88`, color:cal.color}}>
                  + {cal.label}
                </button>
              );
            })}
          </div>
          <div style={{color:C.muted,fontSize:10,marginTop:7,fontStyle:'italic',opacity:0.8}}>
            Creates a separate copy — this entry stays as is.
          </div>
        </div>
      )}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:4}}>
        <div>
          {isEdit && onDelete && (
            confirmDelete ? (
              existing.diaryGroup && onDeleteGroup ? (
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span style={{color:C.muted,fontSize:12}}>This is a repeating entry —</span>
                  <button onClick={()=>{ onDelete(existing.id); onClose(); }}
                    style={{background:C.red+'22',border:`1px solid ${C.red}`,color:C.red,cursor:'pointer',
                      borderRadius:6,fontSize:12,padding:'6px 12px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>
                    Delete this day
                  </button>
                  <button onClick={()=>{ onDeleteGroup(existing.diaryGroup); onClose(); }}
                    style={{background:C.red+'22',border:`1px solid ${C.red}`,color:C.red,cursor:'pointer',
                      borderRadius:6,fontSize:12,padding:'6px 12px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>
                    Delete all repeats
                  </button>
                  <button onClick={()=>setConfirmDelete(false)}
                    style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:12,
                      fontFamily:"'Jost',sans-serif",textDecoration:'underline',padding:0}}>
                    keep
                  </button>
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{color:C.muted,fontSize:12}}>Delete this entry?</span>
                  <button onClick={()=>{ onDelete(existing.id); onClose(); }}
                    style={{background:C.red+'22',border:`1px solid ${C.red}`,color:C.red,cursor:'pointer',
                      borderRadius:6,fontSize:12,padding:'6px 12px',fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px'}}>
                    Yes, delete
                  </button>
                  <button onClick={()=>setConfirmDelete(false)}
                    style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:12,
                      fontFamily:"'Jost',sans-serif",textDecoration:'underline',padding:0}}>
                    keep
                  </button>
                </div>
              )
            ) : (
              <button onClick={()=>setConfirmDelete(true)}
                style={{background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:12,
                  fontFamily:"'Jost',sans-serif",padding:0}}>
                Delete
              </button>
            )
          )}
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{isEdit ? 'Save changes' : 'Add entry'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// Lightweight client picker for the calendar "+ PS" flow. Private sessions are
// normally booked from a person's record (the person is already known); booking
// from the calendar reverses that — you have a date and need to choose who. This
// modal picks the client, then the parent routes into the existing private-
// booking path (book_create_private) with the date pre-filled, so the package
// picker + attendance link all work as they do from PersonDetail. The "no person
// yet" option falls back to creating an empty private slot you can attach a
// client to later.
export function PickPersonModal({ people, attendance, classes, onPick, onSkip, onClose }) {
  return (
    <Modal title="Private session — who for?" onClose={onClose}>
      <SearchSelect people={people} attendance={attendance} classes={classes} onSelect={onPick} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16}}>
        {onSkip
          ? <button onClick={onSkip}
              style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:12,
                fontFamily:"'Jost',sans-serif",textDecoration:'underline',padding:0}}>
              Block out a slot without a client →
            </button>
          : <span />}
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// template (htmlContent direct). Errors from the worker (validation, missing
// primary email, Brevo failure) surface inline so the user can fix and retry
// without losing their draft. The outbound interaction is written server-side
// and returned to the caller via onSend, which is expected to splice it into
// the parent's notes state so it appears on PersonDetail immediately.

export function SendEmailModal({ person, org, people = [], initialRecipients = null, templates = [], onSend, onClose, onSaveAsTemplate, initialSubject = '', initialBody = '', threadId, inReplyTo, draftKey }) {
  // Draft persistence: if a draftKey is supplied, the in-progress subject AND
  // body survive closing/reopening the modal (and navigating away) via
  // localStorage. Stored as a single JSON blob {subject, body}. Falls back to
  // treating a bare string as a legacy body-only draft from before subjects
  // were persisted, so nothing already saved is lost.
  const restored = (() => {
    if (!draftKey) return null;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw == null) return null;
      if (raw.startsWith('{')) {
        const o = JSON.parse(raw);
        return { subject: o.subject ?? '', body: o.body ?? '' };
      }
      return { subject: '', body: raw }; // legacy body-only draft
    } catch { return null; }
  })();
  const [subject, setSubject] = useState(restored?.subject || initialSubject);
  const [body, setBody] = useState(restored?.body != null ? restored.body : initialBody);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Editable recipient set. Seeded from initialRecipients (reply-all —
  // derived by deriveReplyAllRecipients upstream) or from the person the
  // modal was opened on; then freely editable — add CRM contacts via search,
  // add raw addresses for people not in the CRM (their fan-out rows land in
  // the Inbox for linking), toggle To/Cc per chip, remove. ALWAYS sent to
  // the worker as recipients[] — a one-entry list is identical to the
  // legacy personId path server-side. Not draft-persisted (subject/body
  // are; a recipient set is cheap to rebuild and stale sets are risky).
  const MAX_RECIPIENTS = 10;  // mirrors the worker's ADHOC_MAX_RECIPIENTS
  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [recips, setRecips] = useState(() => {
    if (Array.isArray(initialRecipients) && initialRecipients.length) {
      return initialRecipients.map(r => ({ ...r, role: r.role === 'cc' ? 'cc' : 'to' }));
    }
    return person?.id
      ? [{ personId: person.id, name: person.name || null, email: person.email || '', role: 'to' }]
      : [];
  });
  const [adding, setAdding] = useState(false);
  const [rawEmail, setRawEmail] = useState('');
  const recipLabel = (r) => r.name
    || (r.personId && people.find(p => p.id === r.personId)?.name)
    || r.email || '?';
  const addPerson = (p) => {
    if (!p || recips.some(r => r.personId === p.id)) { setAdding(false); return; }
    setRecips(prev => [...prev, { personId: p.id, name: p.name || null, email: p.email || '', role: 'to' }]);
    setAdding(false);
  };
  const addRaw = () => {
    const em = rawEmail.trim().toLowerCase();
    if (!EMAIL_OK.test(em)) return;
    if (!recips.some(r => (r.email || '').toLowerCase() === em)) {
      setRecips(prev => [...prev, { personId: null, name: null, email: em, role: 'to' }]);
    }
    setRawEmail('');
    setAdding(false);
  };
  const toggleRole = (i) => setRecips(prev =>
    prev.map((r, x) => x === i ? { ...r, role: r.role === 'cc' ? 'to' : 'cc' } : r));
  const removeRecip = (i) => setRecips(prev => prev.filter((_, x) => x !== i));
  // A CRM contact with no primary email fails the whole send server-side —
  // catch it here with the name attached instead. Raw addresses always pass.
  const noEmailNames = recips
    .filter(r => r.personId && !(r.email || people.find(p => p.id === r.personId)?.email))
    .map(recipLabel);
  const hasTo = recips.some(r => r.role === 'to');

  // Attachments. Chips hold the picked File objects; bytes upload at send
  // time (sequentially, via the forms-worker) so a closed modal leaves no
  // orphan R2 objects. uploadedIds caches file→row-id across a failed send
  // so retrying doesn't upload (or bill) the same bytes twice. NOT persisted
  // in the draft — File handles don't survive localStorage.
  const ATTACH_MAX_TOTAL = 15 * 1024 * 1024;  // worker + Brevo budget (raw)
  const ATTACH_MAX_COUNT = 5;
  const [attach, setAttach] = useState([]);       // [{ key, file }]
  const [uploadingName, setUploadingName] = useState(null);
  const uploadedIds = useRef({});                 // key → files-row id
  const fileInputRef = useRef(null);
  const attachTotal = attach.reduce((s, a) => s + (a.file.size || 0), 0);
  const overBudget = attachTotal > ATTACH_MAX_TOTAL;
  const fmtMb = (b) => `${(b / 1048576).toFixed(1)} MB`;
  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    setAttach(prev => {
      const next = [...prev];
      for (const f of incoming) {
        if (next.length >= ATTACH_MAX_COUNT) break;
        if (next.some(a => a.file.name === f.name && a.file.size === f.size)) continue;
        next.push({ key: `${f.name}—${f.size}—${Date.now()}`, file: f });
      }
      return next;
    });
  };
  const removeAttach = (key) => setAttach(prev => prev.filter(a => a.key !== key));

  // Persist subject + body as they change. Writes are cheap and the modal is
  // short-lived, so no debounce. Cleared on successful send.
  useEffect(() => {
    if (!draftKey) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ subject, body })); } catch {}
  }, [subject, body, draftKey]);

  const canSend = !busy && recips.length > 0 && recips.length <= MAX_RECIPIENTS
    && hasTo && noEmailNames.length === 0
    && subject.trim() && body.trim() && !overBudget;

  // Template picker. Show ALL templates, with the most relevant for this
  // recipient sorted to the top (scoreTemplates). Applying one fills subject +
  // body via fillTemplate (which swaps {name}/{firstName} and leaves human-edit
  // markers like [day] intact). If the draft already has content, confirm
  // before overwriting so nothing typed is lost silently.
  const rankedTemplates = useMemo(
    () => scoreTemplates(templates.filter(t => t.active !== false), { person, org }),
    [templates, person, org]
  );
  const applyTemplate = (id) => {
    if (!id) return;
    const tpl = rankedTemplates.find(t => t.id === id);
    if (!tpl) return;
    const hasDraft = subject.trim() || body.trim();
    if (hasDraft && !window.confirm('Replace the current draft with this template? Your typed text will be lost.')) {
      return;
    }
    setSubject(fillTemplate(tpl.subject || '', person));
    setBody(fillTemplate(tpl.body || '', person));
  };

  // Save the current draft as a reusable template. Prompts for a name, then
  // hands a new template row to the parent (which mints persistence). The body
  // is stored verbatim — any {name}/{firstName} the user typed becomes a token
  // for next time. We don't try to re-tokenise the recipient's actual name out
  // of the text; that's lossy and surprising. The parent shows its own success
  // path; here we just confirm inline.
  const saveAsTemplate = () => {
    if (!onSaveAsTemplate) return;
    if (!(subject.trim() || body.trim())) return;
    const label = window.prompt('Name this template:', subject.trim().slice(0, 60));
    if (label == null) return; // cancelled
    if (!label.trim()) { alert('A template needs a name.'); return; }
    onSaveAsTemplate({ label: label.trim(), subject: subject.trim(), body });
  };

  const send = async () => {
    if (!canSend) return;
    setBusy(true); setErr(null);
    try {
      // Upload pending attachments first (sequential — order matches chips,
      // progress readable). Already-uploaded chips (a prior send attempt
      // that failed later) reuse their cached row id.
      const attachmentFileIds = [];
      for (const a of attach) {
        if (!uploadedIds.current[a.key]) {
          setUploadingName(a.file.name);
          const row = await filesApi.uploadAttachment(a.file);
          uploadedIds.current[a.key] = row.id;
        }
        attachmentFileIds.push(uploadedIds.current[a.key]);
      }
      setUploadingName(null);
      const res = await onSend({
        personId: person?.id,  // legacy field; worker prefers recipients[]
        recipients: recips.map(r => r.personId
          ? { personId: r.personId, role: r.role }
          : { email: r.email, role: r.role }),
        subject: subject.trim(),
        body, // server escapes + \n -> <br>; keep newlines intact
        threadId,   // undefined for fresh sends → server mints a new thread_id
        inReplyTo,  // undefined for fresh sends → no In-Reply-To header
        attachmentFileIds: attachmentFileIds.length ? attachmentFileIds : undefined,
      });
      // Best-effort log failure: email *did* send, but the interaction row
      // didn't write. Surface and still close — user can add a manual note.
      if (res?.warning) alert(res.warning);
      if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
      setUploadingName(null);
      setBusy(false);
    }
  };

  return (
    <Modal title={recips.length === 1 ? `Email ${recipLabel(recips[0])}` : `Email ${recips.length} recipients`} onClose={busy ? ()=>{} : onClose} wide>
      {/* Recipient chips: tap the To/Cc tag to toggle, × to remove. */}
      <div style={{marginBottom:14}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
          {recips.map((r, i) => (
            <span key={r.personId || r.email || i} style={{display:'inline-flex',alignItems:'center',gap:6,
              background:C.card,border:`1px solid ${C.border}`,color:C.text,
              fontSize:12,padding:'4px 10px',borderRadius:14,maxWidth:240}}>
              <span onClick={() => !busy && toggleRole(i)} title="Toggle To / Cc"
                style={{color:r.role === 'cc' ? C.muted : C.gold,fontSize:9,fontWeight:700,
                  letterSpacing:'0.6px',cursor:busy ? 'default' : 'pointer',flexShrink:0}}>
                {r.role === 'cc' ? 'CC' : 'TO'}
              </span>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{recipLabel(r)}</span>
              {!busy && (
                <span onClick={() => removeRecip(i)} title="Remove"
                  style={{color:C.muted,cursor:'pointer',fontSize:13,lineHeight:1,flexShrink:0}}>×</span>
              )}
            </span>
          ))}
          <button onClick={() => setAdding(a => !a)}
            disabled={busy || recips.length >= MAX_RECIPIENTS}
            title={recips.length >= MAX_RECIPIENTS ? `Max ${MAX_RECIPIENTS} recipients` : 'Add a recipient'}
            style={{background:'none',border:`1px solid ${C.border}`,
              color:recips.length >= MAX_RECIPIENTS ? C.muted : C.gold,
              cursor:(busy || recips.length >= MAX_RECIPIENTS) ? 'default' : 'pointer',
              borderRadius:14,fontSize:11,padding:'4px 10px',fontFamily:"'Jost',sans-serif"}}>
            {adding ? '× Close' : '+ Add'}
          </button>
        </div>
        {noEmailNames.length > 0 && (
          <div style={{color:C.gold,fontSize:11,marginTop:6}}>
            ⚠ No primary email: {noEmailNames.join(', ')} — set one on the contact, or remove them here
          </div>
        )}
        {recips.length > 0 && !hasTo && (
          <div style={{color:C.gold,fontSize:11,marginTop:6}}>⚠ At least one recipient must be To (not just Cc)</div>
        )}
        {adding && (
          <div style={{marginTop:8,padding:10,border:`1px solid ${C.border}`,borderRadius:8,background:C.surf}}>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <input value={rawEmail} onChange={e=>setRawEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addRaw(); }}
                placeholder="Type an address not in the CRM…"
                style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,
                  color:C.text,fontSize:13,padding:'7px 10px',fontFamily:"'Jost',sans-serif",outline:'none'}} />
              <Btn small onClick={addRaw} disabled={!EMAIL_OK.test(rawEmail.trim().toLowerCase())}>Add</Btn>
            </div>
            <SearchSelect people={people} attendance={[]} classes={[]}
              existing={recips.map(r => r.personId).filter(Boolean)}
              onSelect={addPerson} />
          </div>
        )}
      </div>
      {(rankedTemplates.length > 0 || onSaveAsTemplate) && (
        <div style={{marginBottom:10,display:'flex',gap:8,alignItems:'center'}}>
          {rankedTemplates.length > 0 && (
            <select
              value=""
              onChange={e => { applyTemplate(e.target.value); e.target.value = ''; }}
              disabled={busy}
              style={{
                flex:1,background:C.card,border:`1px solid ${C.border}`,
                borderRadius:6,color:C.muted,fontSize:13,padding:'8px 12px',
                fontFamily:"'Jost',sans-serif",outline:'none',cursor:'pointer',
              }}
            >
              <option value="">Insert template…</option>
              {rankedTemplates.map(t => (
                <option key={t.id} value={t.id} style={{color:C.text}}>{t.label}</option>
              ))}
            </select>
          )}
          {onSaveAsTemplate && (
            <button
              onClick={saveAsTemplate}
              disabled={busy || !(subject.trim() || body.trim())}
              title="Save the current subject + body as a reusable template"
              style={{
                flexShrink:0,background:'none',border:`1px solid ${C.border}`,
                color:(subject.trim()||body.trim())?C.gold:C.muted,
                cursor:(subject.trim()||body.trim())?'pointer':'default',
                borderRadius:6,fontSize:12,padding:'8px 12px',
                fontFamily:"'Jost',sans-serif",letterSpacing:'0.3px',whiteSpace:'nowrap',
              }}>
              + Save as template
            </button>
          )}
        </div>
      )}
      <input
        type="text"
        value={subject}
        onChange={e=>setSubject(e.target.value)}
        placeholder="Subject"
        disabled={busy}
        maxLength={200}
        style={{
          width:'100%',background:C.card,border:`1px solid ${C.border}`,
          borderRadius:6,color:C.text,fontSize:14,padding:'8px 12px',
          fontFamily:"'Jost',sans-serif",outline:'none',marginBottom:10,
        }}
      />
      <textarea
        value={body}
        onChange={e=>setBody(e.target.value)}
        rows={12}
        placeholder="Write your message..."
        disabled={busy}
        style={{
          width:'100%',background:C.card,border:`1px solid ${C.border}`,
          borderRadius:6,color:C.text,fontSize:14,padding:'10px 12px',
          fontFamily:"'Jost',sans-serif",resize:'vertical',outline:'none',
          lineHeight:1.6,
        }}
      />
      {/* Attachments: picker + chips + running budget. Bytes upload at send
          time; the server re-validates everything (extension allowlist, 25 MB
          per file, 15 MB per send), so this UI only pre-checks the budget. */}
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginTop:10}}>
        <input ref={fileInputRef} type="file" multiple style={{display:'none'}}
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
        <button onClick={() => fileInputRef.current?.click()}
          disabled={busy || attach.length >= ATTACH_MAX_COUNT}
          title={attach.length >= ATTACH_MAX_COUNT ? `Max ${ATTACH_MAX_COUNT} attachments` : 'Attach files'}
          style={{background:'none',border:`1px solid ${C.border}`,
            color:attach.length >= ATTACH_MAX_COUNT ? C.muted : C.gold,
            cursor:(busy || attach.length >= ATTACH_MAX_COUNT) ? 'default' : 'pointer',
            borderRadius:6,fontSize:12,padding:'6px 12px',fontFamily:"'Jost',sans-serif"}}>
          📎 Attach
        </button>
        {attach.map(a => (
          <span key={a.key} style={{display:'inline-flex',alignItems:'center',gap:6,
            background:C.card,border:`1px solid ${uploadingName === a.file.name ? C.gold : C.border}`,
            color:C.text,fontSize:11.5,padding:'4px 10px',borderRadius:14,maxWidth:230}}>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.file.name}</span>
            <span style={{color:C.muted,flexShrink:0}}>{fmtMb(a.file.size)}</span>
            {!busy && (
              <span onClick={() => removeAttach(a.key)} title="Remove"
                style={{color:C.muted,cursor:'pointer',flexShrink:0,fontSize:13,lineHeight:1}}>×</span>
            )}
          </span>
        ))}
        {attach.length > 0 && (
          <span style={{color:overBudget ? C.red : C.muted,fontSize:11,marginLeft:'auto'}}>
            {fmtMb(attachTotal)} / 15 MB{overBudget && ' — too large to send'}
          </span>
        )}
      </div>
      {err && (
        <div style={{
          marginTop:12,padding:'8px 12px',background:'#3a1f1f',
          border:'1px solid #6b2e2e',borderRadius:6,color:'#e8a4a4',
          fontSize:12,lineHeight:1.5,
        }}>
          {err}
        </div>
      )}
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}>
        <Btn variant="ghost" small onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn small onClick={send} disabled={!canSend}>
          {busy ? (uploadingName ? `Uploading ${uploadingName}…` : 'Sending…') : 'Send email'}
        </Btn>
      </div>
    </Modal>
  );
}

// Hoisted out of Sidebar so its internal hover state survives Sidebar re-renders.
// (Defining it inline made React see a "new" component type on every parent re-render
// and unmount/remount, wiping local state including the hover toggle for the × button.)


