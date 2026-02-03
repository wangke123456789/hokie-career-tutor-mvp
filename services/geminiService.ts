
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ChatMessage, InterviewType } from "../types";

const MODEL_NAME = 'gemini-3-pro-preview';

export const analyzeResume = async (
  resumeText: string,
  jobDescription: string,
  onChunk: (text: string) => void
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    You are a world-class Recruitment Specialist and Career Coach. 
    Analyze the provided RESUME against the JOB DESCRIPTION (JD).

    RESUME: ${resumeText}
    JD: ${jobDescription}

    Provide a analysis in Markdown:
    1. Match Score (%)
    2. Key Strengths
    3. Missing Skills
    4. Optimization Suggestions
    5. Interview Questions to prepare
  `;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 4000 } }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) onChunk(chunk.text);
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const startInterviewChat = (resumeText: string, jd: string, type: InterviewType) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const baseInstruction = `
    You are a strict and professional Interviewer for the following role.
    TARGET JD: ${jd}
    CANDIDATE RESUME: ${resumeText}

    RULES:
    1. Act as a specific hiring manager or technical lead.
    2. Ask ONE challenging question at a time.
    3. After the user answers, give a brief (1 sentence) professional critique of the answer, then ask the NEXT question.
    4. Focus on gaps identified in the resume relative to the JD.
    5. Stay in character.
  `;

  const oralInstruction = type === 'VIDEO' 
    ? "6. IMPORTANT: You are in a VIDEO CALL. Be more conversational, use spoken language patterns. Keep your responses concise so they are easy to listen to. Avoid long lists."
    : "";

  return ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: baseInstruction + oralInstruction,
    },
  });
};

export const generateInterviewReport = async (history: ChatMessage[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Based on the following mock interview transcript, provide a final "Interview Performance Feedback Report".
    History: ${JSON.stringify(history)}

    Structure your report as follows:
    # Interview Performance Feedback
    - **Overall Rating**: [Out of 10]
    - **Communication Clarity**: [Feedback]
    - **Technical Competence**: [Feedback]
    - **Key Strengths Demonstrated**: [List]
    - **Areas for Improvement**: [Actionable advice]
  `;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: { thinkingConfig: { thinkingBudget: 8000 } }
  });

  return response.text;
};
