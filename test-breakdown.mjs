const sceneText = `INT. КВАРТИРА БОРИСА — НОЧЬ

БОРИС (40) сидит за столом. Перед ним — пустая бутылка и старая фотография.
Он поднимает взгляд на окно. За стеклом — огни города.

БОРИС
(тихо)
Ты обещала вернуться.

Он встаёт, подходит к окну. Кладёт ладонь на стекло.
За спиной звонит телефон. Борис не оборачивается.`;

const systemPrompt = `You are Scene Analyst, the first stage of a cinematic planning pipeline.
Your only job is to interpret a scene and return structured analysis.
Do not write shots. Do not write image prompts. Do not write video prompts.

Return one valid JSON object with this exact top-level shape:
{
  "sceneSummary": "string",
  "dramaticBeats": [
    {
      "id": "string", "sceneId": "string", "order": 0, "title": "string",
      "summary": "string", "narrativeFunction": "string", "emotionalShift": "string",
      "subjectFocus": "string", "characterIds": ["string"],
      "locationId": "string or null", "propIds": ["string"],
      "visualAnchors": ["string"], "transitionOut": "string"
    }
  ],
  "emotionalTone": "string",
  "geography": "string",
  "characterPresence": ["string"],
  "propCandidates": ["string"],
  "visualMotifs": ["string"],
  "continuityRisks": ["string"],
  "recommendedShotCount": 6
}
Respond with JSON only.`;

async function test() {
  console.log("Testing Scene Analyst via /api/chat (GPT-4o)...\n");
  
  const r = await fetch("http://localhost:3002/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Analyze this scene for cinematic planning:\n\n" + sceneText }],
      modelId: "gpt-4o",
      system: systemPrompt,
    }),
  });

  console.log("STATUS:", r.status);
  
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
  }

  console.log("BODY LENGTH:", full.length);
  console.log("---RESPONSE---");
  console.log(full);
  console.log("---END---\n");

  try {
    const parsed = JSON.parse(full);
    console.log("PARSED OK!");
    console.log("  Scene Summary:", parsed.sceneSummary?.slice(0, 100));
    console.log("  Beats:", parsed.dramaticBeats?.length);
    console.log("  Recommended shots:", parsed.recommendedShotCount);
    console.log("  Characters:", parsed.characterPresence);
    console.log("  Motifs:", parsed.visualMotifs);
  } catch (e) {
    console.log("PARSE FAILED:", e.message);
    console.log("First 200 chars:", full.slice(0, 200));
  }
}

test().catch((e) => console.log("ERROR:", e.message));
