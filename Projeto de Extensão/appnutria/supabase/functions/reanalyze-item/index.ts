// ============================================================================
// supabase/functions/reanalyze-item/index.ts
//
// Esta Edge Function reanalisa itens de refeição que o usuário EDITOU
// manualmente (mudou o alimento e/ou a quantidade) — sem reenviar a foto.
//
// Aceita UM ou VÁRIOS itens editados ao mesmo tempo (ex.: o usuário
// corrigiu 3 dos 5 alimentos identificados), resolvendo tudo em uma única
// chamada ao Gemini. Isso é importante para custo: cada chamada à API tem
// um "peso fixo" (as instruções de sistema, o overhead da requisição),
// então mandar 3 itens de uma vez custa bem menos que 3 chamadas
// separadas de 1 item cada.
//
// Por não enviar imagem, o custo por item aqui também é muito menor que
// na "analyze-meal": só texto de entrada, sem os tokens de imagem.
// ============================================================================

import { GoogleGenAI, Type } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Limite de segurança: mesmo no "pior caso" citado (usuário edita todos os
// itens), uma refeição real dificilmente passa disso. Evita que uma
// requisição malformada ou abusiva mande uma lista gigante numa única
// chamada (o que aumentaria muito o custo de uma vez só).
const MAX_ITEMS_PER_REQUEST = 20;

// Schema de UM item (reaproveitado dentro do array de resposta abaixo).
// Sem campo "confidence": o usuário já confirmou o alimento manualmente,
// então não há incerteza sobre identificação, só a possibilidade de o
// texto digitado ser ilegível/sem sentido — coberta pelo campo
// "recognized" abaixo.
const singleItemSchema = {
  type: Type.OBJECT,
  properties: {
    // "input_index" amarra a resposta ao item de entrada correspondente —
    // ver explicação mais abaixo, no comentário sobre correspondência.
    input_index: { type: Type.INTEGER },
    name: { type: Type.STRING },
    estimated_quantity: { type: Type.STRING },
    // Quando o texto digitado pelo usuário não corresponde a nenhum
    // alimento identificável (erro de digitação grave, texto sem sentido,
    // campo vazio disfarçado, etc.), "recognized" vem false. Nesse caso,
    // não fabricamos números — o app deve tratar isso como um erro de
    // item, pedindo para o usuário reescrever, em vez de aceitar uma
    // estimativa inventada.
    recognized: { type: Type.BOOLEAN },
    unrecognized_reason: { type: Type.STRING }, // preenchido só quando recognized = false
    estimated_nutrition: {
      type: Type.OBJECT,
      properties: {
        calories_kcal: { type: Type.NUMBER },
        carbs_g: { type: Type.NUMBER },
        protein_g: { type: Type.NUMBER },
        fat_g: { type: Type.NUMBER },
      },
      required: ["calories_kcal", "carbs_g", "protein_g", "fat_g"],
    },
    // Frase pronta para a busca na FatSecret + o idioma em que essa busca
    // deve ser feita. Alimentos internacionais (ex.: "Cinnamon roll",
    // "Challah") costumam ter mais chance de match na base em inglês do
    // que na base em português.
    fatsecret_query: { type: Type.STRING },
    fatsecret_query_language: { type: Type.STRING, enum: ["pt", "en"] },
  },
  required: [
    "input_index",
    "name",
    "estimated_quantity",
    "recognized",
  ],
};

// A resposta agora é sempre uma lista de itens — mesmo quando só 1 item
// foi editado, ela vem como uma lista de 1 posição. Isso mantém o
// contrato da API simples e único (o app não precisa tratar "resposta de
// item único" e "resposta de lista" como dois formatos diferentes).
const reanalysisSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: singleItemSchema,
    },
  },
  required: ["items"],
};

