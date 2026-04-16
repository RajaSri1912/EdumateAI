import { NextRequest, NextResponse } from "next/server";
import { model } from "@/lib/gemini";

export async function POST(req: NextRequest) {
    try {
        const { message, context, history } = await req.json();

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        const chat = model.startChat({
            history: history || [],
            generationConfig: {
                maxOutputTokens: 1000,
            },
        });

        // Construct the prompt with context
        const prompt = `
Context from the document:
${context ? context.substring(0, 30000) : "No context provided."} 
(Note: Context might be truncated if too long)

User Question: ${message}

Answer the user's question based on the provided context. If the answer is not in the context, say so, but try to be helpful based on general knowledge if appropriate, while clarifying it's not from the document.
`;

        const result = await chat.sendMessage(prompt);
        const response = result.response;
        const text = response.text();

        return NextResponse.json({ reply: text });
    } catch (error: any) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ error: error.message || "Failed to generate response" }, { status: 500 });
    }
}
