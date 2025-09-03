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

/* --------------------------- small helpers --------------------------- */
const qs = (sel) => document.querySelector(sel);
const fmt = (n) => (n ?? 0).toLocaleString();
const toDate = (ts) => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);

/* --------------------------- tabs wiring ----------------------------- */
const tabs = document.querySelectorAll('.tab');
const sections = {
  overview: qs('#tab-overview'),
  upload: qs('#tab-upload'),
  programs: qs('#tab-programs'),
  analytics: qs('#tab-analytics'),
};
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  const target = t.dataset.tab;
  Object.entries(sections).forEach(([k, el]) => el.classList.toggle('hidden', k !== target));
}));

/* --------------------------- auth gate ------------------------------- */
const urlParams = new URLSearchParams(location.search);
const passUid = urlParams.get('uid'); // optional view-only of someone else
const nextUrl = () => {
  const base = 'creatordashboard.html';
  return passUid ? `${base}?uid=${encodeURIComponent(passUid)}` : base;
};

onAuthStateChanged(auth, async (user) => {
  // require sign-in first (always)
  if (!user) {
    location.href = `login.html?next=${encodeURIComponent(nextUrl())}`;
    return;
  }

  // wire nav buttons
  const loginLink = qs('#login-link');
  const logoutLink = qs('#logout-link');
  if (loginLink) loginLink.style.display = 'none';
  if (logoutLink) {
    logoutLink.style.display = 'inline';
    logoutLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await signOut(auth);
      location.href = 'index.html';
    });
  }

  // whose dashboard are we looking at?
  const viewingUid = passUid || user.uid;
  const isSelf = viewingUid === user.uid;

  // fetch viewer's role (must be a creator to access dashboard)
  const meSnap = await getDoc(doc(db, 'users', user.uid));
  const me = meSnap.exists() ? meSnap.data() : null;
  if (me?.role !== 'creator') {
    // user exists but is not a creator → send home (or make a user dashboard later)
    location.href = 'index.html';
    return;
  }

  // fetch the creator being viewed (self or other)
  const creatorSnap = await getDoc(doc(db, 'users', viewingUid));
  const creator = creatorSnap.exists() ? creatorSnap.data() : null;

  // header
  qs('#creator-name').textContent = creator?.displayName || creator?.email || 'Creator';
  qs('#creator-id').textContent = `uid: ${viewingUid}`;

  // show Upload tab ONLY if you're viewing your own dashboard
  sections.upload.classList.toggle('hidden', !isSelf);

  // load data
  await loadOverview(viewingUid);
  await loadPrograms(viewingUid, { canManage: isSelf });
  await loadAnalytics(viewingUid);

  // bind upload (self only)
  if (isSelf) {
    qs('#upload-form')?.addEventListener('submit', (e) => handleUpload(e, viewingUid));
  }
});

/* --------------------------- overview KPIs --------------------------- */
async function loadOverview(uid) {
  // followers
  const fQ = query(collection(db, 'follows'), where('creatorId', '==', uid));
  const fSnap = await getDocs(fQ);
  qs('#kpi-followers').textContent = fmt(fSnap.size);

  // programs + downloads sum
  const pQ = query(collection(db, 'programs'), where('creatorId', '==', uid));
  const pSnap = await getDocs(pQ);
  qs('#kpi-programs').textContent = fmt(pSnap.size);
  let totalDl = 0;
  pSnap.forEach(d => { totalDl += d.data().downloads || 0; });
  qs('#kpi-downloads').textContent = fmt(totalDl);
}

/* --------------------------- uploads -------------------------------- */
async function handleUpload(e, uid) {
  e.preventDefault();
  const form = e.currentTarget;
  const status = qs('#upload-status');
  status.textContent = 'Uploading…';

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

/* --------------------------- programs table ------------------------- */
async function loadPrograms(uid, { canManage }) {
  const body = qs('#program-rows');
  body.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;

  const pQ = query(
    collection(db, 'programs'),
    where('creatorId', '==', uid),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(pQ);

  if (snap.empty) {
    body.innerHTML = `<tr><td colspan="6" class="muted">No programs yet.</td></tr>`;
    return;
  }

  let rows = '';
  snap.forEach(d => {
    const p = d.data();
    const created = toDate(p.createdAt)?.toLocaleDateString() ?? '—';
    const status = p.published ? `<span class="pill success">Published</span>` : `<span class="pill">Draft</span>`;
    const dlLink = `download.html?id=${d.id}`; // tracked download redirect
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
            ` : ``}
          </div>
        </td>
      </tr>`;
  });
  body.innerHTML = rows;

  if (!canManage) return;

  // publish/unpublish
  body.querySelectorAll('button[data-act="toggle"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.currentTarget.closest('tr');
      const id = tr.dataset.id;
      const currentIsUnpublish = e.currentTarget.textContent.toLowerCase().includes('unpublish');
      await updateDoc(doc(db, 'programs', id), { published: !currentIsUnpublish });
      await loadPrograms(uid, { canManage: true });
    });
  });

  // delete
  body.querySelectorAll('button[data-act="delete"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.currentTarget.closest('tr');
      const id = tr.dataset.id;
      const path = tr.dataset.path;
      if (!confirm('Delete this program? This cannot be undone.')) return;
      await deleteDoc(doc(db, 'programs', id));
      if (path) { try { await deleteObject(ref(storage, path)); } catch(_){} }
      await loadPrograms(uid, { canManage: true });
      await loadOverview(uid);
      await loadAnalytics(uid);
    });
  });
}

/* --------------------------- analytics ------------------------------ */
async function loadAnalytics(uid) {
  const snap = await getDocs(query(collection(db, 'programs'), where('creatorId','==',uid)));
  let published = 0, drafts = 0, last30 = 0;
  const monthAgo = Date.now() - 30*24*60*60*1000;
  snap.forEach(d => {
    const p = d.data();
    if (p.published) published++; else drafts++;
    const t = toDate(p.createdAt)?.getTime?.() ?? 0;
    if (t > monthAgo) last30++;
  });
  qs('#a-published').textContent = fmt(published);
  qs('#a-drafts').textContent   = fmt(drafts);
  qs('#a-last30').textContent   = fmt(last30);
}
