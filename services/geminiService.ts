
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

    throw new Error(`无法从 AI 回复中提取 JSON。原始回复: ${text.substring(0, 100)}...`);
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
    validUserNames: string[], 
    referenceDate: string,
    aiConfig?: AIConfig,
    providerType?: string // 'gemini' | others
): Promise<AIResponse | null> => {

  if (!aiConfig || (!aiConfig.apiKey && providerType !== 'custom')) {
    throw new Error("请先在设置中配置 API Key");
  }

  const todayStr = referenceDate || new Date().toISOString().split('T')[0];
  const validNamesStr = validUserNames.length > 0 ? `Valid family members: ${validUserNames.join(', ')}.` : '';
  const isHomeMode = currentUserName === '全家人';

  const systemPrompt = `
      You are a smart family assistant. Your job is to classify the user's intent and return a JSON object.
      
      Context:
      - Current Date: ${todayStr}
      - Current View Mode User: "${currentUserName}" (If "全家人", it means Home View/All Family).
      - ${validNamesStr}
      
      TASK 1: CLASSIFY INTENT
      - IF the user wants to set a reminder/alarm/task (e.g., "Remind dad to eat", "Wake me up at 8"):
        -> Set "action": "create_reminder"
      - IF the user input is casual chat (e.g., "Hello", "How are you"), gibberish, or just partial text without intent:
        -> Set "action": "chat_response"
        -> Set "replyText": A friendly, short conversational reply in Chinese.
      - IF the intent is ambiguous (e.g. user says "Eat medicine" BUT Current View is "全家人" and no specific name is mentioned):
        -> Set "action": "chat_response"
        -> Set "replyText": "请问是提醒哪位家庭成员？" (Ask for clarification).

      TASK 2: EXTRACT DATA (Only if action is "create_reminder")
      - "reminderData": {
          "title": "Content of reminder",
          "time": "HH:mm" (24-hour, default to now+5mins if unspecified),
          "date": "YYYY-MM-DD" (Default to ${todayStr}),
          "targetUser": "Name of person" (If not mentioned, default to "${currentUserName}". If "${currentUserName}" is "全家人", you MUST have asked for clarification in step 1, unless you can infer it contextually, otherwise default to first valid member or ask),
          "type": "medication" | "general" | "activity"
      }

      IMPORTANT: Return ONLY the JSON object.
      Example 1 (Reminder):
      { "action": "create_reminder", "reminderData": { "title": "吃苹果", "time": "14:00", "date": "${todayStr}", "targetUser": "爷爷", "type": "general" } }
      
      Example 2 (Chat):
      { "action": "chat_response", "replyText": "你好！我是家庭助手，请告诉我需要提醒什么？" }
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
      User Input: "${text}"`,
      config: {
        responseMimeType: "application/json",
      }
    });

    if (response.text) {
      return extractJsonFromText(response.text);
    }
    return null;

  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    throw error;
  }
};
