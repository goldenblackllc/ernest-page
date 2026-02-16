// Check for key
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("No API KEY found!");
  process.exit(1);
}

// Direct fetch is more reliable for listing models if standard SDK method isn't intuitive
async function run() {
  try {
    console.log("Fetching models...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.models) {
      console.log("\n--- ALL AVAILABLE MODELS (generateContent) ---");
      const models = data.models
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .sort();

      models.forEach(m => console.log(m));

      console.log("\n--- PRO / EXPERIMENTAL VARIANTS ---");
      const proExp = models.filter(m =>
        m.includes('pro') ||
        m.includes('experimental') ||
        m.includes('exp')
      );

      if (proExp.length > 0) {
        proExp.forEach(m => console.log(m));
      } else {
        console.log("None found.");
      }
    } else {
      console.log("No models returned in response:", data);
    }

  } catch (e) {
    console.error("Error fetching models:", e);
  }
}

run();
