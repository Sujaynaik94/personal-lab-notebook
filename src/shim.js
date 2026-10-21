/* Personal Lab Notebook local runtime: stores everything in this browser (IndexedDB). No server, no login. */
(() => {
  if (window.claude) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const store = new Map(), subs = [], urls = new Map();
  let idb;
  /* each copy of this file (by its location on disk) keeps its own separate data */
  const H = location.protocol === 'file:' ? (() => { let h = 2166136261; const t = decodeURIComponent(location.pathname).toLowerCase(); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); })() : '';
  const DBN = H ? 'labbook-local-' + H : 'labbook-local', K = k => H ? k + '@' + H : k;
  const open = () => new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('docs'); d.createObjectStore('blobs'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = (s, m, f) => new Promise((res, rej) => { const t = idb.transaction(s, m), o = t.objectStore(s); const q = f(o); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
  const ready = (async () => {
    try {
      idb = await open();
      await new Promise(res => { const c = idb.transaction('docs').objectStore('docs').openCursor(); c.onsuccess = () => { const x = c.result; if (x) { store.set(x.key, x.value); x.continue(); } else res(); }; c.onerror = res; });
      await new Promise(res => { const c = idb.transaction('blobs').objectStore('blobs').openCursor(); c.onsuccess = () => { const x = c.result; if (x) { urls.set(x.key, URL.createObjectURL(x.value)); x.continue(); } else res(); }; c.onerror = res; });
      if (H && !store.size && !(await metaGet('asked'))) await legacyCopy();
    } catch (e) { console.warn('IndexedDB unavailable, data will not persist', e); }
  })();
  async function legacyCopy() {
    try {
      if (indexedDB.databases) { const l = await indexedDB.databases(); if (!l.some(d => d.name === 'labbook-local')) { await metaSet('asked', 1); return; } }
      const old = await new Promise((res, rej) => { const r = indexedDB.open('labbook-local', 1); let fresh = false; r.onupgradeneeded = () => { fresh = true; r.transaction.abort(); }; r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); });
      if (!old || !old.objectStoreNames.contains('docs')) { try { old && old.close(); } catch (e) {} return; }
      const rd = st => new Promise(res => { const o = []; const c = old.transaction(st).objectStore(st).openCursor(); c.onsuccess = () => { const x = c.result; if (x) { o.push([x.key, x.value]); x.continue(); } else res(o); }; c.onerror = () => res(o); });
      const docs = await rd('docs'), blobs = await rd('blobs'); old.close();
      await metaSet('asked', 1);
      if (!docs.length) return;
      if (!confirm('This copy of Personal Lab Notebook now keeps its OWN separate data, so changes here no longer change other copies of the file.\n\nIt is empty at the moment. Copy the ' + docs.length + ' existing items from the older shared storage into this copy?\n\nOK = copy them now (a one-time snapshot)\nCancel = start empty')) return;
      for (const [k, v] of docs) { await tx('docs', 'readwrite', o => o.put(v, k)); store.set(k, v); }
      for (const [k, v] of blobs) { await tx('blobs', 'readwrite', o => o.put(v, k)); urls.set(k, URL.createObjectURL(v)); }
    } catch (e) { console.warn('legacy copy failed', e); }
  }
  const persist = (p, v) => { try { localStorage.setItem(K('lb_dirty'), '1'); localStorage.setItem(K('lb_lastchange'), String(Date.now())); } catch (e) {} return idb && tx('docs', 'readwrite', o => v === undefined ? o.delete(p) : o.put(v, p)).catch(() => {}); };
  const snapDoc = p => ({ id: p.split('/').pop(), exists: store.has(p), data: () => store.has(p) ? clone(store.get(p)) : undefined, metadata: {} });
  const kids = col => [...store.keys()].filter(k => k.startsWith(col + '/') && k.slice(col.length + 1).indexOf('/') < 0);
  const notify = () => subs.slice().forEach(s => s());
  const addSub = run => { subs.push(run); setTimeout(run, 0); return () => { const i = subs.indexOf(run); if (i >= 0) subs.splice(i, 1); }; };
  function query(col, ord) {
    const qs = () => { let ids = kids(col); if (ord) ids.sort((a, b) => { const x = store.get(a)[ord[0]], y = store.get(b)[ord[0]]; return (x > y ? 1 : x < y ? -1 : 0) * (ord[1] === 'desc' ? -1 : 1); }); else ids.sort(); const docs = ids.map(snapDoc); return { docs, size: docs.length, empty: !docs.length }; };
    return { orderBy: (f, d) => query(col, [f, d || 'asc']), async get() { return qs(); }, onSnapshot(next) { return addSub(() => next(qs())); } };
  }
  const docRef = p => ({ id: p.split('/').pop(), path: p, async get() { return snapDoc(p); },
    async set(d) { const v = clone(d); store.set(p, v); persist(p, v); notify(); },
    async update(d) { if (!store.has(p)) throw { code: 'invalid_argument', message: 'Document does not exist' }; const v = { ...store.get(p), ...clone(d) }; store.set(p, v); persist(p, v); notify(); },
    async delete() { store.delete(p); persist(p); notify(); },
    onSnapshot(next) { return addSub(() => next(snapDoc(p))); }, collection: c => db.collection(p + '/' + c) });
  const db = { doc: docRef, collection(p) { const q = query(p); q.path = p; q.doc = id => docRef(p + '/' + (id || 'id' + Math.random().toString(36).slice(2, 10))); q.add = async d => { const r = q.doc(); await r.set(d); return r; }; return q; } };
  const user = { me: async () => ({ id: 'local' }), id: async () => 'local', isOwner: () => true, canEdit: () => true, can: () => true, profiles: async ids => Object.fromEntries(ids.map(i => [i, { id: i, name: 'Local user', isMe: true }])) };
  const downloads = { save: async ({ filename, data }) => { const b = data instanceof Blob ? data : new Blob([data], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 2000); return { status: 'saved' }; } };
  const assets = {
    upload: async b => { if (b.size > 20 * 1048576) throw { code: 'too_large', message: 'File over 20 MB' }; const id = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join(''); if (idb) await tx('blobs', 'readwrite', o => o.put(b, id)); urls.set(id, URL.createObjectURL(b)); return { id, url: urls.get(id), sizeBytes: b.size, contentType: b.type }; },
    list: async () => ({ assets: [], usage: {} }),
    delete: async id => { if (idb) await tx('blobs', 'readwrite', o => o.delete(id)); urls.delete(id); return { deleted: true }; }
  };
  /* ---------------- backup / restore (local build only) ---------------- */
  const LS = { get: k => { try { return localStorage.getItem(K(k)); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(K(k), v); } catch (e) {} } };
  const b64 = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1] || ''); r.readAsDataURL(blob); });
  const unb64 = (s, type) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
  const allBlobs = () => new Promise(res => { const out = {}; if (!idb) return res(out); const c = idb.transaction('blobs').objectStore('blobs').openCursor(); c.onsuccess = () => { const x = c.result; if (x) { out[x.key] = x.value; x.continue(); } else res(out); }; c.onerror = () => res(out); });
  async function makeBackup() {
    await ready; const docs = {}; store.forEach((v, k) => { docs[k] = v; }); const bl = await allBlobs(), blobs = {};
    for (const [id, b] of Object.entries(bl)) blobs[id] = { type: b.type, d: await b64(b) };
    return { app: 'labbook-local', v: 1, at: new Date().toISOString(), docs, blobs };
  }
  async function applyBackup(o) {
    if (!o || o.app !== 'labbook-local' || !o.docs) throw new Error('This is not a Personal Lab Notebook backup file.');
    await tx('docs', 'readwrite', s => s.clear()); await tx('blobs', 'readwrite', s => s.clear());
    for (const [k, v] of Object.entries(o.docs)) await tx('docs', 'readwrite', s => s.put(v, k));
    for (const [id, b] of Object.entries(o.blobs || {})) await tx('blobs', 'readwrite', s => s.put(unb64(b.d, b.type), id));
    LS.set('lb_lastbackup', o.at || ''); LS.set('lb_lastchange', String(Date.now()));
  }
  const tsOf = v => { let m = 0; if (v && typeof v === 'object') for (const f of ['updatedAt', 'modifiedAt', 'savedAt', 'at', 'createdAt']) { const x = v[f], t = typeof x === 'number' ? x : typeof x === 'string' ? Date.parse(x) : NaN; if (t > m) m = t; } return m; };
  function planMerge(o) {
    if (!o || o.app !== 'labbook-local' || !o.docs) throw new Error('This is not a Personal Lab Notebook backup file.');
    const pl = { add: [], newer: [], keep: 0, same: 0, prot: 0, blobs: [] };
    for (const [k, v] of Object.entries(o.docs)) { if (!store.has(k)) { pl.add.push(k); continue; } const L = store.get(k); if (JSON.stringify(L) === JSON.stringify(v)) { pl.same++; continue; } if (L && L.signedAt) { pl.prot++; continue; } if (tsOf(v) > tsOf(L)) pl.newer.push(k); else pl.keep++; }
    for (const id of Object.keys(o.blobs || {})) if (!urls.has(id)) pl.blobs.push(id);
    return pl;
  }
  async function applyMerge(o, pl) {
    for (const k of [...pl.add, ...pl.newer]) { await tx('docs', 'readwrite', s => s.put(o.docs[k], k)); }
    for (const id of pl.blobs) { const b = o.blobs[id]; await tx('blobs', 'readwrite', s => s.put(unb64(b.d, b.type), id)); }
    LS.set('lb_lastchange', String(Date.now())); LS.set('lb_dirty', '1');
  }
  const stamp = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const metaOpen = () => new Promise((res, rej) => { const r = indexedDB.open('labbook-local-meta', 1); r.onupgradeneeded = () => r.result.createObjectStore('m'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const mk = k => H ? H + ':' + k : k;
  const metaGet = async k => { k = mk(k); try { const d = await metaOpen(); return await new Promise(res => { const q = d.transaction('m').objectStore('m').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch (e) { return undefined; } };
  const metaSet = async (k, v) => { k = mk(k); const d = await metaOpen(); return new Promise((res, rej) => { const t = d.transaction('m', 'readwrite'); v === undefined ? t.objectStore('m').delete(k) : t.objectStore('m').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
  const canFolder = typeof window.showDirectoryPicker === 'function';
  let dirH = null, dirOK = false, busy = false, folderName = '';
  async function checkDir(ask) { if (!dirH) return false; try { let p = await dirH.queryPermission({ mode: 'readwrite' }); if (p !== 'granted' && ask) p = await dirH.requestPermission({ mode: 'readwrite' }); dirOK = p === 'granted'; } catch (e) { dirOK = false; } return dirOK; }
  async function writeFile(name, text) { const fh = await dirH.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(text); await w.close(); }
  async function folderBackup() {
    if (!dirOK || busy) return false; busy = true;
    try { const o = await makeBackup(), t = JSON.stringify(o); await writeFile('labbook-backup-' + stamp(new Date()) + '.json', t); await writeFile('labbook-latest.json', t); LS.set('lb_lastbackup', o.at); LS.set('lb_lastfolder', o.at); LS.set('lb_dirty', '');
      const names = []; for await (const [n] of dirH.entries()) if (/^labbook-backup-\d{4}-\d\d-\d\d\.json$/.test(n)) names.push(n); names.sort(); while (names.length > 14) { try { await dirH.removeEntry(names.shift()); } catch (e) { break; } } return true; }
    catch (e) { console.warn('folder backup failed', e); dirOK = false; return false; } finally { busy = false; }
  }
  async function readLatest() { if (!dirOK) return null; try { const f = await (await dirH.getFileHandle('labbook-latest.json')).getFile(); return JSON.parse(await f.text()); } catch (e) { return null; } }
  const css = document.createElement('style'); css.textContent = '#lbbk-b{position:fixed;left:10px;bottom:10px;z-index:99998;font:600 12px system-ui,sans-serif;padding:7px 11px;border-radius:99px;border:1px solid #bbb;background:#fff;color:#222;cursor:pointer;box-shadow:0 1px 4px #0003}#lbbk-b.warn{background:#fff4d6;border-color:#d9a400}#lbbk-m{position:fixed;inset:0;z-index:99999;background:#0006;display:flex;align-items:center;justify-content:center;padding:16px}#lbbk-m .bx{background:#fff;color:#222;border-radius:12px;max-width:520px;width:100%;padding:18px;font:14px/1.45 system-ui,sans-serif;max-height:90vh;overflow:auto}#lbbk-m h3{margin:0 0 8px;font-size:17px}#lbbk-m button{font:600 13px system-ui;padding:8px 12px;border-radius:8px;border:1px solid #888;background:#f3f3f3;cursor:pointer;margin:4px 6px 4px 0}#lbbk-m button.p{background:#1a6b59;color:#fff;border-color:#1a6b59}#lbbk-m .s{background:#f4f4f4;border-radius:8px;padding:8px 10px;margin:8px 0;font-size:13px}#lbbk-m .w{background:#fff4d6}';
  const ago = iso => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  let btn, newer = null;
  function paintBtn() { if (!btn) return; const lb = LS.get('lb_lastbackup'), old = !lb || (Date.now() - new Date(lb)) > 14 * 864e5, need = newer || (folderName && !dirOK) || old; btn.className = need ? 'warn' : ''; btn.id = 'lbbk-b'; btn.textContent = newer ? '💾 Newer backup found' : (folderName && !dirOK) ? '💾 Re-allow backup folder' : old ? '💾 Back up now' : '💾 Backed up ' + ago(lb); }
  function modal() {
    const m = document.createElement('div'); m.id = 'lbbk-m';
    const draw = () => { const lb = LS.get('lb_lastbackup');
      m.innerHTML = `<div class="bx"><h3>Backup &amp; restore</h3><div class="s">Your data lives only in this browser. Last backup: <b>${ago(lb)}</b>${lb ? ' (' + new Date(lb).toLocaleString() + ')' : ''}.</div>
      ${newer ? `<div class="s w"><b>The backup folder has newer data</b> (${new Date(newer.at).toLocaleString()}) than this browser. <button class="p" data-a="loadnewer">Load it</button><button data-a="ignorenewer">Ignore</button></div>` : ''}
      <button class="p" data-a="dl">Download backup file now</button><button data-a="rs">Restore from a file (replaces everything)…</button><button data-a="mg">Merge a backup file (adds missing, keeps newer)…</button>
      <hr style="border:0;border-top:1px solid #ddd;margin:12px 0"><b>Automatic daily backup</b>
      ${canFolder ? `<div class="s">${folderName ? 'Folder: <b>' + folderName + '</b>' + (dirOK ? ' · active' : ' · needs permission this session') : 'No folder chosen yet.'}<br>While Personal Lab Notebook is open it saves a dated file there (once a day, and after changes), keeps the last 14, and always updates <code>labbook-latest.json</code>. Pick a folder that syncs (OneDrive, Dropbox, Google Drive) to use it on another computer.</div>
      <button data-a="pick">${folderName ? 'Change folder…' : 'Choose backup folder…'}</button>${folderName && !dirOK ? '<button class="p" data-a="allow">Allow folder</button>' : ''}${dirOK ? '<button data-a="now">Back up to folder now</button>' : ''}` : `<div class="s w">This browser cannot write to a folder. Use Chrome or Edge for automatic backups. Otherwise use the download button regularly.</div>`}
      <div style="text-align:right;margin-top:10px"><button data-a="x">Close</button></div></div>`; };
    draw(); document.body.appendChild(m);
    m.onclick = async e => { const a = e.target.dataset?.a; if (e.target === m || a === 'x') return m.remove(); if (!a) return;
      try {
        if (a === 'dl') { const o = await makeBackup(); const b = new Blob([JSON.stringify(o)], { type: 'application/json' }); const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = 'labbook-backup-' + stamp(new Date()) + '.json'; document.body.appendChild(l); l.click(); setTimeout(() => { l.remove(); URL.revokeObjectURL(l.href); }, 2000); LS.set('lb_lastbackup', o.at); }
        else if (a === 'rs') { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = async () => { const f = i.files[0]; if (!f) return; try { const o = JSON.parse(await f.text()); if (!confirm('Replace ALL data in this browser with the backup from ' + new Date(o.at).toLocaleString() + '? Current data here will be overwritten.')) return; await applyBackup(o); location.reload(); } catch (err) { alert('Could not restore: ' + err.message); } }; i.click(); }
        else if (a === 'mg') { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = async () => { const f = i.files[0]; if (!f) return; try { const o = JSON.parse(await f.text()); const pl = planMerge(o); const n = pl.add.length + pl.newer.length + pl.blobs.length;
          const msg = 'Merge the backup from ' + new Date(o.at).toLocaleString() + ' into this copy?\n\n• New items to add: ' + pl.add.length + '\n• Items where the backup is newer (replace here): ' + pl.newer.length + '\n• Items where this copy is newer (kept): ' + pl.keep + '\n• Signed pages (never overwritten): ' + pl.prot + '\n• Identical: ' + pl.same + '\n• New images/files: ' + pl.blobs.length + '\n\nItems you deleted here can come back if they exist in the backup. A safety backup of the current data is downloaded first.';
          if (!n) return alert('Nothing to merge: this copy already has everything in that backup that is newer or missing.'); if (!confirm(msg)) return;
          const cur = await makeBackup(); const bb = new Blob([JSON.stringify(cur)], { type: 'application/json' }); const l = document.createElement('a'); l.href = URL.createObjectURL(bb); l.download = 'labbook-before-merge-' + stamp(new Date()) + '.json'; document.body.appendChild(l); l.click(); setTimeout(() => { l.remove(); URL.revokeObjectURL(l.href); }, 2000);
          await new Promise(r => setTimeout(r, 600)); await applyMerge(o, pl); location.reload(); } catch (err) { alert('Could not merge: ' + err.message); } }; i.click(); }
        else if (a === 'pick') { dirH = await showDirectoryPicker({ mode: 'readwrite', id: 'labbook-backup' }); await metaSet('dir', dirH); folderName = dirH.name; await checkDir(true); if (dirOK) { await folderBackup(); } }
        else if (a === 'allow') { await checkDir(true); if (dirOK) await folderBackup(); }
        else if (a === 'now') { await folderBackup(); }
        else if (a === 'loadnewer') { if (!confirm('Replace ALL data in this browser with the backup from ' + new Date(newer.at).toLocaleString() + '?')) return; await applyBackup(newer); location.reload(); return; }
        else if (a === 'ignorenewer') { LS.set('lb_lastbackup', newer.at); newer = null; }
      } catch (err) { if (err && err.name !== 'AbortError') alert('Backup error: ' + (err.message || err)); }
      draw(); paintBtn(); };
  }
  async function backupInit() {
    await ready; try { navigator.storage?.persist?.(); } catch (e) {}
    document.head.appendChild(css); btn = document.createElement('button'); btn.onclick = modal; document.body.appendChild(btn);
    dirH = (await metaGet('dir')) || null; if (dirH) { folderName = dirH.name; await checkDir(false); }
    if (dirOK) { const o = await readLatest(), lb = LS.get('lb_lastbackup'); if (o && o.at && (!lb || o.at > lb) && o.at !== LS.get('lb_lastfolder')) newer = o; }
    paintBtn(); if (newer) modal();
    const tick = async () => { if (dirOK && !newer) { const lf = LS.get('lb_lastfolder'), day = !lf || stamp(new Date(lf)) !== stamp(new Date()), dirty = LS.get('lb_dirty') === '1'; if (day || dirty) await folderBackup(); } paintBtn(); };
    tick(); setInterval(tick, 120000);
    document.addEventListener('click', async () => { if (folderName && !dirOK && !dirChecking) { dirChecking = true; await checkDir(true).catch(() => {}); dirChecking = false; if (dirOK) { const o = await readLatest(), lb = LS.get('lb_lastbackup'); if (o && o.at && (!lb || o.at > lb) && o.at !== LS.get('lb_lastfolder')) { newer = o; paintBtn(); modal(); } else { tick(); } } } }, { once: false });
  }
  let dirChecking = false;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', backupInit); else backupInit();
  window.__blobUrl = id => urls.get(id) || '';
  window.claude = { use: async n => { await ready; return ({ db, user, downloads, assets })[n] || null; } };
})();
