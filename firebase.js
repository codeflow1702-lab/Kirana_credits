import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Intentionally the same Firebase project as V1. V2 uses the existing
// users/{uid}/transactions collection and does not touch other collections.
const firebaseConfig = {
  apiKey: "AIzaSyBOtfWjnav21_Wr7FiSzYAOOvTdC-FwMcY",
  authDomain: "multiplayer-uno-ca8dc.firebaseapp.com",
  projectId: "multiplayer-uno-ca8dc",
  storageBucket: "multiplayer-uno-ca8dc.firebasestorage.app",
  messagingSenderId: "853979305177",
  appId: "1:853979305177:web:509dca67cd11f202d11ac8",
  measurementId: "G-D9TE0FJ3FC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
