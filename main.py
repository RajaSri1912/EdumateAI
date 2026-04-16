import os
import json
import logging
from io import BytesIO
from typing import List, Optional
from google import genai
from google.genai import types
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader
from dotenv import load_dotenv
from deep_translator import GoogleTranslator
import docx
import pptx
import pandas as pd
import io

# Configure logging
logging.basicConfig(filename='backend.log', level=logging.DEBUG, 
                    format='%(asctime)s %(levelname)s: %(message)s')

load_dotenv()

app = FastAPI(debug=True)
# translator = Translator() # Removed buggy googletrans

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TranslationRequest(BaseModel):
    text: str
    target_lang: str

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("WARNING: GEMINI_API_KEY not found in environment variables.")

client = genai.Client(api_key=api_key) if api_key else genai.Client()
GEMINI_MODEL = 'gemini-2.5-flash'

@app.post("/translate")
async def translate_text(request: TranslationRequest):
    try:
        # Check if text is valid
        if not request.text:
            return {"translated_text": ""}
            
        # Perform translation using deep_translator
        translated = GoogleTranslator(source='auto', target=request.target_lang).translate(request.text)
        return {"translated_text": translated}
    except Exception as e:
        logging.error(f"Translation Error: {e}")
        print(f"Translation failed: {e}")
        # Return original text as fallback as requested by user
        return {"translated_text": request.text}

# --- Helper Functions ---

def extract_text_from_pdf(file_content: bytes) -> str:
    try:
        pdf_reader = PdfReader(BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() or ""
        return text
    except Exception as e:
        print(f"Error extracting PDF text: {e}")
        raise HTTPException(status_code=400, detail="Failed to parse PDF file.")

def extract_text_from_docx(file_content: bytes) -> str:
    try:
        doc = docx.Document(BytesIO(file_content))
        text = "\n".join([para.text for para in doc.paragraphs])
        return text
    except Exception as e:
        print(f"Error extracting DOCX text: {e}")
        raise HTTPException(status_code=400, detail="Failed to parse DOCX file.")

def extract_text_from_pptx(file_content: bytes) -> str:
    try:
        prs = pptx.Presentation(BytesIO(file_content))
        text = []
        for slide in prs.slides:
            for shape in slide.shapes:
                if hasattr(shape, "text"):
                    text.append(shape.text)
        return "\n".join(text)
    except Exception as e:
        print(f"Error extracting PPTX text: {e}")
        raise HTTPException(status_code=400, detail="Failed to parse PPTX file.")

def extract_text_from_excel_csv(file_content: bytes, filename: str) -> str:
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(file_content))
        else:
            df = pd.read_excel(BytesIO(file_content))
        return df.to_string()
    except Exception as e:
        print(f"Error extracting Excel/CSV text: {e}")
        raise HTTPException(status_code=400, detail="Failed to parse Spreadsheet file.")

async def analyze_document_with_gemini(text: str) -> dict:
    try:
        prompt = """
        You are EduMate, a high-energy learning assistant. Your goal is to help the user master their materials and level up their knowledge.
        Analyze the following document content and provide tailored insights for three difficulty levels: Basic, Intermediate, and Advanced.

        TONE AND STYLE:
        - Maintain a professional yet extremely motivating and high-energy tone.
        - Use emojis to make the content engaging and visually structured (e.g., ⚡, 🚀, 🧠, ✅).
        - Act as a personal mentor who is excited about the user's progress.

        For EACH level (Basic, Intermediate, Advanced), provide:
         - A Summary (Basic: simple and clear, <100 words; Intermediate: standard, ~150 words; Advanced: detailed and technical, ~200 words)
         - Key Takeaways (Basic: 3 main points with emojis; Intermediate: 5 points; Advanced: 5-7 detailed points).

        Also provide:
         - A Glossary of 5-10 key terms (definitions should be clear and professional).

        Return strictly ONLY valid JSON with no markdown formatting:
        {
            "basic": {
                "summary": "...",
                "keyTakeaways": ["...", "..."]
            },
            "intermediate": {
                "summary": "...",
                "keyTakeaways": ["...", "..."]
            },
            "advanced": {
                "summary": "...",
                "keyTakeaways": ["...", "..."]
            },
            "glossary": [{ "term": "...", "definition": "..." }, ...]
        }

        Document Content:
        """ + text[:30000] # Limit content to avoid token limits

        token_count = client.models.count_tokens(model=GEMINI_MODEL, contents=prompt).total_tokens
        print(f"Token count: {token_count}")
        response = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        
        # Clean up response text to ensure valid JSON
        json_str = response.text.strip()
        if json_str.startswith("```json"):
            json_str = json_str[7:]
        if json_str.endswith("```"):
            json_str = json_str[:-3]
        
        # Simple validation/parsing
        import json
        return json.loads(json_str)
    except Exception as e:
        print(f"Gemini Analysis Error: {e}")
        # Log the full traceback if available
        logging.error(f"Gemini Analysis Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate AI analysis: {str(e)}")


