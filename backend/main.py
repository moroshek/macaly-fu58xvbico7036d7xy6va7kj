# main.py - WITH AGGRESSIVE DEBUGGING LOGS & SECURITY ENHANCEMENTS

import logging # Keep this at the very top
import os      # Keep this near the top for environment access
import re      # For SecureFormatter and other regex operations

# --- NEW: Secure Logging Formatter ---
class SecureFormatter(logging.Formatter):
    """Custom formatter that redacts sensitive data from log messages."""
    
    REDACTION_PATTERNS = [
        # Gemini API Key (as query param: key=VALUE)
        (re.compile(r'([?&]key=)[^&]+'), r'\1[REDACTED_GEMINI_KEY]'),
        # Hugging Face Token (Authorization: Bearer TOKEN)
        (re.compile(r'(Authorization\s*:\s*Bearer\s+)\S+'), r'\1[REDACTED_HF_TOKEN]'),
        # Ultravox API Key (X-API-Key: KEY) - Less likely in logs but good to have
        (re.compile(r'(X-API-Key\s*:\s*)\S+'), r'\1[REDACTED_ULTRAVOX_KEY]'),
        # Generic "token": "value" or "api_key": "value" in JSON-like strings or assignments
        (re.compile(r'("?(?:api_key|token|secret|password)"?\s*[:=]\s*"?)\S+("?)', re.IGNORECASE), r'\1[REDACTED_SENSITIVE_VALUE]\2'),
    ]

    def format(self, record):
        # Get the original formatted message (handles record.msg % record.args)
        message = super().format(record)
        
        for pattern, replacement in self.REDACTION_PATTERNS:
            message = pattern.sub(replacement, message)
        return message

