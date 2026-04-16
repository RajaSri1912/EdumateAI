"use client";

import { useEffect, useState } from "react";
import { collection, query, getDocs, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { updateUserStreak } from "@/lib/streak";
import { logActivity } from "@/lib/activity";
import styles from "../Play.module.css";
import gameStyles from "./GlossaryGlide.module.css";

interface DocumentMeta {
    id: string;
    name: string;
    parsedData?: any;
    glossaryGlideBestScore?: number;
}

export default function GlossaryGlide() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [docs, setDocs] = useState<DocumentMeta[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<DocumentMeta | null>(null);
    const [gameState, setGameState] = useState<'selecting' | 'playing' | 'finished'>('selecting');

    // Game state
    const [cards, setCards] = useState<any[]>([]);
    const [flipped, setFlipped] = useState<number[]>([]);
    const [solved, setSolved] = useState<number[]>([]);
    const [moves, setMoves] = useState(0);

    useEffect(() => {
        if (!loading && !user) router.push('/');
        if (user) fetchDocs();
    }, [user, loading]);

    const fetchDocs = async () => {
        const q = query(
            collection(db, "users", user!.uid, "documents"),
            orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const fetchedDocs = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as DocumentMeta))
            .filter(d => d.parsedData?.glossary?.length > 0);
        setDocs(fetchedDocs);
    };

    const startGame = (doc: DocumentMeta) => {
        const glossary = doc.parsedData.glossary.slice(0, 8); // Max 8 pairs for a 4x4 grid
        const gameCards: any[] = [];

        glossary.forEach((item: any, idx: number) => {
            gameCards.push({ id: idx * 2, content: item.term, pairId: idx, type: 'term' });
            gameCards.push({ id: idx * 2 + 1, content: item.definition, pairId: idx, type: 'def' });
        });

        setCards(gameCards.sort(() => Math.random() - 0.5));
        setSelectedDoc(doc);
        setGameState('playing');
        setMoves(0);
        setFlipped([]);
        setSolved([]);
    };

    const handleCardClick = (id: number) => {
        if (flipped.length === 2 || solved.includes(id) || flipped.includes(id)) return;

        const newFlipped = [...flipped, id];
        setFlipped(newFlipped);

        if (newFlipped.length === 2) {
            setMoves(m => m + 1);
            const card1 = cards.find(c => c.id === newFlipped[0]);
            const card2 = cards.find(c => c.id === newFlipped[1]);

            if (card1.pairId === card2.pairId) {
                setSolved(prev => [...prev, ...newFlipped]);
                setFlipped([]);
                if (solved.length + 2 === cards.length) {
                    setGameState('finished');
                    if (user && selectedDoc) {
                        const finalMoves = moves + 1;
                        updateUserStreak(user.uid).catch(console.error);
                        logActivity(user.uid, "game", `Completed Glossary Glide: ${selectedDoc.name}`).catch(console.error);

                        const currentBest = selectedDoc.glossaryGlideBestScore || Infinity;
                        if (finalMoves < currentBest) {
                            const docRef = doc(db, 'users', user.uid, 'documents', selectedDoc.id);
                            updateDoc(docRef, { glossaryGlideBestScore: finalMoves }).catch(console.error);
                            setDocs(prev => prev.map(d => d.id === selectedDoc.id ? { ...d, glossaryGlideBestScore: finalMoves } : d));
                            setSelectedDoc({ ...selectedDoc, glossaryGlideBestScore: finalMoves });
                        }
                    }
                }
            } else {
                setTimeout(() => setFlipped([]), 1500);
            }
        }
    };

    if (loading || !user) return null;

    return (
        <div className={styles.container} style={{
            paddingTop: gameState === 'playing' ? '5.5rem' : '7rem',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div className={gameStyles.topBar}>
                <button
                    onClick={() => gameState === 'playing' ? setGameState('selecting') : router.back()}
                    className={gameStyles.backBtn}
                >
                    ← Back
                </button>
            </div>

            {gameState !== 'playing' && (
                <header className={styles.header} style={{ marginBottom: '2rem' }}>
                    <h1>Glossary Glide 🧠</h1>
                    <p>Match terms with their definitions to master the subject.</p>
                </header>
            )}

            {gameState === 'selecting' && (
                <div className={gameStyles.selectionArea}>
                    <h3>Select a Document to Play</h3>
                    {docs.length > 0 ? (
                        <div className={gameStyles.docList}>
                            {docs.map(doc => (
                                <div key={doc.id} className={gameStyles.docOption} onClick={() => startGame(doc)}>
                                    <span>📄</span>
                                    <h4>{doc.name}</h4>
                                    <p>{doc.parsedData.glossary.length} terms available</p>
                                    <p style={{ marginTop: "0.5rem", color: "var(--primary)", fontWeight: "bold" }}>
                                        {doc.glossaryGlideBestScore ? `Best Score: ${doc.glossaryGlideBestScore} moves` : 'New'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p>No documents with glossary found. Upload and process a file first!</p>
                    )}
                </div>
            )}

            {gameState === 'playing' && (
                <div className={gameStyles.gameBoard}>
                    <div className={gameStyles.hud}>
                        <div className={gameStyles.hudTitle}>Glossary Glide 🧠</div>
                        <div className={gameStyles.stats}>
                            <span>Moves: {moves}</span>
                            <span>Solved: {solved.length / 2} / {cards.length / 2}</span>
                        </div>
                    </div>
                    <div className={gameStyles.grid}>
                        {cards.map(card => (
                            <div
                                key={card.id}
                                className={`${gameStyles.card} ${flipped.includes(card.id) ? gameStyles.flipped : ''} ${solved.includes(card.id) ? gameStyles.solved : ''}`}
                                onClick={() => handleCardClick(card.id)}
                            >
                                <div className={gameStyles.cardInner}>
                                    <div className={gameStyles.cardFront}>?</div>
                                    <div className={gameStyles.cardBack}>
                                        <p className={`${card.type === 'def' ? gameStyles.defText : ''}`}>{card.content}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {gameState === 'finished' && (
                <div className={gameStyles.winScreen}>
                    <div className={gameStyles.trophy}>🏆</div>
                    <h2>Mastery Achieved!</h2>
                    <p>Clean sweep! You completed the glossary match in {moves} moves.</p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
                        <button className={styles.playBtn} onClick={() => setGameState('selecting')}>Play Again</button>
                        <button className={styles.playBtn} style={{ background: 'var(--glass-bg)' }} onClick={() => router.push('/play')}>Exit</button>
                    </div>
                </div>
            )}
        </div>
    );
}