# --- Routes ---

@app.get("/")
def read_root():
    return {"status": "ok", "message": "EduMate AI Backend is running (Gemini)"}

@app.post("/process")
async def process_document(file: UploadFile = File(...)):
    try:
        content = await file.read()
        filename = file.filename
        content_type = file.content_type
        
        text = ""
        print(f"Processing file: {filename} ({content_type})")

        if "pdf" in content_type or filename.endswith(".pdf"):
            print("Attempting to extract text from PDF...")
            text = extract_text_from_pdf(content)
            print(f"Extracted {len(text)} characters from PDF.")
        elif "wordprocessingml" in content_type or filename.endswith(".docx"):
            print("Attempting to extract text from DOCX...")
            text = extract_text_from_docx(content)
        elif "presentationml" in content_type or filename.endswith(".pptx"):
            print("Attempting to extract text from PPTX...")
            text = extract_text_from_pptx(content)
        elif "spreadsheet" in content_type or filename.endswith(".xlsx") or filename.endswith(".xls") or filename.endswith(".csv"):
            print("Attempting to extract text from Spreadsheet...")
            text = extract_text_from_excel_csv(content, filename)
        elif "text" in content_type or "plain" in content_type:
            text = content.decode("utf-8")
        else:
             # Fallback: try to read as text if unknown but looks like text, or error
             try:
                 text = content.decode("utf-8")
             except:
                 print(f"Unsupported content type: {content_type}")
                 raise HTTPException(status_code=400, detail="Unsupported file type.")

        if not text.strip():
             print("Text extraction resulted in empty string.")
             raise HTTPException(status_code=400, detail="No extractable text found. If this is a scanned PDF (images), this app cannot read it yet.")

        print("Sending text to Gemini...")
        analysis_result = await analyze_document_with_gemini(text)
        print("Analysis complete.")

        return {
            "data": analysis_result,
            "text": text
        }

    except HTTPException as he:
        print(f"HTTPException: {he.detail}")
        raise he
    except Exception as e:
        print(f"Error processing document: {e}")
        logging.error(f"Processing Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class QuizRequest(BaseModel):
    text: str
    mode: str = "intermediate"

@app.post("/quiz")
async def generate_quiz(request: QuizRequest):
    try:
        text = request.text
        mode = request.mode.lower()
        
        prompt = f"""
        You are EduMate, a high-energy study mentor. 
        Generate a {mode}-level quiz based on the following document content. 
        The goal is to challenge the user and help them achieve mastery.
        
        Requirements:
        1. Create EXACTLY 10 multiple-choice questions.
        2. Difficulty: {mode} (
           - basic: straightforward recall
           - intermediate: concept application
           - advanced: deep analytical understanding
        )
        3. Each question must have 4 options and the correct answer clearly indicated.
        4. Frame the quiz as an exciting challenge to test their progress.
        
        Return strictly ONLY valid JSON with no markdown formatting:
        {{
            "quiz": [
                {{
                    "question": "...",
                    "options": ["...", "...", "...", "..."],
                    "answer": "..." (must match one of the options text exactly)
                }},
                ... (10 questions total)
            ]
        }}
        
        Document Content:
        """ + text[:25000] # Provide enough context

        print(f"Generating {mode} quiz with Gemini. Input length: {len(text)}")
        response = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        
        json_str = response.text.strip()
        if json_str.startswith("```json"):
            json_str = json_str[7:]
        if json_str.endswith("```"):
            json_str = json_str[:-3]
            
        return json.loads(json_str)

    except Exception as e:
        print(f"Quiz Generation Error: {e}")
        logging.error(f"Quiz Gen Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate quiz.")

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    history: Optional[List[dict]] = None

@app.post("/chat")
async def chat_with_document(request: ChatRequest):
    try:
        # Construct chat history for Gemini
        formatted_history = []
        if request.history:
            for msg in request.history:
                role = "user" if msg.get("role") == "user" else "model"
                formatted_history.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.get("content", ""))]))

        chat = client.chats.create(model=GEMINI_MODEL, history=formatted_history)
        
        context_text = request.context[:20000] if request.context else "No document context."
        
        prompt = f"""
        Context from the document:
        {context_text}

        User Question: {request.message}

        You are EduMate, a high-energy, motivating AI tutor. 
        - Use relevant emojis to maintain excitement (⚡, 🧠, ✨, 🚀, etc.).
        - Focus on being extremely helpful, encouraging, and punchy.
        - Treat the user as a high-performer on their way to mastering this subject.
        - If the answer is in the document, highlight it clearly with high energy.
        - If it's outside the scope, mention it professionally but keep the motivation high.
        """
        
        response = chat.send_message(prompt)
        return {"reply": response.text}

    except Exception as e:
        print(f"Chat Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate chat response.")


