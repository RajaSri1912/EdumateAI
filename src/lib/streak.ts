import { db } from "./firebase";
import { doc, getDoc, updateDoc, increment, serverTimestamp, Timestamp } from "firebase/firestore";

export interface StreakData {
    streakCount: number;
    lastReadTimestamp: Timestamp | null;
    bestStreak: number;
}

export function calculateEffectiveStreak(data: any): number {
    if (!data) return 0;
    const streakCount = data.streakCount || 0;
    const lastReadTimestamp = data.lastReadTimestamp;

    if (!lastReadTimestamp) return 0;

    const lastReadDate = typeof lastReadTimestamp.toDate === 'function' ? lastReadTimestamp.toDate() : new Date(lastReadTimestamp.seconds * 1000);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastReadDay = new Date(lastReadDate.getFullYear(), lastReadDate.getMonth(), lastReadDate.getDate());

    const diffTime = today.getTime() - lastReadDay.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
        return 0;
    }
    return streakCount;
}

export async function updateUserStreak(userId: string) {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return;

    const data = userSnap.data();
    const streakCount = data.streakCount || 0;
    const lastReadTimestamp = data.lastReadTimestamp as Timestamp | null;
    const bestStreak = data.bestStreak || 0;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (lastReadTimestamp) {
        const lastReadDate = lastReadTimestamp.toDate();
        const lastReadDay = new Date(lastReadDate.getFullYear(), lastReadDate.getMonth(), lastReadDate.getDate());

        const diffTime = today.getTime() - lastReadDay.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            // Already read today, no change to streak count
            return;
        } else if (diffDays === 1) {
            // Consecutive day!
            const newStreak = streakCount + 1;
            await updateDoc(userRef, {
                streakCount: newStreak,
                lastReadTimestamp: serverTimestamp(),
                bestStreak: Math.max(bestStreak, newStreak)
            });
        } else {
            // Streak broken
            await updateDoc(userRef, {
                streakCount: 1,
                lastReadTimestamp: serverTimestamp(),
                bestStreak: Math.max(bestStreak, 1)
            });
        }
    } else {
        // First time reading
        await updateDoc(userRef, {
            streakCount: 1,
            lastReadTimestamp: serverTimestamp(),
            bestStreak: 1
        });
    }
}
