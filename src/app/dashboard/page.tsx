"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import styles from "./Dashboard.module.css";
import animStyles from "./DashboardAnimations.module.css";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, query, where, getDocs, orderBy, doc, updateDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getOrCreateEduMateFolder, uploadToGoogleDrive } from "@/lib/googleDrive";
import GlobalChat from "@/components/GlobalChat";
import { getLearningRate, getLearningRateHistory } from "@/lib/activity";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

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
    readingMastery?: number;
    testMastery?: number;
    status?: string;
    errorMessage?: string;
    glossaryGlideBestScore?: number;
    masterySprintBestScore?: number;
}

export default function Dashboard() {
    const { user, accessToken, loading } = useAuth();
    const router = useRouter();
    const [dragging, setDragging] = useState(false);
    const [files, setFiles] = useState<DocumentMeta[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
    const [processingId, setProcessingId] = useState<string | null>(null);
    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [linkInput, setLinkInput] = useState("");

    // Per-item import status map: key -> status
    const [importStatus, setImportStatus] = useState<{ [key: string]: 'IMPORTING' | 'IMPORTED' | 'FAILED' | 'IDLE' }>({});
    const [linkSuccess, setLinkSuccess] = useState<string | null>(null);
    const [learningRate, setLearningRate] = useState<number | null>(null);
    const [learningRateHistory, setLearningRateHistory] = useState<any[]>([]);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            fetchDocuments();
            getLearningRate(user.uid).then(rate => setLearningRate(rate)).catch(console.error);
            getLearningRateHistory(user.uid, 15).then(history => setLearningRateHistory(history)).catch(console.error);
        }
    }, [user, loading, router]);

    const fetchDocuments = async () => {
        if (!user) return;
        try {
            const q = query(
                collection(db, "users", user.uid, "documents"),
                orderBy("createdAt", "desc")
            );
            const querySnapshot = await getDocs(q);
            const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DocumentMeta[];
            setFiles(docs);
        } catch (error) {
            console.error("Error fetching documents:", error);
        }
    };

    const handleUpload = async (file: File) => {
        if (!user) return;

        setUploading(true);
        const progressTracker = { drive: 0, processing: 0 };
        const hasDrive = !!accessToken;

        const updateCombinedProgress = () => {
            const totalProgress = hasDrive
                ? (progressTracker.drive + progressTracker.processing) / 2
                : progressTracker.processing;
            setUploadProgress(prev => ({ ...prev, [file.name]: totalProgress }));
        };

        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        try {
            // 1. Prepare Google Drive Folder
            let folderId = "";
            let driveFileId = "";

            const driveUploadPromise = (async () => {
                if (!hasDrive) return;
                try {
                    folderId = await getOrCreateEduMateFolder(accessToken);
                    console.log(`Google Drive folder '${folderId}' ready for ${file.name}.`);

                    if (!folderId) return;

                    const id = await uploadToGoogleDrive(file, accessToken, folderId, (p) => {
                        progressTracker.drive = p;
                        updateCombinedProgress();
                    });
                    driveFileId = id;
                    progressTracker.drive = 100;
                    updateCombinedProgress();
                    console.log(`Google Drive upload complete: ${id}`);
                } catch (err: any) {
                    console.error("Drive upload failed:", err);
                    if (err.message && err.message.includes("session expired")) {
                        alert("Google Drive session expired. Please logout and login again to sync files.");
                    }
                }
            })();

            // 2. Process via API (Direct Upload)
            const processPromise = (async () => {
                const formData = new FormData();
                formData.append("file", file);

                // Simulate progress for the upload phase
                const progInterval = setInterval(() => {
                    if (progressTracker.processing < 90) {
                        progressTracker.processing += 10;
                        updateCombinedProgress();
                    }
                }, 500);

                const res = await fetch("http://localhost:8000/process", {
                    method: "POST",
                    body: formData
                });

                clearInterval(progInterval);
                progressTracker.processing = 100;
                updateCombinedProgress();

                if (!res.ok) {
                    let errorMessage = "Processing failed";
                    try {
                        const errorData = await res.json();
                        errorMessage = errorData.detail || errorData.error || errorMessage;
                    } catch (e) {
                        const errorText = await res.text();
                        errorMessage = errorText || errorMessage;
                    }
                    throw new Error(errorMessage);
                }

                return await res.json();
            })();

            // Run parallel
            const [_, processResult] = await Promise.all([driveUploadPromise, processPromise]);
            const { data, text } = processResult;

            // 3. Save to Firestore
            const docRef = await addDoc(collection(db, "users", user.uid, "documents"), {
                name: file.name,
                url: "local_processed", // Placeholder since we skipped Storage
                type: file.type,
                size: file.size,
                status: 'processed',
                driveFileId: driveFileId,
                parsedData: data,
                textContent: text,
                createdAt: new Date().toISOString()
            });

            console.log(`Document saved. ID: ${docRef.id}`);

            setUploading(false);
            setTimeout(() => {
                setUploadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[file.name];
                    return newProgress;
                });
            }, 500);

            fetchDocuments();
        } catch (error: any) {
            console.error("Upload/Process failed:", error);
            setUploading(false);
            setUploadProgress({});
            alert("Failed to process document: " + (error.message || "Unknown error"));
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        droppedFiles.forEach(handleUpload);
    }, [user, accessToken]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files);
            selectedFiles.forEach(handleUpload);
        }
    };

    const handleProcess = async (file: DocumentMeta) => {
        if (processingId) return;
        setProcessingId(file.id);
        try {
            const res = await fetch("/api/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileUrl: file.url, type: file.type })
            });
            const { data, text, error } = await res.json();

            if (error) throw new Error(error);

            const docRef = doc(db, "users", user!.uid, "documents", file.id);
            await updateDoc(docRef, {
                parsedData: data,
                textContent: text,
                status: 'processed'
            });

            fetchDocuments();
        } catch (error: any) {
            console.error("Processing error:", error);
            alert("Failed to process document: " + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) return (
        <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p>Loading your space...</p>
        </div>
    );

    if (!user) return null;

    const firstName = user.displayName ? user.displayName.split(" ")[0] : "Student";



    const handleLinkImport = async (urlToImport?: string, importedTitle?: string) => {
        const urlObj = urlToImport || linkInput;
        if (!urlObj || !urlObj.trim()) return;

        const statusKey = urlToImport ? urlObj : 'MAIN_INPUT';

        // Show progress bar (mimic file upload)
        const displayKey = `Importing: ${urlObj.length > 30 ? urlObj.slice(0, 30) + '...' : urlObj}`;
        setUploadProgress(prev => ({ ...prev, [displayKey]: 0 }));

        // Simulate progress
        const progressInterval = setInterval(() => {
            setUploadProgress(prev => {
                const current = prev[displayKey] || 0;
                if (current >= 90) return prev;
                return { ...prev, [displayKey]: current + 10 };
            });
        }, 500);

        setImportStatus(prev => ({ ...prev, [statusKey]: 'IMPORTING' }));
        if (!urlToImport) setLinkSuccess(null);

        try {
            const res = await fetch("http://localhost:8000/process-link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: urlObj })
            });

            clearInterval(progressInterval);

            if (!res.ok) {
                let errorMessage = "Link processing failed";
                try {
                    const errorObj = await res.json();
                    errorMessage = errorObj.detail || errorMessage;
                } catch {
                    const textErr = await res.text();
                    if (textErr) errorMessage = textErr.slice(0, 100);
                }
                throw new Error(errorMessage);
            }

            const { title, data, text, sourceType, originalUrl } = await res.json();

            // Complete progress logic
            setUploadProgress(prev => ({ ...prev, [displayKey]: 100 }));

            // Save to Firestore
            let docName = (title !== "Imported Link" && title) ? title : importedTitle || (sourceType === 'youtube' ? 'YouTube Video' : 'Web Article');
            if (docName.length > 60) docName = docName.slice(0, 60) + '...';

            await addDoc(collection(db, "users", user.uid, "documents"), {
                name: docName,
                url: originalUrl,
                type: sourceType === 'youtube' ? 'video/youtube' : 'text/html',
                size: text.length,
                status: 'processed',
                driveFileId: null,
                parsedData: data,
                textContent: text,
                createdAt: new Date().toISOString()
            });

            setImportStatus(prev => ({ ...prev, [statusKey]: 'IMPORTED' }));

            if (!urlToImport) {
                setLinkInput("");
                setLinkSuccess("Successfully added to your library! 🚀");
                setTimeout(() => setLinkSuccess(null), 5000);
            }

            // Clear status and progress after delay
            setTimeout(() => {
                setImportStatus(prev => {
                    const newState = { ...prev };
                    delete newState[statusKey];
                    return newState;
                });
                setUploadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[displayKey];
                    return newProgress;
                });
            }, 3000);

            fetchDocuments();

        } catch (error: any) {
            clearInterval(progressInterval);
            console.warn("Link import failed:", error.message);

            setImportStatus(prev => ({ ...prev, [statusKey]: 'FAILED' }));
            setUploadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[displayKey];
                return newProgress;
            });

            if (!urlToImport) {
                alert(`Could not import link: ${error.message}`);
            }

            setTimeout(() => {
                setImportStatus(prev => {
                    const newState = { ...prev };
                    delete newState[statusKey];
                    return newState;
                });
            }, 3000);
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setSearching(true);
        setSearchResults([]);

        try {
            // Parallel search
            const [resourceRes, videoRes] = await Promise.all([
                fetch("http://localhost:8000/resources", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: searchQuery })
                }),
                fetch("http://localhost:8000/youtube", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: searchQuery })
                })
            ]);

            const resourceData = await resourceRes.json();
            const videoData = await videoRes.json();

            const combined = [
                ...(resourceData.resources || []).map((r: any) => ({ ...r, type: 'resource' })),
                ...(videoData.videos || []).map((v: any) => ({ ...v, type: 'video' }))
            ];

            setSearchResults(combined);
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setSearching(false);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>
                    <span className={styles.greetingText}>Great to see you, {firstName}!</span>
                    <span className={styles.rocketEmoji}>🚀</span>
                </h1>
                <p>Ready to excel? Your learning materials are synced and ready for a session.</p>
                {learningRate !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1rem', marginTop: '1rem', width: '100%' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '0.4rem 1rem', borderRadius: '999px', color: '#4ade80', fontWeight: 'bold' }}>
                            <span>📈</span> Learning Rate: <span style={{ color: '#fff' }}>{learningRate.toFixed(1)}</span> <span style={{ fontSize: '0.8rem', opacity: 0.8, marginLeft: '4px' }}>(Scale 1-10)</span>
                        </div>
                        {learningRateHistory.length > 0 && (
                            <div style={{ width: '100%', height: '200px', background: 'rgba(255,255,255,0.02)', padding: '1rem 1rem 0 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>15-Day Momentum Trend</h4>
                                <ResponsiveContainer width="100%" height={130}>
                                    <AreaChart data={learningRateHistory}>
                                        <defs>
                                            <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ background: '#0f172a', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', color: '#fff' }}
                                            itemStyle={{ color: '#4ade80', fontWeight: 'bold' }}
                                        />
                                        <Area type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorRate)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                )}
            </header>

            <div className={styles.actionGrid}>
                {/* 1. Upload Card */}
                <div
                    className={`${styles.actionCard} ${styles.uploadCard} ${dragging ? styles.activeDrop : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('fileInput')?.click()}
                >
                    <input
                        type="file"
                        id="fileInput"
                        className={styles.fileInput}
                        multiple
                        accept=".pdf,.txt,.docx,.pptx,.xlsx,.xls,.csv"
                        onChange={handleFileSelect}
                    />
                    <div className={styles.iconWrapper}>
                        {uploading ? '⏳' : '📥'}
                    </div>
                    <div className={styles.uploadText}>
                        <h3>{dragging ? "Drop to upload" : "Upload to EduMate"}</h3>
                        <p>PDF, DOCX, PPTX, Excel, CSV</p>
                    </div>
                </div>

                {/* 2. Link Input Card */}
                <div className={`${styles.actionCard} ${styles.onlineCard}`}>
                    <div className={`${styles.iconWrapper} ${importStatus['MAIN_INPUT'] === 'IMPORTING' ? animStyles.processing : ''}`} style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))', color: '#60a5fa' }}>
                        🔗
                    </div>
                    <div className={styles.uploadText}>
                        <h3>Import from Link</h3>
                        <p>YouTube Video or Website URL</p>
                    </div>
                    <div className={styles.searchContainer}>
                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                <input
                                    type="text"
                                    className={styles.searchInput}
                                    placeholder="Paste URL here..."
                                    value={linkInput}
                                    onChange={(e) => setLinkInput(e.target.value)}
                                    // wrapper function to handle enter key with optional arg issue
                                    onKeyDown={(e) => e.key === 'Enter' && handleLinkImport()}
                                />
                                <button
                                    className={styles.searchBtn}
                                    style={{ width: 'auto', padding: '0 1.5rem' }}
                                    onClick={() => handleLinkImport()}
                                    disabled={importStatus['MAIN_INPUT'] === 'IMPORTING'}
                                >
                                    {importStatus['MAIN_INPUT'] === 'IMPORTING' ? '⏳' :
                                        importStatus['MAIN_INPUT'] === 'IMPORTED' ? '✅' :
                                            '➔'}
                                </button>
                            </div>
                            {linkSuccess && (
                                <div className={animStyles.successMessage}>
                                    ✅ {linkSuccess}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Online Sources Section */}
            <section className={styles.resourcesSection}>
                <div className={`${styles.actionCard} ${styles.onlineCard}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', textAlign: 'left', minHeight: 'auto', gap: '4rem' }}>

                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <div className={styles.iconWrapper} style={{ width: 60, height: 60, fontSize: '1.5rem', marginBottom: 0, background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(168, 85, 247, 0.1))', color: 'var(--secondary)' }}>
                                🌐
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Online Sources</h3>
                                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Discover verified YouTube videos & web resources.</p>
                            </div>
                        </div>

                        <div className={styles.searchContainer} style={{ maxWidth: '100%' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                <input
                                    type="text"
                                    className={styles.searchInput}
                                    placeholder="Search Topic (e.g., Quantum Physics)..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                                <button className={styles.searchBtn} onClick={handleSearch} disabled={searching} style={{ width: 'auto', padding: '0 2rem' }}>
                                    {searching ? 'Searching...' : 'Search'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div style={{ flex: 1, height: '100%', minHeight: '200px' }}>
                        {searchResults.length > 0 ? (
                            <div className={styles.resultsList} style={{ maxHeight: '400px' }}>
                                {searchResults.map((result, idx) => {
                                    const itemKey = result.url || result.link;
                                    const itemStatus = importStatus[itemKey] || 'IDLE';

                                    return (
                                        <div key={idx} className={styles.resultItem}>
                                            <a href={result.url || result.link} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: '1rem', flex: 1, textDecoration: 'none', color: 'inherit' }}>
                                                {result.type === 'video' ? (
                                                    <img src={result.thumbnail} alt="" className={styles.resultThumb} />
                                                ) : (
                                                    <div className={styles.resultThumb} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', background: 'rgba(255,255,255,0.1)' }}>📄</div>
                                                )}
                                                <div className={styles.resultInfo}>
                                                    <h4>{result.title}</h4>
                                                    <span>{result.type === 'video' ? 'YouTube' : 'Web Resource'}</span>
                                                </div>
                                            </a>
                                            <button
                                                className={animStyles.importBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleLinkImport(itemKey, result.title);
                                                }}
                                                disabled={itemStatus === 'IMPORTING' || itemStatus === 'IMPORTED'}
                                                style={{ minWidth: '100px' }}
                                            >
                                                {itemStatus === 'IMPORTING' ? 'Importing...' :
                                                    itemStatus === 'IMPORTED' ? 'Imported' :
                                                        itemStatus === 'FAILED' ? 'Retry' :
                                                            'Import +'}
                                            </button>
                                        </div>
                                    )
                                })
                                }
                            </div>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', border: '2px dashed var(--glass-border)', borderRadius: 'var(--radius)' }}>
                                <p>Search results will appear here</p>
                            </div>
                        )}
                    </div>

                </div>
            </section>

            {Object.keys(uploadProgress).length > 0 && (
                <div className={styles.progressSection}>
                    <h3>Syncing materials...</h3>
                    {Object.entries(uploadProgress).map(([name, progress]) => (
                        <div key={name} className={styles.progressBarContainer}>
                            <div className={styles.progressBarLabel}>
                                <span>{name}</span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                            <div className={styles.progressBar}>
                                <div
                                    className={styles.progressBarFill}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <section className={styles.recentSection}>
                <div className={styles.recentHeader}>
                    <h2>Your Cloud Library</h2>
                    {files.length > 0 && <span>{files.length} items</span>}
                </div>

                {files.length > 0 ? (
                    <div className={styles.documentList}>
                        {files.map((file) => (
                            <div
                                key={file.id}
                                className={styles.docCard}
                                onClick={() => router.push(`/dashboard/file?id=${file.id}`)}
                            >
                                <div className={styles.docIcon}>
                                    {file.type.includes('youtube') ? '📺' : file.type.includes('html') ? '🌐' : file.type.includes('pdf') ? '📕' : '📄'}
                                </div>
                                <div className={styles.docInfo}>
                                    <h4>{file.name}</h4>
                                    <span>
                                        {(file.size / 1024 / 1024).toFixed(2)} MB • {new Date(file.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {file.driveFileId && <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '4px' }}>✓ Synced to Drive</div>}

                                    {/* Game Scores Overlay */}
                                    {(file.glossaryGlideBestScore || file.masterySprintBestScore) && (
                                        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {file.glossaryGlideBestScore && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '12px' }}>
                                                    🧠 {file.glossaryGlideBestScore} moves
                                                </span>
                                            )}
                                            {file.masterySprintBestScore && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '12px' }}>
                                                    🚀 Score: {file.masterySprintBestScore}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {processingId === file.id ? (
                                    <div className={styles.smallSpinner}></div>
                                ) : file.parsedData ? (
                                    <>
                                        <div className={styles.statusBadge}>Ready</div>
                                        {/* Mastery Bars */}
                                        <div className={styles.masteryContainer}>
                                            <div className={styles.masteryItem}>
                                                <div className={styles.masteryLabel}>
                                                    <span>Reading Mastery</span>
                                                    <span>{Math.round(file.readingMastery || 0)}%</span>
                                                </div>
                                                <div className={styles.progressBarTrack}>
                                                    <div
                                                        className={styles.progressBarFill}
                                                        style={{ width: `${file.readingMastery || 0}%`, background: 'linear-gradient(90deg, #3b82f6, #06b6d4)' }}
                                                    />
                                                </div>
                                            </div>
                                            <div className={styles.masteryItem}>
                                                <div className={styles.masteryLabel}>
                                                    <span>Test Mastery</span>
                                                    <span>{Math.round(file.testMastery || 0)}%</span>
                                                </div>
                                                <div className={styles.progressBarTrack}>
                                                    <div
                                                        className={styles.progressBarFill}
                                                        style={{ width: `${file.testMastery || 0}%`, background: 'linear-gradient(90deg, #8b5cf6, #ec4899)' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <button
                                        className={styles.processBtn}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleProcess(file);
                                        }}
                                    >
                                        AI Process
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>✨</div>
                        <h3>Your library is empty</h3>
                        <p>Upload files to sync them with Google Drive & AI.</p>
                    </div>
                )}
            </section>
            {/* Global Chat Assistant */}
            <GlobalChat documents={files} />
        </div>
    );
}
