"use client";

import { useEffect, useState, useRef } from "react";
import { collection, query, getDocs, orderBy, updateDoc, doc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { updateUserStreak } from "@/lib/streak";
import { logActivity } from "@/lib/activity";
import styles from "../Play.module.css";
import gameStyles from "./MasterySprint.module.css";
import cardStyles from "../glossary-glide/GlossaryGlide.module.css";

interface DocumentMeta {
    id: string;
    name: string;
    parsedData?: any;
    masterySprintBestScore?: number;
}

interface Question {
    question: string;
    options: string[];
    correctAnswer: string;
}

export default function MasterySprint() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [docs, setDocs] = useState<DocumentMeta[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<DocumentMeta | null>(null);
    const [gameState, setGameState] = useState<'selecting' | 'playing' | 'finished'>('selecting');

    // Game variables
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(60);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!loading && !user) router.push('/');
        if (user) fetchDocs();

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [user, loading, router]);

    const fetchDocs = async () => {
        const q = query(
            collection(db, "users", user!.uid, "documents"),
            orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const fetchedDocs = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as DocumentMeta))
            // Only allow documents that have a generated glossary of at least 4 items
            .filter(d => d.parsedData?.glossary?.length >= 4);
        setDocs(fetchedDocs);
    };

    const startGame = (docData: DocumentMeta) => {
        setSelectedDoc(docData);
        const glossary = docData.parsedData?.glossary || [];
        if (glossary.length < 4) {
            alert("This document needs at least 4 glossary terms to play Mastery Sprint.");
            return;
        }

        // Generate a large set of questions from the glossary by shuffling
        let generatedQuestions: Question[] = [];

        // Let's create 20 questions by repeating and mixing terms and definitions
        for (let i = 0; i < 20; i++) {
            const isTermQuestion = Math.random() > 0.5;
            const targetItem = glossary[Math.floor(Math.random() * glossary.length)];

            let questionText, correctStr;
            if (isTermQuestion) {
                questionText = `What is the definition of "${targetItem.term}"?`;
                correctStr = targetItem.definition;
            } else {
                questionText = `Which term is defined as: "${targetItem.definition}"?`;
                correctStr = targetItem.term;
            }

            const options = generateOptions(correctStr, glossary, isTermQuestion);

            generatedQuestions.push({
                question: questionText,
                correctAnswer: correctStr,
                options: options
            });
        }

        setQuestions(generatedQuestions);
        setCurrentIndex(0);
        setScore(0);
        setTimeLeft(60);
        setSelectedAnswer(null);
        setGameState('playing');

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    endGame();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // Helper to generate multiple choice options from other answers
    const generateOptions = (correctStr: string, allItems: any[], isTermQuestion: boolean) => {
        const fakeOptions = allItems
            .map(i => isTermQuestion ? i.definition : i.term)
            .filter(val => val !== correctStr)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);

        while (fakeOptions.length < 3) {
            fakeOptions.push(`Dummy Option ${fakeOptions.length + 1}`);
        }

        return [correctStr, ...fakeOptions].sort(() => 0.5 - Math.random());
    };

    const handleAnswer = (answer: string) => {
        if (selectedAnswer) return; // Prevent double clicking

        setSelectedAnswer(answer);

        const isCorrect = answer === questions[currentIndex].correctAnswer;
        if (isCorrect) {
            setScore(s => s + 1);
        }

        // Wait a second to show the answer, then move on
        setTimeout(() => {
            if (currentIndex < questions.length - 1 && timeLeft > 0) {
                setSelectedAnswer(null);
                setCurrentIndex(i => i + 1);
            } else {
                endGame();
            }
        }, 1500);
    };

    const endGame = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState('finished');
        updateStreak();
    };

    const updateStreak = async () => {
        if (!user) return;
        try {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { completedSessions: increment(1) });
            await updateUserStreak(user.uid);
            if (selectedDoc) {
                await logActivity(user.uid, "game", `Completed Mastery Sprint: ${selectedDoc.name}`);

                const currentBest = selectedDoc.masterySprintBestScore || 0;
                if (score > currentBest) {
                    const docRef = doc(db, 'users', user.uid, 'documents', selectedDoc.id);
                    await updateDoc(docRef, { masterySprintBestScore: score });
                    setDocs(prev => prev.map(d => d.id === selectedDoc.id ? { ...d, masterySprintBestScore: score } : d));
                    setSelectedDoc({ ...selectedDoc, masterySprintBestScore: score });
                }
            }
        } catch (error) {
            console.error("Error updating mastery stats:", error);
        }
    };

    if (loading || !user) return null;

    return (
        <div className={styles.container} style={{
            paddingTop: gameState === 'playing' ? '6.5rem' : '8rem',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div className={cardStyles.topBar}>
                <button
                    onClick={() => gameState === 'playing' ? setGameState('selecting') : router.back()}
                    className={cardStyles.backBtn}
                >
                    ← Back
                </button>
            </div>

            {gameState !== 'playing' && (
                <header className={styles.header} style={{ marginBottom: '2rem' }}>
                    <h1>Mastery Sprint 🚀</h1>
                    <p>The ultimate 60-second challenge. Rapid-fire questions based on your study materials.</p>
                </header>
            )}

            {gameState === 'selecting' && (
                <div className={gameStyles.selectionArea}>
                    <h3>Select a Document to Sprint</h3>
                    {docs.length > 0 ? (
                        <div className={gameStyles.docList}>
                            {docs.map(doc => (
                                <div key={doc.id} className={gameStyles.docOption} onClick={() => startGame(doc)}>
                                    <span>📄</span>
                                    <h4>{doc.name}</h4>
                                    <p>Ready for Sprint</p>
                                    <p style={{ marginTop: "0.5rem", color: "var(--secondary)", fontWeight: "bold" }}>
                                        {doc.masterySprintBestScore ? `High Score: ${doc.masterySprintBestScore}` : 'New'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: "var(--text-secondary)" }}>No documents with enough glossary terms found. Process a new file to get started!</p>
                    )}
                </div>
            )}

            {gameState === 'playing' && questions.length > 0 && (
                <div className={gameStyles.gameContainer}>
                    <div className={gameStyles.hud}>
                        <div className={gameStyles.score}>Score: {score}</div>
                        <div className={`${gameStyles.timer} ${timeLeft <= 10 ? gameStyles.timerWarning : ''}`}>
                            0:{timeLeft.toString().padStart(2, '0')}
                        </div>
                        <div className={gameStyles.score}>Question: {currentIndex + 1}/{questions.length}</div>
                    </div>

                    <div className={gameStyles.card}>
                        <h2 className={gameStyles.questionText}>{questions[currentIndex].question}</h2>
                        <div className={gameStyles.optionsGrid}>
                            {questions[currentIndex].options.map((opt, idx) => (
                                <button
                                    key={idx}
                                    className={`${gameStyles.optionBtn} ${selectedAnswer === opt ?
                                        opt === questions[currentIndex].correctAnswer ? gameStyles.correct : gameStyles.incorrect
                                        : selectedAnswer && opt === questions[currentIndex].correctAnswer ? gameStyles.correct : ''
                                        }`}
                                    onClick={() => handleAnswer(opt)}
                                    disabled={!!selectedAnswer}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {gameState === 'finished' && (
                <div className={cardStyles.winScreen} style={{ animation: "slideUp 0.5s ease" }}>
                    <div className={cardStyles.trophy} style={{ filter: 'drop-shadow(0 0 20px #ef4444)' }}>🏃</div>
                    <h2>Sprint Completed!</h2>
                    <p style={{ fontSize: '1.2rem', margin: '1rem 0 2rem' }}>You scored {score} out of {currentIndex + 1} questions.</p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <button className={styles.playBtn} style={{ background: 'var(--secondary)' }} onClick={() => setGameState('selecting')}>Sprint Again</button>
                        <button className={styles.playBtn} style={{ background: 'var(--glass-bg)', color: '#fff' }} onClick={() => router.push('/play')}>Exit</button>
                    </div>
                </div>
            )}
        </div>
    );
}
