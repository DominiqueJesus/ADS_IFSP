// src/hooks/useFeed.js
//
// Fixes aplicados nesta versão:
//   - BUG 4: fetchPosts limpa a lista antes de setar (evita duplicate keys)
//   - BUG 2: comentários sincronizados via Supabase Realtime por canal por post

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../supabase';

const PAGE_SIZE = 10;

export function useFeed(currentUserId) {
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [page,        setPage]        = useState(0);

  // Ref para guardar canais Realtime ativos por post (postId → channel)
  const realtimeChannels = useRef({});
  const feedPostsChannel = useRef(null);

  // ── BUG 4 CORRIGIDO: Busca inicial com limpeza prévia ─────────────────────
  //
  // PROBLEMA ANTERIOR:
  //   setPosts(withLikes) sobrescrevia o array mas, se prependPost() havia
  //   inserido um post localmente, o refresh buscava esse mesmo post do banco
  //   e o adicionava novamente — dois items com o mesmo id no array.
  //   O React Native lançava erro de "duplicate child key" na FlatList.
  //
  // CORREÇÃO:
  //   Antes de setar os dados novos, zeramos o array com setPosts([]).
  //   Isso garante que o estado começa limpo independente do que havia antes.
  //   Também resetamos `page` e `hasMore` para manter consistência com a paginação.

  const fetchPosts = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setPosts([]);         // ← limpa antes de carregar — elimina duplicatas
    }
    setPage(0);
    setHasMore(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id, image_url, caption, likes_count, created_at,
          profiles ( id, username, avatar_url, streak )
        `)
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (error) throw error;

      const withLikes   = await enrichWithUserLikes(data, currentUserId);
      const withStreaks = await enrichWithCorrectedStreaks(withLikes);
      setPosts(withStreaks);
      setPage(1);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      console.warn('useFeed.fetchPosts:', err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUserId]);

  // ── Realtime: novos posts aparecem no topo / posts excluídos somem ─────────
  useEffect(() => {
    if (feedPostsChannel.current) {
      supabase.removeChannel(feedPostsChannel.current);
      feedPostsChannel.current = null;
    }

    const channel = supabase
      .channel('feed_posts')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'posts',
      }, async (payload) => {
        // Busca o post completo com profile e streak
        const { data } = await supabase
          .from('posts')
          .select('id, image_url, caption, likes_count, created_at, profiles ( id, username, avatar_url, streak )')
          .eq('id', payload.new.id)
          .single();
        if (!data) return;
        const withLike = await enrichWithUserLikes([data], currentUserId);
        const withStreak = await enrichWithCorrectedStreaks(withLike);
        // Não duplica se já existe (ex: post próprio via prependPost)
        setPosts(prev => {
          if (prev.some(p => p.id === data.id)) return prev;
          return [withStreak[0], ...prev];
        });
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'posts',
      }, (payload) => {
        // Post excluído some do feed para todos os usuários
        setPosts(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .subscribe();

    feedPostsChannel.current = channel;
    return () => supabase.removeChannel(channel);
  }, [currentUserId]);

  // ── Carrega mais posts (scroll infinito) ──────────────────────────────────
  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const from = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id, image_url, caption, likes_count, created_at,
          profiles ( id, username, avatar_url, streak )
        `)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const withLikes   = await enrichWithUserLikes(data, currentUserId);
      const withStreaks = await enrichWithCorrectedStreaks(withLikes);

      // Deduplicação defensiva: garante que não entram IDs já presentes
      setPosts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newOnly = withStreaks.filter(p => !existingIds.has(p.id));
        return [...prev, ...newOnly];
      });

      setPage(prev => prev + 1);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      console.warn('useFeed.fetchMore:', err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [page, loadingMore, hasMore, currentUserId]);

  // ── Like / Unlike com atualização otimista ────────────────────────────────
  const toggleLike = useCallback(async (postId) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const wasLiked = post.userLiked;
    const newCount = wasLiked ? post.likes_count - 1 : post.likes_count + 1;

    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, userLiked: !wasLiked, likes_count: newCount } : p
    ));

    try {
      if (wasLiked) {
        await supabase.from('likes').delete()
          .eq('post_id', postId).eq('user_id', currentUserId);
        await supabase.rpc('decrement_likes', { post_id: postId });
      } else {
        await supabase.from('likes').insert({ post_id: postId, user_id: currentUserId });
        await supabase.rpc('increment_likes', { post_id: postId });
      }
    } catch (err) {
      console.warn('useFeed.toggleLike:', err.message);
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, userLiked: wasLiked, likes_count: post.likes_count } : p
      ));
    }
  }, [posts, currentUserId]);

  // ── BUG 2 CORRIGIDO: Comentários com Supabase Realtime ────────────────────
  //
  // PROBLEMA ANTERIOR:
  //   fetchComments fazia uma query única — sem subscription. O outro usuário
  //   só via novos comentários se reabrisse a seção manualmente.
  //
  // CORREÇÃO:
  //   subscribeToComments abre um canal Realtime filtrado por post_id.
  //   Quando outro usuário insere um comentário, o evento INSERT chega via
  //   websocket e adicionamos ao estado local do PostCard via callback.
  //
  //   Fluxo:
  //     PostCard abre → chama subscribeToComments(postId, onNewComment)
  //     PostCard fecha → chama unsubscribeFromComments(postId)
  //
  //   O canal é nomeado `comments:${postId}` e fica na ref realtimeChannels
  //   para evitar múltiplas subscrições no mesmo post.

  const fetchComments = useCallback(async (postId) => {
    const { data, error } = await supabase
      .from('comments')
      .select('id, content, created_at, profiles ( username, avatar_url )')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) { console.warn('useFeed.fetchComments:', error.message); return []; }
    return data ?? [];
  }, []);

  const subscribeToComments = useCallback((postId, onNewComment) => {
    const channelKey = `comments:${postId}`;

    // Evita subscrição duplicada no mesmo post
    if (realtimeChannels.current[channelKey]) return;

    const channel = supabase
      .channel(channelKey)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'comments',
          filter: `post_id=eq.${postId}`,
        },
        async (payload) => {
          // O payload traz o novo comentário mas sem o JOIN de profiles.
          // Buscamos o perfil do autor separadamente para ter username/avatar.
          const { data: profileData } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          const enriched = {
            ...payload.new,
            profiles: profileData ?? { username: 'usuário', avatar_url: null },
          };

          // Só notifica se o comentário for de outro usuário
          // (o próprio já foi adicionado localmente via addComment)
          if (payload.new.user_id !== currentUserId) {
            onNewComment(enriched);
          }
        }
      )
      .subscribe();

    realtimeChannels.current[channelKey] = channel;
  }, [currentUserId]);

  const unsubscribeFromComments = useCallback((postId) => {
    const channelKey = `comments:${postId}`;
    const channel = realtimeChannels.current[channelKey];
    if (channel) {
      supabase.removeChannel(channel);
      delete realtimeChannels.current[channelKey];
    }
  }, []);

  const addComment = useCallback(async (postId, content) => {
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: currentUserId, content: content.trim() })
      .select('id, content, created_at, profiles ( username, avatar_url )')
      .single();

    if (error) { console.warn('useFeed.addComment:', error.message); return null; }
    return data;
  }, [currentUserId]);

  // ── Adiciona novo post ao topo sem duplicar no próximo refresh ────────────
  const prependPost = useCallback((newPost) => {
    setPosts(prev => {
      // Deduplicação: não adiciona se o ID já existir
      if (prev.some(p => p.id === newPost.id)) return prev;
      return [{ ...newPost, userLiked: false }, ...prev];
    });
  }, []);

  return {
    posts, setPosts, loading, loadingMore, hasMore,
    fetchPosts, fetchMore,
    toggleLike,
    fetchComments,
    subscribeToComments,
    unsubscribeFromComments,
    addComment,
    prependPost,
  };
}

