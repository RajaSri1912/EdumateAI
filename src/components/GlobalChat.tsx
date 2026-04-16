"use client";
import React, { useState, useRef, useEffect } from "react";
import styles from "./GlobalChat.module.css";
import { useAuth } from "@/context/AuthContext";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
    role: "user" | "model";
    parts: { text: string }[];
}

interface GlobalChatProps {
    documents: any[]; // List of user's documents with metadata
}

export default function GlobalChat({ documents }: GlobalChatProps) {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    const buildContext = () => {
        const userName = user?.displayName || "User";
        let context = `You are EduMate, a high-energy learning assistant for ${userName}. Your mission is to help them achieve total mastery of their materials and reach their full potential.
        
        The user has the following documents in their learning library:
        \n`;

        documents.forEach((doc, index) => {
            const summary = doc.parsedData?.summary || "No summary available.";
            context += `${index + 1}. **${doc.name}** (${doc.type}): ${summary}\n\n`;
        });

        context += `\nUse this context to answer questions with excitement. Use motivational emojis (⚡, 🧠, ✨, 🚀) and maintain a punchy, high-energy tone. If asked about something specific to a document that isn't in the summary, encourage them to open that document for deep-dive details.`;

        return context;
    };

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
            const context = buildContext();

            const response = await fetch("http://localhost:8000/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: input,
                    context: context,
                    history: messages.map(m => ({
                        role: m.role,
                        parts: m.parts // Send stripped parts to backend
                    }))
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

            setMessages([...newMessages, aiMsg]);

        } catch (error) {
            console.error("Global Chat error:", error);
            setMessages([...newMessages, {
                role: "model",
                parts: [{ text: "Sorry, I encountered an issue connecting to your learning assistant." }]
            }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Floating Action Button */}
            {!isOpen && (
                <button
                    className={styles.fab}
                    onClick={() => setIsOpen(true)}
                    title="Chat with EduMate AI"
                >
                    💬
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className={styles.chatWindow}>
                    <div className={styles.header}>
                        <div className={styles.headerTitle}>
                            <span className={styles.avatar}>🤖</span>
                            <div>
                                <h3>EduMate Assistant</h3>
                                <span className={styles.status}>Online • Access to {documents.length} docs</span>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className={styles.closeBtn}>×</button>
                    </div>

                    <div className={styles.messages}>
                        {messages.length === 0 && (
                            <div className={styles.welcome}>
                                <p>Hi {user?.displayName?.split(" ")[0]}! I can help you navigate your learnings. Ask me about your documents!</p>
                            </div>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`${styles.message} ${msg.role === 'user' ? styles.user : styles.ai}`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.parts[0].text}
                                </ReactMarkdown>
                            </div>
                        ))}
                        {loading && <div className={styles.typing}>Thinking...</div>}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className={styles.inputArea}>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Ask about your library..."
                            disabled={loading}
                        />
                        <button onClick={handleSend} disabled={loading || !input.trim()}>
                            ➤
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
