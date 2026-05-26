import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD1Nl7LVxpMN58Wlzk4eLTokMzRWU-fdus",
  authDomain: "uat-platform-69e27.firebaseapp.com",
  projectId: "uat-platform-69e27",
  storageBucket: "uat-platform-69e27.firebasestorage.app",
  messagingSenderId: "108357266538",
  appId: "1:108357266538:web:89e86391b0d27820ceae13",
};

// Initialize Firebase only if it hasn't been initialized already
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore (Database)
const db = getFirestore(app);

// Initialize Cloud Storage (Files)
const storage = getStorage(app);

// Export app, db, and storage so the rest of the app can use them
export { app, db, storage };

