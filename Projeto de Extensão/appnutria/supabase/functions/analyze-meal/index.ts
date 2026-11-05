// ============================================================================
// supabase/functions/analyze-meal/index.ts
//
// Esta é uma Supabase Edge Function: um pedacinho de código que roda no
// backend (nos servidores do Supabase), não no celular do usuário.
// Ela recebe a foto de uma refeição, manda para o Gemini analisar, e
// devolve os alimentos identificados + estimativa nutricional em JSON.
//
// Runtime: Deno (por isso os imports são por URL/pacote, não "node_modules").
// ============================================================================

// Importa o SDK oficial do Google para falar com a API do Gemini.
// O prefixo "npm:" diz ao Deno para buscar esse pacote do registro do npm,
// mesmo sem instalação local — ele baixa e guarda em cache automaticamente.
import { GoogleGenAI, Type } from "npm:@google/genai";

// Importa o cliente do Supabase, que vamos usar aqui só para verificar se
// quem está chamando essa função é um usuário autenticado de verdade
// (e não alguém tentando usar sua chave do Gemini de graça).
import { createClient } from "npm:@supabase/supabase-js@2";

// ----------------------------------------------------------------------------
// CORS = Cross-Origin Resource Sharing.
// Em resumo: é uma regra de segurança dos navegadores/apps que bloqueia,
// por padrão, que um app chame uma API "de fora". Precisamos avisar
// explicitamente que está tudo bem o app do Nutria chamar esta função,
// devolvendo esses cabeçalhos (headers) em toda resposta.
// ----------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // em produção, troque "*" pelo domínio real do app, se aplicável
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ----------------------------------------------------------------------------
// O schema é a "planta" do JSON que queremos que o Gemini devolva.
// Em vez de só pedir "responda em JSON" no texto do prompt (o que às vezes
// falha), usamos o recurso de "saída estruturada" da API: o Gemini é
// obrigado a seguir exatamente este formato, com estes tipos de dado.
// Isso é o que chamamos de responseSchema.
// ----------------------------------------------------------------------------
const nutritionSchema = {
  type: Type.OBJECT,
  properties: {
    meal_title: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          estimated_quantity: { type: Type.STRING },
          confidence: { type: Type.STRING }, // "alta" | "média" | "baixa"
          // "recognized" é diferente de "confidence": confidence mede
          // incerteza sobre QUAL alimento é ou QUANTO tem; recognized
          // marca o caso extremo em que não dá pra dizer que aquilo é
          // comida (ex.: objeto não alimentar na foto). Quando false,
          // não fabricamos números — o app deve tratar isso como um erro
          // de item, não como uma estimativa válida.
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
          // Frase pronta para a busca na FatSecret + o idioma em que essa
          // busca deve ser feita. Alimentos internacionais (ex.: "Cinnamon
          // roll", "Challah") costumam ter mais chance de match na base em
          // inglês do que na base em português.
          fatsecret_query: { type: Type.STRING },
          fatsecret_query_language: { type: Type.STRING, enum: ["pt", "en"] },
        },
        required: [
          "name",
          "estimated_quantity",
          "confidence",
          "recognized",
        ],
      },
    },
    total_estimated_nutrition: {
      type: Type.OBJECT,
      properties: {
        calories_kcal: { type: Type.NUMBER },
        carbs_g: { type: Type.NUMBER },
        protein_g: { type: Type.NUMBER },
        fat_g: { type: Type.NUMBER },
      },
      required: ["calories_kcal", "carbs_g", "protein_g", "fat_g"],
    },
    // Frase única, em português, combinando todos os itens identificados —
    // pronta para ser enviada ao endpoint de Processamento de Linguagem
    // Natural (NLP) da FatSecret, que aceita uma descrição de refeição
    // inteira em vez de exigir um item por chamada.
    fatsecret_query: { type: Type.STRING },
    is_estimate: { type: Type.BOOLEAN },
    notes: { type: Type.STRING },
  },
  required: [
    "meal_title",
    "items",
    "total_estimated_nutrition",
    "fatsecret_query",
    "is_estimate",
    "notes",
  ],
};

