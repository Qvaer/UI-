
import { Issue, IssueType, IssueSubType } from "../types";
import { createDiagnosisSheet } from "../utils/imageProcessor";
import { Language } from "../utils/i18n";

// Initialize OpenAI client for Volcengine (Doubao)
// Users need to provide VOLCENGINE_API_KEY and VOLCENGINE_MODEL_ID (Endpoint ID)
// Fallback to hardcoded values provided by user if env vars are missing
const baseURL = "https://ark.cn-beijing.volces.com/api/v3";

const cleanBase64 = (str: string) => str.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

// Helper to clean potential markdown formatting from AI response
const cleanJson = (str: string) => {
    return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

/**
 * Enhances locally detected issues using GenAI (Doubao).
 * Focuses on Semantics: Icon shapes, Text content, Meaning.
 * Ignores Metrics: Position pixels, exact sizes (Local algo is better at this).
 */
export const enhanceIssuesWithAI = async (
  currentIssues: Issue[],
  designImageBase64: string,
  alignedDevImageBase64: string,
  language: Language = 'zh',
  apiKey?: string,
  modelId?: string
): Promise<Issue[]> => {

  // 1. Filter issues
  const targetIssues = currentIssues;

  if (targetIssues.length === 0) return currentIssues;

  // Limit to top 12 to strictly control token usage but allow better coverage
  const issuesToAnalyze = [...targetIssues]
    .sort((a, b) => {
        // Prioritize HIGH severity
        const score = (s: string) => s === 'high' ? 3 : s === 'medium' ? 2 : 1;
        return score(b.severity) - score(a.severity);
    })
    .slice(0, 12);

  const boxes = issuesToAnalyze.map(i => i.relatedBox!).filter(Boolean);

  // Generate the diagnosis sheet only for these specific boxes
  const diagnosisSheetBase64 = await createDiagnosisSheet(
    designImageBase64,
    alignedDevImageBase64,
    boxes
  );

  const langInstruction = language === 'en' 
    ? 'Return descriptions in English.'
    : 'Return descriptions in Chinese.';

  // Build a context map to "ground" the AI
  const issueHints = issuesToAnalyze.map((issue, idx) => {
      let hint = "";
      if (issue.subType === 'position') hint = "Detected: Position Shift (Alignment/Margin)";
      else if (issue.subType === 'dimension') hint = "Detected: Size/Dimension Mismatch";
      else if (issue.subType === 'missing') hint = "Detected: Element Missing in Dev";
      else if (issue.subType === 'icon') hint = "Detected: Icon Shape/Symbol Mismatch";
      else if (issue.type === 'color') hint = "Detected: Color/Style mismatch";
      else hint = "Detected: Visual content difference";
      
      return `Issue #${idx + 1} ID: "${issue.id}" -> Hint: ${hint}`;
  }).join('\n');

  const systemPrompt = `
    You are a pixel-perfect UI Design QA Expert.
    I have provided a composite image containing multiple rows of analysis.
    
    CRITICAL INSTRUCTION:
    1. Look at the large white text labels on the image (e.g., "Issue #1", "Issue #2").
    2. These numbers correspond strictly to the rows in the image.
    3. You MUST map the visual content of "Issue #N" to the JSON object for that specific ID.
    4. **TRUST THE LOCAL HINTS**: I will provide hints below from a mathematical algorithm. Use them as your primary hypothesis. If the hint says "Position Shift", do not say "Missing Element" just because it moved slightly. Look for the shift.
    5. **DESCRIPTION**: Provide a detailed visual description of the difference (e.g., "Button background is blue instead of red", "Icon is smaller").

    ${langInstruction}

    LOCAL HINTS (Use these to avoid hallucination):
    ${issueHints}

    For each row:
    - LEFT Image: Design Original (Blue bar).
    - RIGHT Image: Development Implementation (Orange bar).
    
    Your task is to confirm the difference and describe it concisely.
    
    CLASSIFICATION RULES:
    1. **False Positive**: If visual diff is negligible (<1px), return 'subType': 'false_positive'.
    2. **Position**: Element exists but is shifted (even if crop cuts it off partially).
    3. **Missing**: Design has element, Dev is completely empty.
    4. **Extra**: Dev has element, Design is empty.
    5. **Font Weight**: Text content is same, but thickness differs.
    6. **Text**: Text content/spelling is different.
    7. **Icon**: Icon shape is different.
    8. **Color**: Color is clearly different.

    Return a purely valid JSON Array. DO NOT use Markdown.
    Schema:
    [
      {
        "id": "String (Must match input ID)",
        "detectedIssues": [
          {
             "subType": "icon" | "text" | "missing" | "position" | "dimension" | "font-weight" | "color" | "false_positive" | "other",
             "location": "String (e.g., 'Submit Button')",
             "problem": "String (Description of the diff)"
          }
        ]
      }
    ]
  `;

  // Use passed MODEL_ID or env, or the user-provided default
  const MODEL_NAME = modelId || process.env.VOLCENGINE_MODEL_ID || 'ep-m-20260303165808-5gpw8';
  
  // Use passed apiKey or env, or fallback
  const FINAL_API_KEY = apiKey || process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY || process.env.API_KEY || "99221f7b-b247-4f06-8509-f82db3204872";

  if (!FINAL_API_KEY) {
      console.warn("Doubao AI: Missing API Key");
      // Fallback to hardcoded key if env var is missing in client (though server handles it too)
  }

  console.log(`[DoubaoService] Enhancing ${issuesToAnalyze.length} issues using model: ${MODEL_NAME}`);

  try {
      // Call the backend API proxy
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error("Request timed out after 180s")), 180000); // 180s timeout

      console.log(`[DoubaoService] Calling /api/analyze...`);
      const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              imageBase64: cleanBase64(diagnosisSheetBase64),
              systemPrompt: systemPrompt,
              modelId: MODEL_NAME,
              apiKey: FINAL_API_KEY
          }),
          signal: controller.signal
      });
      clearTimeout(timeoutId);

      console.log(`[DoubaoService] Received response status: ${response.status}`);

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || `Server error: ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.text;
      
      if (!text) return currentIssues;

      let aiResults: any[] = [];
      try {
          const jsonText = cleanJson(text);
          aiResults = JSON.parse(jsonText);
      } catch (e) {
          console.warn("AI JSON Parse Error", e);
          try {
              const match = text.match(/\[.*\]/s);
              if (match) {
                  aiResults = JSON.parse(match[0]);
              }
          } catch (retryE) {
              console.warn("AI JSON Retry Failed", retryE);
              return currentIssues;
          }
      }

      // Merge AI results back into the issues
      const enhancedIssues = currentIssues.reduce<Issue[]>((acc, issue) => {
          const aiMatch = aiResults.find(r => r.id === issue.id);
          
          if (aiMatch && aiMatch.detectedIssues && aiMatch.detectedIssues.length > 0) {
              
              if (aiMatch.detectedIssues.some((di: any) => di.subType === 'false_positive')) {
                  return acc; 
              }

              const mainDetected = aiMatch.detectedIssues[0];
              const secondaryDetected = aiMatch.detectedIssues.slice(1);

              // Logic: If Local Algo was very sure about Position/Dimension (high deltaPx),
              // and AI says something totally different (like "Text"), trust Local Algo for the *type*,
              // but use AI for the *location name* AND description.
              let finalSubType = mainDetected.subType as IssueSubType;
              let finalDesc = mainDetected.problem || mainDetected.description;

              if ((issue.subType === 'position' || issue.subType === 'dimension') && issue.deltaPx && issue.deltaPx > 5) {
                   // If AI missed the position shift, revert to local type but keep AI's description/location
                   if (finalSubType !== 'position' && finalSubType !== 'dimension') {
                       finalSubType = issue.subType; // Trust math for type classification
                       // Note: We intentionally keep AI's description (finalDesc) here as requested, 
                       // because AI descriptions are often more accurate/descriptive than generic "Position Shift".
                   }
              }

              acc.push({
                  ...issue,
                  subType: finalSubType,
                  location: mainDetected.location || issue.location, 
                  description: finalDesc || issue.description,
                  secondaryIssues: secondaryDetected.map((sd: any) => ({
                      subType: sd.subType as IssueSubType,
                      description: sd.problem || sd.description
                  })),
                  isAiEnhanced: true 
              });
          } else {
              acc.push(issue);
          }
          return acc;
      }, []);

      // Final Safety Sort: Ensure strictly Top-to-Bottom
      enhancedIssues.sort((a, b) => {
            const boxA = a.designBox || a.relatedBox || { y: 0, x: 0, width: 0, height: 0 };
            const boxB = b.designBox || b.relatedBox || { y: 0, x: 0, width: 0, height: 0 };
            
            if (Math.abs(boxA.y - boxB.y) <= 10) {
                return boxA.x - boxB.x;
            }
            return boxA.y - boxB.y;
      });

      return enhancedIssues;

  } catch (error) {
      console.error("Doubao AI Request Failed", error);
      throw error; // Let the caller handle the error (e.g. show toast)
  }
};
