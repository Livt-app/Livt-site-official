// js/creator.js
import { auth, db, storage } from './firebase.js';
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, collection, query, where, getDocs,
  addDoc, serverTimestamp, orderBy, updateDoc, deleteDoc, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

/** ---------- tab UI ---------- */
const tabs = document.querySelectorAll('.tab');
const sections = {
  overview: document.querySelector('#tab-overview'),
  upload: document.querySelector('#tab-upload'),
  programs: document.querySelector('#tab-programs'),
  analytics: document.querySelector('#tab-analytics'),
};
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  const target = t.dataset.tab;
  Object.entries(sections).forEach(([k, el]) => el.classList.toggle('hidden', k !== target));
}));

/** ---------- helpers ---------- */
const qs = (sel) => document.querySelector(sel);
const qsp = (sel) => document.querySelector(sel) ?? { textContent: '' };
const fmt = (n) => n?.toLocaleString?.() ?? n ?? '—';
const toDate = (ts) => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);

/** ---------- DOM ---------- */
const loginLink = qs('#login-link');
const logoutLink = qs('#logout-link');

const elName = qs('#creator-name');
const elId = qs('#creator-id');
const kFollowers = qs('#kpi-followers');
const kPrograms  = qs('#kpi-programs');
const kDownloads = qs('#kpi-downloads');

const aPub   = qs('#a-published');
const aDraft = qs('#a-drafts');
const aLast30= qs('#a-last30');

const tableBody = qs('#program-rows');

/** ---------- resolve which creator to show ----------
 * if URL has ?uid=... show that creator (public-ish view) but still allow management if it's you
 * otherwise, if logged-in creator -> show self
 */
const params = new URLSearchParams(location.search);
let creatorUid = params.get('uid') || null;

/** ---------- main ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!creatorUid && user) creatorUid = user.uid;

  // toggle nav links
  if (user) { loginLink.style.display = 'none'; logoutLink.style.display = 'inline'; }
  else { loginLink.style.display = 'inline'; logoutLink.style.display = 'none'; }
  logoutLink.addEventListener('click', async (e) => { e.preventDefault(); await signOut(auth); location.href='index.html'; });

  if (!creatorUid) {
    // no uid and not logged in
    elName.textContent = 'Creator';
    elId.textContent = 'Not signed in';
    sections.upload.classList.add('hidden');
  }

  // fetch creator doc
  const userDoc = creatorUid ? await getDoc(doc(db, 'users', creatorUid)) : null;
  const userData = userDoc?.exists() ? userDoc.data() : null;
  const isCreator = userData?.role === 'creator';

  // gate upload if viewing someone else or not a creator
  const isSelf = user && user.uid === creatorUid;
  if (!isCreator || !isSelf) {
    sections.upload.classList.add('hidden'); // only self can upload here
  } else {
    sections.upload.classList.remove('hidden');
  }

  // header
  elName.textContent = userData?.displayName || userData?.email || 'Creator';
  elId.textContent = creatorUid ? `uid: ${creatorUid}` : 'uid: —';

  await loadOverview(creatorUid);
  await loadPrograms(creatorUid, { canManage: isSelf });
  await loadAnalytics(creatorUid);

  // bind upload
  const upForm = qs('#upload-form');
  upForm?.addEventListener('submit', (e)=>handleUpload(e, creatorUid));
});

/** ---------- overview kpis ---------- */
async function loadOverview(uid) {
  if (!uid) return;
  // followers count
  const fQ = query(collection(db, 'follows'), where('creatorId','==',uid));
  const fSnap = await getDocs(fQ);
  kFollowers.textContent = fmt(fSnap.size);

  // programs + total downloads
  const pQ = query(collection(db, 'programs'), where('creatorId','==',uid));
  const pSnap = await getDocs(pQ);
  kPrograms.textContent = fmt(pSnap.size);
  let totalDl = 0;
  pSnap.forEach(d => { totalDl += d.data().downloads || 0; });
  kDownloads.textContent = fmt(totalDl);
}