// As instruções de sistema definem "quem" o Gemini deve ser nesta tarefa.
// Ficam separadas do prompt do usuário para não se misturarem com o que
// vier do app.
const SYSTEM_INSTRUCTION = `
Você é o motor de análise nutricional de imagens do aplicativo Nutria.
Você recebe UMA foto de refeição e deve identificar os alimentos visíveis,
estimando por item e no total: calorias, carboidratos, proteínas e gorduras.

Regras:
1. estimated_quantity deve ser uma estimativa em gramas ou medida caseira
   (ex.: "150g", "1 unidade média"), baseada no tamanho do prato/talheres
   como referência visual.
2. fatsecret_query deve ser uma única frase descrevendo a refeição inteira
   com quantidades, no idioma indicado em fatsecret_query_language — será
   usada depois no endpoint de Processamento de Linguagem Natural da
   FatSecret para consultar um banco de dados nutricional.
3. Alimentos podem ter nomes de origem estrangeira, mesmo em fotos de
   usuários brasileiros (ex.: "Cinnamon roll", "Challah/Hallah", "Croissant").
   Identifique-os normalmente. Em "name", use a tradução em português
   somente se ela for amplamente reconhecida e comum (ex.: "Croissant" pode
   virar "Croissant" mesmo, já que é o nome usual no Brasil); quando não
   houver equivalente natural, mantenha o nome original do prato.
4. fatsecret_query_language deve ser "en" quando o alimento for mais
   provável de ser encontrado na base internacional/em inglês da FatSecret
   (pratos estrangeiros, marcas internacionais, nomes próprios sem tradução
   comum) e "pt" para pratos e ingredientes tipicamente brasileiros.
5. Se não tiver certeza de QUAL é o alimento ou de QUANTO tem, mas ainda
   assim reconhece que é comida, inclua-o com "recognized": true e
   "confidence": "baixa" — nunca omita um item visível só por incerteza.
6. Use "recognized": false APENAS no caso extremo em que o item da foto
   claramente não é um alimento identificável (ex.: objeto não alimentar,
   região da foto ilegível/cortada). Nesse caso, preencha
   "unrecognized_reason" explicando brevemente em português, e NÃO
   preencha estimated_nutrition nem fatsecret_query para esse item — não
   invente números para algo que não foi reconhecido como comida.
7. Todos os campos de texto (exceto fatsecret_query quando em inglês)
   devem estar em português do Brasil.
8. is_estimate deve ser sempre "true".
9. Em "notes", registre qualquer observação relevante (ex.: prato
   parcialmente coberto, ângulo ruim, item não identificado).
`.trim();