# Configure logging AT THE VERY TOP and set level to DEBUG
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# --- NEW: Apply SecureFormatter to root logger's handlers ---
secure_formatter_instance = SecureFormatter(fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
for handler in logging.root.handlers:
    handler.setFormatter(secure_formatter_instance)
# --- END NEW ---

logger = logging.getLogger(__name__) # Get your specific logger

logger.critical("########## main.py: SCRIPT EXECUTION STARTED (Top Level) ##########")

try:
    logger.critical("########## main.py: Attempting initial imports... ##########")
    import json
    # import re # Already imported above
    import asyncio
    import requests 
    from typing import List # For type hinting validate_required_env_vars
    import sys # For sys.exit in __main__
    from fastapi import FastAPI, HTTPException, Request, Body
    from fastapi.responses import JSONResponse 
    from fastapi.middleware.cors import CORSMiddleware
    logger.critical("########## main.py: Initial imports SUCCEEDED. ##########")
except ImportError as e_import:
    logger.critical(f"########## main.py: FATAL IMPORT ERROR: {e_import} ##########", exc_info=True)
    raise # Re-raise to ensure Cloud Run sees the failure clearly

logger.critical("########## main.py: Defining constants and configuration variables... ##########")

# --- Environment Variables & Configuration ---
ULTRAVOX_API_KEY_ENV_VAR = "ULTRAVOX_API_KEY" 
ULTRAVOX_AGENT_ID = os.environ.get("ULTRAVOX_AGENT_ID", "fb42f359-003c-4875-b1a1-06c4c1c87376")
logger.critical(f"Attempted to load ULTRAVOX_AGENT_ID. Value: '{ULTRAVOX_AGENT_ID}' (Default was 'fb42f359-003c-4875-b1a1-06c4c1c87376')")
ULTRAVOX_API_BASE_URL = "https://api.ultravox.ai/api"
logger.critical(f"ULTRAVOX_API_BASE_URL set to: {ULTRAVOX_API_BASE_URL}")

GEMINI_API_KEY_ENV_VAR = "GEMINI_API_KEY"
AI2_GEMINI_MODEL_NAME_DEFAULT = "gemini-2.5-flash-preview-05-20"
AI2_GEMINI_MODEL_NAME = os.environ.get("AI2_GEMINI_MODEL_NAME", AI2_GEMINI_MODEL_NAME_DEFAULT) 
logger.critical(f"Attempted to load AI2_GEMINI_MODEL_NAME. Value: '{AI2_GEMINI_MODEL_NAME}' (Default was '{AI2_GEMINI_MODEL_NAME_DEFAULT}')")
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
logger.critical(f"GEMINI_API_BASE_URL set to: {GEMINI_API_BASE_URL}")

HF_API_TOKEN_ENV_VAR = "HF_API_TOKEN"
AI3_HF_ENDPOINT_URL_DEFAULT = "https://vvgxd2ms1kn7p2sq.us-east4.gcp.endpoints.huggingface.cloud"
AI3_HF_ENDPOINT_URL = os.environ.get("AI3_HF_ENDPOINT_URL", AI3_HF_ENDPOINT_URL_DEFAULT)
logger.critical(f"Attempted to load AI3_HF_ENDPOINT_URL. Value: '{AI3_HF_ENDPOINT_URL}' (Default was '{AI3_HF_ENDPOINT_URL_DEFAULT}')")

logger.critical("########## main.py: Constants and configurations defined. ##########")
logger.critical("########## main.py: Initializing FastAPI app object... ##########")
app = FastAPI(title="AI Medical Intake Backend", version="1.2.4_secure_debug") # Updated version
logger.critical("########## main.py: FastAPI app object INITIALIZED. ##########")

# --- CORS Configuration (Agnostic & More Secure) ---
logger.critical("########## main.py: Configuring CORS middleware... ##########")
_env_allowed_origins = os.environ.get("ALLOWED_ORIGINS")
if _env_allowed_origins: # If set to a non-empty string
    ALLOWED_ORIGINS = [origin.strip() for origin in _env_allowed_origins.split(',') if origin.strip()]
    if not ALLOWED_ORIGINS: # e.g., env_val was " , "
        logger.warning(f"ALLOWED_ORIGINS environment variable ('{_env_allowed_origins}') "
                       "was set but contained no valid origins after parsing. CORS will be highly restrictive (no origins allowed).")
        ALLOWED_ORIGINS = [] # Explicitly allow no origins in this case
    else:
        logger.info(f"CORS: Using ALLOWED_ORIGINS from env var: {ALLOWED_ORIGINS}")
else: # Not set, or set to empty string - use defaults
    ALLOWED_ORIGINS = [
        "http://localhost:3000", # Common frontend dev port
        "http://localhost:8081", # Another common local dev port for frontend
        "http://localhost:5173", # Vite default
        # IMPORTANT: Add your actual frontend production/staging URLs here
        # e.g., "https://your-app-frontend.your-domain.com"
    ]
    if _env_allowed_origins is None:
        logger.info(f"CORS: ALLOWED_ORIGINS environment variable not set. Defaulting to: {ALLOWED_ORIGINS}")
    else: # Was set to "" (empty string)
        logger.info(f"CORS: ALLOWED_ORIGINS environment variable was empty. Defaulting to: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # More specific than ["*"]
    allow_credentials=True, 
    allow_methods=["GET", "POST"],   # Specific methods
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"], # Specific headers
)
logger.critical(f"########## main.py: CORS middleware CONFIGURED. Allowed Origins: {ALLOWED_ORIGINS} ##########")


# --- Global Variables (to hold loaded keys/configs) ---
logger.critical("########## main.py: Initializing global key/config holders to None... ##########")
ULTRAVOX_API_KEY_VALUE = None
GEMINI_API_KEY_VALUE = None
HF_API_TOKEN_VALUE = None
AI3_HF_ENDPOINT_URL_VALUE = None

# --- QUICK FIX: Call management to prevent 4409 conflicts ---
call_cooldown = {}  # Simple in-memory cooldown tracking

logger.critical("########## main.py: Global key/config holders INITIALIZED. ##########")


# --- FastAPI Event Handlers ---
@app.on_event("startup")
async def startup_event():
    logger.critical("########## main.py @app.on_event('startup'): EXECUTION STARTED ##########")
    global ULTRAVOX_API_KEY_VALUE, GEMINI_API_KEY_VALUE, HF_API_TOKEN_VALUE, AI3_HF_ENDPOINT_URL_VALUE

    logger.critical(f"STARTUP: Attempting to load env var: {ULTRAVOX_API_KEY_ENV_VAR}")
    ULTRAVOX_API_KEY_VALUE = os.environ.get(ULTRAVOX_API_KEY_ENV_VAR)
    if not ULTRAVOX_API_KEY_VALUE:
        err_msg = f"❌ CRITICAL STARTUP FAILURE: Required environment variable '{ULTRAVOX_API_KEY_ENV_VAR}' is not set or is empty."
        logger.critical(err_msg)
        raise RuntimeError(err_msg)
    logger.critical(f"STARTUP: Successfully loaded {ULTRAVOX_API_KEY_ENV_VAR}. (Value Redacted from log by SecureFormatter if pattern matches)")

    logger.critical(f"STARTUP: Attempting to load env var: {GEMINI_API_KEY_ENV_VAR}")
    GEMINI_API_KEY_VALUE = os.environ.get(GEMINI_API_KEY_ENV_VAR)
    if not GEMINI_API_KEY_VALUE:
        err_msg = f"❌ CRITICAL STARTUP FAILURE: Required environment variable '{GEMINI_API_KEY_ENV_VAR}' is not set or is empty."
        logger.critical(err_msg)
        raise RuntimeError(err_msg)
    logger.critical(f"STARTUP: Successfully loaded {GEMINI_API_KEY_ENV_VAR}. (Value Redacted from log by SecureFormatter if pattern matches)")

    logger.critical(f"STARTUP: Attempting to load env var: {HF_API_TOKEN_ENV_VAR}")
    HF_API_TOKEN_VALUE = os.environ.get(HF_API_TOKEN_ENV_VAR)
    if not HF_API_TOKEN_VALUE:
        err_msg = f"❌ CRITICAL STARTUP FAILURE: Required environment variable '{HF_API_TOKEN_ENV_VAR}' is not set or is empty."
        logger.critical(err_msg)
        raise RuntimeError(err_msg)
    logger.critical(f"STARTUP: Successfully loaded {HF_API_TOKEN_ENV_VAR}. (Value Redacted from log by SecureFormatter if pattern matches)")
    
    logger.critical(f"STARTUP: Attempting to load env var: AI3_HF_ENDPOINT_URL (from global AI3_HF_ENDPOINT_URL)")
    AI3_HF_ENDPOINT_URL_VALUE = AI3_HF_ENDPOINT_URL 
    if not AI3_HF_ENDPOINT_URL_VALUE: # Simpler check, rely on default if env var not set for URL
         err_msg = f"❌ CRITICAL STARTUP FAILURE: AI3_HF_ENDPOINT_URL resolved to an empty value. Env var 'AI3_HF_ENDPOINT_URL' might be empty or default is problematic."
         logger.critical(err_msg)
         raise RuntimeError(err_msg)
    # Warning for default URL if actual env var was missing (original logic was a bit complex here, simplified)
    if AI3_HF_ENDPOINT_URL_VALUE == AI3_HF_ENDPOINT_URL_DEFAULT and not os.environ.get("AI3_HF_ENDPOINT_URL"):
        logger.warning(f"STARTUP: AI3_HF_ENDPOINT_URL is using its default value '{AI3_HF_ENDPOINT_URL_DEFAULT}'. Ensure this is intended if an override was expected via env var.")
    logger.critical(f"STARTUP: AI #3 Hugging Face Endpoint URL confirmed: '{AI3_HF_ENDPOINT_URL_VALUE}'")
    
    logger.critical(f"STARTUP: AI #2 (Summarization) will use Gemini model: '{AI2_GEMINI_MODEL_NAME}'")
    if AI2_GEMINI_MODEL_NAME == AI2_GEMINI_MODEL_NAME_DEFAULT and not os.environ.get("AI2_GEMINI_MODEL_NAME"):
        logger.warning(f"STARTUP: AI2_GEMINI_MODEL_NAME is using its default value '{AI2_GEMINI_MODEL_NAME_DEFAULT}'. Ensure this is intended if an override was expected via env var.")

    logger.critical(f"STARTUP: Ultravox Agent ID configured: '{ULTRAVOX_AGENT_ID}'")
    if ULTRAVOX_AGENT_ID == "fb42f359-003c-4875-b1a1-06c4c1c87376" and not os.environ.get("ULTRAVOX_AGENT_ID"): # Default UUID
        logger.warning(f"STARTUP: ULTRAVOX_AGENT_ID is using its default value. Ensure this is intended if an override was expected via env var.")

    logger.critical("########## main.py @app.on_event('startup'): EXECUTION COMPLETED SUCCESSFULLY ##########")

# --- Helper Function for Gemini API call (AI #2) ---
async def call_gemini_api(
    model_name: str, 
    prompt: str, 
    temperature: float = 0.2, 
    max_output_tokens: int = 4096,
    top_p: float = 0.95,
    top_k: int = 40
    ) -> str:
    if not GEMINI_API_KEY_VALUE:
        logger.error("Gemini API Key is not configured (global value missing).")
        raise HTTPException(status_code=503, detail="Gemini AI service is not configured (API key missing at call time).")

    effective_model_name = model_name.replace("models/", "") 
    # The API key in the URL will be redacted by SecureFormatter if logged
    api_url = f"{GEMINI_API_BASE_URL}/{effective_model_name}:generateContent?key={GEMINI_API_KEY_VALUE}"
    
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
            "topP": top_p,
            "topK": top_k,
        }
    }
    # Logged URL will have key redacted by SecureFormatter
    logger.info(f"Calling Gemini API with model: {effective_model_name} at URL (key redacted in logs): {api_url}")
    try:
        loop = asyncio.get_event_loop()
        # Timeout increased to 180s as per previous version
        response = await loop.run_in_executor(None, lambda: requests.post(api_url, headers=headers, json=payload, timeout=180))
        response.raise_for_status()
        result = response.json()
        if (result.get("candidates") and isinstance(result["candidates"], list) and 
            len(result["candidates"]) > 0 and result["candidates"][0].get("content") and
            result["candidates"][0]["content"].get("parts") and 
            isinstance(result["candidates"][0]["content"]["parts"], list) and
            len(result["candidates"][0]["content"]["parts"]) > 0 and
            "text" in result["candidates"][0]["content"]["parts"][0]):
            return result["candidates"][0]["content"]["parts"][0]["text"]
        if result.get("candidates") and result["candidates"][0].get("finishReason") != "STOP":
            finish_reason = result['candidates'][0].get('finishReason')
            logger.warning(f"Gemini generation for {effective_model_name} finished with reason: {finish_reason}.")
            if result.get("promptFeedback", {}).get("blockReason"):
                block_reason = result['promptFeedback']['blockReason']
                safety_ratings = result['promptFeedback'].get('safetyRatings')
                logger.error(f"Gemini prompt for {effective_model_name} blocked. Reason: {block_reason}. Ratings: {safety_ratings}")
                raise HTTPException(status_code=400, detail=f"Request blocked by AI safety filters: {block_reason}")
            if finish_reason == "MAX_TOKENS" and result["candidates"][0].get("content", {}).get("parts",[{}])[0].get("text"):
                 return result["candidates"][0]["content"]["parts"][0]["text"] 
            logger.warning(f"Gemini generation for {effective_model_name} resulted in finish reason '{finish_reason}' but no text content was found in the expected place.")
            return "" # Return empty string if no usable content
        logger.error(f"Could not parse Gemini response or unexpected format for {effective_model_name}: {json.dumps(result, indent=2)}")
        raise HTTPException(status_code=502, detail="Invalid response format from Gemini AI service.")
    except requests.exceptions.Timeout:
        logger.error(f"Timeout calling Gemini API for model {effective_model_name}")
        raise HTTPException(status_code=504, detail="Gemini AI service timeout.")
    except requests.exceptions.RequestException as e:
        # Exception string (e) might contain the URL with API key, SecureFormatter will handle redaction in logs.
        logger.error(f"Error calling Gemini API for model {effective_model_name}: {e}")
        detail_msg = f"Error communicating with Gemini AI service: {str(e)[:200]}..." # Truncate potentially long error
        status_code = 502 
        if e.response is not None:
            status_code = e.response.status_code
            try:
                error_content = e.response.json()
                # error_content itself might contain sensitive info if API echoes it; SecureFormatter helps if logged raw
                logger.error(f"Gemini API error details: {json.dumps(error_content)}") # Log the JSON error
                detail_msg = error_content.get("error", {}).get("message", e.response.text)
            except ValueError: 
                detail_msg = e.response.text
            if "model" in detail_msg.lower() and ("not found" in detail_msg.lower() or "does not exist" in detail_msg.lower() or "permission" in detail_msg.lower()):
                 logger.critical(f"The specified Gemini model '{effective_model_name}' was not found or is not accessible. Please verify the model name and your project's access permissions. Detail: {detail_msg}")
                 raise HTTPException(status_code=404, detail=f"The AI model '{effective_model_name}' for summarization was not found or is not accessible.")
        raise HTTPException(status_code=status_code, detail=detail_msg)