// ── Helper: corrige streak de cada autor via RPC ─────────────────────────────
// A RPC get_corrected_streak é chamada para cada autor único nos posts.
// Isso garante que o feed exibe sempre o streak correto,
// mesmo que o dono do post não tenha logado hoje.
async function enrichWithCorrectedStreaks(posts) {
  if (posts.length === 0) return posts;

  // Autores únicos — evita chamadas duplicadas para o mesmo usuário
  const authorIds = [...new Set(posts.map(p => p.profiles?.id).filter(Boolean))];

  // Busca streak corrigido para cada autor em paralelo
  const corrections = await Promise.all(
    authorIds.map(async (authorId) => {
      const { data } = await supabase.rpc('get_corrected_streak', { p_user_id: authorId });
      return { authorId, streak: data ?? 0 };
    })
  );

  const streakMap = {};
  corrections.forEach(({ authorId, streak }) => { streakMap[authorId] = streak; });

  // Aplica as correções nos posts
  return posts.map(p => {
    const authorId = p.profiles?.id;
    if (!authorId || streakMap[authorId] === undefined) return p;
    return {
      ...p,
      profiles: { ...p.profiles, streak: streakMap[authorId] },
    };
  });
}

// ── Helper: anota userLiked em cada post ──────────────────────────────────────
async function enrichWithUserLikes(posts, userId) {
  if (!userId || posts.length === 0) return posts.map(p => ({ ...p, userLiked: false }));

  const ids = posts.map(p => p.id);
  const { data } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', ids);

  const likedSet = new Set((data ?? []).map(l => l.post_id));
  return posts.map(p => ({ ...p, userLiked: likedSet.has(p.id) }));
}
