"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_EMAILS } from "@/lib/adminConfig";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";
import { calculateEffectiveStreak } from "@/lib/streak";

interface PlatformUser {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
    lastLoginServer?: any;
    metadata?: any;
    activityHistory?: any[];
    classGroup?: string;
    streakCount?: number;
}

export default function AdminDashboard() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<PlatformUser[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [selectedClass, setSelectedClass] = useState("All");
    const [classes, setClasses] = useState<string[]>([]);
    const [newClassStr, setNewClassStr] = useState("");

    const filteredUsers = selectedClass === "All"
        ? users
        : users.filter(u => u.classGroup === selectedClass);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    useEffect(() => {
        const fetchUsers = async () => {
            if (!user || !user.email || !ADMIN_EMAILS.includes(user.email)) {
                setIsLoadingUsers(false);
                return;
            }

            try {
                const querySnapshot = await getDocs(collection(db, "users"));
                const fetchedUsers: PlatformUser[] = [];
                querySnapshot.forEach((doc) => {
                    fetchedUsers.push(doc.data() as PlatformUser);
                });
                setUsers(fetchedUsers);

                // Fetch Classes
                const configRef = doc(db, "admin", "config");
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    setClasses(configSnap.data().classes || []);
                } else {
                    await setDoc(configRef, { classes: ["Class A", "Class B"] });
                    setClasses(["Class A", "Class B"]);
                }
            } catch (error) {
                console.error("Error fetching users:", error);
            } finally {
                setIsLoadingUsers(false);
            }
        };

        if (user && !loading) {
            fetchUsers();
        } else if (!user && !loading) {
            setIsLoadingUsers(false);
        }
    }, [user, loading]);

    const handleAddClass = async () => {
        if (!newClassStr.trim() || classes.includes(newClassStr.trim())) return;
        const updatedClasses = [...classes, newClassStr.trim()];

        try {
            await setDoc(doc(db, "admin", "config"), { classes: updatedClasses }, { merge: true });
            setClasses(updatedClasses);
            setNewClassStr("");
        } catch (error) {
            console.error("Error adding class:", error);
            alert("Failed to add class.");
        }
    };

    const handleDeleteClass = async (classToDelete: string) => {
        if (!confirm(`Are you sure you want to delete ${classToDelete}? This won't remove users from the system, but their class will become Unassigned if they were inside it.`)) return;

        const updatedClasses = classes.filter(c => c !== classToDelete);
        try {
            await setDoc(doc(db, "admin", "config"), { classes: updatedClasses }, { merge: true });
            setClasses(updatedClasses);
            if (selectedClass === classToDelete) setSelectedClass("All");
        } catch (error) {
            console.error("Error deleting class:", error);
            alert("Failed to delete class.");
        }
    };

    if (loading || isLoadingUsers) {
        return <div className={styles.spinner}></div>;
    }

    if (!user || !user.email || !ADMIN_EMAILS.includes(user.email)) {
        return (
            <div className={styles.deniedContainer}>
                <div className={styles.deniedIcon}>⛔</div>
                <h2>Access Denied</h2>
                <p>You do not have administrative privileges to view this page.</p>
                {user && <p style={{ color: '#9ca3af', marginTop: '1rem' }}>Logged in as: {user.email}</p>}
                <button
                    onClick={() => router.push('/dashboard')}
                    style={{ marginTop: '2rem', padding: '0.8rem 2rem', background: 'var(--primary)', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                >
                    Return to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Admin Control Panel</h1>
            </header>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Total Users</span>
                    <span className={styles.statValue}>{users.length}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Total Classes</span>
                    <span className={styles.statValue}>{classes.length}</span>
                </div>
            </div>

            <div style={{ marginBottom: '3rem', background: 'rgba(255, 255, 255, 0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <h2 style={{ color: 'white', marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem' }}>Class Manager</h2>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <input
                        type="text"
                        value={newClassStr}
                        onChange={(e) => setNewClassStr(e.target.value)}
                        placeholder="New Class Name (e.g. Science 101)"
                        style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', outline: 'none' }}
                    />
                    <button
                        onClick={handleAddClass}
                        style={{ padding: '0 2rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        Add Class
                    </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {classes.map(c => (
                        <div key={c} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                            {c}
                            <button onClick={() => handleDeleteClass(c)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: '1.2rem', lineHeight: 1 }}>×</button>
                        </div>
                    ))}
                    {classes.length === 0 && <span style={{ color: '#9ca3af' }}>No classes created yet.</span>}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ color: 'white', margin: 0 }}>Platform Users</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Filter by Class:</span>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '6px',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="All" style={{ color: 'black' }}>All Users</option>
                        {classes.map(c => <option key={c} value={c} style={{ color: 'black' }}>{c}</option>)}
                        <option value="" style={{ color: 'black' }}>Unassigned</option>
                    </select>
                </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table className={styles.usersTable}>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Class</th>
                            <th>Email</th>
                            <th>Current Learning Rate</th>
                            <th>Last Login</th>
                            <th>Streak</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(u => {
                            // Calculate local learning rate based on their history
                            let lr = 0;
                            if (u.activityHistory) {
                                const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                                const recentActivities = u.activityHistory.filter((a: any) => a.timestamp > oneDayAgo);
                                lr = Math.min(10, (recentActivities.length / 24) * 10);
                            }

                            return (
                                <tr key={u.uid} className={styles.clickableRow} onClick={() => router.push(`/admin/user?id=${u.uid}`)}>
                                    <td>
                                        <div className={styles.userInfo}>
                                            {u.photoURL ? (
                                                <img src={u.photoURL} alt={u.displayName} className={styles.avatar} referrerPolicy="no-referrer" />
                                            ) : (
                                                <div className={styles.avatar} style={{ background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                                                    {u.displayName?.[0] || 'U'}
                                                </div>
                                            )}
                                            <span style={{ fontWeight: 500 }}>{u.displayName || "Unknown"}</span>
                                        </div>
                                    </td>
                                    <td>
                                        {u.classGroup ? (
                                            <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                                                {u.classGroup}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Unassigned</span>
                                        )}
                                    </td>
                                    <td>{u.email}</td>
                                    <td style={{ color: 'var(--glow-color)', fontWeight: 'bold' }}>
                                        {lr.toFixed(1)} / 10
                                    </td>
                                    <td style={{ color: '#9ca3af' }}>
                                        {u.lastLoginServer?.toDate ? new Date(u.lastLoginServer.toDate()).toLocaleString() : "Unknown"}
                                    </td>
                                    <td>
                                        <span style={{
                                            background: 'rgba(249, 115, 22, 0.1)',
                                            color: '#f97316',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '20px',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            {calculateEffectiveStreak(u)}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