# --- Helper Function for Hugging Face API call (AI #3) ---
async def call_hf_inference_api(
    prompt: str, 
    temperature: float = 0.6, 
    max_new_tokens: int = 700,
    top_p: float = 0.9,
    do_sample: bool = True
    ) -> str:
    if not AI3_HF_ENDPOINT_URL_VALUE or not HF_API_TOKEN_VALUE:
        logger.error("Hugging Face Inference API URL or Token is not configured (global value missing).")
        raise HTTPException(status_code=503, detail="HF Inference service is not configured (config missing at call time).")

    # Authorization header value will be redacted by SecureFormatter if logged
    headers = {
        "Authorization": f"Bearer {HF_API_TOKEN_VALUE}",
        "Content-Type": "application/json"
    }
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": max_new_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "do_sample": do_sample,
            "return_full_text": False 
        }
    }
    logger.info(f"Calling Hugging Face Inference API at {AI3_HF_ENDPOINT_URL_VALUE}")
    try:
        loop = asyncio.get_event_loop()
        # Timeout 120s
        response = await loop.run_in_executor(None, lambda: requests.post(AI3_HF_ENDPOINT_URL_VALUE, headers=headers, json=payload, timeout=120))
        response.raise_for_status()
        result = response.json()
        if result and isinstance(result, list) and 'generated_text' in result[0]:
            return result[0]['generated_text']
        logger.error(f"Could not parse HF Inference API response or unexpected format: {result}")
        raise HTTPException(status_code=502, detail="Invalid response format from HF Inference service.")
    except requests.exceptions.Timeout:
        logger.error(f"Timeout calling HF Inference API: {AI3_HF_ENDPOINT_URL_VALUE}")
        raise HTTPException(status_code=504, detail="HF Inference service timeout.")
    except requests.exceptions.RequestException as e:
        # Exception string (e) might contain headers, SecureFormatter will handle redaction in logs.
        logger.error(f"Error calling HF Inference API: {e}")
        detail_msg = f"Error communicating with HF Inference service: {str(e)[:200]}..." # Truncate
        status_code = 502
        if e.response is not None:
            status_code = e.response.status_code
            try:
                detail_msg_json = e.response.json() 
                logger.error(f"HF API error details: {json.dumps(detail_msg_json)}")
                # Try to extract a meaningful message, be careful not to make detail_msg itself a huge JSON
                if isinstance(detail_msg_json, dict) and "error" in detail_msg_json:
                    detail_msg = str(detail_msg_json["error"])
                else:
                    detail_msg = e.response.text[:200] + "..." # Truncate if it's not a simple error string
            except ValueError:
                detail_msg = e.response.text[:200] + "..." # Truncate
        raise HTTPException(status_code=status_code, detail=detail_msg)

