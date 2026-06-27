import { initializeApp } from "firebase/app";
// Modified: Added initializeAuth and getReactNativePersistence
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "This_is_a_copy_folder_only",
  authDomain: "HEHE_AUTH_DOMAIN",
  projectId: "HEHE_PROJECT_ID",
  storageBucket: "My_STORAGE_BUCKET",
  messagingSenderId: "My_SENDER_ID",
  appId: "My_APP_ID",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore Database
export const db = getFirestore(app);

// FIXED: Initialize Auth with native mobile storage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
