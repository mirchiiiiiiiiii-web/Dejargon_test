// Import OpenAI - Vercel will auto-install from package.json
import OpenAI from "openai";

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    console.log("❌ Wrong method:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate request body
  const { contractText } = req.body;
  
  if (!contractText || typeof contractText !== "string" || contractText.trim() === "") {
    console.log("❌ Invalid contract text");
    return res.status(400).json({ error: "Invalid contract text - please provide contract text" });
  }

  console.log("✅ Received contract text, length:", contractText.length);

  // Check if API key exists
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not found in environment variables!");
    return res.status(500).json({ 
      error: "OpenAI API key not configured",
      hint: "Add OPENAI_API_KEY to Vercel Environment Variables"
    });
  }

  console.log("✅ API key found");

  try {
    // Initialize OpenAI client
    console.log("🔑 Initializing OpenAI client...");
    const openai = new OpenAI({
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
- The "clauses" array should contain important contractual terms (3-5 clauses)
- Output ONLY valid JSON, no additional text`;

    // Call OpenAI API
    console.log("📡 Calling OpenAI API...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `Analyze this contract and return ONLY a JSON object:\n\n${contractText}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000
    });

    console.log("✅ OpenAI API responded successfully");

    // Parse the response
    const responseContent = completion.choices[0].message.content;
    console.log("📄 Raw response:", responseContent);
    
    const analysisResult = JSON.parse(responseContent);
    console.log("📊 Parsed analysis result");

    // Validate and ensure the response has the required structure
    const validatedResult = {
      score: typeof analysisResult.score === 'number' ? analysisResult.score : 0,
      scoreLabel: analysisResult.scoreLabel || "Unknown",
      summary: analysisResult.summary || "Analysis completed",
      highlights: Array.isArray(analysisResult.highlights) ? analysisResult.highlights : [],
      issues: Array.isArray(analysisResult.issues) ? analysisResult.issues.map((issue, idx) => ({
        id: issue.id || idx + 1,
        title: issue.title || "Issue",
        description: issue.description || ""
      })) : [],
      clauses: Array.isArray(analysisResult.clauses) ? analysisResult.clauses.map(clause => ({
        title: clause.title || "Clause",
        text: clause.text || ""
      })) : []
    };

    // Return the analysis
    console.log("✅ Sending validated result to client");
    return res.status(200).json(validatedResult);

  } catch (error) {
    console.error("❌ Analysis failed with error:", error.message);
    console.error("Full error stack:", error.stack);
    
    // Return more specific error information
    return res.status(500).json({ 
      error: "Analysis failed",
      details: error.message,
      type: error.name,
      hint: "Check Vercel function logs for more information"
    });
  }
}
