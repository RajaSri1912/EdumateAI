"use client";

import { useEffect, useState, use } from "react";
import { doc, getDoc, collection, getDocs, query, orderBy, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_EMAILS } from "@/lib/adminConfig";
import styles from "./page.module.css";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { calculateEffectiveStreak } from "@/lib/streak";

interface ActivityRecord {
    id: string;
    type: string;
    description: string;
    timestamp: number;
}

interface PlatformUser {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
    lastLoginServer?: any;
    metadata?: any;
    activityHistory?: ActivityRecord[];
    streakCount?: number;
    classGroup?: string;
}

function UserDetails() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const userId = searchParams.get('id');
    const [targetUser, setTargetUser] = useState<PlatformUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [learningRate, setLearningRate] = useState(0);
    const [classes, setClasses] = useState<string[]>([]);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        } else if (!loading && user && !ADMIN_EMAILS.includes(user.email || '')) {
            router.push('/dashboard');
        }
    }, [user, loading, router]);

    useEffect(() => {
        const fetchUserDetails = async () => {
            if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
                setIsLoading(false);
                return;
            }

            try {
                if (!userId) {
                    setIsLoading(false);
                    return;
                }
                const userRef = doc(db, "users", userId);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const data = userSnap.data() as PlatformUser;
                    setTargetUser(data);

                    // Fetch Classes
                    const configRef = doc(db, "admin", "config");
                    const configSnap = await getDoc(configRef);
                    if (configSnap.exists()) {
                        setClasses(configSnap.data().classes || []);
                    }

                    // Calculate Learning Rate
                    if (data.activityHistory) {
                        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                        const recentActivities = data.activityHistory.filter(a => a.timestamp > oneDayAgo);
                        const rate = Math.min(10, (recentActivities.length / 24) * 10);
                        setLearningRate(rate);
                    }
                }
            } catch (error) {
                console.error("Error fetching user details:", error);
            } finally {
                setIsLoading(false);
            }
        };

        if (user && !loading) {
            fetchUserDetails();
        }
    }, [user, loading, userId]);

    if (loading || isLoading) {
        return <div className={styles.spinner}></div>;
    }

    if (!targetUser) {
        return (
            <div className={styles.container} style={{ textAlign: 'center', marginTop: '10vh' }}>
                <h2>User Not Found</h2>
                <p style={{ color: '#9ca3af' }}>The requested user does not exist or has been deleted.</p>
                <button
                    onClick={() => router.push('/admin')}
                    className={styles.backButton}
                    style={{ background: 'var(--primary)', color: 'white', padding: '0.8rem 2rem', borderRadius: '8px', marginTop: '1rem' }}
                >
                    Back to Admin Panel
                </button>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.topSection}>
                <button onClick={() => router.push('/admin')} className={styles.backButton}>
                    ← Back to Admin Panel
                </button>
                <header className={styles.header}>
                    <div>
                        {targetUser.photoURL ? (
                            <img src={targetUser.photoURL} alt={targetUser.displayName} className={styles.avatar} referrerPolicy="no-referrer" />
                        ) : (
                            <div className={styles.avatarFallback}>{targetUser.displayName?.[0] || 'U'}</div>
                        )}
                    </div>
                    <div className={styles.userInfo}>
                        <h1>{targetUser.displayName}</h1>
                        <div className={styles.metaInfo}>
                            <span>{targetUser.email}</span>
                            <span>•</span>
                            <span>ID: {targetUser.uid}</span>
                        </div>
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
                            <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>Active</span>
                            <span style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>Streak: {calculateEffectiveStreak(targetUser)}</span>
                        </div>
                    </div>
                </header>
            </div>

            <div className={styles.grid}>
                <section className={styles.card}>
                    <h2>Key Insights</h2>
                    <div className={styles.statsList}>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Current Learning Rate</span>
                            <span className={styles.statValue} style={{ color: 'var(--glow-color)' }}>{learningRate.toFixed(1)} / 10</span>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Class / Cohort</span>
                            <select
                                value={targetUser.classGroup || ""}
                                onChange={async (e) => {
                                    const newClass = e.target.value;
                                    try {
                                        await updateDoc(doc(db, "users", targetUser.uid), { classGroup: newClass });
                                        setTargetUser({ ...targetUser, classGroup: newClass });
                                    } catch (err) {
                                        console.error("Error updating class", err);
                                    }
                                }}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    color: 'white',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '6px',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="" style={{ color: 'black' }}>Unassigned</option>
                                {classes.map(c => <option key={c} value={c} style={{ color: 'black' }}>{c}</option>)}
                            </select>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Total Activity Logs</span>
                            <span className={styles.statValue}>{targetUser.activityHistory?.length || 0}</span>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Last Active</span>
                            <span className={styles.statValue}>
                                {targetUser.lastLoginServer?.toDate ? new Date(targetUser.lastLoginServer.toDate()).toLocaleString() : "Unknown"}
                            </span>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Account Created</span>
                            <span className={styles.statValue}>
                                {targetUser.metadata?.creationTime ? new Date(Number(targetUser.metadata.creationTime)).toLocaleDateString() : "Unknown"}
                            </span>
                        </div>
                    </div>
                </section>

                <section className={styles.card}>
                    <h2>Activity Timeline</h2>
                    <div className={styles.activityList}>
                        {targetUser.activityHistory && targetUser.activityHistory.length > 0 ? (
                            targetUser.activityHistory.map((act) => (
                                <div key={act.id} className={styles.activityItem}>
                                    <div className={styles.activityHeader}>
                                        <div className={styles.activityType}>{act.type}</div>
                                        <div className={styles.activityTime}>
                                            {new Date(act.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    <p style={{ margin: 0, color: 'white', lineHeight: '1.4' }}>{act.description}</p>
                                </div>
                            ))
                        ) : (
                            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>No activity history found for this user.</p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

export default function UserDetailsPage() {
    return (
        <Suspense fallback={<div className={styles.spinner}></div>}>
            <UserDetails />
        </Suspense>
    );
}
