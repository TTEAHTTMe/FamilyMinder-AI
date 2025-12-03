import { GoogleGenAI, Type } from "@google/genai";
import { ParsedReminder, AIConfig } from "../types";

// Helper to extract JSON from text (handles Markdown code blocks and chatty responses)
const extractJsonFromText = (text: string): ParsedReminder => {
    let cleanText = text;

    // 1. Try to extract from markdown code blocks first (e.g. ```json ... ```)
    // This is very common with Qwen/GLM models
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        cleanText = codeBlockMatch[1];
    }

    // 2. Locate the outermost JSON object bounds
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const potentialJson = cleanText.substring(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(potentialJson) as ParsedReminder;
        } catch (e) {
            console.error("Extracted block is not valid JSON", e);
        }
    }

    // 3. Last resort: Try parsing the whole text (sometimes models just return JSON)
    try {
        return JSON.parse(cleanText) as ParsedReminder;
    } catch (e) {
        // Fall through to error
    }

    throw new Error(`无法从 AI 回复中提取 JSON。原始回复: ${text.substring(0, 100)}...`);
};

// Helper for OpenAI-compatible APIs (DeepSeek, Moonshot, SiliconFlow, Ollama/Custom)
const callOpenAICompatible = async (
    systemPrompt: string, 
    userText: string, 
    apiKey: string, 
    baseUrl: string, 
    model: string
): Promise<ParsedReminder> => {
    // Controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // Increased to 45s for slower models

    try {
        // Ensure no trailing slash
        const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        
        console.log(`Calling AI: ${model} at ${cleanUrl}`);

        const response = await fetch(`${cleanUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userText }
                ],
                // CRITICAL: response_format is NOT supported by many open source models (Qwen, etc.) on SiliconFlow.
                // Do NOT include it. We rely on the prompt and extractJsonFromText.
                temperature: 0.1
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`AI Request Failed (${response.status}): ${err}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
            throw new Error("AI returned empty content");
        }

        console.log("AI Raw Response:", content);
        return extractJsonFromText(content);

    } catch (error: any) {
        clearTimeout(timeoutId);
        console.error("OpenAI Compatible API Error:", error);
        if (error.name === 'AbortError') {
            throw new Error("AI 请求超时 (45秒)，请检查网络或更换模型");
        }
        throw error;
    }
};

export const parseReminderWithGemini = async (
    text: string, 
    currentUserName: string, 
    validUserNames?: string[], 
    referenceDate?: string,
    aiConfig?: AIConfig,
    providerType?: string // 'gemini' | others
): Promise<ParsedReminder | null> => {

  // For custom local LLMs (like Ollama), apiKey might be optional, but we check generally.
  if (!aiConfig || (!aiConfig.apiKey && providerType !== 'custom')) {
    throw new Error("请先在设置中配置 API Key");
  }

  const todayStr = referenceDate || new Date().toISOString().split('T')[0];
  const validNamesStr = validUserNames ? `Valid family members: ${validUserNames.join(', ')}.` : '';

  const systemPrompt = `Current context: User is "${currentUserName}". Today is ${todayStr}. ${validNamesStr}
      Analyze the spoken request and extract reminder details into a JSON object.
      
      Rules:
      1. Default time: current time + 5 mins if unspecified.
      2. Default user: "${currentUserName}" if unspecified.
      3. If a valid family member name is mentioned, use it as 'targetUser'.
      4. Type: 'medication' (for pills/health), 'general', or 'activity'.
      5. Date: YYYY-MM-DD format. Default to ${todayStr}.
      6. Time: HH:mm (24-hour).
      
      IMPORTANT: Return ONLY the JSON object. No markdown, no explanations.
      Example format:
      {
        "title": "Eat apple",
        "time": "14:00",
        "date": "2023-10-27",
        "targetUser": "Dad",
        "type": "general"
      }`;
  
  // --- OPENAI COMPATIBLE PROVIDERS ---
  if (providerType && providerType !== 'gemini') {
      return callOpenAICompatible(
          systemPrompt, 
          text, 
          aiConfig.apiKey, 
          aiConfig.baseUrl, 
          aiConfig.model
      );
  }

  // --- GOOGLE GEMINI ---
  try {
    const ai = new GoogleGenAI({ apiKey: aiConfig.apiKey });
    const response = await ai.models.generateContent({
      model: aiConfig.model || "gemini-2.5-flash",
      contents: `${systemPrompt}
      Analyze this spoken request: "${text}".`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "The content of the reminder" },
            time: { type: Type.STRING, description: "Time in HH:mm format" },
            date: { type: Type.STRING, description: "Date in YYYY-MM-DD format" },
            targetUser: { type: Type.STRING, description: "Name of the person to remind, if mentioned" },
            type: { type: Type.STRING, enum: ["medication", "general", "activity"] }
          },
          required: ["title", "time", "date", "type"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ParsedReminder;
    }
    return null;

  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    throw error;
  }
};