# --- Prompts and Helper Functions (Content unchanged from previous correct version) ---
AI2_SUMMARIZATION_SYSTEM_PROMPT = """## 1. CORE IDENTITY & PRIME DIRECTIVE

You are an AI Medical Summarization Specialist. Your **sole and primary mission** is to process a transcript of a patient medical intake interview and generate a single, clean, and structured **JSON object** containing a comprehensive summary. This JSON summary is for review by a clinical team and for programmatic input into other analytical systems. You must adhere strictly to the provided JSON output format and content guidelines.

---

## 2. INPUT SPECIFICATION

You will receive a text transcript of a medical intake interview conducted by a conversational AI assistant with a patient. The transcript will contain:
*   The AI assistant's questions and statements.
*   The patient's responses and statements.
*   Potentially, system notes or indicators within the transcript (e.g., `[PATIENT REQUESTED TO STOP INTERVIEW]`, `[EMERGENCY PROTOCOL ACTIVATED: REASON - CHEST PAIN]`). Pay attention to these as they may indicate an incomplete interview.

---

## 3. TASK: SUMMARIZATION & JSON OUTPUT FORMAT

Your task is to extract all relevant medical information from the provided transcript and organize it into a **single JSON object**.

If information for a specific section was not discussed or is not present in the transcript, use `null` or an empty string `""` for the corresponding JSON field value. Do not infer or invent information.

**Your final output MUST be a single JSON object structured as follows:**

{
  "chiefComplaint": "String or null",
  "historyOfPresentIllness": "String or null",
  "associatedSymptoms": "String or null",
  "pastMedicalHistory": "String or null",
  "medications": "String or null",
  "allergies": "String or null",
  "notesOnInteraction": "String or null"
}

**3.1. CONTENT GUIDELINES FOR EACH JSON FIELD:**

*   `chiefComplaint`:
    *   Extract the main reason(s) the patient is seeking care. (e.g., "Right knee pain and swelling")
    *   If not explicitly stated or interview terminated early: "Information not gathered." or state what was clearly implied before termination.

*   `historyOfPresentIllness`:
    *   Provide a detailed, chronological narrative paragraph summarizing the patient's current medical complaint. This should synthesize answers related to Location, Onset, Character, Associated Symptoms (those directly related to the chief complaint), Timing/Triggers, Exacerbating/Alleviating Factors, and Severity (LOCATES framework). (e.g., "The patient is a 45-year-old male presenting with a 2-day history of sharp pain in the right knee, which reportedly began after a fall from a bicycle. The pain is rated by the patient as 7/10 and is described as exacerbated by weight-bearing activities such as walking. Partial alleviation is reported with the application of ice...")
    *   If the interview was terminated early, summarize only what was obtained. (e.g., "Patient reported right knee pain. Onset was stated as two days prior, following a fall. Character of pain was described as sharp. Further details regarding associated symptoms, timing, exacerbating/alleviating factors, and severity were not obtained due to early termination of the interview.")

*   `associatedSymptoms`:
    *   List any other symptoms the patient mentioned that are not already detailed as part of the HPI narrative. (e.g., "Fever, chills.")
    *   If none reported or not gathered: "None reported by patient." or "Information not gathered."
    *   This section is for symptoms that might be secondary or not directly tied to the HPI's LOCATES elements but still relevant.

*   `pastMedicalHistory`:
    *   List any pre-existing medical conditions mentioned by the patient. (e.g., "Diabetes Type 2, Asthma.")
    *   If none reported or not gathered: "None reported by patient." or "Information not gathered."

*   `medications`:
    *   List all medications the patient reported taking, including over-the-counter drugs and supplements. Include dosages and frequency if provided. (e.g., "Metformin 500mg BID. Albuterol inhaler PRN.")
    *   If none reported or not gathered: "None reported by patient." or "Information not gathered."

*   `allergies`:
    *   List any drug, food, or environmental allergies mentioned by the patient, including the reaction if provided. (e.g., "Sulfa drugs (anaphylaxis), Peanuts (hives).")
    *   If none reported or not gathered: "No known drug allergies reported by patient." or "Information not gathered."

*   `notesOnInteraction` (If applicable):
    *   If the transcript indicates the interview was terminated early by patient request, or if an emergency protocol was invoked, provide a brief, factual note here. (e.g., "Interview terminated by patient request after discussing the HPI." or "Emergency protocol was invoked by the conversational AI due to the patient reporting [specific symptom like 'crushing chest pain']. Patient advised to call 911. No further history obtained.")
    *   If the interview completed normally without incident, this can be `null` or an empty string.

---

## 4. CRITICAL GUIDELINES FOR SUMMARIZATION

*   Objectivity: Report only what is stated in the transcript. Do not add interpretations or assumptions.
*   Accuracy: Ensure the summary accurately reflects the information provided by the patient.
*   Completeness (within transcript limits): Extract all relevant details for each section from the provided transcript.
*   Conciseness: Be direct and avoid unnecessary jargon or overly verbose phrasing, while still being comprehensive.
*   No Medical Advice or Diagnosis: Your role is to summarize, not to analyze or diagnose.
*   Strict Adherence to Format: The output MUST be a single JSON object structured exactly as specified.

---
"""

