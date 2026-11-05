// src/screens/tabs/FeedTab.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente auxiliar declarado dentro desta função.

import React, { useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, TouchableOpacity, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useStreakValidation } from '../../hooks/useStreakValidation';
import { useUser } from '../../context/UserContext';
import { useFeed } from '../../hooks/useFeed';
import PostCard from '../../components/PostCard';
import StreakLostPopup from '../../components/StreakLostPopup';
import { COLORS, FONTS, SPACING } from '../../theme';

// ── Componentes auxiliares — FORA do FeedTab (regra permanente) ───────────────

function ListFooter({ loadingMore }) {
  if (!loadingMore) return <View style={{ height: 80 }} />;
  return (
    <View style={styles.footerLoader}>
      <ActivityIndicator size="small" color={COLORS.primary} />
    </View>
  );
}

function EmptyFeed() {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>🍽️</Text>
      <Text style={styles.emptyTitle}>Nenhuma refeição ainda</Text>
      <Text style={styles.emptySubtitle}>
        Seja o primeiro a compartilhar uma refeição saudável!
      </Text>
    </View>
  );
}

// ── FeedPostCard — wrapper que repassa onProfilePress ─────────────────────────
function FeedPostCard({
  post, index, flatListRef,
  currentUserId, currentUserAvatar,
  onLike, onAddComment, onFetchComments,
  onSubscribeToComments, onUnsubscribeFromComments,
  onProfilePress, onDeletePost,
}) {
  return (
    <PostCard
      post={post}
      currentUserId={currentUserId}
      currentUserAvatar={currentUserAvatar}
      onLike={onLike}
      onAddComment={onAddComment}
      onFetchComments={onFetchComments}
      onSubscribeToComments={onSubscribeToComments}
      onUnsubscribeFromComments={onUnsubscribeFromComments}
      flatListRef={flatListRef}
      postIndex={index}
      onProfilePress={onProfilePress}
      onDeletePost={onDeletePost}
    />
  );
}

// ── FeedTab ───────────────────────────────────────────────────────────────────
export default function FeedTab({ navigation, feedRef }) {
  const { session, profile } = useUser();
  const userId        = session?.user?.id;
  const flatListRef   = useRef(null);
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const route = useRoute();

  const { validateStreak, showStreakPopup, dismissStreakPopup } = useStreakValidation();

  const {
    posts, loading, loadingMore,
    fetchPosts, fetchMore, toggleLike,
    fetchComments, addComment, prependPost,
    subscribeToComments, unsubscribeFromComments,
  } = useFeed(userId);

  useImperativeHandle(feedRef, () => ({
    prependPost,
    scrollToTopAndRefresh: () => {
      // 1. Slide animado até o topo
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      // 2. Após a animação, refresh silencioso (sem piscar/spinner)
      setTimeout(() => fetchPosts(true), 350);
    },
  }), [prependPost, fetchPosts]);

  const handleDeletePost = useCallback((postId) => {
    // Remove o post do feed imediatamente após exclusão
    setPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  useEffect(() => {
    fetchPosts();
    validateStreak();
  }, [fetchPosts]);

  useEffect(() => {
    const scrollToPostId = route.params?.scrollToPostId;
    if (!scrollToPostId || posts.length === 0) return;
    const index = posts.findIndex(p => p.id === scrollToPostId);
    if (index >= 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
      }, 150);
    }
    // Limpa o param imediatamente para não re-triggar ao curtir/descurtir posts
    navigation.setParams({ scrollToPostId: undefined });
  }, [route.params?.scrollToPostId]);

  const handleProfilePress = (postUserId) => {
    if (!postUserId) return;
    navigationRef.current.push('PublicProfile', { userId: postUserId });
  };

  // ── Swipe-left estilo Instagram: abre a câmera (AddMeal) ──────────────────
  // Só dispara quando o gesto é predominantemente horizontal e para a
  // esquerda, e com deslocamento mínimo — assim não conflita com o scroll
  // vertical da FlatList nem com o swipe entre abas do TabsRoot (que está
  // na Home/índice 0, então deslizar para a esquerda não tem aba à direita
  // para revelar — é o gesto livre que aproveitamos aqui).
  // origin: 'swipe' faz o MainAppScreen abrir com slide horizontal e permitir
  // fechar com swipe-right de volta para a Home (gestureDirection: 'horizontal').
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        const horizontalSwipeLeft = gesture.dx < -20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;
        return horizontalSwipeLeft;
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -60 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5) {
          navigationRef.current.navigate('AddMeal', { origin: 'swipe' });
        }
      },
    })
  ).current;

  const renderItem = ({ item, index }) => (
    <FeedPostCard
      post={item}
      index={index}
      flatListRef={flatListRef}
      currentUserId={userId}
      currentUserAvatar={profile?.avatar_url}
      onLike={toggleLike}
      onAddComment={addComment}
      onFetchComments={fetchComments}
      onSubscribeToComments={subscribeToComments}
      onUnsubscribeFromComments={unsubscribeFromComments}
      onProfilePress={handleProfilePress}
      onDeletePost={handleDeletePost}
    />
  );

  const keyExtractor = (item) => String(item.id);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>

      {/* ── Feed ────────────────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {loading ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={posts}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            onEndReached={fetchMore}
            onEndReachedThreshold={0.4}
            onRefresh={fetchPosts}
            refreshing={loading}
            ListEmptyComponent={EmptyFeed}
            ListFooterComponent={<ListFooter loadingMore={loadingMore} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={posts.length === 0 ? styles.emptyList : { paddingBottom: 110 }}
          />
        )}
      </KeyboardAvoidingView>

      {/* Popup de streak perdida — fora da FlatList, dentro do View raiz */}
      <StreakLostPopup visible={showStreakPopup} onDismiss={dismissStreakPopup} />

    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, backgroundColor: COLORS.background },
  headerLogo:      { height: 32, width: 120 },
  centerLoader:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyList:       { flexGrow: 1 },
  footerLoader:    { paddingVertical: 20, alignItems: 'center' },
  emptyContainer:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyEmoji:      { fontSize: 56, marginBottom: 16 },
  emptyTitle:      { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.textStrong, marginBottom: 4, textAlign: 'center' },
  emptySubtitle:   { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center', lineHeight: 20 },
});
