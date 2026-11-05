// src/screens/profile/PublicProfileScreen.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro da função principal.
//
// Tela de perfil público de qualquer usuário.
// Acessada ao clicar no avatar de um post ou em um resultado de busca.
// Exibe: foto, username, stats (posts/seguidores/seguindo), grid de posts e botão Seguir.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../context/UserContext';
import { useFollows } from '../../hooks/useFollows';
import { supabase } from '../../../supabase';
import { GOAL_LABELS } from '../../utils/caloricCalc';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

const DEFAULT_AVATAR = 'https://i.imgur.com/lOsEl90.png';

// ── Componentes auxiliares — fora da função principal (regra permanente) ──────

function HeaderBar({ onBack, username }) {
  return (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>@{username}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function StatColumn({ count, label, onPress }) {
  return (
    <TouchableOpacity style={styles.statItem} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function PostGridItem({ post, onPress }) {
  return (
    <TouchableOpacity style={gridStyles.item} onPress={() => onPress(post)} activeOpacity={0.85}>
      <Image source={{ uri: post.image_url }} style={gridStyles.img} resizeMode="cover" />
    </TouchableOpacity>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────
export default function PublicProfileScreen({ route, navigation }) {
  const { userId: targetId } = route.params;
  const { session } = useUser();
  const currentUserId = session?.user?.id;

  const { fetchFollowCounts, fetchIsFollowing, toggleFollow } = useFollows(currentUserId);

  const [targetProfile, setTargetProfile]   = useState(null);
  const [posts,          setPosts]           = useState([]);
  const [followCounts,   setFollowCounts]    = useState({ followers: 0, following: 0 });
  const [isFollowing,    setIsFollowing]     = useState(false);
  const [loadingProfile, setLoadingProfile]  = useState(true);
  const [followLoading,  setFollowLoading]   = useState(false);

  const isOwnProfile = currentUserId === targetId;

  useEffect(() => {
    loadAll();
  }, [targetId]);

  const loadAll = async () => {
    setLoadingProfile(true);
    await Promise.all([
      loadProfile(),
      loadPosts(),
      loadFollowData(),
    ]);
    setLoadingProfile(false);
  };

  const loadProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, goal, streak, calorie_target')
      .eq('id', targetId)
      .single();
    if (data) setTargetProfile(data);
  };

  const loadPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('id, image_url, likes_count, created_at')
      .eq('user_id', targetId)
      .order('created_at', { ascending: false });
    setPosts(data ?? []);
  };

  const loadFollowData = async () => {
    const [counts, following] = await Promise.all([
      fetchFollowCounts(targetId),
      fetchIsFollowing(targetId),
    ]);
    setFollowCounts(counts);
    setIsFollowing(following);
  };

  // ── Seguir / Deixar de seguir (otimista) ─────────────────────────────────
  const handleToggleFollow = useCallback(async () => {
    setFollowLoading(true);
    // Atualiza UI imediatamente
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setFollowCounts(prev => ({
      ...prev,
      followers: wasFollowing ? prev.followers - 1 : prev.followers + 1,
    }));
    await toggleFollow(targetId, wasFollowing);
    setFollowLoading(false);
  }, [isFollowing, targetId, toggleFollow]);

  if (loadingProfile) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!targetProfile) {
    return (
      <View style={styles.loaderContainer}>
        <Text style={styles.errorText}>Perfil não encontrado.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <HeaderBar
        onBack={() => navigation.goBack()}
        username={targetProfile.username}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Avatar + stats ──────────────────────────────────────────── */}
        <View style={styles.profileHeader}>
          <Image
            source={{ uri: targetProfile.avatar_url ?? DEFAULT_AVATAR }}
            style={styles.avatar}
          />
          <View style={styles.statsRow}>
            <StatColumn count={posts.length} label="Posts" />
            <StatColumn
              count={followCounts.followers}
              label="Seguidores"
              onPress={() => navigation.navigate('FollowList', {
                userId: targetId,
                type: 'followers',
                username: targetProfile.username,
              })}
            />
            <StatColumn
              count={followCounts.following}
              label="Seguindo"
              onPress={() => navigation.navigate('FollowList', {
                userId: targetId,
                type: 'following',
                username: targetProfile.username,
              })}
            />
          </View>
        </View>

        {/* ── Info do usuário ──────────────────────────────────────────── */}
        <View style={styles.infoBlock}>
          <Text style={styles.username}>@{targetProfile.username}</Text>
          {targetProfile.streak > 0 && (
            <Text style={styles.streak}>🔥 {targetProfile.streak} dias em sequência</Text>
          )}
          {targetProfile.goal && (
            <Text style={styles.goal}>
              {GOAL_LABELS[targetProfile.goal] ?? targetProfile.goal}
            </Text>
          )}
        </View>

        {/* ── Botão Seguir / Seguindo ──────────────────────────────────── */}
        {!isOwnProfile && (
          <View style={styles.followBtnContainer}>
            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followBtnActive]}
              onPress={handleToggleFollow}
              disabled={followLoading}
              activeOpacity={0.8}
            >
              {followLoading
                ? <ActivityIndicator size="small" color={isFollowing ? COLORS.textStrong : COLORS.background} />
                : <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                    {isFollowing ? 'Seguindo' : 'Seguir'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── Grid de posts ────────────────────────────────────────────── */}
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PostGridItem
              post={item}
              onPress={(p) => navigation.navigate('TabsRoot', { scrollToPostId: p.id })}
            />
          )}
          numColumns={3}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={posts.length === 0 ? styles.noPosts : gridStyles.grid}
          ListEmptyComponent={(
            <View style={styles.noPosts}>
              <Text style={styles.noPostsText}>Nenhuma postagem ainda.</Text>
            </View>
          )}
        />

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: COLORS.background },
  loaderContainer:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  errorText:          { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textSubtitle },

  headerBar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle:        { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong },

  profileHeader:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.lg },
  avatar:             { width: 86, height: 86, borderRadius: 43, borderWidth: 3, borderColor: COLORS.primary, backgroundColor: COLORS.lightGray },

  statsRow:           { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' },
  statItem:           { alignItems: 'center' },
  statCount:          { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.textStrong },
  statLabel:          { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle, marginTop: 2 },

  infoBlock:          { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  username:           { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textStrong },
  streak:             { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.primary, marginTop: 2 },
  goal:               { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, marginTop: 2 },

  followBtnContainer: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  followBtn:          { backgroundColor: COLORS.primary, paddingVertical: 9, borderRadius: RADIUS.sm, alignItems: 'center' },
  followBtnActive:    { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.lightGray },
  followBtnText:      { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.background },
  followBtnTextActive:{ color: COLORS.textStrong },

  noPosts:            { flex: 1, alignItems: 'center', paddingVertical: SPACING.xl },
  noPostsText:        { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle },
});

const gridStyles = StyleSheet.create({
  grid: { paddingHorizontal: 2, paddingTop: 2 },
  item: { width: '32.9%', aspectRatio: 1, marginRight: 2, marginBottom: 2 },
  img:  { width: '100%', height: '100%', backgroundColor: COLORS.lightGray },
});