const SYSTEM_INSTRUCTION = `
Você é o motor de análise nutricional do aplicativo Nutria. Você recebe uma
lista numerada de descrições de alimentos, digitadas ou corrigidas por um
usuário (não uma imagem), e deve estimar as informações nutricionais de
CADA item da lista, de forma independente.

Regras:
1. Processe cada item da lista separadamente — o resultado de um item não
   deve influenciar a estimativa de outro.
2. Devolva exatamente um objeto de resultado para cada item recebido, na
   mesma quantidade. Nunca combine dois itens de entrada em um só
   resultado, nem devolva mais ou menos itens do que os recebidos.
3. "input_index" no resultado deve ser IGUAL ao número da posição do item
   na lista de entrada (começando em 0), para garantir a correspondência
   correta mesmo que a ordem de processamento interna mude.
4. Use a quantidade exatamente como o usuário informou — não arredonde nem
   troque a unidade (se o usuário disse "200g", a resposta deve refletir
   200g, não outra quantidade).
5. estimated_quantity deve repetir a quantidade informada, normalizada de
   forma clara (ex.: "200g", "1 unidade média").
6. Alimentos podem estar escritos em outro idioma além do português,
   inclusive nomes próprios de pratos (ex.: "Cinnamon roll",
   "Challah"/"Hallah", "Croissant"). Reconheça-os normalmente. Em "name",
   use a tradução em português somente se ela for amplamente reconhecida e
   comum; quando não houver equivalente natural, mantenha o nome original
   digitado pelo usuário.
7. fatsecret_query deve ser uma frase curta combinando quantidade +
   alimento, no idioma indicado em fatsecret_query_language, pronta para
   uma busca no banco de dados nutricional da FatSecret.
8. fatsecret_query_language deve ser "en" quando o alimento for mais
   provável de ser encontrado na base internacional/em inglês da FatSecret
   (pratos estrangeiros, marcas internacionais, nomes próprios sem
   tradução comum) e "pt" para pratos e ingredientes tipicamente
   brasileiros.
9. Use "recognized": false APENAS quando o texto digitado não corresponder
   a nenhum alimento identificável (erro de digitação grave, texto sem
   sentido, ou algo que claramente não é comida). Nesse caso, preencha
   "unrecognized_reason" explicando brevemente em português o motivo, e
   NÃO preencha estimated_nutrition nem fatsecret_query para esse item —
   não invente números para um texto que não descreve um alimento.
10. Se o texto for só um pouco ambíguo mas ainda assim descrever algo que
    plausivelmente é comida, trate como "recognized": true e faça a melhor
    estimativa possível — reserve "recognized": false para os casos
    realmente sem solução.
11. Todos os campos de texto (exceto fatsecret_query quando em inglês e
    unrecognized_reason, que também deve estar em português) devem estar
    em português do Brasil.
`.trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // -------------------------------------------------------------------
    // Mesma verificação de autenticação das outras funções — repetida
    // aqui porque cada Edge Function roda isolada.
    // -------------------------------------------------------------------
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

    // TODO (futuro — depende do Must #3): mesma checagem de assinatura
    // ativa mencionada na "analyze-meal".

    // -------------------------------------------------------------------
    // Corpo esperado: uma LISTA de textos, um por item editado.
    // Ex.: { "items": ["200g de arroz integral", "1 filé de frango grelhado"] }
    //
    // Mesmo quando só 1 item foi editado, o app deve enviar uma lista com
    // 1 posição — assim o contrato da API é sempre o mesmo, não importa
    // quantos itens mudaram.
    // -------------------------------------------------------------------
    const { items } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Envie 'items' como uma lista com ao menos 1 texto." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (items.some((i) => typeof i !== "string" || i.trim().length === 0)) {
      return new Response(
        JSON.stringify({ error: "Todos os itens da lista devem ser textos não vazios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (items.length > MAX_ITEMS_PER_REQUEST) {
      return new Response(
        JSON.stringify({ error: `No máximo ${MAX_ITEMS_PER_REQUEST} itens por requisição.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });

    // -------------------------------------------------------------------
    // Monta a lista numerada que vai no prompt, para o Gemini conseguir
    // amarrar cada resultado ao item de entrada certo via "input_index".
    // Ex.:
    //   0. 200g de arroz integral
    //   1. 1 filé de frango grelhado
    // -------------------------------------------------------------------
    const numberedList = items
      .map((text: string, index: number) => `${index}. ${text}`)
      .join("\n");

    // Ainda uma chamada só de texto — sem "inlineData" — por isso mais
    // barata que a "analyze-meal", mesmo processando vários itens juntos.
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Itens editados pelo usuário, um por linha:\n${numberedList}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: reanalysisSchema,
      },
    });

    const result = JSON.parse(response.text ?? '{"items":[]}');

    // -------------------------------------------------------------------
    // Reordena a resposta pela "input_index", por garantia — mesmo que o
    // Gemini já devolva na ordem certa na maioria das vezes, é mais seguro
    // não confiar cegamente na ordem de chegada do array.
    // -------------------------------------------------------------------
    result.items.sort((a: { input_index: number }, b: { input_index: number }) =>
      a.input_index - b.input_index
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro em reanalyze-item:", error);
    return new Response(
      JSON.stringify({ error: "Falha ao reanalisar os itens. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ============================================================================
// NOTA SOBRE O TOTAL DA REFEIÇÃO (calories_kcal, carbs_g etc. somados):
//
// Esta função devolve só os itens recalculados — ela NÃO recalcula o total
// da refeição. Somar os valores nutricionais de uma lista de itens é
// aritmética simples, não exige IA. Quem for integrar esta função (front-
// end, ou uma função utilitária separada) deve substituir cada item
// editado pelo correspondente em "result.items" (usando "input_index" para
// saber qual item da lista original cada resultado atualiza) e então somar
// os quatro campos numéricos de todos os itens (editados ou não) de novo —
// EXCETO os itens com "recognized": false, que não têm "estimated_nutrition"
// e não devem entrar na soma (ver nota sobre necessidade de mudança no
// front, na resposta que acompanha este código).
// ============================================================================