class YouTubeRequest(BaseModel):
    query: str

@app.post("/youtube")
async def get_youtube_suggestions(request: YouTubeRequest):
    try:
        if not request.query:
            return {"videos": []}
            
        prompt = f"""
        You are a world-class educational consultant. Your mission is to PINPOINT the top 4 absolute best, highest-quality YouTube playlists or courses for learning: "{request.query}".
        
        ### MISSION
        Find 4 specific, high-impact YouTube playlists or full courses that will take the user from their current level to mastery in "{request.query}". 
        Avoid generic "intro" playlists unless strictly necessary for this specific path.
        
        ### EXTREME PINPOINTING RULES:
        1. RELEVANCE: Every recommendation must be directly tied to "{request.query}".
        2. VERIFICATION: Use your search tool to confirm the playlists are currently active and highly-rated.
        3. LINKS: To ensure the links never break (404s), follow this exact platform-specific search query format:
           - YouTube: https://www.youtube.com/results?search_query={{URL_ENCODED_PLAYLIST_NAME}}
        4. DESCRIPTIONS: Write a 3-sentence powerful justification for why THIS specific playlist is the perfect "Deep Dive" for their goal.
        5. RATINGS: Mention the rating and number of reviews/views in the description if available.
        6. MODULES: Provide an accurate count of videos/modules in the playlist (e.g. 17).
        
        Return a JSON array of exactly 4 objects strictly in this exact format. Do not add markdown or extra text:
        {{
            "videos": [
                {{
                    "title": "Pinpointed Title (e.g. 'Beginner Knitters 101 Playlist')",
                    "provider": "YOUTUBE PLAYLISTS",
                    "description": "Specific reasoning: Why this fits their goal + Verified Rating/Reviews.",
                    "modules": 17,
                    "link": "https://www.youtube.com/results?search_query=Beginner+Knitters+101+Playlist"
                }}
            ]
        }}
        """
        
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearchRetrieval())]
            )
        )
        
        json_str = response.text.strip()
        if json_str.startswith("```json"):
            json_str = json_str[7:]
        if json_str.endswith("```"):
            json_str = json_str[:-3]
            
        data = json.loads(json_str)
        videos = []
        
        import urllib.parse
        
        for v in data.get("videos", []):
            link = (v.get("link") or "").strip()
            title = v.get("title", "YouTube Playlist")
            
            # Bulletproof enforcement: Always convert to a safe search query if it's a direct playlist link 
            # or if it's empty, to completely eliminate 404s.
            if not link or "playlist?list=" in link or "watch?v=" in link:
                safe_query = urllib.parse.quote_plus(title + " playlist")
                link = f"https://www.youtube.com/results?search_query={safe_query}"
            
            videos.append({
                "title": title,
                "link": link,
                "provider": v.get("provider", "YOUTUBE PLAYLISTS"),
                "description": v.get("description", "A great comprehensive resource."),
                "modules": v.get("modules", 0)
            })
            
        return {"videos": videos}
    except Exception as e:
        print(f"YouTube Search Error: {e}")
        # Build fallback link
        fallback_link = f"https://www.youtube.com/results?search_query={request.query.replace(' ', '+')}"
        return {"videos": [], "fallback": fallback_link}

