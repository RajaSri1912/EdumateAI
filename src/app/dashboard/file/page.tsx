"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from 'react';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { updateUserStreak } from "@/lib/streak";
import { logActivity } from "@/lib/activity";
import styles from "./FileDetails.module.css";
import ChatInterface from "@/components/ChatInterface";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DocumentMeta {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    createdAt: string;
    parsedData?: any;
    driveFileId?: string;
    textContent?: string;
    chatHistory?: any[];
    currentMode?: 'basic' | 'intermediate' | 'advanced';
    quizScores?: Record<string, number>;
    readModes?: string[];
}

function FileDetails() {
    const searchParams = useSearchParams();
    const fileId = searchParams.get('id');
    const router = useRouter();
    const { user, loading } = useAuth();
    const [document, setDocument] = useState<DocumentMeta | null>(null);
    const [quizData, setQuizData] = useState<Record<string, any[]>>({});
    const [loadingQuiz, setLoadingQuiz] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [mode, setMode] = useState<'basic' | 'intermediate' | 'advanced'>('basic'); // Default to basic
    const [quizScores, setQuizScores] = useState<Record<string, number>>({});
    const [currentQuizState, setCurrentQuizState] = useState<{ [key: string]: { answered: number, score: number } }>({});

    const [readModes, setReadModes] = useState<string[]>([]);

    // Translation Logic
    const [language, setLanguage] = useState<string>('en');
    const [translatedContent, setTranslatedContent] = useState<Record<string, any>>({});
    const [translating, setTranslating] = useState(false);

    // Audio & YouTube
    const [youtubeVideos, setYoutubeVideos] = useState<any[]>([]);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [showVideos, setShowVideos] = useState(false);
    const [isFetchingYoutube, setIsFetchingYoutube] = useState(false);
    const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

    const translateContent = async (text: string, lang: string) => {
        if (!text) return "";
        try {
            const res = await fetch('http://localhost:8000/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, target_lang: lang })
            });
            if (!res.ok) throw new Error('Translation failed');
            const data = await res.json();
            return data.translated_text;
        } catch (e) {
            console.error(e);
            return text; // Fallback
        }
    };

    useEffect(() => {
        if (language === 'en' || !document || !document.parsedData) return;

        const cacheKey = `${mode}-${language}`;
        if (translatedContent[cacheKey]) return; // Already cached

        const isTiered = document.parsedData && 'intermediate' in document.parsedData;
        const dataToTranslate = isTiered ? document.parsedData[mode] : document.parsedData;

        if (!dataToTranslate) return;

        const performTranslation = async () => {
            setTranslating(true);
            try {
                // Translate Summary
                const summary = await translateContent(dataToTranslate.summary, language);

                // Translate Takeaways
                const keyTakeaways = await Promise.all(
                    dataToTranslate.keyTakeaways.map((t: string) => translateContent(t, language))
                );

                // Translate Glossary
                const glossary = document.parsedData.glossary ? await Promise.all(
                    document.parsedData.glossary.map(async (item: any) => ({
                        term: await translateContent(item.term, language),
                        definition: await translateContent(item.definition, language)
                    }))
                ) : [];

                setTranslatedContent(prev => ({
                    ...prev,
                    [cacheKey]: { summary, keyTakeaways, glossary }
                }));
            } finally {
                setTranslating(false);
            }
        };

        performTranslation();
    }, [language, mode, document]);

    const ytSearchRef = useRef<HTMLInputElement>(null);

    const fetchVideos = useCallback(async (customQuery?: string) => {
        if (!document) return;
        const summaryPreview = displayData?.summary?.substring(0, 50) || "";
        const query = customQuery || `${summaryPreview} ${mode} explanation`;
        setIsFetchingYoutube(true);
        try {
            const res = await fetch('http://localhost:8000/youtube', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const data = await res.json();
            if (data.videos) setYoutubeVideos(data.videos);
        } catch (e) {
            console.error("Failed to fetch YouTube videos", e);
            setYoutubeVideos([]);
        } finally {
            setIsFetchingYoutube(false);
        }
    }, [document, mode]);

    // YouTube fetch happens manually via button now

    // Load readModes from document data
    useEffect(() => {
        if (document?.readModes) {
            setReadModes(document.readModes);
        }
    }, [document]);

    // Save mastery scores whenever relevant state changes
    useEffect(() => {
        if (!user || !fileId || !document) return;

        const maxScorePerMode = 10;
        const modes = ['basic', 'intermediate', 'advanced'];

        // Calculate Test Mastery with Weights and Hierarchy
        // Hierarchy: If score >= 7 in higher level, assume 10 in lower levels.
        const sBasic = quizScores['basic'] || 0;
        const sInter = quizScores['intermediate'] || 0;
        const sAdv = quizScores['advanced'] || 0;

        let effBasic = sBasic;
        let effInter = sInter;
        let effAdv = sAdv;

        if (sAdv >= 7) {
            effInter = Math.max(effInter, 10);
            effBasic = Math.max(effBasic, 10);
        } else if (sInter >= 7) {
            effBasic = Math.max(effBasic, 10);
        }

        // Weighted Score: Basic(1) + Inter(2) + Adv(3)
        // Max: 10 + 20 + 30 = 60
        const weightedScore = (effBasic * 1) + (effInter * 2) + (effAdv * 3);
        const testMastery = Math.min(100, Math.round((weightedScore / 60) * 100));

        // Calculate Reading Mastery
        const readingMastery = Math.min(100, Math.round((readModes.length / 3) * 100));

        const docRef = doc(db, "users", user.uid, "documents", fileId as string);

        // Only update if changed significantly (simple check to avoid loops, though Firestore handles idempotent writes well)
        // We just always update for simplicity in this prototype, or check against document state
        updateDoc(docRef, {
            readingMastery,
            testMastery,
            readModes
        }).catch(err => console.error("Error saving mastery:", err));

    }, [readModes, quizScores, user, fileId]);

    const handleToggleRead = async () => {
        let newReadModes = [...readModes];
        const isMarkingRead = !newReadModes.includes(mode);

        if (newReadModes.includes(mode)) {
            newReadModes = newReadModes.filter(m => m !== mode);
        } else {
            newReadModes.push(mode);
        }
        setReadModes(newReadModes);

        // Update streak if marking as read
        if (isMarkingRead && user && document) {
            try {
                await updateUserStreak(user.uid);
                await logActivity(user.uid, "read", `Read ${document.name} (${mode} mode)`);
            } catch (err) {
                console.error("Failed to update streak/activity:", err);
            }
        }
        // Firestore update happens in useEffect
    };

    // Save mode change to Firestore
    const handleModeChange = async (newMode: 'basic' | 'intermediate' | 'advanced') => {
        setMode(newMode);
        if (user && fileId) {
            try {
                const docRef = doc(db, "users", user.uid, "documents", fileId as string);
                await updateDoc(docRef, { currentMode: newMode });
            } catch (error) {
                console.error("Failed to save mode:", error);
            }
        }
    };

    const generateQuiz = async (selectedMode: string) => {
        if (!document?.textContent) return;

        setLoadingQuiz(true);
        try {
            const response = await fetch('http://localhost:8000/quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: document.textContent, mode: selectedMode }),
            });

            if (!response.ok) throw new Error('Failed to generate quiz');

            const data = await response.json();
            setQuizData(prev => ({ ...prev, [selectedMode]: data.quiz }));
            // Reset current quiz state for this mode
            setCurrentQuizState(prev => ({ ...prev, [selectedMode]: { answered: 0, score: 0 } }));
        } catch (error) {
            console.error("Error generating quiz:", error);
            alert("Failed to generate quiz. Please try again.");
        } finally {
            setLoadingQuiz(false);
        }
    };

    const handleAnswerClick = async (mode: string, questionIndex: number, isCorrect: boolean, btn: HTMLButtonElement, siblings: HTMLCollection) => {
        // Visual feedback
        if (isCorrect) {
            btn.classList.add(styles.correct);
            btn.innerText += " ✅";
        } else {
            btn.classList.add(styles.incorrect);
            btn.innerText += " ❌";
        }

        Array.from(siblings).forEach((sibling) => {
            (sibling as HTMLButtonElement).disabled = true;
            if (!isCorrect) {
                // Check if sibling text matches answer (logic copied from previous) or just rely on backend data if possible
                // Simplified logic: we don't easily know which sibling is correct without re-parsing. 
                // But strictly for score tracking:
            }
        });

        // Update score state
        setCurrentQuizState(prev => {
            const currentState = prev[mode] || { answered: 0, score: 0 };
            const newState = {
                answered: currentState.answered + 1,
                score: currentState.score + (isCorrect ? 1 : 0)
            };

            // Check if quiz completed
            if (newState.answered === 10) { // Assuming 10 questions
                const finalScore = newState.score;

                setQuizScores(prevScores => {
                    const currentBest = prevScores[mode] || 0;
                    if (finalScore > currentBest) {
                        // Persist new best score
                        if (user && fileId) {
                            const docRef = doc(db, "users", user.uid, "documents", fileId as string);
                            updateDoc(docRef, { [`quizScores.${mode}`]: finalScore }).catch(e => console.error("Failed to save score", e));
                        }
                        return { ...prevScores, [mode]: finalScore };
                    }
                    return prevScores;
                });
            }
            return { ...prev, [mode]: newState };
        });
    };

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
            return;
        }

        const fetchDocument = async () => {
            if (!user || !fileId) return;

            try {
                const docRef = doc(db, "users", user.uid, "documents", fileId as string);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data() as Omit<DocumentMeta, 'id'>;
                    setDocument({ ...data, id: docSnap.id } as DocumentMeta);

                    // Restore saved mode and scores
                    if (data.currentMode) setMode(data.currentMode);
                    if (data.quizScores) setQuizScores(data.quizScores);
                } else {
                    console.error("Document not found");
                    router.push("/dashboard");
                }
            } catch (error) {
                console.error("Error fetching document:", error);
            } finally {
                setFetching(false);
            }
        };

        if (user) {
            fetchDocument();
        }
    }, [user, loading, fileId, router]);

    if (loading || fetching) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>Loading document insights...</p>
            </div>
        );
    }

    if (!document) return null;



    // ... existing useEffects ...





    // Check if the data supports modes (new format) or is legacy (flat format)
    const isTiered = document?.parsedData && 'intermediate' in document.parsedData;
    const originalData = isTiered ? document.parsedData[mode] : document.parsedData;

    // Select content to display
    const displayData = (language !== 'en' && translatedContent[`${mode}-${language}`])
        ? translatedContent[`${mode}-${language}`]
        : originalData;

    const displayGlossary = (language !== 'en' && translatedContent[`${mode}-${language}`]?.glossary)
        ? translatedContent[`${mode}-${language}`].glossary
        : document.parsedData.glossary;



    const handlePlayAudio = () => {
        if (audioPlaying) {
            window.speechSynthesis.cancel();
            setAudioPlaying(false);
            return;
        }

        // Clean text for speech
        const summaryText = displayData?.summary || "";
        const takeawaysText = displayData?.keyTakeaways?.join('. ') || "";
        if (!summaryText && !takeawaysText) return;

        // Remove emojis and common markdown symbols to prevent TTS from reading them out loud
        const rawText = `Summary. ${summaryText}. Key Takeaways. ${takeawaysText}`;
        const textToRead = rawText
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
            .replace(/[*_~`#\[\]>|\\]/g, '');

        const utterance = new SpeechSynthesisUtterance(textToRead);

        // Set language for TTS
        const langCode = language === 'hi' ? 'hi-IN' : language === 'te' ? 'te-IN' : 'en-US';
        utterance.lang = langCode;

        // Try to find a high-quality/natural voice
        const voices = window.speechSynthesis.getVoices();

        // 1. First prioritize language match AND natural sounding ones (Google, Premium, Online)
        let bestVoice = voices.find(v => v.lang.startsWith(langCode.split('-')[0]) && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium') || v.name.includes('Neural')));

        // 2. If no premium voice, fallback to any matching language 
        if (!bestVoice) {
            bestVoice = voices.find(v => v.lang.startsWith(langCode.split('-')[0]));
        }

        if (bestVoice) {
            utterance.voice = bestVoice;
        }

        // Adjust rate and pitch slightly for a more natural cadence
        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        utterance.onend = () => setAudioPlaying(false);
        speechRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        setAudioPlaying(true);
    };

    return (
        <div className={styles.container}>
            {/* Header / Navigation */}
            <div className={styles.topSection}>
                <button onClick={() => router.back()} className={styles.backButton}>
                    ← Back to Dashboard
                </button>
                <header className={styles.header}>
                    <div>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {document.type?.includes('youtube') ? '📺' : document.type?.includes('html') ? '🌐' : document.type?.includes('pdf') ? '📕' : '📄'}
                            {document.name}
                        </h1>
                        <div className={styles.metaInfo}>
                            <span>{(document.size / 1024 / 1024).toFixed(2)} MB</span>
                            <span>•</span>
                            <span>{new Date(document.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            {document.driveFileId && (
                                <>
                                    <span>•</span>
                                    <span style={{ color: '#22c55e' }}>Synced to Drive</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Language Selector */}
                    <select
                        className={styles.languageSelect}
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as any)}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            background: 'var(--glass-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--glass-border)',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="en">English</option>
                        <option value="hi">Hindi (हिंदी)</option>
                        <option value="te">Telugu (తెలుగు)</option>
                        <option value="ta">Tamil (தமிழ்)</option>
                        <option value="kn">Kannada (ಕನ್ನಡ)</option>
                        <option value="ml">Malayalam (മലയാളം)</option>
                        <option value="mr">Marathi (मराठी)</option>
                        <option value="bn">Bengali (বাংলা)</option>
                        <option value="gu">Gujarati (ગુજરાતી)</option>
                        <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
                        <option value="or">Odia (ଓଡ଼ିଆ)</option>
                        <option value="as">Assamese (অসমীয়া)</option>
                        <option value="ur">Urdu (اردو)</option>
                        <option value="es">Spanish (Español)</option>
                        <option value="fr">French (Français)</option>
                        <option value="de">German (Deutsch)</option>
                        <option value="it">Italian (Italiano)</option>
                        <option value="ja">Japanese (日本語)</option>
                        <option value="ko">Korean (한국어)</option>
                        <option value="pt">Portuguese (Português)</option>
                        <option value="ru">Russian (Русский)</option>
                        <option value="zh">Chinese (中文)</option>
                    </select>
                </header>
            </div>

            {isTiered && (
                <div className={styles.modeTabsContainer}>
                    <div className={styles.modeTabs}>
                        {(['basic', 'intermediate', 'advanced'] as const).map((m) => (
                            <button
                                key={m}
                                className={`${styles.tab} ${mode === m ? styles.activeTab : ''}`}
                                onClick={() => handleModeChange(m)}
                            >
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {document?.parsedData && !translating && (
                <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', marginBottom: '2rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={handlePlayAudio}
                        className={styles.startQuizBtn}
                        style={{
                            background: audioPlaying ? 'rgba(239, 68, 68, 0.2)' : 'var(--glass-bg)',
                            border: audioPlaying ? '1px solid #ef4444' : '1px solid var(--glass-border)',
                            color: audioPlaying ? '#ef4444' : 'var(--text-primary)',
                            padding: '0.6rem 1.2rem',
                            fontSize: '0.9rem'
                        }}
                    >
                        {audioPlaying ? '⏹ Stop Audio' : '▶️ Listen to Summary'}
                    </button>

                    <button
                        className={styles.startQuizBtn}
                        style={{
                            background: readModes.includes(mode) ? 'rgba(34, 197, 94, 0.2)' : 'var(--glass-bg)',
                            color: readModes.includes(mode) ? '#4ade80' : 'var(--text-primary)',
                            border: readModes.includes(mode) ? '1px solid #4ade80' : '1px solid var(--glass-border)',
                            padding: '0.6rem 1.2rem',
                            fontSize: '0.9rem'
                        }}
                        onClick={handleToggleRead}
                    >
                        {readModes.includes(mode) ? '✅ Reading Completed' : `Mark ${mode.charAt(0).toUpperCase() + mode.slice(1)} Reading as Complete`}
                    </button>

                    {document?.parsedData?.glossary?.length >= 4 && (
                        <>
                            <button
                                className={styles.startQuizBtn}
                                style={{ background: 'rgba(147, 51, 234, 0.1)', color: '#d8b4fe', border: '1px solid rgba(147, 51, 234, 0.3)', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
                                onClick={() => router.push('/play/glossary-glide')}
                            >
                                🧠 Glossary Glide
                            </button>
                            <button
                                className={styles.startQuizBtn}
                                style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#f9a8d4', border: '1px solid rgba(236, 72, 153, 0.3)', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
                                onClick={() => router.push('/play/mastery-sprint')}
                            >
                                🚀 Mastery Sprint
                            </button>
                        </>
                    )}
                </div>
            )}

            <div className={styles.grid}>
                {/* Main Content: Insights */}
                <div className={styles.mainContent}>
                    {translating ? (
                        <div className={styles.loadingContainer}>
                            <div className={styles.spinner}></div>
                            <p>Translating content...</p>
                        </div>
                    ) : document.parsedData ? (
                        <>
                            <section className={styles.card}>
                                <h2>📝 {isTiered ? `${mode.charAt(0).toUpperCase() + mode.slice(1)} Summary` : 'Summary'}</h2>
                                <div className={styles.summaryText}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {displayData.summary}
                                    </ReactMarkdown>
                                </div>
                            </section>

                            <section className={styles.card}>
                                <h2>💡 Key Takeaways</h2>
                                <ul className={styles.takeawaysList}>
                                    {displayData.keyTakeaways?.map((point: string, i: number) => (
                                        <li key={i}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {point}
                                            </ReactMarkdown>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section className={styles.card}>
                                <h2>📖 Glossary</h2>
                                <div className={styles.glossaryGrid}>
                                    {displayGlossary?.map((item: any, i: number) => (
                                        <div key={i} className={styles.glossaryItem}>
                                            <strong>{item.term}</strong>
                                            <span>{item.definition}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>



                            {/* YouTube Section */}
                            <section className={styles.card} style={{ marginBottom: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF0000" width="28" height="28">
                                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                        </svg>
                                        Recommended Videos
                                    </h2>
                                    {showVideos && (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                ref={ytSearchRef}
                                                type="text"
                                                placeholder="Search other videos..."
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--glass-border)',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    color: 'white',
                                                    fontSize: '0.9rem'
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const val = ytSearchRef.current?.value;
                                                        if (val) fetchVideos(val);
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => {
                                                    const val = ytSearchRef.current?.value;
                                                    if (val) fetchVideos(val);
                                                }}
                                                className={styles.startQuizBtn}
                                                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                                                disabled={isFetchingYoutube}
                                            >
                                                {isFetchingYoutube ? 'Searching...' : 'Search'}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {!showVideos ? (
                                    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Find hand-picked YouTube tutorials for this document.</p>
                                        <button
                                            className={styles.startQuizBtn}
                                            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.6rem 2rem' }}
                                            onClick={() => {
                                                setShowVideos(true);
                                                if (youtubeVideos.length === 0) {
                                                    fetchVideos(document.name);
                                                }
                                            }}
                                        >
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                                                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                                </svg>
                                                Search Videos
                                            </span>
                                        </button>
                                    </div>
                                ) : (
                                    youtubeVideos.length > 0 ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                                            {youtubeVideos.map((v, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        background: '#0a0a0a',
                                                        border: '1px solid rgba(255,255,255,0.05)',
                                                        borderRadius: '16px',
                                                        padding: '1.5rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '1rem',
                                                        transition: 'transform 0.2s',
                                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                                                    }}
                                                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                                    onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', color: '#a78bfa', background: 'rgba(167, 139, 250, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                                                            {v.provider || 'YOUTUBE PLAYLISTS'}
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em' }}>
                                                            {v.modules || '?'} MODULES
                                                        </span>
                                                    </div>

                                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.5rem 0 0', lineHeight: '1.3' }}>
                                                        {v.title}
                                                    </h3>

                                                    <p style={{ fontSize: '0.9rem', color: '#9ca3af', lineHeight: '1.6', margin: 0, flex: 1 }}>
                                                        {v.description}
                                                    </p>

                                                    <a
                                                        href={v.link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            display: 'block',
                                                            width: '100%',
                                                            padding: '0.8rem',
                                                            marginTop: '1rem',
                                                            background: 'rgba(255, 255, 255, 0.03)',
                                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                                            borderRadius: '8px',
                                                            color: 'white',
                                                            textDecoration: 'none',
                                                            textAlign: 'center',
                                                            fontWeight: 600,
                                                            transition: 'background 0.2s'
                                                        }}
                                                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                                                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                                                    >
                                                        Explore <span style={{ fontSize: '0.8em', marginLeft: '4px' }}>↗</span>
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    ) : isFetchingYoutube ? (
                                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
                                            <div className={styles.spinner} style={{ margin: '0 auto 1rem', width: '24px', height: '24px' }}></div>
                                            Searching YouTube...
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
                                            <p>No suitable videos found for this topic.</p>
                                        </div>
                                    )
                                )}
                            </section>

                            <section className={styles.quizCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h2>❓ {mode.charAt(0).toUpperCase() + mode.slice(1)} Quiz</h2>
                                    {quizScores[mode] !== undefined && (
                                        <span style={{
                                            background: quizScores[mode] >= 7 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                            color: quizScores[mode] >= 7 ? '#4ade80' : '#f87171',
                                            padding: '0.2rem 0.8rem',
                                            borderRadius: '20px',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold'
                                        }}>
                                            Score: {quizScores[mode]}/10
                                        </span>
                                    )}
                                </div>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                                    Test your knowledge with 10 {mode} level questions.
                                </p>

                                {!quizData[mode] ? (
                                    <div style={{ textAlign: 'start' }}>
                                        <button
                                            className={styles.startQuizBtn}
                                            onClick={() => generateQuiz(mode)}
                                            disabled={loadingQuiz}
                                        >
                                            {loadingQuiz ? 'Generating Quiz...' : `Start ${mode.charAt(0).toUpperCase() + mode.slice(1)} Quiz`}
                                        </button>
                                    </div>
                                ) : (
                                    <div className={styles.quizContainer}>
                                        {quizData[mode].map((q: any, i: number) => (
                                            <div key={i} className={styles.quizQuestionItem}>
                                                <span className={styles.questionText}>Q{i + 1}: {q.question}</span>
                                                <div className={styles.quizOptions}>
                                                    {q.options?.map((opt: string, oi: number) => {
                                                        const cleanOpt = opt;
                                                        return (
                                                            <button
                                                                key={oi}
                                                                className={`${styles.optionBtn}`}
                                                                onClick={(e) => {
                                                                    const btn = e.currentTarget;
                                                                    const btnText = cleanOpt.trim();
                                                                    const ansText = q.answer.trim();
                                                                    const isCorrect = btnText === ansText || btnText.includes(ansText) || ansText.includes(btnText);

                                                                    handleAnswerClick(mode, i, isCorrect, btn, btn.parentElement!.children);

                                                                    // Highlight correct sibling if wrong (visual only)
                                                                    if (!isCorrect) {
                                                                        Array.from(btn.parentElement!.children).forEach(sibling => {
                                                                            const sibText = (sibling as HTMLElement).innerText.trim();
                                                                            if (sibText === ansText || sibText.includes(ansText) || ansText.includes(sibText)) {
                                                                                (sibling as HTMLElement).classList.add(styles.correct);
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                            >
                                                                {opt}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Next Steps / Reset */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                                            {quizScores[mode] !== undefined && quizScores[mode] >= 7 && (
                                                <div style={{ padding: '1.5rem', background: 'rgba(34, 197, 94, 0.15)', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.3)', textAlign: 'center' }}>
                                                    <p style={{ color: '#4ade80', marginBottom: '1rem', fontWeight: 'bold' }}>🎉 EXCELLENT! You've mastered this level! Brain power maximized 🧠⚡</p>
                                                    {mode === 'basic' && (
                                                        <button
                                                            className={styles.startQuizBtn}
                                                            onClick={() => handleModeChange('intermediate')}
                                                            style={{ width: '100%', background: 'linear-gradient(90deg, #10b981, #3b82f6)' }}
                                                        >
                                                            Mastery Unlocked: Onwards to Intermediate 🔓
                                                        </button>
                                                    )}
                                                    {mode === 'intermediate' && (
                                                        <button
                                                            className={styles.startQuizBtn}
                                                            onClick={() => handleModeChange('advanced')}
                                                            style={{ width: '100%', background: 'linear-gradient(90deg, #8b5cf6, #ec4899)' }}
                                                        >
                                                            Expert Status: Unlock Advanced Challenge 🏆
                                                        </button>
                                                    )}
                                                    {mode === 'advanced' && (
                                                        <p style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '1.2rem' }}>⭐️ MISSION COMPLETE! You have achieved total mastery of this material.</p>
                                                    )}
                                                </div>
                                            )}

                                            <button
                                                className={styles.startQuizBtn}
                                                style={{ alignSelf: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
                                                onClick={() => {
                                                    setQuizData(prev => {
                                                        const newData = { ...prev };
                                                        delete newData[mode];
                                                        return newData;
                                                    });
                                                    setQuizScores(prev => {
                                                        const newScores = { ...prev };
                                                        delete newScores[mode];
                                                        return newScores;
                                                    })
                                                    setCurrentQuizState(prev => {
                                                        const newState = { ...prev };
                                                        delete newState[mode];
                                                        return newState;
                                                    });
                                                }}
                                            >
                                                Reset Quiz
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </section>
                        </>
                    ) : (
                        <div className={styles.card}>
                            <p>This document has not been processed for insights yet.</p>
                        </div>
                    )}
                </div>

                {/* Sidebar: Chat Interface */}
                <aside className={styles.sidebar}>
                    {document.textContent ? (
                        <ChatInterface
                            documentId={document.id}
                            documentName={document.name}
                            textContent={document.textContent}
                            initialMessages={document.chatHistory}
                        />
                    ) : (
                        <div className={styles.card}>
                            <p>Chat unavailable (no text content found).</p>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}

export default function FileDetailsPage() {
    return (
        <Suspense fallback={<div style={{ textAlign: 'center', padding: '5rem' }}>Loading...</div>}>
            <FileDetails />
        </Suspense>
    );
}