def prepare_analysis_prompt(summary_json_string: str) -> str | None:
    try:
        data = json.loads(summary_json_string)
    except json.JSONDecodeError:
        logger.error("Error: Invalid JSON input to prepare_analysis_prompt.")
        return None
    chief_complaint = data.get("chiefComplaint", "") or ""
    hpi = data.get("historyOfPresentIllness", "") or ""
    associated_symptoms = data.get("associatedSymptoms", "") or ""
    past_medical_history = data.get("pastMedicalHistory", "") or ""
    medications = data.get("medications", "") or ""
    allergies = data.get("allergies", "") or ""

    patient_summary_parts = []
    non_informative_phrases = {"information not gathered", "none reported", "none reported by patient", "no known drug allergies reported", "no known drug allergies reported by patient", ""}
    
    if chief_complaint and chief_complaint.lower() not in non_informative_phrases:
        patient_summary_parts.append(f"Chief Complaint: {chief_complaint}")
    if hpi and hpi.lower() not in non_informative_phrases:
        patient_summary_parts.append(f"History of Present Illness: {hpi}")
    if associated_symptoms and associated_symptoms.lower() not in non_informative_phrases:
        patient_summary_parts.append(f"Associated Symptoms: {associated_symptoms}")
    if past_medical_history and past_medical_history.lower() not in non_informative_phrases:
        patient_summary_parts.append(f"Past Medical History: {past_medical_history}")
    if medications and medications.lower() not in non_informative_phrases:
        patient_summary_parts.append(f"Current Medications: {medications}")
    if allergies and allergies.lower() not in non_informative_phrases:
        patient_summary_parts.append(f"Allergies: {allergies}")
    
    patient_summary_for_analysis = "\n".join(patient_summary_parts)

    if not patient_summary_for_analysis.strip():
        logger.warning("Warning: No substantive patient data to analyze after filtering. Cannot generate AI#3 prompt.")
        return None
    
    analysis_prompt = f"""You are an advanced medical AI assistant (e.g., a fine-tuned model like II-Medical-8B, or a general large language model) tasked with providing clinical analysis and potential treatment considerations for a healthcare provider.

PATIENT SUMMARY:
---
{patient_summary_for_analysis}
---

INSTRUCTIONS FOR YOUR RESPONSE:
1.  Based ONLY on the PATIENT SUMMARY provided above, generate a concise clinical analysis.
2.  Include potential differential diagnoses if appropriate, and suggest relevant next steps or treatment considerations.
3.  Your response is for a healthcare provider; use appropriate medical terminology.
4.  CRITICAL: Your entire response MUST be enclosed within <answer> and </answer> tags.
5.  CRITICAL: Do NOT repeat, echo, or paraphrase any part of the "PATIENT SUMMARY" input within your <answer></answer> tags. Your answer should begin directly with your clinical analysis.
6.  Focus SOLELY on the analysis, differential diagnoses, and treatment considerations. Avoid any conversational filler, greetings, or explanations of your process.

Example of desired output format:
<answer>
[Your direct clinical analysis, differential diagnoses, and treatment considerations based on the patient summary. No repetition of the input summary.]
</answer>

Begin your analysis now.
"""
    return analysis_prompt

