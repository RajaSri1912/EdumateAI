"use client";

import React from 'react';
import styles from './Play.module.css';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';

export default function PlayPage() {
    const router = useRouter();
    const { user, loading } = useAuth();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    if (loading || !user) return null;

    const games = [
        {
            id: 'glossary-glide',
            title: 'Glossary Glide',
            description: 'Master your terms! Match terms with their definitions in this sleek memory challenge. Boost your recall speed.',
            icon: '🧠',
            available: true,
            color: 'var(--primary)'
        },
        {
            id: 'mastery-sprint',
            title: 'Mastery Sprint',
            description: 'The ultimate 60-second challenge. Rapid-fire questions based on your study materials. Can you go 10 for 10?',
            icon: '🚀',
            available: true,
            color: 'var(--secondary)'
        }
    ];

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1><span>Play & Master</span> 🎮</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
                    Turn your study materials into high-energy challenges. Choose a game to begin.
                </p>
            </header>

            <div className={styles.gameGrid}>
                {games.map((game) => (
                    <div
                        key={game.id}
                        className={`${styles.gameCard} ${!game.available ? styles.comingSoon : ''}`}
                        onClick={() => game.available && router.push(`/play/${game.id}`)}
                    >
                        <div className={styles.icon}>{game.icon}</div>
                        <h3>{game.title}</h3>
                        <p>{game.description}</p>
                        <button className={styles.playBtn} disabled={!game.available}>
                            {game.available ? 'Play Now ➔' : 'Coming Soon'}
                        </button>
                    </div>
                ))}
            </div>

            <footer style={{ marginTop: '5rem', color: '#4b5563', fontSize: '0.9rem' }}>
                Games are dynamically generated based on your recent library activities.
            </footer>
        </div>
    );
}
