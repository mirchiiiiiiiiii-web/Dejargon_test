import Groq from "groq-sdk";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { contractText } = req.body;

  if (!contractText || typeof contractText !== "string" || !contractText.trim()) {
    return res.status(400).json({ error: "Invalid contract text" });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      error: "Missing GROQ_API_KEY",
      hint: "Add GROQ_API_KEY to Vercel → Settings → Environment Variables"
    });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const systemPrompt = `
You are an AI contract-risk evaluator... (same text you already have)
`;

    const completion = await groq.chat.completions.create({
      model: "mixtral-8x7b-32768",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this contract and return ONLY JSON:\n\n${contractText}` }
      ],
      temperature: 0.2,
      max_tokens: 3000
    });

    const raw = completion.choices[0].message.content;

    let result;
    try {
      result = JSON.parse(raw);
    } catch (err) {
      console.error("JSON Parse Error:", raw);
      throw new Error("Model returned invalid JSON");
    }

    return res.status(200).json({
      score: result.score ?? 0,
      scoreLabel: result.scoreLabel ?? "Unknown",
      summary: result.summary ?? "",
      highlights: Array.isArray(result.highlights) ? result.highlights : [],
      issues: Array.isArray(result.issues) ? result.issues : [],
      clauses: Array.isArray(result.clauses) ? result.clauses : []
    });

  } catch (error) {
    console.error("GROQ ERROR:", error);
    return res.status(500).json({
      error: "Analysis failed",
      message: error.message
    });
  }
}
