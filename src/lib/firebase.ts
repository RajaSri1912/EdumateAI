// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDcG59M-wMz-Yt9Jqg0x5JatgQJ_yC7InM",
    authDomain: "edu-mate-ai-web.firebaseapp.com",
    projectId: "edu-mate-ai-web",
    storageBucket: "edu-mate-ai-web.firebasestorage.app",
    messagingSenderId: "225114596869",
    appId: "1:225114596869:web:2890f5000785ba10609e6c",
    measurementId: "G-JQ5EWB19YD"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

let analytics;
if (typeof window !== "undefined") {
    isSupported().then((supported) => {
        if (supported) {
            analytics = getAnalytics(app);
        }
    });
}
export { analytics };
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
