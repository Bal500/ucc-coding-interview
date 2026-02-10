import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message } = body;

    console.log("Backend hívás érkezett:", message);

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      console.error("HIBA: Nincs érvényes API kulcs!");
      return NextResponse.json({ error: "Hiányzó API kulcs a szerveren" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
      Te egy segítőkész ügyfélszolgálati asszisztens vagy egy "UCC Project" nevű eseménykezelő alkalmazásban.
      Válaszolj röviden, udvariasan, magyarul.
      
      Szabályok:
      - Ha a felhasználó emberi segítséget kér, a válaszod CSAK ennyi legyen: "HUMAN_TRANSFER".
      - Ha jelszóról van szó: mondd el, hogy a Login oldalon van "Elfelejtett jelszó" gomb.
      - Ha eseményekről van szó: mondd el, hogy bejelentkezés után a Dashboardon lehet kezelni őket.
      - Bármi mással kapcsolatban válaszolj készségesen.
      - Ha a felhasználó elveszíti a többlépcsős azonosításhoz szükséges kódját, akkor javasold, hogy kérjen emberi segítéget.

      A felhasználó üzenete: ${message}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log("Gemini válasza:", responseText);

    return NextResponse.json({ text: responseText });

  } catch (error: any) {
    console.error("RÉSZLETES API HIBA:", error);
    
    return NextResponse.json({ 
      error: "Szerver hiba történt.", 
      details: error.message 
    }, { status: 500 });
  }
}
