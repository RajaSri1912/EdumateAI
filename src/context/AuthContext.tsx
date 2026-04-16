"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    User,
    GoogleAuthProvider
} from "firebase/auth";
import { auth, googleProvider, db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

interface AuthContextType {
    user: User | null;
    accessToken: string | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem("google_drive_token");
        if (storedToken) setAccessToken(storedToken);

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const loggedInUser = result.user;

            // Get Google Access Token
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential?.accessToken;

            if (token) {
                setAccessToken(token);
                localStorage.setItem("google_drive_token", token);
            }

            // Store user details in Firestore
            await setDoc(doc(db, "users", loggedInUser.uid), {
                uid: loggedInUser.uid,
                email: loggedInUser.email,
                displayName: loggedInUser.displayName,
                photoURL: loggedInUser.photoURL,
                phoneNumber: loggedInUser.phoneNumber,
                providerId: loggedInUser.providerId,
                metadata: {
                    creationTime: loggedInUser.metadata.creationTime,
                    lastSignInTime: loggedInUser.metadata.lastSignInTime,
                },
                lastLoginServer: serverTimestamp(),
            }, { merge: true });

            window.location.href = "/dashboard";
        } catch (error) {
            console.error("Error signing in with Google", error);
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
            setAccessToken(null);
            localStorage.removeItem("google_drive_token");
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, accessToken, loading, signInWithGoogle, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
