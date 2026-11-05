// ============================================================================
// supabase/functions/dashboard-report/index.ts
//
// Diferente das outras funções, esta NÃO chama o Gemini. Tudo aqui é
// leitura e soma de dados que já existem no banco — a "inteligência" já
// aconteceu antes, quando cada refeição foi analisada e salva. Gastar uma
// chamada de IA só para somar números já calculados seria desperdício.
//
// SCHEMA REAL (conferido em Database_Nutria_-_Modelo.txt e no código-fonte):
// - "profiles": goal ('Emagrecimento' | 'massa' | 'definir'),
//   calorie_target (meta calórica diária, calculada no onboarding em
//   caloricCalc.js) e streak (ofensiva atual).
// - "posts": cada postagem, com created_at (id é bigint).
// - "meal_analyses": tabela NOVA (criada na migration
//   20260819000001_create_meal_analyses.sql) que guarda o resultado da
//   "analyze-meal" ligado a um post_id.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ----------------------------------------------------------------------------
// Metas de macronutrientes por objetivo, como PORCENTAGEM das calorias
// totais. Isso é um valor padrão/simplificado — se no futuro o Nutria
// passar a guardar metas de macro específicas por usuário (colunas
// próprias em "profiles"), troque esta função por uma leitura direta
// dessas colunas em vez de calcular a partir da porcentagem.
//
// As chaves usadas aqui ("Emagrecimento", "massa", "definir") são os
// valores EXATOS gravados em profiles.goal — conferidos em GoalScreen.js.
// ----------------------------------------------------------------------------
function macroGoalSplitByGoal(goal: string) {
  // { carboidrato, proteína, gordura } como fração de 1 (soma = 1.0)
  switch (goal) {
    case "massa": // Ganho de massa muscular
      return { carbs: 0.45, protein: 0.30, fat: 0.25 };
    case "Emagrecimento":
      return { carbs: 0.40, protein: 0.35, fat: 0.25 };
    case "definir": // Manutenção calórica
    default:
      return { carbs: 0.45, protein: 0.25, fat: 0.30 };
  }
}

// Converte a meta de calorias + o split percentual em gramas de cada
// macro. 1g de carboidrato ou proteína = 4 kcal; 1g de gordura = 9 kcal —
// são as constantes nutricionais padrão, não um valor inventado.
function macroGramsFromCalorieGoal(calorieGoal: number, goal: string) {
  const split = macroGoalSplitByGoal(goal);
  return {
    carbs_g: Math.round((calorieGoal * split.carbs) / 4),
    protein_g: Math.round((calorieGoal * split.protein) / 4),
    fat_g: Math.round((calorieGoal * split.fat) / 9),
  };
}

