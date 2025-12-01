import OpenAI from "openai";

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate request body
  const { contractText } = req.body;
  
  if (!contractText || typeof contractText !== "string" || contractText.trim() === "") {
    return res.status(400).json({ error: "Invalid contract text" });
  }

  try {
    // Initialize OpenAI client
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Create the analysis prompt
    const systemPrompt = `You are an AI contract-risk evaluator. Your job is to analyze the agreement text and subtract points from a base score of 100 every time you detect a risk.

SCORING RULES:
Start with 100 points. Subtract points based on the risks you detect. The score must NEVER go below 0.

Use these deductions:
- Unusually long payment cycle (90-120 days) → -10
- Termination instability (e.g., 1-day notice, termination without cause, vague triggers) → -15
- IP ambiguity (ownership unclear, no rights defined) → -20
- Broad indemnity (one-sided, unlimited responsibility) → -20
- Missing liability cap → -15
- Unilateral change-of-terms clause → -15
- Weak confidentiality clause → -10
- Dispute resolution disadvantage (foreign courts, costly arbitration, unclear jurisdiction) → -10
- Undefined scope of work → -10
- Weak or missing force majeure clause → -5

RISK ZONES:
- 75-100 → "Safe"
- 50-74 → "Mostly Safe"
- 25-49 → "Moderately Risky"
- 0-24 → "High Risk"

OUTPUT FORMAT:
You must return a JSON object with this exact structure:
{
  "score": <number 0-100>,
  "scoreLabel": "<Safe | Mostly Safe | Moderately Risky | High Risk>",
  "summary": "<2-3 sentence summary in simple language>",
  "highlights": ["<key point 1>", "<key point 2>", "<key point 3>"],
  "issues": [
    {
      "id": <number>,
      "title": "<issue title>",
      "description": "<issue description with evidence from contract>"
    }
  ],
  "clauses": [
    {
      "title": "<clause name>",
      "text": "<relevant text from contract>"
    }
  ]
}

INSTRUCTIONS:
- Only include deductions for real risks you find in the contract
- Always reference specific clauses when identifying issues
- Never invent clauses that don't exist
- Keep explanations clear and in plain language
- Ensure the math is correct (100 - total deductions = final score, never below 0)
- The "issues" array should contain specific problems found
- The "clauses" array should contain important contractual terms
- Output ONLY valid JSON, no additional text`;

    // Call OpenAI API
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `Analyze this contract:\n\n${contractText}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    // Parse the response
    const analysisResult = JSON.parse(completion.choices[0].message.content);

    // Validate and ensure the response has the required structure
    const validatedResult = {
      score: analysisResult.score || 0,
      scoreLabel: analysisResult.scoreLabel || "Unknown",
      summary: analysisResult.summary || "Analysis completed",
      highlights: Array.isArray(analysisResult.highlights) ? analysisResult.highlights : [],
      issues: Array.isArray(analysisResult.issues) ? analysisResult.issues : [],
      clauses: Array.isArray(analysisResult.clauses) ? analysisResult.clauses : []
    };

    // Return the analysis
    return res.status(200).json(validatedResult);

  } catch (error) {
    console.error("Analysis failed:", error);
    return res.status(500).json({ error: "Analysis failed" });
  }
}
