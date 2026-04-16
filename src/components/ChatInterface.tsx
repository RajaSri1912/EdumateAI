"use client";
import React, { useState, useRef, useEffect } from "react";
import styles from "./ChatInterface.module.css";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Ensure this matches your firebase alias
import { useAuth } from "@/context/AuthContext";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatMessage {
    role: "user" | "model";
    parts: { text: string }[];
}

interface ChatInterfaceProps {
    documentId: string;
    documentName: string;
    textContent: string;
    initialMessages?: ChatMessage[];
    onClose?: () => void;
}

export default function ChatInterface({ documentId, documentName, textContent, initialMessages = [], onClose }: ChatInterfaceProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: ChatMessage = {
            role: "user",
            parts: [{ text: input }]
        };

        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput("");
        setLoading(true);

        try {
            const response = await fetch("http://localhost:8000/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: input,
                    context: textContent,
                    history: messages
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            const aiMsg: ChatMessage = {
                role: "model",
                parts: [{ text: data.reply }]
            };

            const updatedMessages = [...newMessages, aiMsg];
            setMessages(updatedMessages);

            // Optionally save chat history to Firestore
            if (user && documentId) {
                await updateDoc(doc(db, "users", user.uid, "documents", documentId), {
                    chatHistory: updatedMessages
                });
            }

        } catch (error) {
            console.error("Chat error:", error);
            const errorMsg: ChatMessage = {
                role: "model",
                parts: [{ text: "Sorry, I encountered an error. Please try again." }]
            };
            setMessages([...newMessages, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.chatContainer}>
            <div className={styles.chatHeader}>
                <h3>Chat with {documentName}</h3>
                {onClose && (
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                )}
            </div>

            <div className={styles.messagesContainer} style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#6b7280', marginTop: '2rem' }}>
                        <p>Ask me anything about this document! 🧠⚡</p>
                    </div>
                )}
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.aiMessage}`}
                    >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.parts[0].text}
                        </ReactMarkdown>
                    </div>
                ))}
                {loading && (
                    <div style={{ alignSelf: 'flex-start', padding: '0.5rem 1rem', background: '#f3f4f6', borderRadius: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                        EduMate is analyzing... ⚡
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
                <input
                    type="text"
                    className={styles.chatInput}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Drop a question here..."
                    disabled={loading}
                />
                <button
                    className={styles.sendButton}
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                >
                    Send
                </button>
            </div>
        </div>
    );
}
