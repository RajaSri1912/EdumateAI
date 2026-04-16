import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export const parseDocumentContent = async (text: string) => {
    const prompt = `
        You are an expert educational assistant called EduMate AI. 
        I am giving you the raw text extracted from a study document. 
        Please process this text and return a structured JSON response with the following fields:
        1. "summary": A concise overview of the document (2-3 paragraphs).
        2. "keyTakeaways": An array of important bullet points.
        3. "glossary": An array of objects each containing "term" and "definition".
        4. "quiz": An array of 5 multiple-choice questions, each with "question", "options" (array of 4), and "correctAnswer" (index).

        Document Text:
        ${text}

        Return ONLY the JSON object.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const jsonText = response.text().replace(/```json|```/g, "").trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Gemini Parsing Error:", error);
        throw new Error("Failed to parse document with AI");
    }
};