// ----------------------------------------------------------------------------
// Deno.serve é o "ponto de entrada" da função — o Supabase chama essa
// função toda vez que uma requisição HTTP chega neste endpoint.
// "req" é a requisição recebida; o que retornamos vira a resposta HTTP.
// ----------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Navegadores/apps mandam uma requisição "OPTIONS" antes da de verdade,
  // só para perguntar "posso chamar essa API?" (isso faz parte do CORS).
  // Aqui só respondemos "sim, pode" e encerramos, sem processar nada.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --------------------------------------------------------------------
    // PASSO 1 — Verificar se quem está chamando é um usuário autenticado.
    // O app do Nutria deve enviar o token de login do usuário no cabeçalho
    // "Authorization". Usamos o cliente do Supabase para validar esse
    // token e descobrir quem é o usuário.
    // --------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Requisição sem token de autenticação." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cria um cliente do Supabase "em nome do usuário", usando a URL e a
    // chave pública (anon key) do projeto — ambas já ficam disponíveis
    // automaticamente dentro de toda Edge Function, sem precisar configurar.
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

    // TODO (futuro — depende do Must #3, sistema de pagamento):
    // Antes de chamar o Gemini, consultar a tabela "subscriptions" e
    // verificar se userData.user.id tem assinatura ativa. Se não tiver,
    // devolver 403 (acesso negado) aqui, sem gastar chamada de IA.

    // TODO (futuro — extensão de precisão nutricional com FatSecret):
    // Depois de receber "analysis" do Gemini (mais abaixo), usar os campos
    // "fatsecret_query" / "fatsecret_query_language" de cada item para
    // chamar o endpoint de Processamento de Linguagem Natural da
    // FatSecret (POST /natural-language-processing/v1, com "region" e
    // "language" derivados de fatsecret_query_language), autenticando com
    // um token OAuth 2.0 obtido via Client ID + Client Secret (diferente
    // do par app_id/app_key usado por outros provedores). O resultado
    // devolvido pela FatSecret substituiria os números estimados pelo
    // Gemini pelos valores reais do banco de dados nutricional.
    //
    // IMPORTANTE: só nesse ponto futuro é possível saber se um alimento
    // "não existe na base" da FatSecret (ex.: prato regional muito
    // específico) — o Gemini, sozinho, não consulta a FatSecret, então
    // não tem como saber isso hoje. Quando essa função existir, trate a
    // ausência de resultado da FatSecret assim: mantenha o
    // "estimated_nutrition" que o Gemini já calculou para aquele item (em
    // vez de mostrar um erro ou zerar os valores) e sinalize no dado
    // devolvido ao app que aquele item ficou como "estimativa da IA, não
    // conferida na base nutricional" — assim o usuário não perde a
    // informação, só sabe que ela é menos precisa que a dos demais itens.

    // --------------------------------------------------------------------
    // PASSO 2 — Ler os dados enviados pelo app.
    // Esperamos um corpo JSON como: { "imageBase64": "...", "mimeType": "image/jpeg" }
    // Base64 é uma forma de representar uma imagem como texto, para poder
    // enviá-la dentro de um JSON.
    // --------------------------------------------------------------------
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: "Envie 'imageBase64' e 'mimeType' no corpo da requisição." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --------------------------------------------------------------------
    // PASSO 3 — Criar o cliente do Gemini.
    // A chave nunca aparece aqui no código: Deno.env.get() busca o valor
    // que você salvou com "supabase secrets set GEMINI_API_KEY=...".
    // --------------------------------------------------------------------
    const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });

    // --------------------------------------------------------------------
    // PASSO 4 — Chamar o modelo, enviando a imagem + o pedido de análise.
    // "contents" é a lista de partes da mensagem: aqui, uma imagem e um
    // texto curto pedindo a análise.
    // --------------------------------------------------------------------
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: "Analise a imagem da refeição anexada e devolva o JSON conforme o schema definido." },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        // temperature baixa = respostas mais consistentes/previsíveis,
        // ideal para uma tarefa de extração de dados (não criativa).
        temperature: 0.3,
        // Força a resposta a ser JSON válido, seguindo o schema definido acima.
        responseMimeType: "application/json",
        responseSchema: nutritionSchema,
      },
    });

    // response.text já vem como uma string JSON (graças ao responseSchema).
    // Convertemos essa string para um objeto JavaScript de verdade.
    const analysis = JSON.parse(response.text ?? "{}");

    // --------------------------------------------------------------------
    // PASSO 5 — Devolver o resultado para o app.
    // Tudo que a Edge Function retorna aqui é o que o app Expo vai receber
    // como resposta da chamada de rede.
    //
    // NOTA IMPORTANTE PARA QUEM INTEGRAR O FRONT-END:
    // Esta função roda ANTES de o post existir (o usuário ainda está
    // revisando a análise, pode editar itens com "reanalyze-item", e só
    // decide publicar depois) — por isso ela não salva nada na tabela
    // "meal_analyses" (que exige um post_id válido, e o post ainda não
    // foi criado). O fluxo completo de publicação, em AddCaptionScreen.js,
    // deve ficar assim:
    //   1. Inserir o post normalmente em "posts" (como já é feito hoje).
    //   2. Com o "id" do post retornado, inserir uma linha em
    //      "meal_analyses" com esse post_id + os dados desta análise
    //      (ou da versão já editada pelo usuário, se ele corrigiu algo).
    // Esse passo 2 é um insert direto (protegido por RLS), no mesmo
    // padrão já usado para "posts" — não precisa de outra Edge Function.
    // --------------------------------------------------------------------
    return new Response(JSON.stringify(analysis), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    // Se qualquer coisa der errado (imagem inválida, Gemini fora do ar,
    // JSON malformado etc.), caímos aqui em vez de a função travar.
    console.error("Erro em analyze-meal:", error);
    return new Response(
      JSON.stringify({ error: "Falha ao analisar a refeição. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});