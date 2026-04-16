"use client";

import styles from "./Navbar.module.css";
import { useAuth } from "../context/AuthContext";
import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import StreakFire from "./StreakFire";
import { ADMIN_EMAILS } from "@/lib/adminConfig";
import { calculateEffectiveStreak } from "@/lib/streak";

const Navbar = () => {
    const { user, signInWithGoogle, logout } = useAuth();
    const [streak, setStreak] = useState(0);

    useEffect(() => {
        if (!user) {
            setStreak(0);
            return;
        }

        const userRef = doc(db, "users", user.uid);
        const unsubscribe = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setStreak(calculateEffectiveStreak(data));
            }
        });

        return () => unsubscribe();
    }, [user]);

    return (
        <nav className={styles.nav}>
            <Link href="/" className={styles.logoContainer}>
                <img src="/edumatelogo.png" alt="EduMate Logo" className={styles.logoImage} />
                <span className={styles.logo}>EduMate AI</span>
            </Link>

            <div className={styles.navLinks}>
                <Link href="/" className={styles.navLink}>Home</Link>
                <Link href="/#features" className={styles.navLink}>Features</Link>
                <Link href="/#mastery" className={styles.navLink}>Mastery Path</Link>
                <Link href="/#cloud" className={styles.navLink}>Cloud</Link>
                {user && (
                    <>
                        <Link href="/play" className={styles.navLink}>Play 🎮</Link>
                        <Link href="/dashboard" className={styles.navLink}>Dashboard</Link>
                        {user.email && ADMIN_EMAILS.includes(user.email) && (
                            <Link href="/admin" className={styles.navLink} style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Admin</Link>
                        )}
                    </>
                )}
            </div>

            <div className={styles.auth}>
                {user ? (
                    <div className={styles.profile}>
                        <StreakFire count={streak} />
                        <div className={styles.avatar}>
                            {user.photoURL ? (
                                <img
                                    src={user.photoURL}
                                    alt={user.displayName || "User"}
                                    className={styles.avatarImg}
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <span>{user.displayName?.[0] || 'U'}</span>
                            )}
                        </div>
                        <button onClick={logout} className={styles.loginBtn}>
                            Sign Out
                        </button>
                    </div>
                ) : (
                    <button onClick={signInWithGoogle} className={styles.loginBtn}>
                        Login with Google
                    </button>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
