"use client";

import React from 'react';
import styles from './StreakFire.module.css';

interface StreakFireProps {
    count: number;
}

const StreakFire: React.FC<StreakFireProps> = ({ count }) => {
    // Determine scale based on count to make it "grow"
    // Starts at 1.0, increases slightly per day of streak
    const growthFactor = Math.min(1.5, 1 + (count * 0.05));

    return (
        <div className={styles.streakContainer} title={`${count} day streak!`}>
            <span
                className={`${styles.fireIcon} ${count > 0 ? styles.fireActive : ''}`}
                style={{ transform: `scale(${growthFactor})` }}
            >
                🔥
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                <span className={styles.streakCount}>{count}</span>
                <span className={styles.streakLabel}>Days</span>
            </div>
        </div>
    );
};

export default StreakFire;
