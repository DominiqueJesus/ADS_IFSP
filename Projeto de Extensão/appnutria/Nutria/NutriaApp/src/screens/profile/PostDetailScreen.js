// src/screens/profile/PostDetailScreen.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro da função principal.
//
// Exibe um post acessado pelo grid do perfil.
// Usa PostCard diretamente — estilo 100% idêntico ao feed, sem duplicação.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../context/UserContext';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../../supabase';
import PostCard from '../../components/PostCard';
import { COLORS, FONTS, SPACING } from '../../theme';

function HeaderBar({ onBack }) {
  return (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Post</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

export default function PostDetailScreen({ route, navigation }) {
  const { postId } = route.params;
  const { session, profile } = useUser();
  const currentUserId = session?.user?.id;

  const [post,    setPost]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPost(); }, [postId]);

  const loadPost = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('posts')
      .select('id, image_url, caption, likes_count, created_at, profiles ( id, username, avatar_url, streak )')
      .eq('id', postId)
      .single();

    // Verifica se o usuário logado já curtiu
    const { data: likeData } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (data) setPost({ ...data, userLiked: !!likeData, likes_count: data.likes_count });
    setLoading(false);
  };

  // ── Like otimista — atualiza o estado local do post ───────────────────────
  const handleLike = useCallback(async (postId) => {
    setPost(prev => {
      if (!prev) return prev;
      const wasLiked = prev.userLiked;
      return { ...prev, userLiked: !wasLiked, likes_count: wasLiked ? prev.likes_count - 1 : prev.likes_count + 1 };
    });
    const wasLiked = post?.userLiked;
    if (wasLiked) {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUserId);
      await supabase.rpc('decrement_likes', { post_id: postId });
    } else {
      await supabase.from('likes').insert({ post_id: postId, user_id: currentUserId });
      await supabase.rpc('increment_likes', { post_id: postId });
    }
  }, [post?.userLiked, currentUserId]);

  // ── Busca comentários ─────────────────────────────────────────────────────
  const fetchComments = useCallback(async (postId) => {
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, profiles ( id, username, avatar_url )')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    return data ?? [];
  }, []);

  // ── Adiciona comentário ───────────────────────────────────────────────────
  const addComment = useCallback(async (postId, content) => {
    const { data } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: currentUserId, content: content.trim() })
      .select('id, content, created_at, profiles ( id, username, avatar_url )')
      .single();
    return data;
  }, [currentUserId]);

  // ── Navega para o perfil correto (próprio ou público) ─────────────────────
  const handleProfilePress = useCallback((userId) => {
    if (!userId) return;
    if (userId === currentUserId) {
      navigation.navigate('TabsRoot', { switchTab: 'profile' });
    } else {
      navigation.navigate('PublicProfile', { userId });
    }
  }, [currentUserId, navigation]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <HeaderBar onBack={() => navigation.goBack()} />
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!post) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <HeaderBar onBack={() => navigation.goBack()} />

        {/* ScrollView para o caso do post + comentários ser longo */}
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Reutiliza exatamente o PostCard do feed — zero duplicação de estilo */}
          <PostCard
            post={post}
            currentUserId={currentUserId}
            currentUserAvatar={profile?.avatar_url}
            onLike={handleLike}
            onAddComment={addComment}
            onFetchComments={fetchComments}
            onProfilePress={handleProfilePress}
            // flatListRef e postIndex não são necessários aqui (não há FlatList)
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.background },
  loader:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle:{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong },
});
