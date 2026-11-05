// ============================================================================
// supabase/functions/suggest-meals/index.ts
//
// Gera sugestões de refeições personalizadas: 5 horários (café da manhã,
// almoço, lanche da tarde, jantar, lanche da noite) x 3 sugestões cada
// (despensa / rápido / capricho), considerando o objetivo do usuário e os
// itens que ele tem na despensa (tabela "pantry_items").
// ============================================================================

import { GoogleGenAI, Type } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Um item de ingrediente dentro de uma receita.
const ingredientSchema = {
  type: Type.OBJECT,
  properties: {
    quantity_and_unit: { type: Type.STRING }, // ex.: "2 xícaras", "3 colheres de sopa"
    name: { type: Type.STRING },
    // true = o usuário já tem esse ingrediente na despensa cadastrada.
    // Só é relevante calcular isso quando a despensa tem itens; com a
    // despensa vazia, todo ingrediente vem "available_in_pantry": false,
    // e o app simplesmente não deve exibir esse aviso nesse caso (ver
    // OBS 1 na explicação em texto).
    available_in_pantry: { type: Type.BOOLEAN },
  },
  required: ["quantity_and_unit", "name", "available_in_pantry"],
};

const recipeSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    prep_time_minutes: { type: Type.INTEGER },
    difficulty: { type: Type.STRING, enum: ["facil", "media", "dificil"] },
    servings: { type: Type.INTEGER },
    ingredients: { type: Type.ARRAY, items: ingredientSchema },
    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
    chef_tips: { type: Type.ARRAY, items: { type: Type.STRING } },
    // Frase curta (nome do prato + característica visual) para uma busca
    // futura em uma API de banco de imagens — NÃO é usada pelo Gemini
    // para gerar nem buscar a imagem em si.
    image_search_query: { type: Type.STRING },
  },
  required: ["title", "prep_time_minutes", "difficulty", "servings", "ingredients", "steps", "chef_tips"],
};

const suggestionSchema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ["despensa", "rapido", "capricho"] },
    type_label: { type: Type.STRING }, // "Com base na sua despensa" | "Fácil e rápido" | "No capricho"
    // false só deve acontecer no tipo "despensa", quando não é possível
    // montar nenhuma receita razoável só com os itens da lista.
    active: { type: Type.BOOLEAN },
    inactive_reason: { type: Type.STRING }, // preenchido só quando active = false
    recipe: recipeSchema, // omitido/ignorado pelo app quando active = false
  },
  required: ["type", "type_label", "active"],
};

const mealSectionSchema = {
  type: Type.OBJECT,
  properties: {
    meal_time: {
      type: Type.STRING,
      enum: ["cafe_da_manha", "almoco", "lanche_da_tarde", "jantar", "lanche_da_noite"],
    },
    // Só relevante para "lanche_da_noite" — as outras 4 seções são sempre
    // aplicáveis.
    applicable: { type: Type.BOOLEAN },
    applicability_note: { type: Type.STRING },
    suggestions: { type: Type.ARRAY, items: suggestionSchema }, // sempre 3 posições
  },
  required: ["meal_time", "applicable", "suggestions"],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    pantry_status: {
      type: Type.STRING,
      enum: ["vazia", "insuficiente", "itens_invalidos", "inadequada_para_objetivo", "ok"],
    },
    pantry_status_note: { type: Type.STRING },
    sections: { type: Type.ARRAY, items: mealSectionSchema }, // sempre 5 posições
  },
  required: ["pantry_status", "sections"],
};

