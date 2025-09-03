// js/auth.js
import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const signUpForm = document.querySelector('#signup-form');
const signInForm = document.querySelector('#signin-form');
const switchToSignIn = document.querySelector('#to-signin');
const switchToSignUp = document.querySelector('#to-signup');
const statusEl = document.querySelector('#auth-status');

switchToSignIn?.addEventListener('click', () => {
  signUpForm.classList.add('hidden');
  signInForm.classList.remove('hidden');
});
switchToSignUp?.addEventListener('click', () => {
  signInForm.classList.add('hidden');
  signUpForm.classList.remove('hidden');
});

signUpForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Creating account...';
  const email = signUpForm.email.value.trim();
  const password = signUpForm.password.value.trim();
  const displayName = signUpForm.displayName.value.trim();
  const role = signUpForm.role.value; // 'creator' | 'user'
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(cred.user, { displayName });
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email,
      displayName: displayName || email.split('@')[0],
      role,
      createdAt: new Date().toISOString()
    });
    statusEl.textContent = 'Account created.';
    window.location.href = role === 'creator' ? 'upload.html' : 'index.html';
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
});

signInForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Signing in...';
  try {
    const cred = await signInWithEmailAndPassword(
      auth,
      signInForm.email.value.trim(),
      signInForm.password.value.trim()
    );
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    const role = snap.exists() ? snap.data().role : 'user';
    // figure out where to send the user
const next = new URLSearchParams(location.search).get('next');

// if ?next exists, use it; otherwise go to default (dashboard for creators, home for users)
window.location.href = next || (role === 'creator' ? 'creatordashboard.html' : 'index.html');

  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
});

// optional: show who’s signed in if the page has #whoami
onAuthStateChanged(auth, (user) => {
  const who = document.querySelector('#whoami');
  if (who) who.textContent = user ? `Signed in as ${user.displayName || user.email}` : 'Not signed in';
});

// optional: expose a logout handler if a page has #logout-btn
document.querySelector('#logout-btn')?.addEventListener('click', async () => {
  await signOut(auth);
  location.href = 'index.html';
});
