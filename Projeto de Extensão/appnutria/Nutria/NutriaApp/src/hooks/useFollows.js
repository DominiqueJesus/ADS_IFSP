// src/hooks/useFollows.js
//
// Hook centralizado para toda a lógica de seguir/deixar de seguir.
// Usado por: PublicProfileScreen, FollowListScreen, ProfileTab (contagens)
//
// Funções expostas:
//   fetchFollowCounts(userId)      → { followers, following }
//   fetchIsFollowing(targetId)     → boolean
//   toggleFollow(targetId)         → void (otimista)
//   fetchFollowers(userId)         → profile[]
//   fetchFollowing(userId)         → profile[]
//   searchUsers(query)             → profile[]

import { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

export function useFollows(currentUserId) {
  const [loading, setLoading] = useState(false);

  // ── Contagens de seguidores e seguindo ────────────────────────────────────
  const fetchFollowCounts = useCallback(async (userId) => {
    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', userId),
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', userId),
    ]);
    return {
      followers: followersRes.count ?? 0,
      following: followingRes.count ?? 0,
    };
  }, []);

  // ── Verifica se o usuário logado já segue o alvo ──────────────────────────
  const fetchIsFollowing = useCallback(async (targetId) => {
    if (!currentUserId || currentUserId === targetId) return false;
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', currentUserId)
      .eq('following_id', targetId)
      .maybeSingle();
    return !!data;
  }, [currentUserId]);

  // ── Seguir / Deixar de seguir (otimista — sem loading visual) ────────────
  const toggleFollow = useCallback(async (targetId, isFollowing) => {
    if (!currentUserId || currentUserId === targetId) return;
    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetId);
    } else {
      await supabase
        .from('follows')
        .insert({ follower_id: currentUserId, following_id: targetId });
    }
  }, [currentUserId]);

  // ── Lista de seguidores de um usuário ────────────────────────────────────
  const fetchFollowers = useCallback(async (userId) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('follows')
      .select('profiles!follows_follower_id_fkey ( id, username, avatar_url, goal )')
      .eq('following_id', userId)
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error) { console.warn('useFollows.fetchFollowers:', error.message); return []; }
    return (data ?? []).map(row => row.profiles).filter(Boolean);
  }, []);

  // ── Lista de quem um usuário segue ────────────────────────────────────────
  const fetchFollowing = useCallback(async (userId) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('follows')
      .select('profiles!follows_following_id_fkey ( id, username, avatar_url, goal )')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error) { console.warn('useFollows.fetchFollowing:', error.message); return []; }
    return (data ?? []).map(row => row.profiles).filter(Boolean);
  }, []);

  // ── Busca de usuários por username ────────────────────────────────────────
  const searchUsers = useCallback(async (query) => {
    if (!query || query.trim().length < 2) return [];
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, goal, streak')
      .or(`username.ilike.%${query.trim()}%,full_name.ilike.%${query.trim()}%`)
      .limit(20);

    setLoading(false);
    if (error) { console.warn('useFollows.searchUsers:', error.message); return []; }
    return data ?? [];
  }, [currentUserId]);

  return {
    loading,
    fetchFollowCounts,
    fetchIsFollowing,
    toggleFollow,
    fetchFollowers,
    fetchFollowing,
    searchUsers,
  };
}