function buildSystemInstruction(goalLabel: string) {
  return `
Você é o motor de sugestões de refeições do aplicativo Nutria. Gere um
plano de sugestões para as 5 seções do dia: café da manhã, almoço, lanche
da tarde, jantar e lanche da noite — nessa ordem, com 3 sugestões cada.

O objetivo alimentar do usuário é: ${goalLabel}. Toda sugestão deve ser
coerente com esse objetivo (ex.: mais proteína e leve superávit calórico
para ganho de massa; déficit calórico moderado e saciedade para
emagrecimento; equilíbrio para manutenção).

As três sugestões de cada seção, sempre nesta ordem:
1. type "despensa" (type_label "Com base na sua despensa"): use
   SOMENTE ingredientes da lista de despensa fornecida (pode indicar 1-2
   itens extras pequenos e comuns, como sal ou óleo, presumindo que a
   pessoa sempre tem em casa). Se não for possível montar nenhuma receita
   razoável só com a despensa informada, marque "active": false e explique
   o motivo em "inactive_reason" (ex.: "despensa vazia", "poucos itens
   cadastrados", "itens não formam uma refeição coerente"). Não invente
   receita quando active for false — omita o campo "recipe" nesse caso.
2. type "rapido" (type_label "Fácil e rápido"): preparo simples e rápido
   (até ~20 minutos), priorizando também usar itens da despensa quando
   possível, mas sem a obrigação de usar só ela.
3. type "capricho" (type_label "No capricho"): preparo mais elaborado,
   para quando o usuário tiver tempo extra — pode usar qualquer
   ingrediente, sem depender da despensa.

Regras gerais:
1. Receitas devem ser simples, de ingredientes baratos e comuns no Brasil,
   e realistas para o dia a dia (evite ingredientes exóticos ou
   equipamentos incomuns).
2. Em "ingredients", marque "available_in_pantry": true APENAS para
   ingredientes que estão literalmente na lista de despensa fornecida;
   todo o resto deve vir como false.
3. "image_search_query" deve ser uma frase curta e descritiva do prato,
   em português (ex.: "tapioca recheada com queijo e tomate"), para uso
   futuro em uma busca de imagem — não tente descrever uma URL nem
   inventar que a imagem já existe.
4. Para a seção "lanche_da_noite": marque "applicable": true
   principalmente quando o objetivo for ganho de massa muscular (uma
   refeição extra ajuda no superávit calórico). Para emagrecimento e
   manutenção, normalmente marque "applicable": false, com uma nota breve
   em "applicability_note" explicando que não costuma ser necessário,
   mas pode ser incluído se o usuário sentir fome. Quando "applicable" for
   false, ainda assim devolva a lista "suggestions" vazia.
5. pantry_status deve refletir a lista de despensa fornecida no início da
   conversa: "vazia" (lista sem nenhum item), "insuficiente" (poucos itens
   para formar refeições), "itens_invalidos" (itens que não parecem
   alimentos de verdade), "inadequada_para_objetivo" (ex.: sem nenhuma
   fonte de proteína para quem quer ganhar massa), ou "ok". Em
   "pantry_status_note", explique brevemente o motivo em português.
6. Todos os campos de texto devem estar em português do Brasil.
`.trim();
}

// Chaves EXATAS gravadas em profiles.goal (conferidas em GoalScreen.js) —
// não são "emagrecimento"/"manutencao"/"ganho_massa" como eu tinha
// assumido antes de ver o código real.
const GOAL_LABELS: Record<string, string> = {
  Emagrecimento: "Emagrecimento",
  massa: "Ganho de massa muscular",
  definir: "Manutenção calórica",
};

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
    const userId = userData.user.id;

    // TODO (futuro — depende do Must #3): checagem de assinatura ativa,
    // igual às outras funções — sugestões são um recurso Premium.

    // -------------------------------------------------------------------
    // PASSO 1 — Descobrir o objetivo do usuário (definido no onboarding).
    // -------------------------------------------------------------------
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("goal")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.goal) {
      return new Response(
        JSON.stringify({ error: "Não foi possível carregar o objetivo do usuário." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------------
    // PASSO 2 — Buscar a despensa do usuário (pode vir vazia — é
    // exatamente o cenário padrão hoje, enquanto a tela da despensa ainda
    // não existe no app; ver OBS 1 na explicação em texto).
    // -------------------------------------------------------------------
    const { data: pantryItems } = await supabaseClient
      .from("pantry_items")
      .select("name, quantity_description, category")
      .eq("user_id", userId);

    const pantryDescription = (pantryItems && pantryItems.length > 0)
      ? pantryItems.map((i) => `- ${i.quantity_description} de ${i.name} (${i.category})`).join("\n")
      : "(lista de despensa vazia — o usuário ainda não cadastrou nenhum item)";

    const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });

    const goalLabel = GOAL_LABELS[profile.goal] ?? profile.goal;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [{
            text: `Lista de despensa do usuário:\n${pantryDescription}\n\nGere as sugestões conforme as regras definidas.`,
          }],
        },
      ],
      config: {
        systemInstruction: buildSystemInstruction(goalLabel),
        temperature: 0.7, // mais alta que nas outras funções: aqui queremos variedade criativa nas receitas, não extração exata de dados
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const suggestions = JSON.parse(response.text ?? "{}");

    // Não salvamos as sugestões no banco — são geradas sob demanda,
    // sempre que o usuário abrir a tela. Se no futuro quiserem um
    // histórico ou permitir "favoritar" uma sugestão, essa gravação
    // entraria aqui, como uma tabela nova (ex.: "saved_suggestions").
    return new Response(JSON.stringify(suggestions), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro em suggest-meals:", error);
    return new Response(
      JSON.stringify({ error: "Falha ao gerar sugestões de refeições." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});