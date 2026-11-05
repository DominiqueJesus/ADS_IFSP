-- ============================================================================
-- supabase/migrations/20260819000000_create_pantry_items.sql
--
-- Cria a tabela que guarda os itens da despensa/geladeira de cada usuário.
-- Migrations são arquivos SQL versionados: cada um representa uma mudança
-- no banco, aplicada em ordem (por isso o nome começa com data/hora).
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),

  -- Dono do item. "references auth.users" garante que esse id só pode ser
  -- de um usuário que realmente existe no sistema de autenticação.
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,

  -- Guardamos a quantidade como texto livre (ex.: "500g", "3 unidades"),
  -- no mesmo estilo já usado em "estimated_quantity" das outras funções —
  -- mais simples de exibir e editar do que separar número + unidade.
  quantity_description text not null,

  -- Categoria para agrupar a lista na tela (vegetais, frutas, cereais,
  -- carnes, laticínios, etc.). Preenchida pela IA no momento da entrada
  -- (foto ou texto), não pelo usuário diretamente.
  category text,

  -- Prazo de validade típico, em dias, estimado pela IA com base no tipo
  -- de alimento (ex.: alface ~5 dias, arroz ~365 dias). Usado para
  -- calcular se o item "está há tempo demais" quando o usuário não
  -- informa uma data de validade exata.
  estimated_shelf_life_days integer,

  -- Data de validade exata, só quando o usuário souber/informar (ex.: lida
  -- de uma embalagem). Quando preenchida, tem prioridade sobre o cálculo
  -- por estimated_shelf_life_days.
  expiration_date date,

  -- De onde esse item veio: preenchido manualmente, por foto ou por texto
  -- digitado. Não afeta o funcionamento, só ajuda a entender/depurar dados
  -- depois (ex.: "os itens vindos de foto erram mais that tal categoria?").
  source text not null check (source in ('manual', 'foto', 'texto')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Acelera a consulta mais comum: "me dê todos os itens deste usuário".
create index if not exists pantry_items_user_id_idx on public.pantry_items(user_id);

-- ----------------------------------------------------------------------------
-- RLS (Row Level Security) = trava no nível de cada linha da tabela.
-- Sem isso, com a RLS ativada mas sem nenhuma "policy" (regra), NINGUÉM
-- consegue ler/escrever na tabela — nem o próprio dono. Por isso, depois
-- de habilitar, precisamos criar as regras explicando quem pode o quê.
-- ----------------------------------------------------------------------------
alter table public.pantry_items enable row level security;

-- Regra única cobrindo select/insert/update/delete: o usuário só enxerga e
-- só mexe nas linhas onde user_id é o dele mesmo (auth.uid() é o id do
-- usuário autenticado que fez a requisição).
create policy "Usuários gerenciam apenas seus próprios itens de despensa"
  on public.pantry_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);