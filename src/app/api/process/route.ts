import { NextRequest, NextResponse } from "next/server";
import { parseDocumentContent } from "@/lib/gemini";

// Polyfill for browser APIs missing in Node environments but required by pdf-parse/pdfjs
if (typeof global.DOMMatrix === "undefined") {
    // @ts-ignore
    global.DOMMatrix = class DOMMatrix { constructor() { } };
}
if (typeof global.DOMPoint === "undefined") {
    // @ts-ignore
    global.DOMPoint = class DOMPoint { constructor() { } };
}
if (typeof global.Path2D === "undefined") {
    // @ts-ignore
    global.Path2D = class Path2D { constructor() { } };
}

export async function POST(req: NextRequest) {
    try {
        let pdfParser = require("pdf-parse");
        // Handle commonjs/esm interop weirdness regarding default export
        // @ts-ignore
        if (pdfParser.default) pdfParser = pdfParser.default;
        const contentType = req.headers.get("content-type") || "";

        let text = "";
        let fileName = "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file") as File;

            if (!file) {
                return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
            }

            fileName = file.name;
            const buffer = Buffer.from(await file.arrayBuffer());

            if (file.type.includes("pdf")) {
                const data = await pdfParser(buffer);
                text = data.text;
            } else if (file.type.includes("text") || file.type.includes("plain")) {
                text = buffer.toString("utf-8");
            } else {
                return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
            }
        } else {
            // Fallback to JSON/URL method
            const { fileUrl, type } = await req.json();
            if (!fileUrl) {
                return NextResponse.json({ error: "Missing file URL" }, { status: 400 });
            }

            if (type.includes("pdf")) {
                const response = await fetch(fileUrl);
                const buffer = await response.arrayBuffer();
                const data = await pdfParser(Buffer.from(buffer));
                text = data.text;
            } else if (type.includes("text") || type.includes("plain")) {
                const response = await fetch(fileUrl);
                text = await response.text();
            } else {
                return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
            }
        }

        if (!text || text.trim().length === 0) {
            return NextResponse.json({ error: "No text content found in document" }, { status: 400 });
        }

        // Send to Gemini for processing
        const structuredData = await parseDocumentContent(text);

        return NextResponse.json({
            data: structuredData,
            text: text // Return the raw text for chat context
        });
    } catch (error: any) {
        console.error("Processing API Error:", error);
        return NextResponse.json({ error: error.message || "Failed to process document" }, { status: 500 });
    }
}
