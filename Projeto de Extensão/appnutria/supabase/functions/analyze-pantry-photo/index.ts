// ============================================================================
// supabase/functions/analyze-pantry-photo/index.ts
//
// Recebe uma foto da geladeira/despensa do usuário e identifica quais
// alimentos aparecem e uma estimativa de quantidade — SEM calcular
// informação nutricional (isso só faz sentido para refeições prontas,
// não para itens crus guardados na despensa).
//
// Mesmo padrão de autenticação e CORS das funções anteriores.
// ============================================================================

import { GoogleGenAI, Type } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Lista fechada de categorias — usar um "enum" aqui (em vez de deixar o
// Gemini inventar o texto livremente) evita ter "Vegetais", "vegetal" e
// "Legumes e verduras" todos representando a mesma coisa no banco.
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
    quantity_description: { type: Type.STRING }, // ex.: "500g", "3 unidades", "meio pote"
    category: { type: Type.STRING, enum: CATEGORY_ENUM },
    // Estimativa de validade típica para ESSE tipo de alimento, em dias,
    // a partir de hoje — usada depois para calcular alertas de "item
    // parado há muito tempo" sem precisar de outra chamada de IA a cada
    // vez que a lista for exibida.
    estimated_shelf_life_days: { type: Type.INTEGER },
    confidence: { type: Type.STRING }, // "alta" | "média" | "baixa"
  },
  required: ["name", "quantity_description", "category", "estimated_shelf_life_days", "confidence"],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    items: { type: Type.ARRAY, items: pantryItemSchema },
    notes: { type: Type.STRING },
  },
  required: ["items", "notes"],
};

const SYSTEM_INSTRUCTION = `
Você é o motor de identificação de despensa do aplicativo Nutria. Você
recebe UMA foto do interior de uma geladeira, armário ou despensa, e deve
listar cada alimento visível, com uma estimativa de quantidade.

Regras:
1. NÃO calcule informação nutricional aqui — essa função serve só para
   inventariar o que a pessoa tem disponível, não para analisar uma
   refeição pronta.
2. quantity_description deve ser uma estimativa visual razoável (ex.:
   "aprox. 1kg", "3 unidades", "meio pote"), nunca invente uma precisão
   que a imagem não permite confirmar.
3. category deve ser exatamente um dos valores permitidos pelo schema —
   nunca crie uma categoria nova fora da lista.
4. estimated_shelf_life_days é a validade TÍPICA daquele tipo de alimento
   quando guardado normalmente (ex.: alface ~5, arroz cru ~365, ovos ~30),
   não uma leitura de rótulo (a foto pode não mostrar isso). Use seu
   conhecimento geral de conservação de alimentos.
5. Alimentos parcialmente visíveis ou embalagens sem rótulo legível ainda
   devem ser listados com sua melhor estimativa e "confidence": "baixa" —
   não omita um item só por incerteza.
6. Todos os campos de texto devem estar em português do Brasil.
7. Em "notes", registre observações relevantes (ex.: "parte da prateleira
   de baixo não está visível na foto").
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

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: "Envie 'imageBase64' e 'mimeType' no corpo da requisição." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: "Identifique os alimentos visíveis nesta foto de despensa/geladeira, com quantidade estimada." },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const result = JSON.parse(response.text ?? '{"items":[],"notes":""}');

    // -------------------------------------------------------------------
    // Diferente da "analyze-meal" (que só devolve a análise para exibição
    // e deixa o usuário decidir se publica), aqui já inserimos os itens
    // direto na tabela "pantry_items" — o usuário revisa/edita DEPOIS de
    // já estarem salvos, em vez de precisar confirmar antes de salvar.
    // Isso é uma escolha de produto; se preferirem exigir confirmação
    // antes de gravar, basta remover este bloco e devolver "result.items"
    // para o app decidir quando chamar um insert separado.
    // -------------------------------------------------------------------
    const rowsToInsert = result.items.map((item: {
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
      source: "foto",
    }));

    let insertedItems = [];
    if (rowsToInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabaseClient
        .from("pantry_items")
        .insert(rowsToInsert)
        .select();

      if (insertError) {
        console.error("Erro ao salvar itens da despensa:", insertError);
        // Mesmo se salvar falhar, ainda devolvemos a análise da IA — o
        // usuário não perde o resultado, só precisa salvar manualmente.
      } else {
        insertedItems = inserted;
      }
    }

    return new Response(
      JSON.stringify({ items: insertedItems, notes: result.notes }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Erro em analyze-pantry-photo:", error);
    return new Response(
      JSON.stringify({ error: "Falha ao analisar a foto da despensa." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});