/** ---------- upload handler ---------- */
async function handleUpload(e, uid) {
  e.preventDefault();
  const status = qs('#upload-status');
  status.textContent = 'Uploading…';
  const form = e.currentTarget;
  const title = form.title.value.trim();
  const description = form.description.value.trim();
  const published = form.published.value === 'true';
  const file = form.file.files[0];
  if (!file) { status.textContent = 'Choose a file.'; return; }

  try {
    const path = `programs/${uid}/${Date.now()}_${file.name}`;
    const sRef = ref(storage, path);
    await uploadBytes(sRef, file);
    const url = await getDownloadURL(sRef);

    await addDoc(collection(db, 'programs'), {
      creatorId: uid,
      title, description,
      fileUrl: url,
      filePath: path,
      fileName: file.name,
      fileType: file.type || 'document',
      published,
      views: 0,
      downloads: 0,
      createdAt: serverTimestamp()
    });

    status.textContent = 'Uploaded ✔';
    form.reset();
    await loadPrograms(uid, { canManage: true });
    await loadOverview(uid);
    await loadAnalytics(uid);
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  }
}

/** ---------- programs table ---------- */
async function loadPrograms(uid, { canManage }) {
  tableBody.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;
  const pQ = query(collection(db, 'programs'), where('creatorId','==',uid), orderBy('createdAt','desc'));
  const snap = await getDocs(pQ);
  if (snap.empty) { tableBody.innerHTML = `<tr><td colspan="6" class="muted">No programs yet.</td></tr>`; return; }

  let rows = '';
  snap.forEach(d => {
    const p = d.data();
    const created = toDate(p.createdAt)?.toLocaleDateString() ?? '—';
    const status = p.published ? `<span class="pill success">Published</span>` : `<span class="pill">Draft</span>`;
    const dlLink = `download.html?id=${d.id}`; // tracked download redirect (we'll add below)
    rows += `
      <tr data-id="${d.id}" data-path="${p.filePath}">
        <td>${p.title || '(untitled)'}</td>
        <td>${status}</td>
        <td>${fmt(p.views || 0)}</td>
        <td>${fmt(p.downloads || 0)}</td>
        <td>${created}</td>
        <td>
          <div class="row-actions">
            <a class="pill" href="${p.fileUrl}" target="_blank" rel="noopener">Open</a>
            <a class="pill" href="${dlLink}">Copy DL</a>
            ${canManage ? `
              <button class="pill" data-act="toggle">${p.published ? 'Unpublish' : 'Publish'}</button>
              <button class="pill danger" data-act="delete">Delete</button>
            `:''}
          </div>
        </td>
      </tr>`;
  });
  tableBody.innerHTML = rows;

  if (canManage) {
    tableBody.querySelectorAll('button[data-act="toggle"]').forEach(btn => {
      btn.addEventListener('click', async (e)=> {
        const tr = e.currentTarget.closest('tr');
        const id = tr.dataset.id;
        const rowBtn = e.currentTarget;
        const docRef = doc(db, 'programs', id);
        // read current published from DOM text
        const isPub = rowBtn.textContent.toLowerCase().includes('unpublish');
        await updateDoc(docRef, { published: !isPub });
        rowBtn.textContent = isPub ? 'Publish' : 'Unpublish';
        await loadPrograms(uid, { canManage: true });
      });
    });

    tableBody.querySelectorAll('button[data-act="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e)=> {
        const tr = e.currentTarget.closest('tr');
        const id = tr.dataset.id;
        const path = tr.dataset.path;
        if (!confirm('Delete this program? This cannot be undone.')) return;
        await deleteDoc(doc(db, 'programs', id));
        if (path) try { await deleteObject(ref(storage, path)); } catch(_){}
        await loadPrograms(uid, { canManage: true });
        await loadOverview(uid);
        await loadAnalytics(uid);
      });
    });
  }
}

/** ---------- analytics cards ---------- */
async function loadAnalytics(uid) {
  const snap = await getDocs(query(collection(db, 'programs'), where('creatorId','==',uid)));
  let published = 0, drafts = 0, last30 = 0;
  const monthAgo = Date.now() - 30*24*60*60*1000;
  snap.forEach(d => {
    const p = d.data();
    if (p.published) published++; else drafts++;
    const c = toDate(p.createdAt)?.getTime?.() ?? 0;
    if (c > monthAgo) last30++;
  });
  aPub.textContent = fmt(published);
  aDraft.textContent = fmt(drafts);
  aLast30.textContent = fmt(last30);
}

/** ---------- OPTIONAL: tracked download redirect ----------
 * If you add a page download.html?id={programId}, you can increment downloads then redirect.
 * See below snippet to create download.html quickly.
 */
