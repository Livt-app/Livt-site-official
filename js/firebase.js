// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDEe9NWrmaVPvhJ0qC6hHxzshmJwr6z2Eo",
  authDomain: "livt-f0f9e.firebaseapp.com",
  projectId: "livt-f0f9e",
  storageBucket: "livt-f0f9e.firebasestorage.app", // if uploads fail, try "livt-f0f9e.appspot.com"
  messagingSenderId: "315293616101",
  appId: "1:315293616101:web:21d3a9051c6cb5f0dcd10c",
  measurementId: "G-R3WE52NRNC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
