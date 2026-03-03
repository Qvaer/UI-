import express from "express";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));

  // Test Connection Endpoint
  app.post("/api/test-connection", async (req, res) => {
    try {
      const { apiKey, modelId } = req.body;
      // Use provided key/model or fallbacks
      const finalApiKey = apiKey || process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY || process.env.API_KEY || "99221f7b-b247-4f06-8509-f82db3204872";
      const finalModelId = modelId || process.env.VOLCENGINE_MODEL_ID || "ep-m-20260303165808-5gpw8";

      console.log(`[Server] Testing connection to Volcengine with model: ${finalModelId}`);

      const client = new OpenAI({
        apiKey: finalApiKey,
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
        timeout: 10000, // 10s timeout for test
      });

      // Simple test request (empty prompt or minimal token)
      const response = await client.chat.completions.create({
        model: finalModelId,
        messages: [
          { role: "user", content: "Hi" }
        ],
        max_tokens: 5,
      });

      res.json({ success: true, message: "Connection successful!", data: response });
    } catch (error: any) {
      console.error("[Server] Connection Test Failed:", error);
      res.status(500).json({ 
        success: false, 
        error: "Connection failed", 
        details: error.message 
      });
    }
  });

  // API Routes
  app.post("/api/analyze", async (req, res) => {
    try {
      const { imageBase64, systemPrompt, modelId, apiKey } = req.body;

      if (!imageBase64 || !systemPrompt) {
        return res.status(400).json({ error: "Missing image or prompt" });
      }

      // Use provided key/model or fallbacks
      // Prioritize ARK_API_KEY as per Volcengine standard
      const finalApiKey = apiKey || process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY || process.env.API_KEY || "99221f7b-b247-4f06-8509-f82db3204872";
      const finalModelId = modelId || process.env.VOLCENGINE_MODEL_ID || "ep-m-20260303165808-5gpw8";

      console.log(`[Server] Analyzing with model: ${finalModelId}`);
      console.log(`[Server] Payload size: ${imageBase64.length} chars`);

      const client = new OpenAI({
        apiKey: finalApiKey,
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
        timeout: 150000, // 150 seconds timeout for OpenAI client
      });

      console.log(`[Server] Sending request to Volcengine...`);
      const response = await client.chat.completions.create({
        model: finalModelId,
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: `${systemPrompt}\n\nAnalyze the differences in the provided image rows.` 
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
      }, { timeout: 150000 }); // Explicit request timeout

      console.log(`[Server] Received response from Volcengine.`);
      const text = response.choices[0]?.message?.content;
      res.json({ text });

    } catch (error: any) {
      console.error("[Server] Analysis Error:", error);
      res.status(500).json({ 
        error: "Analysis failed", 
        details: error.message,
        stack: error.stack 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
