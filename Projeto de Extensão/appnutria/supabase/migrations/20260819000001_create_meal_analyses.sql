-- ============================================================================
-- supabase/migrations/20260819000001_create_meal_analyses.sql
--
-- Guarda o resultado da análise de IA de cada postagem — separado da
-- tabela "posts" (que já existe e não deve ser alterada) para não misturar
-- dados de rede social com dados nutricionais, e para facilitar consultas
-- de agregação (ex.: o dashboard soma isso por dia).
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.meal_analyses (
  id uuid primary key default gen_random_uuid(),

  -- "posts.id" é bigint (não uuid) — conferido no schema real do projeto.
  -- "unique" garante no máximo 1 análise por post (relação 1-para-1).
  post_id bigint not null unique references public.posts(id) on delete cascade,

  -- Guardado de novo aqui (mesmo já existindo em posts.user_id) para
  -- simplificar a política de RLS abaixo, sem precisar de um JOIN.
  user_id uuid not null references public.profiles(id) on delete cascade,

  calories_kcal numeric not null,
  carbs_g numeric not null,
  protein_g numeric not null,
  fat_g numeric not null,

  -- Detalhe por item identificado (o mesmo array "items" que a função
  -- "analyze-meal" devolve), guardado como jsonb para não precisar de
  -- tabelas extras para cada alimento individual.
  items jsonb not null,

  is_estimate boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists meal_analyses_user_id_idx on public.meal_analyses(user_id);
create index if not exists meal_analyses_post_id_idx on public.meal_analyses(post_id);

alter table public.meal_analyses enable row level security;

-- Leitura: qualquer usuário autenticado pode ver a análise de qualquer
-- post — mesma regra do restante do feed (posts/likes/comments já são
-- públicos entre usuários logados), já que o resumo nutricional aparece
-- publicamente embaixo da foto no feed.
create policy "Qualquer usuário autenticado pode ler análises de refeição"
  on public.meal_analyses
  for select
  using (auth.role() = 'authenticated');

-- Escrita: só o dono do post pode inserir/alterar a análise dele.
create policy "Usuários só inserem/alteram suas próprias análises"
  on public.meal_analyses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);