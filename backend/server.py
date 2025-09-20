from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Agricultural Knowledge Base
AGRICULTURAL_KNOWLEDGE = """
You are Kisan Vani, an AI assistant for farmers. You provide accurate, helpful information about:

GOVERNMENT SCHEMES:
- PM-KISAN: ₹6,000 per year for small farmers (₹2,000 every 4 months)
- PMFBY: Crop insurance scheme with 50% premium support for small farmers
- PMKSY: Financial assistance for micro-irrigation systems
- PM-KMY: Pension scheme ₹3,000/month after age 60
- Soil Health Cards: Free soil analysis and recommendations
- Organic farming schemes and subsidies
- National Food Security Mission programs

PEST & DISEASE MANAGEMENT:
Common Pests: Aphids, Armyworms, Cutworms, Leaf Miners, Thrips, Whiteflies
Symptoms: Holes in leaves, wilting, stunted growth, discolored areas
Management: Use IPM (Integrated Pest Management)
- Cultural controls: Crop rotation, proper spacing, weeding
- Biological controls: Natural enemies like ladybird beetles
- Natural pesticides: Neem oil, garlic spray, wood ash

CROP DISEASES:
- Leaf spots, rust, bacterial wilt, stem rot
- Prevention: Good drainage, proper spacing, resistant varieties
- Treatment: Remove infected plants, use lime, Epsom salts

FERTILIZER RECOMMENDATIONS:
- Soil testing first for proper nutrient management
- Organic fertilizers: Compost, vermicompost, green manure
- NPK ratios based on crop needs
- Micronutrient supplements as per soil health cards

Always provide practical, actionable advice suitable for Indian farming conditions.
Respond in the language the farmer uses - Malayalam or English.
"""

# Initialize LLM Chat
async def get_ai_response(message: str, session_id: str, language: str = "english") -> str:
    try:
        # Create system message based on language
        system_message = AGRICULTURAL_KNOWLEDGE
        if language.lower() == "malayalam":
            system_message += "\n\nPlease respond in Malayalam when appropriate, especially for local terms and explanations."
        
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4o-mini")
        
        user_message = UserMessage(text=message)
        response = await chat.send_message(user_message)
        return response
    except Exception as e:
        logging.error(f"Error getting AI response: {e}")
        return "I'm sorry, I'm having trouble processing your request right now. Please try again."

# Define Models
class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    message: str
    response: str
    language: str = "english"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    message: str
    session_id: str
    language: str = "english"

class ChatResponse(BaseModel):
    id: str
    response: str
    timestamp: datetime

# FAQ Data
FAQ_DATA = {
    "english": [
        {
            "id": "1",
            "question": "What government schemes are available for farmers?",
            "answer": "Several schemes are available including PM-KISAN (₹6,000/year), PMFBY (crop insurance), PMKSY (irrigation support), and many more."
        },
        {
            "id": "2", 
            "question": "How to manage pest attacks on crops?",
            "answer": "Use Integrated Pest Management (IPM): crop rotation, biological controls, and natural pesticides like neem oil."
        },
        {
            "id": "3",
            "question": "What are the best fertilizers for my crops?",
            "answer": "First get soil testing done. Use organic fertilizers like compost and vermicompost, supplemented with NPK based on soil health cards."
        },
        {
            "id": "4",
            "question": "How to identify and treat plant diseases?",
            "answer": "Look for symptoms like leaf spots, wilting, or discoloration. Ensure good drainage, use resistant varieties, and remove infected plants."
        }
    ],
    "malayalam": [
        {
            "id": "1",
            "question": "കർഷകർക്കുള്ള സർക്കാർ പദ്ധതികൾ എന്തെല്ലാം?",
            "answer": "PM-KISAN (വർഷത്തിൽ ₹6,000), PMFBY (വിള ഇൻഷുറൻസ്), PMKSY (ജലസേചന സഹായം) എന്നിവയുൾപ്പെടെ നിരവധി പദ്ധതികൾ ലഭ്യമാണ്."
        },
        {
            "id": "2",
            "question": "വിളകളിലെ കീട ആക്രമണം എങ്ങനെ നിയന്ത്രിക്കാം?",
            "answer": "സംയോജിത കീട നിയന്ത്രണം (IPM) ഉപയോഗിക്കുക: വിള ഭ്രമണം, ജൈവിക നിയന്ത്രണം, വേപ്പെണ്ണ പോലുള്ള പ്രകൃതിദത്ത കീടനാശിനികൾ."
        },
        {
            "id": "3", 
            "question": "എന്റെ വിളകൾക്ക് ഏറ്റവും നല്ല വളം ഏതാണ്?",
            "answer": "ആദ്യം മണ്ണ് പരിശോധന നടത്തുക. കമ്പോസ്റ്റ്, കേഴുവളം പോലുള്ള ജൈവവളങ്ങൾ ഉപയോഗിച്ച്, മണ്ണിന്റെ ആരോഗ്യ കാർഡ് അനുസരിച്ച് NPK ചേർക്കുക."
        },
        {
            "id": "4",
            "question": "സസ്യരോഗങ്ങൾ എങ്ങനെ തിരിച്ചറിയാനും ചികിത്സിക്കാനും?",
            "answer": "ഇല പാടുകൾ, വാടൽ, നിറവ്യത്യാസം എന്നിവ ശ്രദ്ധിക്കുക. നല്ല നീർവാർച്ച ഉറപ്പാക്കുക, പ്രതിരോധശേഷിയുള്ള ഇനങ്ങൾ ഉപയോഗിക്കുക, രോഗബാധിതമായ ചെടികൾ നീക്കം ചെയ്യുക."
        }
    ]
}

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Kisan Vani API is running"}

@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest):
    try:
        # Get AI response
        ai_response = await get_ai_response(request.message, request.session_id, request.language)
        
        # Create chat message object
        chat_message = ChatMessage(
            session_id=request.session_id,
            message=request.message,
            response=ai_response,
            language=request.language
        )
        
        # Save to database
        await db.chat_messages.insert_one(chat_message.dict())
        
        return ChatResponse(
            id=chat_message.id,
            response=ai_response,
            timestamp=chat_message.timestamp
        )
    except Exception as e:
        logging.error(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail="Failed to process chat message")

@api_router.get("/faq/{language}")
async def get_faq(language: str):
    if language not in FAQ_DATA:
        raise HTTPException(status_code=400, detail="Language not supported")
    return FAQ_DATA[language]

@api_router.get("/chat-history/{session_id}")
async def get_chat_history(session_id: str):
    try:
        messages = await db.chat_messages.find(
            {"session_id": session_id}
        ).sort("timestamp", 1).to_list(100)
        
        return [
            {
                "id": msg["id"],
                "message": msg["message"],
                "response": msg["response"],
                "timestamp": msg["timestamp"],
                "language": msg.get("language", "english")
            }
            for msg in messages
        ]
    except Exception as e:
        logging.error(f"Error fetching chat history: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch chat history")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()