const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Set up file upload with multer
const upload = multer({ storage: multer.memoryStorage() });

// --- Gemini Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- Helper Functions ---

// Function to generate structured content from Gemini
const parseDocumentContent = async (text) => {
    try {
        const prompt = `
            Analyze the following document content and provide:
            1. A concise summary (max 150 words).
            2. 5 key takeaways (bullet points).
            3. A glossary of 5-10 key terms with definitions.
            4. A short quiz with 3 multiple-choice questions (include options and correct answer).

            Return the response strictly in JSON format with the following structure:
            {
                "summary": "...",
                "keyTakeaways": ["...", "..."],
                "glossary": [{ "term": "...", "definition": "..." }, ...],
                "quiz": [{ "question": "...", "options": ["...", ...], "answer": "..." }, ...]
            }

            Document Content:
            ${text.substring(0, 30000)} 
        `; // Sending first 30k chars to avoid token limits

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();

        // Extract JSON from response (remove markdown code blocks if present)
        const jsonString = responseText.replace(/```json|```/g, "").trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Gemini Parsing Error:", error);
        throw new Error("Failed to generate AI content from document.");
    }
};

// --- Routes ---

// 1. Process Document Route
app.post('/process', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        let text = "";
        const buffer = req.file.buffer;
        const mimetype = req.file.mimetype;

        console.log(`Processing file: ${req.file.originalname} (${mimetype})`);

        if (mimetype === 'application/pdf') {
            const data = await pdf(buffer);
            text = data.text;
        } else if (mimetype === 'text/plain') {
            text = buffer.toString('utf-8');
        } else {
            return res.status(400).json({ error: "Unsupported file type. Only PDF and Text files are allowed." });
        }

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: "No text content found in document" });
        }

        // Send to Gemini
        console.log("Sending text to Gemini for analysis...");
        const structuredData = await parseDocumentContent(text);
        console.log("Analysis complete.");

        res.json({
            data: structuredData,
            text: text // Return raw text for chat context
        });

    } catch (error) {
        console.error("Processing Error:", error);
        res.status(500).json({ error: error.message || "Failed to process document" });
    }
});

// 2. Chat Route
app.post('/chat', async (req, res) => {
    try {
        const { message, context, history } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        const chat = model.startChat({
            history: history || [],
        });

        const prompt = `
            Context from the document:
            ${context ? context.substring(0, 20000) : "No document context provided."}

            User Question: ${message}

            Answer the user's question based on the provided document context. If the answer is not in the context, use your general knowledge but mention that it's outside the document's scope. Keep the answer helpful and concise.
        `;

        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });

    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: "Failed to generate chat response" });
    }
});

// Start Server
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});
