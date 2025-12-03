import { GoogleGenAI, Type } from "@google/genai";
import { ParsedReminder, AIConfig } from "../types";

// Helper for OpenAI-compatible APIs (DeepSeek, Moonshot, SiliconFlow, Ollama/Custom)
const callOpenAICompatible = async (
    systemPrompt: string, 
    userText: string, 
    apiKey: string, 
    baseUrl: string, 
    model: string
): Promise<ParsedReminder> => {
    try {
        // Ensure no trailing slash
        const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        
        const response = await fetch(`${cleanUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt + `\nRespond in JSON format with keys: title, time, date, targetUser, type. Type enum: medication, general, activity.` },
                    { role: 'user', content: userText }
                ],
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`AI Request Failed: ${err}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        return JSON.parse(content) as ParsedReminder;

    } catch (error) {
        console.error("OpenAI Compatible API Error:", error);
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
      Analyze this spoken request.
      Extract the reminder details.
      - If no time is specified, default to current time + 5 minutes.
      - If no user is specified by name (e.g. "remind grandpa"), assume it is for the current user.
      - If a specific name from the valid family members list is mentioned, strictly use that name as targetUser.
      - If it involves medicine, pills, or health, set type to 'medication'.
      - Extract the date if mentioned (e.g. "tomorrow", "next friday"). Return date in YYYY-MM-DD format. If no date mentioned, use today's date (${todayStr}).
      - Return time in 24-hour HH:mm format.`;
  
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