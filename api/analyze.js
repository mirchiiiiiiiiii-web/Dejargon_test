// Import Groq SDK
import Groq from "groq-sdk";

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { contractText } = req.body;

  if (!contractText || typeof contractText !== "string" || contractText.trim() === "") {
    return res.status(400).json({ error: "Invalid contract text" });
  }

  // Check GROQ API key
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      error: "GROQ_API_KEY not found!",
      hint: "Add GROQ_API_KEY in Vercel Environment Variables"
    });
  }

  try {
    // Initialize Groq client
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const systemPrompt = `
You are an AI contract-risk evaluator. Your job is to analyze the agreement text and subtract points from a base score of 100 every time you detect a risk.

SCORING RULES:
Start with 100 points. Subtract points based on the risks you detect. The score must NEVER go below 0.

Use these deductions:
- Unusually long payment cycle (90-120 days) → -10
- Termination instability → -15
- IP ambiguity → -20
- Broad indemnity → -20
- Missing liability cap → -15
- Unilateral change-of-terms clause → -15
- Weak confidentiality clause → -10
- Dispute resolution disadvantage → -10
- Undefined scope of work → -10
- Weak or missing force majeure clause → -5

RISK ZONES:
- 75-100 → "Safe"
- 50-74 → "Mostly Safe"
- 25-49 → "Moderately Risky"
- 0-24 → "High Risk"

OUTPUT FORMAT:
Return ONLY this JSON structure:
{
  "score": <number>,
  "scoreLabel": "<label>",
  "summary": "<short summary>",
  "highlights": ["point1", "point2"],
  "issues": [
    { "id": 1, "title": "Issue", "description": "Details" }
  ],
  "clauses": [
    { "title": "Clause Name", "text": "Extracted text" }
  ]
}
`;

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: "mixtral-8x7b-32768", // Best free Groq model for long text
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this contract and return ONLY JSON:\n\n${contractText}`
        }
      ],
      temperature: 0.2,
      max_tokens: 3000
    });

    const raw = completion.choices[0].message.content;
    const result = JSON.parse(raw);

    const validated = {
      score: typeof result.score === "number" ? result.score : 0,
      scoreLabel: result.scoreLabel || "Unknown",
      summary: result.summary || "",
      highlights: Array.isArray(result.highlights) ? result.highlights : [],
      issues: Array.isArray(result.issues) ? result.issues : [],
      clauses: Array.isArray(result.clauses) ? result.clauses : []
    };

    return res.status(200).json(validated);

  } catch (error) {
    console.error("GROQ ERROR:", error);
    return res.status(500).json({
      error: "Analysis failed",
      message: error.message
    });
  }
}