def extract_answer_from_tags(text_with_tags: str, tag_name: str = "answer") -> str | None:
    match = re.search(rf'<{tag_name}>(.*?)</{tag_name}>', text_with_tags, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    logger.warning(f"Could not find <{tag_name}> tags in the provided text. Returning raw text.")
    return text_with_tags # Return raw text if tags not found, as per original logic

# --- API Endpoints (Content mostly unchanged, ensuring use of global API key VALUES) ---
@app.get("/health", summary="Health check endpoint")
async def health_check(): 
    logger.info("########## /health endpoint WAS CALLED AND IS OK ##########")
    return {"status": "ok", "message": "AI Medical Intake Backend is running."}

@app.post("/api/v1/initiate-intake", summary="Initiate Ultravox Medical Intake Call")
async def initiate_intake_call():
    logger.critical("########## /api/v1/initiate-intake endpoint CALLED ##########")
    
    # QUICK FIX: Simple cooldown to prevent 4409 conflicts
    import time
    current_time = time.time()
    
    # Clean old entries (older than 60 seconds) periodically
    if current_time % 100 == 0:  # Clean every ~100 calls
        call_cooldown.clear()
    
    # Check cooldown - prevent calls within 5 seconds
    last_call_time = call_cooldown.get("last_call", 0)
    if current_time - last_call_time < 5:
        logger.warning(f"Call attempted too soon. Last call: {last_call_time}, Current: {current_time}")
        raise HTTPException(
            status_code=429, 
            detail="Please wait a moment before starting another interview. Try again in a few seconds."
        )
    
    if not ULTRAVOX_API_KEY_VALUE:
        logger.error("Ultravox API Key is not available at time of call to /initiate-intake.")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable: Voice AI service not ready.")

    agent_call_url = f"{ULTRAVOX_API_BASE_URL}/agents/{ULTRAVOX_AGENT_ID}/calls"
    # Header X-API-Key value will be redacted by SecureFormatter if logged by requests/http client
    headers = {"Content-Type": "application/json", "X-API-Key": ULTRAVOX_API_KEY_VALUE}
    payload_data = {} 
    logger.info(f"Initiating Ultravox call for agent {ULTRAVOX_AGENT_ID}")
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: requests.post(agent_call_url, headers=headers, json=payload_data, timeout=20))
        response.raise_for_status()
        call_details = response.json()
        join_url, call_id = call_details.get("joinUrl"), call_details.get("callId")
        if not join_url:
            logger.error(f"joinUrl not found in Ultravox response: {call_details}")
            raise HTTPException(status_code=502, detail="Failed to get joinUrl from voice AI service.")
        
        # Record successful call creation
        call_cooldown["last_call"] = current_time
        logger.info(f"Ultravox call initiated successfully. Call ID: {call_id}")
        
        return {"joinUrl": join_url, "callId": call_id}
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling Ultravox API to initiate call: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Error contacting voice AI service: {str(e)[:200]}...")
    except Exception as e:
        logger.error(f"Unexpected error during intake initiation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during intake initiation.")

