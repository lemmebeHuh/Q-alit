import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyApsWwITRgSq74jKRHZ5epu8WgXmkqygfk",
  authDomain: "q-alit.firebaseapp.com",
  projectId: "q-alit",
  storageBucket: "q-alit.firebasestorage.app",
  messagingSenderId: "1091455441691",
  appId: "1:1091455441691:web:208afc8e0b96e1933f91be",
  measurementId: "G-F60ZYNPCBZ"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
