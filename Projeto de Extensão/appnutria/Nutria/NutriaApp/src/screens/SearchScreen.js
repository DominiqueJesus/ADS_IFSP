// src/screens/SearchScreen.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro da função principal.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  StyleSheet, FlatList, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { supabase } from '../../supabase';
import { useFollows } from '../hooks/useFollows';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const DEFAULT_AVATAR = require('../../assets/images/avatar-default.png');
const recentSearchesKey = (uid) => `@nutria/search-cache:${uid}`;
const RECENT_SEARCHES_LIMIT = 6;

// Chave única por item do histórico
const itemKey = (item) => item.type === 'query' ? `q:${item.text}` : item.id;

// ── Resultado de busca normal (tamanho padrão) ────────────────────────────────
function UserSearchRow({ user, isFollowing, isOwnUser, onToggleFollow, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.8}>
      <Image source={user.avatar_url ? { uri: user.avatar_url } : DEFAULT_AVATAR} style={styles.avatar} />
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{user.username}</Text>
        {user.streak > 0 && (
          <Text style={styles.streak}>🔥 {user.streak} dias</Text>
        )}
      </View>
      {!isOwnUser && (
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

// ── Perfil no histórico (compacto, sem botão seguir) ──────────────────────────
function RecentUserRow({ user, onPress, onDelete }) {
  return (
    <TouchableOpacity style={styles.recentRow} onPress={onPress} activeOpacity={0.8}>
      <Image
        source={user.avatar_url ? { uri: user.avatar_url } : DEFAULT_AVATAR}
        style={styles.recentAvatar}
      />
      <View style={styles.recentInfo}>
        <Text style={styles.recentUsername}>@{user.username}</Text>
        {user.streak > 0 && (
          <Text style={styles.recentStreak}>🔥 {user.streak} dias</Text>
        )}
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={15} color={COLORS.textSubtitle} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Texto de pesquisa no histórico (compacto) ─────────────────────────────────
function RecentQueryRow({ text, onPress, onDelete }) {
  return (
    <TouchableOpacity style={styles.recentRow} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.recentQueryIcon}>
        <Ionicons name="time-outline" size={14} color={COLORS.textSubtitle} />
      </View>
      <Text style={[styles.recentUsername, { flex: 1 }]}>{text}</Text>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={15} color={COLORS.textSubtitle} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function SearchScreen({ navigation }) {
  const { session } = useUser();
  const currentUserId = session?.user?.id;
  const { searchUsers, fetchIsFollowing, toggleFollow, loading } = useFollows(currentUserId);

  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [followingSet, setFollowingSet] = useState(new Set());
  const [recentItems,  setRecentItems]  = useState([]);
  const [searching,    setSearching]    = useState(false);

  const debounceTimer      = useRef(null);
  // Refs para evitar stale closures dentro do debounce e do handler de limpeza
  const recentItemsRef     = useRef([]);
  const hasResultsRef      = useRef(false);
  const clickedInSearchRef = useRef(false);
  const lastSearchQueryRef = useRef('');
  const currentUserIdRef   = useRef(currentUserId);

  useEffect(() => { recentItemsRef.current = recentItems; }, [recentItems]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);

  // ── Carrega histórico ao montar / trocar conta ────────────────────────────
  useEffect(() => {
    let mounted = true;
    setRecentItems([]);
    hasResultsRef.current      = false;
    clickedInSearchRef.current = false;
    lastSearchQueryRef.current = '';

    (async () => {
      if (!currentUserId) return;
      try {
        const raw = await AsyncStorage.getItem(recentSearchesKey(currentUserId));
        if (!mounted || !raw) return;
        const cached = JSON.parse(raw);
        if (!Array.isArray(cached)) return;
        // Migra formato antigo (objetos sem type) para type: 'user'
        const migrated = cached.map(item => item.type ? item : { type: 'user', ...item });
        setRecentItems(migrated);
        const userItems = migrated.filter(i => i.type === 'user');
        if (userItems.length > 0) {
          const checks = await Promise.all(
            userItems.map(u => fetchIsFollowing(u.id).then(f => ({ id: u.id, f })))
          );
          if (mounted) setFollowingSet(new Set(checks.filter(c => c.f).map(c => c.id)));
        }
      } catch {
        // cache opcional
      }
    })();

    return () => {
      mounted = false;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [currentUserId]);

  // ── Persiste um item novo no topo (deduplicado) ───────────────────────────
  const persistItem = useCallback(async (item) => {
    const key  = itemKey(item);
    const prev = recentItemsRef.current;
    const next = [item, ...prev.filter(r => itemKey(r) !== key)].slice(0, RECENT_SEARCHES_LIMIT);
    setRecentItems(next);
    try {
      await AsyncStorage.setItem(recentSearchesKey(currentUserIdRef.current), JSON.stringify(next));
    } catch {}
  }, []);

  // ── Remove um item do histórico ───────────────────────────────────────────
  const removeItem = useCallback(async (key) => {
    const next = recentItemsRef.current.filter(r => itemKey(r) !== key);
    setRecentItems(next);
    try {
      await AsyncStorage.setItem(recentSearchesKey(currentUserIdRef.current), JSON.stringify(next));
    } catch {}
  }, []);

  // ── Abre perfil: salva no histórico apenas ao clicar ─────────────────────
  const openProfile = useCallback((userId, fromSearch = false) => {
    if (!userId) return;
    if (fromSearch) {
      const user = results.find(u => u.id === userId);
      if (user) {
        clickedInSearchRef.current = true;
        persistItem({ type: 'user', id: user.id, username: user.username, avatar_url: user.avatar_url ?? null, streak: user.streak ?? 0 });
      }
    }
    if (userId === currentUserId) {
      navigation.navigate('TabsRoot', { switchTab: 'profile' });
      return;
    }
    navigation.navigate('PublicProfile', { userId });
  }, [currentUserId, navigation, results, persistItem]);

  // ── Busca com debounce; histórico só é salvo via openProfile ─────────────
  const handleQueryChange = useCallback((text) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (text.trim().length < 2) {
      // Se o usuário limpou sem clicar em nenhum perfil e havia resultados,
      // salva o texto da pesquisa no histórico
      if (!clickedInSearchRef.current && hasResultsRef.current && lastSearchQueryRef.current) {
        persistItem({ type: 'query', text: lastSearchQueryRef.current });
      }
      hasResultsRef.current      = false;
      clickedInSearchRef.current = false;
      lastSearchQueryRef.current = '';
      setResults([]);
      setSearching(false);
      return;
    }

    clickedInSearchRef.current = false;
    setSearching(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const users = await searchUsers(text);
        const corrected = await Promise.all(
          users.map(async (u) => {
            const { data: streak } = await supabase.rpc('get_corrected_streak', { p_user_id: u.id });
            return { ...u, streak: streak ?? u.streak };
          })
        );
        setResults(corrected);
        hasResultsRef.current = corrected.length > 0;
        if (corrected.length > 0) lastSearchQueryRef.current = text.trim();
        const checks = await Promise.all(
          corrected.map(u => fetchIsFollowing(u.id).then(f => ({ id: u.id, f })))
        );
        setFollowingSet(new Set(checks.filter(c => c.f).map(c => c.id)));
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [searchUsers, fetchIsFollowing, persistItem]);

  const handleToggleFollow = useCallback(async (targetId) => {
    const wasFollowing = followingSet.has(targetId);
    setFollowingSet(prev => {
      const next = new Set(prev);
      wasFollowing ? next.delete(targetId) : next.add(targetId);
      return next;
    });
    await toggleFollow(targetId, wasFollowing);
  }, [followingSet, toggleFollow]);

  const isInSearch = query.trim().length >= 2;

  const renderSearchResult = useCallback(({ item }) => (
    <UserSearchRow
      user={item}
      isFollowing={followingSet.has(item.id)}
      isOwnUser={item.id === currentUserId}
      onToggleFollow={() => handleToggleFollow(item.id)}
      onPress={() => openProfile(item.id, true)}
    />
  ), [followingSet, handleToggleFollow, openProfile, currentUserId]);

  const renderRecentItem = useCallback(({ item }) => {
    if (item.type === 'user') {
      return (
        <RecentUserRow
          user={item}
          onPress={() => openProfile(item.id)}
          onDelete={() => removeItem(item.id)}
        />
      );
    }
    return (
      <RecentQueryRow
        text={item.text}
        onPress={() => handleQueryChange(item.text)}
        onDelete={() => removeItem(`q:${item.text}`)}
      />
    );
  }, [openProfile, removeItem, handleQueryChange]);

  const visibleItems = isInSearch ? results : recentItems;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buscar pessoas</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Campo de busca */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={COLORS.textSubtitle} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por @usuário..."
          placeholderTextColor={COLORS.textSubtitle}
          value={query}
          onChangeText={handleQueryChange}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => handleQueryChange('')}>
            <Ionicons name="close-circle" size={18} color={COLORS.textSubtitle} />
          </TouchableOpacity>
        )}
      </View>

      {/* Conteúdo */}
      {loading || searching ? (
        <View style={styles.centerContent}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : visibleItems.length > 0 ? (
        <FlatList
          data={visibleItems}
          keyExtractor={item => itemKey(item)}
          renderItem={isInSearch ? renderSearchResult : renderRecentItem}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={!isInSearch ? <Text style={styles.recentTitle}>Pesquisas recentes</Text> : null}
        />
      ) : isInSearch ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Nenhum resultado para "{query}"</Text>
        </View>
      ) : (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Pesquise um usuário para ver resultados recentes aqui.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.background },
  headerBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle:  { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong },

  searchBar:    { flexDirection: 'row', alignItems: 'center', margin: SPACING.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: COLORS.lightGray, borderRadius: RADIUS.full },
  searchInput:  { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong, padding: 0 },

  // ── Resultado normal ──────────────────────────────────────────────────────
  row:                { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, gap: 12 },
  avatar:             { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.lightGray },
  userInfo:           { flex: 1 },
  username:           { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textStrong },
  streak:             { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.primary, marginTop: 2 },
  followBtn:          { paddingVertical: 6, paddingHorizontal: 16, borderRadius: RADIUS.sm, backgroundColor: COLORS.primary },
  followBtnActive:    { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.lightGray },
  followBtnText:      { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.background },
  followBtnTextActive:{ color: COLORS.textStrong },

  // ── Histórico compacto ────────────────────────────────────────────────────
  recentRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, gap: 10 },
  recentAvatar:   { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.lightGray },
  recentQueryIcon:{ width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.lightGray, alignItems: 'center', justifyContent: 'center' },
  recentInfo:     { flex: 1 },
  recentUsername: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.textStrong },
  recentStreak:   { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.primary, marginTop: 1 },

  centerContent:  { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  emptyText:      { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center' },
  recentTitle:    { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textStrong, paddingHorizontal: SPACING.md, paddingTop: 4, paddingBottom: 6 },
});
