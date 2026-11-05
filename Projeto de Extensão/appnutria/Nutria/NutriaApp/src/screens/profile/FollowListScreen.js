// src/screens/profile/FollowListScreen.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro da função principal.
//
// Lista seguidores ou seguindo de um usuário.
// Cada item tem botão Seguir/Seguindo e navega para o perfil ao tocar.
// Recebe via route.params: { userId, type: 'followers'|'following', username }

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../supabase';
import { useUser } from '../../context/UserContext';
import { useFollows } from '../../hooks/useFollows';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

const DEFAULT_AVATAR = require('../../../assets/images/avatar-default.png');

// ── UserRow — fora da função principal (regra permanente) ─────────────────────
function UserRow({ user, isFollowing, isOwnProfile, onToggleFollow, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.8}>
      <Image source={user.avatar_url ? { uri: user.avatar_url } : DEFAULT_AVATAR} style={styles.avatar} />
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{user.username}</Text>
        {user.streak > 0 && (
          <Text style={styles.streak}>🔥 {user.streak} dias</Text>
        )}
      </View>
      {!isOwnProfile && (
        <TouchableOpacity
          style={[styles.followBtn, isFollowing && styles.followBtnActive]}
          onPress={onToggleFollow}
          activeOpacity={0.8}
        >
          <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
            {isFollowing ? 'Seguindo' : 'Seguir'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────
export default function FollowListScreen({ route, navigation }) {
  const { userId, type, username } = route.params;
  const { session } = useUser();
  const currentUserId = session?.user?.id;

  const { fetchFollowers, fetchFollowing, fetchIsFollowing, toggleFollow, loading } = useFollows(currentUserId);

  const [users,         setUsers]         = useState([]);
  const [followingSet,  setFollowingSet]  = useState(new Set());

  const title = type === 'followers' ? `Seguidores de @${username}` : `@${username} segue`;

  useEffect(() => { loadList(); }, [userId, type]);

  const loadList = async () => {
    const raw = type === 'followers'
      ? await fetchFollowers(userId)
      : await fetchFollowing(userId);

    // Corrige streak de cada usuário via RPC antes de exibir
    const list = await Promise.all(
      raw.map(async (u) => {
        const { data: streak } = await supabase.rpc('get_corrected_streak', { p_user_id: u.id });
        return { ...u, streak: streak ?? u.streak };
      })
    );
    setUsers(list);

    // Verifica quais desses usuários o logado já segue
    const checks = await Promise.all(
      list.map(u => fetchIsFollowing(u.id).then(following => ({ id: u.id, following })))
    );
    const set = new Set(checks.filter(c => c.following).map(c => c.id));
    setFollowingSet(set);
  };

  const handleToggleFollow = useCallback(async (targetId) => {
    const wasFollowing = followingSet.has(targetId);
    // Atualização otimista
    setFollowingSet(prev => {
      const next = new Set(prev);
      wasFollowing ? next.delete(targetId) : next.add(targetId);
      return next;
    });
    await toggleFollow(targetId, wasFollowing);
  }, [followingSet, toggleFollow]);

  const renderItem = useCallback(({ item }) => (
    <UserRow
      user={item}
      isFollowing={followingSet.has(item.id)}
      isOwnProfile={item.id === currentUserId}
      onToggleFollow={() => handleToggleFollow(item.id)}
      onPress={() => {
        if (item.id === currentUserId) {
          navigation.navigate('TabsRoot', { switchTab: 'profile' });
        } else {
          navigation.navigate('PublicProfile', { userId: item.id });
        }
      }}
    />
  ), [followingSet, currentUserId, handleToggleFollow, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: SPACING.xs }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {type === 'followers' ? 'Nenhum seguidor ainda.' : 'Não segue ninguém ainda.'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: COLORS.background },
  loaderContainer:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', paddingVertical: SPACING.xl },
  emptyText:      { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle },

  headerBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle:    { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textStrong, flex: 1, textAlign: 'center' },

  row:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, gap: 12 },
  avatar:         { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.lightGray },
  userInfo:       { flex: 1 },
  username:       { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textStrong },
  streak:         { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.primary, marginTop: 2 },

  followBtn:      { paddingVertical: 6, paddingHorizontal: 16, borderRadius: RADIUS.sm, backgroundColor: COLORS.primary },
  followBtnActive:{ backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.lightGray },
  followBtnText:  { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.background },
  followBtnTextActive: { color: COLORS.textStrong },
});
