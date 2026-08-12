import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { searchTrials, getTrialDetails } from "./src/services/clinicalTrialsServer";
import { parseQuery, summarizeTrial, chatAboutTrials, analyzeCohort, searchAdverseEvents } from "./src/services/geminiServer";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON middleware with reasonable size limit for clinical trial data payloads
  app.use(express.json({ limit: "15mb" }));

  // API Route - Search Clinical Trials
  app.post("/api/trials/search", async (req, res) => {
    try {
      const { query, pageSize } = req.body;
      const results = await searchTrials(query, pageSize || 5);
      res.json(results);
    } catch (error: any) {
      console.error("API error in searchTrials proxy:", error);
      res.status(500).json({ error: error.message || "Failed to search trials" });
    }
  });

  // API Route - Get Detailed Clinical Trial
  app.get("/api/trials/details/:nctId", async (req, res) => {
    try {
      const { nctId } = req.params;
      const trial = await getTrialDetails(nctId);
      if (!trial) {
        res.status(404).json({ error: "Trial not found" });
      } else {
        res.json(trial);
      }
    } catch (error: any) {
      console.error("API error in getTrialDetails proxy:", error);
      res.status(500).json({ error: error.message || "Failed to get trial details" });
    }
  });

  // Simple rolling window rate limiter for Gemini endpoints (prevent abuse & simulate limits)
  // Local limits are bypassed at the request of the user, falling back to actual Gemini platform quotas.
  function checkGeminiRateLimit(req: any, res: any, next: any) {
    next();
  }

  function handleGeminiError(error: any, res: any, defaultMessage: string) {
    const errMsg = error.message || "";
    const isRateLimit = error.status === 429 || 
                        error.statusCode === 429 || 
                        error.name === 'GeminiRateLimitError' ||
                        errMsg.includes("429") || 
                        errMsg.includes("Quota exceeded") || 
                        errMsg.includes("ResourceExhausted") ||
                        errMsg.includes("LimitExceeded") ||
                        errMsg.includes("limit: 20");
    
    if (isRateLimit) {
      const retryMs = error.retryAfterMs || 60 * 1000;
      const minutesToWait = Math.ceil(retryMs / 1000 / 60);
      return res.status(429).json({
        error: "RATE_LIMIT_EXCEEDED",
        retryAfterMs: retryMs,
        retryAfterMinutes: minutesToWait,
        message: `Gemini API 額度已達上限，請於 ${minutesToWait} 分鐘後再試。 (Gemini API quota exceeded, please try again in ${minutesToWait} minute.)`
      });
    }
    res.status(500).json({ error: errMsg || defaultMessage });
  }

  // API Route - Parse Query with Gemini AI
  app.post("/api/gemini/parseQuery", checkGeminiRateLimit, async (req, res) => {
    try {
      const { userInput } = req.body;
      const parsed = await parseQuery(userInput);
      res.json(parsed);
    } catch (error: any) {
      console.error("API error in parseQuery proxy:", error);
      handleGeminiError(error, res, "Failed to parse query");
    }
  });

  // API Route - Summarize Trial with Gemini AI
  app.post("/api/gemini/summarizeTrial", checkGeminiRateLimit, async (req, res) => {
    try {
      const { trial, lang } = req.body;
      const summary = await summarizeTrial(trial, lang);
      res.json({ summary });
    } catch (error: any) {
      console.error("API error in summarizeTrial proxy:", error);
      handleGeminiError(error, res, "Failed to summarize trial");
    }
  });

  // API Route - Chat About Trials with Gemini AI
  app.post("/api/gemini/chatAboutTrials", checkGeminiRateLimit, async (req, res) => {
    try {
      const { userInput, trials, lang } = req.body;
      const response = await chatAboutTrials(userInput, trials, lang);
      res.json({ response });
    } catch (error: any) {
      console.error("API error in chatAboutTrials proxy:", error);
      handleGeminiError(error, res, "Failed to conduct chat");
    }
  });

  // API Route - Perform Cohort Meta-Analysis with Gemini AI
  app.post("/api/gemini/metaAnalysis", checkGeminiRateLimit, async (req, res) => {
    try {
      const { trials, lang, options } = req.body;
      const response = await analyzeCohort(trials, lang, options);
      res.json({ response });
    } catch (error: any) {
      console.error("API error in metaAnalysis proxy:", error);
      handleGeminiError(error, res, "Failed to conduct meta-analysis");
    }
  });

  // API Route - Search and Group Adverse Events with Gemini AI
  app.post("/api/gemini/searchAdverseEvents", checkGeminiRateLimit, async (req, res) => {
    try {
      const { userInput, trials, lang } = req.body;
      const response = await searchAdverseEvents(userInput, trials, lang);
      res.json(response);
    } catch (error: any) {
      console.error("API error in searchAdverseEvents proxy:", error);
      handleGeminiError(error, res, "Failed to search adverse events");
    }
  });

  // Vite middleware setup or production static file serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal: failed to start full-stack server:", err);
  process.exit(1);
});
