import { GoogleGenAI, Type } from "@google/genai";
import { AIResponse, AIConfig } from "../types";

// Helper to extract JSON from text (handles Markdown code blocks and chatty responses)
const extractJsonFromText = (text: string): AIResponse => {
    let cleanText = text;

    // 1. Try to extract from markdown code blocks first (e.g. ```json ... ```)
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
            return JSON.parse(potentialJson) as AIResponse;
        } catch (e) {
            console.error("Extracted block is not valid JSON", e);
        }
    }

    // 3. Last resort
    try {
        return JSON.parse(cleanText) as AIResponse;
    } catch (e) {
        // Fall through
    }

    throw new Error(`无法从 AI 回复中提取有效 JSON。原始回复: ${text.substring(0, 100)}...`);
};

// Helper for OpenAI-compatible APIs
const callOpenAICompatible = async (
    systemPrompt: string, 
    userText: string, 
    apiKey: string, 
    baseUrl: string, 
    model: string
): Promise<AIResponse> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); 

    try {
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
    providerType?: string
): Promise<AIResponse | null> => {

  if (!aiConfig || (!aiConfig.apiKey && providerType !== 'custom')) {
    throw new Error("请先在设置中配置 API Key");
  }

  const todayStr = referenceDate || new Date().toISOString().split('T')[0];
  const validNamesStr = validUserNames ? validUserNames.join(', ') : '';
  
  // Logic to determine if we are in "Home Mode" (generic context) or "User Mode"
  // If currentUserName is '全家人' or 'all', we are in Home Mode.
  
  const systemPrompt = `
      You are a smart family assistant. Your job is to classify the user's intent and return a JSON object.
      
      Context:
      - Current User View: "${currentUserName}"
      - Valid Family Members: [${validNamesStr}]
      - Today's Date: ${todayStr}
      
      --------------------------------------------------
      CRITICAL RULE: "HOME MODE" AMBIGUITY CHECK
      IF Current User View is "全家人" (Home Mode):
         - The user MUST explicitly say a name (e.g., "Dad", "Grandpa").
         - Words like "I", "Me", "We", "My" (我, 咱们) are AMBIGUOUS.
         - IF no explicit name is found: YOU MUST STOP.
         - Return action: "chat_response" asking "Who is this for?".
         - DO NOT GUESS. DO NOT DEFAULT to the first user.
      --------------------------------------------------

      Task:
      Analyze the input: "${text}"
      
      Scenario A: USER WANTS TO CREATE A REMINDER (AND TARGET IS CLEAR)
      If the user clearly asks to set a reminder AND the target is clear (based on rules above), return:
      {
        "action": "create_reminder",
        "reminder": {
          "title": "Short title",
          "time": "HH:mm" (24h, default to now+5min),
          "date": "YYYY-MM-DD" (default to ${todayStr}),
          "targetUser": "Name",
          "type": "medication" | "general" | "activity"
        }
      }
      
      Scenario B: AMBIGUOUS INPUT / CASUAL CHAT
      If the user says "Hello", or is in Home Mode but didn't say a name (e.g. "Wake me up"), return:
      {
        "action": "chat_response",
        "replyText": "请问是提醒谁？ (or conversational reply)"
      }

      Examples:
      1. (Home Mode) "Wake me up at 8" -> {"action": "chat_response", "replyText": "请问是提醒谁八点起床？"}
      2. (Dad's View) "Wake me up at 8" -> {"action": "create_reminder", "reminder": {"targetUser": "Dad", ...}}
      3. (Home Mode) "Remind Grandpa to eat" -> {"action": "create_reminder", "reminder": {"targetUser": "Grandpa", ...}}
      
      IMPORTANT: Return ONLY the JSON object. No markdown.
      `;
  
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
      Input: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ["create_reminder", "chat_response"] },
            reminder: {
               type: Type.OBJECT,
               properties: {
                 title: { type: Type.STRING },
                 time: { type: Type.STRING },
                 date: { type: Type.STRING },
                 targetUser: { type: Type.STRING },
                 type: { type: Type.STRING }
               }
            },
            replyText: { type: Type.STRING }
          },
          required: ["action"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AIResponse;
    }
    return null;

  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    throw error;
  }
};