class ResourceRequest(BaseModel):
    query: str

@app.post("/resources")
async def get_online_resources(request: ResourceRequest):
    try:
        prompt = f"""
        You are EduMate. The user wants to learn about "{request.query}".
        Provide a brief, high-energy overview of this topic (2-3 sentences).
        Then, list 3-5 TRUSTED, actual websites or online resource types where they can learn more (e.g., Coursera, documentation, specific reliable domains).
        
        Return STRICTLY JSON:
        {{
            "overview": "...",
            "resources": [
                {{ "title": "...", "url": "...", "description": "..." }},
                ...
            ]
        }}
        """
        response = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        json_str = response.text.strip()
        if json_str.startswith("```json"):
            json_str = json_str[7:]
        if json_str.endswith("```"):
            json_str = json_str[:-3]
            
        return json.loads(json_str)
    except Exception as e:
        print(f"Resource Gen Error: {e}")
        return {
            "overview": f"Here are some resources for {request.query}.",
            "resources": [
                {"title": "Wikipedia", "url": f"https://en.wikipedia.org/wiki/{request.query.replace(' ', '_')}", "description": "General overview"}
            ]
        }

class LinkRequest(BaseModel):
    url: str

@app.post("/process-link")
async def process_link_content(request: LinkRequest):
    try:
        url = request.url.strip()
        text_content = ""
        source_type = "website"
        title = "Imported Link"

        print(f"Processing Link: {url}")

        # 1. Check if YouTube
        if "youtube.com" in url or "youtu.be" in url:
            source_type = "youtube"
            try:
                import requests
                try:
                    oembed_res = requests.get(f"https://www.youtube.com/oembed?url={url}&format=json", timeout=5)
                    if oembed_res.status_code == 200:
                        title = oembed_res.json().get("title", "YouTube Video")
                except Exception as e:
                    title = "YouTube Video"

                from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
                
                # Extract video ID
                video_id = ""
                if "v=" in url:
                    video_id = url.split("v=")[1].split("&")[0]
                elif "youtu.be" in url:
                    video_id = url.split("/")[-1]
                
                if not video_id:
                    raise ValueError("Could not extract video ID")

                # Try to get transcript (English or generated)
                try:
                    print(f"DEBUG: Fetching transcript for video {video_id}")
                    # Use list_transcripts to get the best available one
                    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                    
                    # specific language or auto-generated
                    # Priorities: Manually created English -> Auto-generated English -> Any English
                    try:
                        transcript = transcript_list.find_manually_created_transcript(['en', 'en-US', 'en-GB'])
                    except:
                        try:
                            transcript = transcript_list.find_generated_transcript(['en', 'en-US', 'en-GB'])
                        except:
                            # If no English, take the first available and translate? 
                            # For now, just take English or fail
                            raise NoTranscriptFound("No English transcript found")
                    
                    fetched_transcript = transcript.fetch()
                    text_content = " ".join([snippet['text'] for snippet in fetched_transcript])
                
                except TranscriptsDisabled:
                    print("Transcripts are disabled for this video.")
                    raise HTTPException(status_code=400, detail="Subtitles are disabled for this video. Please choose a video with closed captions enabled.")
                except NoTranscriptFound:
                    print("No English transcript found.")
                    raise HTTPException(status_code=400, detail="No English transcript found for this video. Please choose a video with English captions.")
                except Exception as e:
                    # Fallback to older instance method if list_transcripts fails (e.g. library version issues)
                    # But actually `list_transcripts` is static in newer versions? 
                    # Previous exploration said `YouTubeTranscriptApi` has no static methods?
                    # Wait, Step 296 said `YouTubeTranscriptApi` is a CLASS in `_api.py`.
                    # And `list` IS a method on the instance `api.list(video_id)`.
                    # So `YouTubeTranscriptApi.list_transcripts` static call might fail if I don't instantiate.
                    
                    print(f"Standard fetch failed ({e}), trying instance fallback...")
                    try:
                         api = YouTubeTranscriptApi()
                         # Try list first
                         try:
                             transcript_list = api.list_transcripts(video_id)
                             transcript = transcript_list.find_generated_transcript(['en', 'en-US', 'en-GB'])
                             fetched_transcript = transcript.fetch()
                         except:
                             # Fallback to direct fetch
                             fetched_transcript = api.get_transcript(video_id, languages=['en', 'en-US', 'en-GB']) if hasattr(api, 'get_transcript') else api.fetch(video_id, languages=['en', 'en-US', 'en-GB'])
                             
                         text_pieces = []
                         for snippet in fetched_transcript:
                             if hasattr(snippet, 'text'):
                                 text_pieces.append(str(snippet.text))
                             elif isinstance(snippet, dict) and 'text' in snippet:
                                 text_pieces.append(str(snippet['text']))
                             else:
                                 text_pieces.append(str(snippet))
                         text_content = " ".join(text_pieces)
                    except TranscriptsDisabled:
                         raise HTTPException(status_code=400, detail="Subtitles are disabled for this video.")
                    except Exception as inner_e:
                        print(f"YouTube Transcript Instance Error: {inner_e}")
                        error_msg = str(inner_e)
                        if "Subtitles are disabled" in error_msg:
                            raise HTTPException(status_code=400, detail="Subtitles are disabled for this video.")
                        raise HTTPException(status_code=400, detail=f"Could not retrieve YouTube transcript. Error: {error_msg}")

                print(f"Extracted {len(text_content)} chars from YouTube transcript.")
            except Exception as e:
                 print(f"YouTube Error: {e}")
                 # Ensure we return a clean message if somehow a disabled error bubbled up
                 if "Disabled" in str(e) or "disabled" in str(e):
                     raise HTTPException(status_code=400, detail="Subtitles are disabled for this video.")
                 raise HTTPException(status_code=400, detail=f"YouTube processing error: {str(e)}")

        # 2. General Website (Newspaper3k)
        else:
            text_content = ""
            try:
                # 1. Try Newspaper3k first
                import nltk
                try:
                    nltk.data.find('tokenizers/punkt')
                except LookupError:
                    nltk.download('punkt', quiet=True)

                from newspaper import Article, Config
                
                # Use a real browser User-Agent
                config = Config()
                config.browser_user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                config.request_timeout = 10

                article = Article(url, config=config)
                article.download()
                article.parse()
                text_content = article.text
                if article.title:
                    title = article.title
            except Exception as e:
                print(f"Newspaper3k failed: {e}")
            
            # 2. Fallback: Requests + BeautifulSoup
            if not text_content:
                print("Falling back to Requests + BeautifulSoup...")
                try:
                    import requests
                    from bs4 import BeautifulSoup
                    
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                    response = requests.get(url, headers=headers, timeout=15)
                    response.raise_for_status()
                    
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    # Remove scripts, styles, interactions
                    for script in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
                        script.decompose()
                        
                    # Extract text
                    paragraphs = [p.get_text() for p in soup.find_all('p')]
                    text_content = "\n".join(paragraphs)
                    
                    if not text_content:
                        # Fallback to body text if no paragraphs
                        text_content = soup.get_text(separator=' ', strip=True)
                        
                    if title == "Imported Link" and soup.title and soup.title.string:
                        title = soup.title.string.strip()

                except Exception as e2:
                    print(f"BeautifulSoup fallback failed: {e2}")
                    raise HTTPException(status_code=400, detail=f"Could not extract text. Website might be blocked or empty. Error: {str(e2)}")
            
            if not text_content or len(text_content) < 50:
                 raise HTTPException(status_code=400, detail="Extracted text is too short or empty.")

            print(f"Extracted {len(text_content)} chars from Website.")

        if not text_content.strip():
             raise HTTPException(status_code=400, detail="Extracted text is empty.")

        # 3. Analyze with Gemini
        print("Sending link content to Gemini...")
        analysis_result = await analyze_document_with_gemini(text_content)
        
        return {
            "title": title,
            "data": analysis_result,
            "text": text_content,
            "sourceType": source_type,
            "originalUrl": url
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Link Processing Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
