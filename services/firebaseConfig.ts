// Firebase configuration and initialization
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAvdOyBT1Zk9rZ79nP2RvdhpfpIQjGfw8Q",
  authDomain: "chat-4c3a7.firebaseapp.com",
  projectId: "chat-4c3a7",
  storageBucket: "chat-4c3a7.firebasestorage.app",
  messagingSenderId: "995636644973",
  appId: "1:995636644973:web:59554144cbaad5d1444364",
  measurementId: "G-9T5TLP4SF1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Analytics (optional)
export const analytics = getAnalytics(app);

export default app;
