import { db } from "./firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export interface ActivityRecord {
    id: string;
    type: string;
    description: string;
    timestamp: number; // Storing as ms since epoch for easy math
}

export async function logActivity(userId: string, type: string, description: string) {
    if (!userId) return;
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) return;

        const data = userSnap.data();
        let activityHistory: ActivityRecord[] = data.activityHistory || [];

        const newActivity: ActivityRecord = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
            type,
            description,
            timestamp: Date.now()
        };

        // Add to front of array
        activityHistory.unshift(newActivity);

        // Keep only the latest 50 activities to avoid document size bloat
        if (activityHistory.length > 50) {
            activityHistory = activityHistory.slice(0, 50);
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const dailyActivityCounts = data.dailyActivityCounts || {};
        dailyActivityCounts[todayStr] = (dailyActivityCounts[todayStr] || 0) + 1;

        await updateDoc(userRef, {
            activityHistory,
            dailyActivityCounts
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
}

export async function getLearningRate(userId: string): Promise<number> {
    if (!userId) return 0;
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) return 0;

        const data = userSnap.data();
        const dailyActivityCounts = data.dailyActivityCounts || {};

        const todayStr = new Date().toISOString().split('T')[0];
        const count = dailyActivityCounts[todayStr] || 0;

        // Formula: (activity / 24) * 10, scale 1 to 10.
        let rate = (count / 24) * 10;
        rate = Math.max(0, Math.min(10, rate));
        return Math.round(rate * 10) / 10;
    } catch (error) {
        console.error("Error calculating learning rate:", error);
        return 0;
    }
}

export async function getLearningRateHistory(userId: string, days: number = 8): Promise<{ date: string, rate: number }[]> {
    if (!userId) return [];
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) return [];

        const data = userSnap.data();
        const dailyActivityCounts = data.dailyActivityCounts || {};

        const history = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const count = dailyActivityCounts[dateStr] || 0;

            let rate = (count / 24) * 10;
            rate = Math.max(0, Math.min(10, rate));
            rate = Math.round(rate * 10) / 10;

            // Format nice date like 'Mar 10'
            const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            history.push({ date: formattedDate, rate });
        }

        return history;
    } catch (error) {
        console.error("Error fetching learning rate history:", error);
        return [];
    }
}
