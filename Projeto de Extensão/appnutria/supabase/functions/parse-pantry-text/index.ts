// ============================================================================
// supabase/functions/parse-pantry-text/index.ts
//
// Recebe um texto livre digitado pelo usuário (ex.: colado de uma lista de
// compras, ou escrito à mão: "2kg de arroz, 1 dúzia de ovos, umas 3
// cenouras") e devolve os itens já separados e categorizados.
//
// Só texto — sem imagem — por isso mais barato e rápido que a
// "analyze-pantry-photo", no mesmo espírito da "reanalyze-item".
// ============================================================================

import { GoogleGenAI, Type } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CATEGORY_ENUM = [
  "vegetais",
  "frutas",
  "cereais_e_graos",
  "carnes_e_ovos",
  "laticinios",
  "condimentos_e_temperos",
  "bebidas",
  "outros",
];

const pantryItemSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    quantity_description: { type: Type.STRING },
    category: { type: Type.STRING, enum: CATEGORY_ENUM },
    estimated_shelf_life_days: { type: Type.INTEGER },
    // Mesmo conceito das outras funções: sinaliza um trecho do texto que
    // não corresponde a um alimento reconhecível, em vez de inventar algo.
    recognized: { type: Type.BOOLEAN },
    unrecognized_reason: { type: Type.STRING },
  },
  required: ["name", "quantity_description", "recognized"],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    items: { type: Type.ARRAY, items: pantryItemSchema },
  },
  required: ["items"],
};

const SYSTEM_INSTRUCTION = `
Você é o motor de interpretação de listas de despensa do aplicativo
Nutria. Você recebe um texto livre, digitado por um usuário, descrevendo
os alimentos que ele tem em casa (pode vir em qualquer formato: lista com
vírgulas, uma linha por item, texto corrido, com ou sem quantidades).

Regras:
1. Separe o texto em itens individuais, um alimento por entrada.
2. Se o usuário não informar quantidade para um item, use
   "quantity_description": "quantidade não informada" em vez de inventar
   um número.
3. category deve ser exatamente um dos valores permitidos pelo schema.
4. estimated_shelf_life_days é a validade TÍPICA daquele tipo de alimento
   guardado normalmente (ex.: alface ~5 dias, arroz cru ~365 dias) — só
   preencha quando "recognized" for true.
5. Use "recognized": false apenas quando um trecho do texto claramente não
   descrever um alimento (ex.: erro de digitação sem sentido, item não
   alimentar). Nesse caso, preencha "unrecognized_reason" e não preencha
   category nem estimated_shelf_life_days para esse item.
6. Alimentos em outro idioma (ex.: "oatmeal", "quinoa") devem ser
   reconhecidos normalmente; mantenha o nome original quando não houver
   tradução natural e comum em português.
7. Todos os campos de texto (exceto quando indicado) devem estar em
   português do Brasil.
`.trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Requisição sem token de autenticação." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado ou token inválido." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Envie 'text' com a lista de alimentos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const result = JSON.parse(response.text ?? '{"items":[]}');

    // Só salvamos no banco os itens que a IA conseguiu reconhecer — os
    // "recognized: false" voltam para o app apenas como aviso, sem virar
    // linha na tabela (evitaria poluir a despensa do usuário com lixo).
    const recognizedItems = result.items.filter((i: { recognized: boolean }) => i.recognized);
    const unrecognizedItems = result.items.filter((i: { recognized: boolean }) => !i.recognized);

    let insertedItems = [];
    if (recognizedItems.length > 0) {
      const rowsToInsert = recognizedItems.map((item: {
        name: string;
        quantity_description: string;
        category: string;
        estimated_shelf_life_days: number;
      }) => ({
        user_id: userData.user.id,
        name: item.name,
        quantity_description: item.quantity_description,
        category: item.category,
        estimated_shelf_life_days: item.estimated_shelf_life_days,
        source: "texto",
      }));

      const { data: inserted, error: insertError } = await supabaseClient
        .from("pantry_items")
        .insert(rowsToInsert)
        .select();

      if (!insertError) insertedItems = inserted;
      else console.error("Erro ao salvar itens da despensa:", insertError);
    }

    return new Response(
      JSON.stringify({ items: insertedItems, unrecognized: unrecognizedItems }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Erro em parse-pantry-text:", error);
    return new Response(
      JSON.stringify({ error: "Falha ao interpretar a lista de alimentos." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});