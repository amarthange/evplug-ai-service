/**
 * Review AI Engine
 * Handles client-side interaction with Gemini 1.5 Flash for review response generation.
 * Adheres to Firebase Spark constraints (no backend) and Gemini free tier quotas.
 */

export interface ReviewDraft {
  style: 'empathetic' | 'professional' | 'brief';
  text: string;
}

export interface GeminiResponse {
  drafts: ReviewDraft[];
}

const GEMINI_MODEL = "gemini-1.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Builds the prompt for Gemini to generate 3 distinct response styles.
 */
function buildReviewPrompt(reviewText: string, rating: number, stationName: string): string {
  // Safety: Slice text to prevent prompt injection
  const safeReviewText = reviewText.slice(0, 500);

  return `
    You are an AI assistant for "SeniorDevOps", a premium EV charging platform.
    Generate exactly 3 response options for a customer review.
    
    STATION: ${stationName}
    RATING: ${rating}/5
    REVIEW: "${safeReviewText}"

    Provide 3 distinct options:
    1. Empathetic: Warm, understanding, and personal.
    2. Professional: Concise, business-like, and solution-oriented.
    3. Brief: Fast, polite, and under 15 words.

    RULES:
    - Address the user's specific points if possible.
    - Each response must be under 100 words.
    - Do NOT use placeholders like [Your Name].
    - Respond ONLY with a valid JSON object in this format:
    {
      "drafts": [
        { "style": "empathetic", "text": "..." },
        { "style": "professional", "text": "..." },
        { "style": "brief", "text": "..." }
      ]
    }
  `.trim();
}

/**
 * Calls Gemini 1.5 Flash API to generate drafts.
 */
export async function generateReviewDrafts(
  reviewText: string, 
  rating: number, 
  stationName: string
): Promise<ReviewDraft[]> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("Missing Gemini API Key. Please check your environment variables.");
  }

  const prompt = buildReviewPrompt(reviewText, rating, stationName);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(`${API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 1000,
        }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API Error: ${response.status} ${errorData.error?.message || ''}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Clean markdown fences if the model included them
    const cleanedJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed: GeminiResponse = JSON.parse(cleanedJson);

    if (!parsed.drafts || parsed.drafts.length !== 3) {
      throw new Error("Invalid response format from AI engine.");
    }

    return parsed.drafts;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  }
}

export interface ReviewSummary {
  sentiment: string;
  positives: string[];
  negatives: string[];
  recommendation: string;
}

/**
 * Performs aggregate sentiment analysis on a batch of reviews.
 */
export async function analyzeReviewSentiment(reviews: { rating: number, text: string }[]): Promise<ReviewSummary> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing Gemini API Key.");

  // Prepare data (max 20 reviews to stay within prompt limits)
  const sample = reviews.slice(0, 20).map(r => `[Rating: ${r.rating}] ${r.text}`).join('\n');
  
  const prompt = `
    Analyze these customer reviews for an EV charging station and provide a summary.
    REVIEWS:
    ${sample}

    Respond ONLY with a JSON object in this format:
    {
      "sentiment": "Overall sentiment (e.g. Strongly Positive)",
      "positives": ["Point 1", "Point 2"],
      "negatives": ["Point 1", "Point 2"],
      "recommendation": "One actionable business recommendation"
    }
  `.trim();

  const response = await fetch(`${API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
    })
  });

  if (!response.ok) throw new Error("AI analysis failed.");
  
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleanedJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanedJson);
}