// Formata uma data como "AAAA-MM-DD" no fuso local — usado como chave do
// calendário e para comparar "esse post foi hoje?".
function toDateKey(date: Date) {
  return date.toISOString().split("T")[0];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Mesmo padrão de autenticação das funções anteriores.
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

    // -------------------------------------------------------------------
    // O app pode pedir um mês específico (ex.: para o usuário navegar
    // para meses anteriores no calendário). Se não vier nada, usamos o
    // mês atual. Formato esperado: "?month=2026-08" na URL.
    // -------------------------------------------------------------------
    const url = new URL(req.url);
    const monthParam = url.searchParams.get("month"); // "2026-08"
    const now = new Date();
    const [year, month] = monthParam
      ? monthParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1)); // primeiro dia do mês seguinte (exclusivo)

    // -------------------------------------------------------------------
    // PASSO 1 — Buscar o perfil (objetivo + meta calórica + streak atual).
    // Nomes de coluna conferidos no schema real: "calorie_target" e
    // "streak" (não "daily_calorie_goal"/"current_streak").
    // -------------------------------------------------------------------
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("goal, calorie_target, streak")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Não foi possível carregar o perfil do usuário." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const macroGoals = macroGramsFromCalorieGoal(profile.calorie_target, profile.goal);

    // -------------------------------------------------------------------
    // PASSO 2 — Buscar as análises nutricionais (tabela "meal_analyses")
    // de todos os posts do usuário dentro do mês pedido. Usamos um JOIN
    // implícito do PostgREST (o "!inner" filtra só posts que já têm uma
    // análise salva) para já vir com a data da postagem junto.
    // -------------------------------------------------------------------
    const { data: monthAnalyses, error: analysesError } = await supabaseClient
      .from("meal_analyses")
      .select("calories_kcal, carbs_g, protein_g, fat_g, posts!inner(created_at)")
      .eq("user_id", userId)
      .gte("posts.created_at", monthStart.toISOString())
      .lt("posts.created_at", monthEnd.toISOString());

    if (analysesError) {
      return new Response(
        JSON.stringify({ error: "Não foi possível carregar as análises nutricionais do mês." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------------
    // PASSO 3 — Agrupar por dia, somando os valores de todas as refeições
    // postadas naquele dia. Fazemos isso em JavaScript (não em SQL) porque
    // o volume de dados é pequeno (posts de UM usuário em UM mês) — não
    // compensa a complexidade de uma consulta SQL de agregação para isso.
    // -------------------------------------------------------------------
    type DayTotals = { calories_kcal: number; carbs_g: number; protein_g: number; fat_g: number };
    const totalsByDay = new Map<string, DayTotals>();

    for (const analysis of monthAnalyses ?? []) {
      // O PostgREST devolve o post relacionado como um objeto (ou array,
      // dependendo da versão) dentro de "posts" — tratamos os dois casos.
      const relatedPost = Array.isArray(analysis.posts) ? analysis.posts[0] : analysis.posts;
      if (!relatedPost?.created_at) continue;

      const dayKey = toDateKey(new Date(relatedPost.created_at));
      const current = totalsByDay.get(dayKey) ?? { calories_kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 };
      totalsByDay.set(dayKey, {
        calories_kcal: current.calories_kcal + (analysis.calories_kcal ?? 0),
        carbs_g: current.carbs_g + (analysis.carbs_g ?? 0),
        protein_g: current.protein_g + (analysis.protein_g ?? 0),
        fat_g: current.fat_g + (analysis.fat_g ?? 0),
      });
    }

    // -------------------------------------------------------------------
    // PASSO 4 — Montar os dados de "hoje".
    // -------------------------------------------------------------------
    const todayKey = toDateKey(now);
    const todayTotals = totalsByDay.get(todayKey) ?? {
      calories_kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0,
    };

    // -------------------------------------------------------------------
    // PASSO 5 — Montar o calendário do mês: um booleano por dia dizendo
    // se a ofensiva foi mantida (ou seja, se houve ao menos 1 post naquele
    // dia — a mesma regra de negócio já usada pelo streak do app, RN05).
    // -------------------------------------------------------------------
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const streakCalendar: Record<string, boolean> = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const key = toDateKey(new Date(Date.UTC(year, month - 1, day)));
      streakCalendar[key] = totalsByDay.has(key);
    }

    // -------------------------------------------------------------------
    // PASSO 6 — Montar a série para o gráfico de linhas do mês: uma
    // entrada por dia (mesmo os dias sem post entram, com zero, para o
    // gráfico não "pular" datas).
    // -------------------------------------------------------------------
    const monthlyTrend = Object.keys(streakCalendar).map((dateKey) => ({
      date: dateKey,
      ...(totalsByDay.get(dateKey) ?? { calories_kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }),
    }));

    // -------------------------------------------------------------------
    // PASSO 7 — Devolver tudo junto. O front-end usa "today" para os
    // números do topo do dashboard, "streak_calendar" para pintar os dias
    // do calendário, e "monthly_trend" para desenhar o gráfico de linhas
    // (uma linha por chave: calories_kcal, carbs_g, protein_g, fat_g —
    // cada uma com sua cor e legenda na hora de renderizar).
    // -------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        current_streak: profile.streak,
        today: {
          consumed: todayTotals,
          goal: {
            calories_kcal: profile.calorie_target,
            ...macroGoals,
          },
        },
        streak_calendar: streakCalendar,
        monthly_trend: monthlyTrend,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Erro em dashboard-report:", error);
    return new Response(
      JSON.stringify({ error: "Falha ao montar o relatório do dashboard." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});