@app.post("/api/v1/submit-transcript", summary="Submit conversation transcript for processing")
async def submit_transcript(data: dict = Body(...)):
    logger.critical("########## /api/v1/submit-transcript endpoint CALLED ##########")
    transcript_text = data.get("transcript")
    call_id = data.get("callId", "N/A")

    if not transcript_text: raise HTTPException(status_code=400, detail="Missing transcript data.")
    if not GEMINI_API_KEY_VALUE: raise HTTPException(status_code=503, detail="AI#2 service unavailable (key missing at call time).")
    if not HF_API_TOKEN_VALUE or not AI3_HF_ENDPOINT_URL_VALUE: raise HTTPException(status_code=503, detail="AI#3 service unavailable (config missing at call time).")

    logger.info(f"Received transcript for callId {call_id}. Length: {len(transcript_text)} chars.")
    try:
        ai2_full_prompt = (
            f"{AI2_SUMMARIZATION_SYSTEM_PROMPT}\n\n"
            f"Transcript:\n{transcript_text}\n\n"
            "IMPORTANT REMINDER: Your entire response MUST be a single, valid JSON object. "
            "Do not include any other text, explanations, or markdown formatting like ```json ... ```. "
            "Only the raw JSON object is permitted."
        )
        logger.info(f"Calling AI #2 (Gemini model: {AI2_GEMINI_MODEL_NAME}) for Summarization...")
        ai2_response_str = await call_gemini_api(
            model_name=AI2_GEMINI_MODEL_NAME, 
            prompt=ai2_full_prompt
        )
        logger.info("AI #2 (Gemini) response received.")
        try:
            cleaned_ai2_response_str = re.sub(r'^```json\s*|\s*```, ', ai2_response_str.strip(), flags=re.MULTILINE | re.DOTALL).strip()
            summary_json_object = json.loads(cleaned_ai2_response_str)
            logger.info("AI #2 response successfully parsed as JSON.")
        except json.JSONDecodeError as je:
            logger.error(f"Failed to parse AI #2 (Gemini) response as JSON. Error: {je}. Response (first 500 chars): '{cleaned_ai2_response_str[:500]}'", exc_info=True)
            json_match = re.search(r'{.*}', cleaned_ai2_response_str, re.DOTALL) 
            if json_match:
                try:
                    summary_json_object = json.loads(json_match.group(0))
                    logger.info("AI #2 response successfully parsed as JSON after regex extraction.")
                except json.JSONDecodeError as je_retry:
                    logger.error(f"Still failed to parse AI #2 (Gemini) response as JSON after regex. Error: {je_retry}", exc_info=True)
                    raise HTTPException(status_code=502, detail="Medical summary generation failed: Invalid JSON format from AI#2 after retry.")
            else:
                raise HTTPException(status_code=502, detail="Medical summary generation failed: No valid JSON found in AI#2 response.")

        logger.info("Preparing prompt for AI #3 (Hugging Face Model)...")
        ai3_prompt = prepare_analysis_prompt(json.dumps(summary_json_object))
        if not ai3_prompt:
            logger.warning("No substantive data for AI #3 analysis.")
            return JSONResponse(status_code=200, content={
                "message": "Summary generated. Clinical analysis skipped due to insufficient data.",
                "summary": summary_json_object, "analysis": None
            })
        logger.info(f"Calling AI #3 (Hugging Face Endpoint: {AI3_HF_ENDPOINT_URL_VALUE}) for Analysis...")
        ai3_raw_response = await call_hf_inference_api(prompt=ai3_prompt)
        logger.info("AI #3 (HF) response received.")
        clinical_analysis_text = extract_answer_from_tags(ai3_raw_response, tag_name="answer")
        if clinical_analysis_text == ai3_raw_response and not ("<answer>" in ai3_raw_response and "</answer>" in ai3_raw_response) :
             logger.warning("AI #3 (HF) response did not contain <answer> tags as instructed. Using raw response.")
        else:
            logger.info("Successfully extracted/processed clinical analysis from AI #3 (HF).")
        return {"message": "Transcript processed successfully.", "summary": summary_json_object, "analysis": clinical_analysis_text}
    except HTTPException: raise 
    except Exception as e:
        logger.error(f"Unexpected error processing transcript for callId {call_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

logger.critical("########## main.py: Reached end of script before Uvicorn or conditional __main__ block. ##########")

# --- NEW: Helper for local dev env var validation ---
def validate_local_env_vars(vars_to_check: List[str]) -> List[str]:
    """Validate that specified environment variables are present for local execution."""
    missing = []
    for var_name in vars_to_check:
        if not os.environ.get(var_name):
            missing.append(var_name)
    return missing

if __name__ == "__main__":
    logger.critical("########## main.py: Running in __main__ block (LOCAL DEVELOPMENT ONLY) ##########")
    
    # --- MODIFIED: No default API keys. Validate presence for local run. ---
    logger.critical("Validating required environment variables for local run...")
    REQUIRED_ENV_VARS_FOR_LOCAL = [
        ULTRAVOX_API_KEY_ENV_VAR,
        GEMINI_API_KEY_ENV_VAR,
        HF_API_TOKEN_ENV_VAR
        # URLs/IDs will use defaults if not set, which is acceptable for local if intended.
    ]
    missing_vars = validate_local_env_vars(REQUIRED_ENV_VARS_FOR_LOCAL)
    if missing_vars:
        logger.critical(f"❌ CRITICAL LOCAL STARTUP FAILURE: Missing required environment variables: {missing_vars}")
        logger.critical("   Please set these in your local environment before running.")
        logger.critical("   Example: export GEMINI_API_KEY=\"your_key_here\"")
        sys.exit(1) # Exit if essential keys for local dev are missing
    logger.critical("Required environment variables for local run are present.")

    # Set other defaults if not present (these are less sensitive or have workable defaults)
    os.environ.setdefault("AI3_HF_ENDPOINT_URL", AI3_HF_ENDPOINT_URL_DEFAULT)
    os.environ.setdefault("AI2_GEMINI_MODEL_NAME", AI2_GEMINI_MODEL_NAME_DEFAULT) 
    os.environ.setdefault("ULTRAVOX_AGENT_ID", "fb42f359-003c-4875-b1a1-06c4c1c87376")
    
    logger.critical("Attempting to run startup_event manually for local __main__ execution...")
    try:
        async def local_startup_wrapper():
            await startup_event()
        asyncio.run(local_startup_wrapper())
        logger.critical("Manual startup_event COMPLETED for local __main__ execution.")
    except Exception as e_startup_local:
        logger.critical(f"CRITICAL ERROR DURING MANUAL LOCAL STARTUP (via __main__): {e_startup_local}", exc_info=True)
        sys.exit(1) # Exit if startup event itself fails
    
    logger.critical("Attempting to start Uvicorn server for local development...")
    try:
        import uvicorn
        # Ensure host is 0.0.0.0 for Docker, port 8080 as per Cloud Run expectation
        uvicorn.run(app, host="0.0.0.0", port=8080, log_level="debug") # Removed loop="asyncio" as uvicorn handles it
    except Exception as e_uvicorn:
        logger.critical(f"CRITICAL ERROR trying to run Uvicorn: {e_uvicorn}", exc_info=True)
        sys.exit(1)