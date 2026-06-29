// documents.jsx — Document storage UI (Phase: manual upload, workflow 1).
//
// Two views, both prop-driven (no direct data-layer import — all DB/storage
// calls are threaded down from FeltBodyCRM.jsx, matching the rest of the app):
//
//   DocumentsView          — list/upload/view/delete stored files (the `files`
//                            table + Supabase Storage). Reachable from the
//                            sidebar; also embeddable on a person/org via the
//                            same handlers with an anchor.
//
//   CareHomeResourcesView  — the care-home pitch PDF link + phone-call scripts.
//                            These are config (editable without redeploy), so
//                            they live in the settings key-value store under
//                            'care_home_resources', NOT the files table. Shape:
//                              { pdfUrl: string,
//                                scripts: [{ id, title, body }] }
//
// Both follow the existing visual language (C tokens, Modal, Btn, FI,
// ConfirmBtn, PageHead, Empty).

import { useEffect, useMemo, useState } from "react";
import { C } from "../lib/constants.js";
import { fmt, today } from "../lib/helpers.jsx";
import { Btn, ConfirmBtn, Empty, FI, Modal, PageHead, Row } from "./primitives.jsx";

// ── helpers ──────────────────────────────────────────────────────────────────

const humanSize = (bytes) => {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

// Pick a glyph from the mime type — cheap visual affordance, no icon lib.
const fileGlyph = (mime = '') => {
  if (mime.startsWith('image/')) return '🖼';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '▦';
  return '📎';
};

// ── DocumentsView ──────────────────────────────────────────────────────────────
// files       — array of fileFromDb-shaped rows (state.files)
// people/orgs — for resolving + showing anchor names, and for the upload picker
// onUpload    — (file, anchor, label) => Promise<savedFile>   (data.files.upload)
// onGetUrl    — (file) => Promise<signedUrl>                  (data.files.signedUrl)
// onRemove    — (file) => Promise<id>                         (data.files.remove)
// anchor      — optional { personId } | { orgId } to scope the view to one
//               record (used when embedded on a detail page). When omitted the
//               view shows ALL documents with a filter.
export function DocumentsView({ files = [], people = [], orgs = [], onUpload, onGetUrl, onRemove, anchor = null, nav, embedded = false }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // all | person | org | general
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');

  const personName = (id) => people.find(p => p.id === id)?.name || 'Unknown contact';
  const orgName = (id) => orgs.find(o => o.id === id)?.name || 'Unknown organisation';

  const scoped = useMemo(() => {
    let list = files;
    if (anchor?.personId) list = list.filter(f => f.personId === anchor.personId);
    else if (anchor?.orgId) list = list.filter(f => f.orgId === anchor.orgId);
    else if (filter === 'person') list = list.filter(f => f.personId);
    else if (filter === 'org') list = list.filter(f => f.orgId);
    else if (filter === 'general') list = list.filter(f => !f.personId && !f.orgId && !f.interactionId);
    return list;
  }, [files, anchor, filter]);

  const openFile = async (file) => {
    setErr('');
    setBusyId(file.id);
    try {
      const url = await onGetUrl(file);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setErr(e.message || 'Could not open the file.');
    } finally {
      setBusyId(null);
    }
  };

  const anchorLabel = (f) =>
    f.personId ? personName(f.personId)
    : f.orgId ? orgName(f.orgId)
    : f.interactionId ? 'Linked to a message'
    : 'General';

  const FilterChip = ({ k, label }) => (
    <span onClick={() => setFilter(k)}
      style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
        background: filter === k ? C.active : 'transparent',
        color: filter === k ? C.gold : C.muted,
        border: `1px solid ${filter === k ? C.gold : C.border}` }}>
      {label}
    </span>
  );

  const body = (
    <>
      {err && (
        <div style={{ background: '#2a1313', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>{err}</div>
      )}

      {!anchor && !embedded && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <FilterChip k="all" label="All" />
          <FilterChip k="person" label="Contacts" />
          <FilterChip k="org" label="Organisations" />
          <FilterChip k="general" label="General" />
        </div>
      )}

      {scoped.length === 0 ? (
        <Empty text="No documents yet." action="Upload one" onAction={() => setUploadOpen(true)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {scoped.map(f => (
            <Row key={f.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{fileGlyph(f.mimeType)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.label || f.filename}
                  </div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                    {f.label ? `${f.filename} · ` : ''}{humanSize(f.sizeBytes)}
                    {' · '}{fmt(String(f.createdAt).slice(0, 10))}
                    {!anchor && <> {' · '}<span style={{ color: C.gold, opacity: 0.8 }}>{anchorLabel(f)}</span></>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  <Btn small variant="secondary" disabled={busyId === f.id} onClick={() => openFile(f)}>
                    {busyId === f.id ? '…' : 'Open'}
                  </Btn>
                  <ConfirmBtn idleLabel="Delete" armedLabel="Delete?" onConfirm={() => onRemove(f)} title="Delete this document permanently" />
                </div>
              </div>
            </Row>
          ))}
        </div>
      )}
    </>
  );

  // Embedded mode (on a detail page): no PageHead, compact header with add btn.
  if (embedded) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase' }}>Documents</span>
          <Btn small onClick={() => setUploadOpen(true)}>+ Upload</Btn>
        </div>
        {body}
        {uploadOpen && (
          <UploadModal people={people} orgs={orgs} fixedAnchor={anchor} onUpload={onUpload} onClose={() => setUploadOpen(false)} onError={setErr} />
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHead action={<Btn onClick={() => setUploadOpen(true)}>+ Upload document</Btn>}>
        Documents
      </PageHead>
      {body}
      {uploadOpen && (
        <UploadModal people={people} orgs={orgs} fixedAnchor={anchor} onUpload={onUpload} onClose={() => setUploadOpen(false)} onError={setErr} />
      )}
    </div>
  );
}

// ── UploadModal ──────────────────────────────────────────────────────────────
// A file picker + optional label + optional anchor. When fixedAnchor is set
// (embedded on a person/org), the anchor picker is hidden and the file is
// attached there automatically.
function UploadModal({ people = [], orgs = [], fixedAnchor = null, onUpload, onClose, onError }) {
  const [file, setFile] = useState(null);
  const [label, setLabel] = useState('');
  const [anchorKind, setAnchorKind] = useState(
    fixedAnchor?.personId ? 'person' : fixedAnchor?.orgId ? 'org' : 'general'
  );
  const [personId, setPersonId] = useState(fixedAnchor?.personId || '');
  const [orgId, setOrgId] = useState(fixedAnchor?.orgId || '');
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const submit = async () => {
    if (!file) { setLocalErr('Choose a file first.'); return; }
    setBusy(true);
    setLocalErr('');
    try {
      const anchor = fixedAnchor
        ? fixedAnchor
        : anchorKind === 'person' ? { personId: personId || null }
        : anchorKind === 'org' ? { orgId: orgId || null }
        : {};
      await onUpload(file, anchor, label);
      onClose();
    } catch (e) {
      setLocalErr(e.message || 'Upload failed.');
      onError && onError(e.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const personOpts = useMemo(
    () => [{ v: '', l: '— select contact —' }, ...people.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ v: p.id, l: p.name }))],
    [people]
  );
  const orgOpts = useMemo(
    () => [{ v: '', l: '— select organisation —' }, ...orgs.slice().sort((a, b) => a.name.localeCompare(b.name)).map(o => ({ v: o.id, l: o.name }))],
    [orgs]
  );

  return (
    <Modal title="Upload document" onClose={onClose}>
      {localErr && (
        <div style={{ background: '#2a1313', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 14 }}>{localErr}</div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', color: C.muted, fontSize: 10, letterSpacing: '0.5px', marginBottom: 5 }}>File</label>
        <input type="file" onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ width: '100%', color: C.text, fontSize: 12, fontFamily: "'Jost',sans-serif" }} />
        {file && (
          <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>
            {file.name} · {humanSize(file.size)}
          </div>
        )}
        <div style={{ color: C.muted, fontSize: 10, marginTop: 6, opacity: 0.7 }}>
          Max 50 MB. Large photos are best compressed before uploading.
        </div>
      </div>

      <FI label="Label (optional)" value={label} onChange={setLabel} />

      {!fixedAnchor && (
        <>
          <FI label="Attach to" value={anchorKind} onChange={setAnchorKind}
            opts={[{ v: 'general', l: 'General (not attached)' }, { v: 'person', l: 'A contact' }, { v: 'org', l: 'An organisation' }]} />
          {anchorKind === 'person' && <FI label="Contact" value={personId} onChange={setPersonId} opts={personOpts} />}
          {anchorKind === 'org' && <FI label="Organisation" value={orgId} onChange={setOrgId} opts={orgOpts} />}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy || !file} onClick={submit}>{busy ? 'Uploading…' : 'Upload'}</Btn>
      </div>
    </Modal>
  );
}

// ── CareHomeResourcesView ──────────────────────────────────────────────────────
// resources — the parsed 'care_home_resources' setting value, or undefined.
//             Shape: { pdfUrl: string, scripts: [{ id, title, body }] }
// onSave    — (value) => Promise   (writes the whole setting object back via
//             data.settings.set('care_home_resources', value))
//
// Read-first display with an Edit toggle. Scripts are copy-to-clipboard so you
// can paste into an email or read off-screen during a call.
const EMPTY_RESOURCES = { pdfUrl: '', scripts: [] };

export function CareHomeResourcesView({ resources, onSave, nav }) {
  const initial = resources && typeof resources === 'object'
    ? { pdfUrl: resources.pdfUrl || '', scripts: Array.isArray(resources.scripts) ? resources.scripts : [] }
    : EMPTY_RESOURCES;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [err, setErr] = useState('');
  // Read-mode: scripts collapse to title-only so the page is a scannable list
  // rather than a wall of text (esp. on mobile). Click a card to expand its body;
  // the section header offers expand-all / collapse-all.
  const [openScripts, setOpenScripts] = useState(()=>new Set());
  const toggleScript = (id) => setOpenScripts(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });

  // Keep draft in sync if the setting reloads underneath us while not editing.
  useEffect(() => { if (!editing) setDraft(initial); /* eslint-disable-next-line */ }, [resources]);

  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1500);
    } catch { /* clipboard blocked — no-op */ }
  };

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      // Drop empty scripts, trim fields.
      const cleaned = {
        pdfUrl: (draft.pdfUrl || '').trim(),
        scripts: (draft.scripts || [])
          .map(s => ({ id: s.id, title: (s.title || '').trim(), body: (s.body || '').trim() }))
          .filter(s => s.title || s.body),
      };
      await onSave(cleaned);
      setDraft(cleaned);
      setEditing(false);
    } catch (e) {
      setErr(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const addScript = () => setDraft(d => ({
    ...d,
    scripts: [...(d.scripts || []), { id: crypto.randomUUID(), title: '', body: '' }],
  }));
  const updateScript = (id, patch) => setDraft(d => ({
    ...d,
    scripts: d.scripts.map(s => s.id === id ? { ...s, ...patch } : s),
  }));
  const removeScript = (id) => setDraft(d => ({ ...d, scripts: d.scripts.filter(s => s.id !== id) }));

  // ── READ MODE ──
  if (!editing) {
    const hasNothing = !initial.pdfUrl && initial.scripts.length === 0;
    return (
      <div>
        <PageHead action={<Btn onClick={() => { setDraft(initial); setEditing(true); }}>Edit</Btn>}>
          Care Home Resources
        </PageHead>

        {err && <div style={{ background: '#2a1313', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 14 }}>{err}</div>}

        {hasNothing ? (
          <Empty text="No resources added yet." action="Add resources" onAction={() => { setDraft(initial); setEditing(true); }} />
        ) : (
          <>
            {initial.pdfUrl && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 10 }}>Pitch PDF</div>
                <Row onClick={() => window.open(initial.pdfUrl, '_blank', 'noopener,noreferrer')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                    <span style={{ fontSize: 20 }}>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>Balance &amp; Vitality guide</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{initial.pdfUrl}</div>
                    </div>
                    <Btn small variant="secondary" onClick={(e) => { e.stopPropagation(); window.open(initial.pdfUrl, '_blank', 'noopener,noreferrer'); }}>Open</Btn>
                  </div>
                </Row>
              </div>
            )}

            {initial.scripts.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase' }}>Phone Call Scripts</div>
                  <span onClick={() => setOpenScripts(prev => prev.size === initial.scripts.length ? new Set() : new Set(initial.scripts.map(s=>s.id)))}
                    style={{ color: C.muted, fontSize: 11, cursor: 'pointer', userSelect: 'none', letterSpacing: '0.3px' }}>
                    {openScripts.size === initial.scripts.length ? 'Collapse all' : 'Expand all'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {initial.scripts.map(s => {
                    const open = openScripts.has(s.id);
                    return (
                    <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div onClick={() => toggleScript(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer', userSelect: 'none' }}>
                          <span style={{ fontSize: 10, color: C.gold, transition: 'transform 0.18s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-flex' }}>▾</span>
                          <span style={{ color: C.text, fontSize: 14, fontWeight: 600, fontFamily: "'Cormorant Garamond',serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'Untitled script'}</span>
                        </div>
                        <Btn small variant="ghost" onClick={() => copy(s.body, s.id)}>{copiedId === s.id ? 'Copied ✓' : 'Copy'}</Btn>
                      </div>
                      {open && (
                        <div style={{ color: C.text, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', opacity: 0.92, marginTop: 12 }}>{s.body}</div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── EDIT MODE ──
  return (
    <div>
      <PageHead action={
        <span style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={() => { setEditing(false); setDraft(initial); }}>Cancel</Btn>
          <Btn disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Btn>
        </span>
      }>
        Edit Care Home Resources
      </PageHead>

      {err && <div style={{ background: '#2a1313', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 14 }}>{err}</div>}

      <div style={{ marginBottom: 28 }}>
        <div style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 10 }}>Pitch PDF</div>
        <FI label="PDF link" value={draft.pdfUrl} onChange={v => setDraft(d => ({ ...d, pdfUrl: v }))} />
        <div style={{ color: C.muted, fontSize: 10, opacity: 0.7, marginTop: -8 }}>
          e.g. https://thefeltbody.com/downloads/balance-vitality-guide.pdf
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase' }}>Phone Call Scripts</span>
          <Btn small variant="secondary" onClick={addScript}>+ Add script</Btn>
        </div>
        {(draft.scripts || []).length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: 'italic', opacity: 0.7, padding: '8px 0' }}>No scripts. Add one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {draft.scripts.map(s => (
              <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                <FI label="Title" value={s.title} onChange={v => updateScript(s.id, { title: v })} />
                <FI label="Script" value={s.body} onChange={v => updateScript(s.id, { body: v })} rows={6} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <ConfirmBtn idleLabel="Remove" armedLabel="Remove?" onConfirm={() => removeScript(s.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
