// src/components/PostCard.js
//
// ⚠️  REGRA PERMANENTE — declarado no escopo do módulo, nunca dentro de outro componente.
//
// SOLUÇÃO DEFINITIVA para navegação de perfil:
// PostCard usa useNavigation() e useUser() diretamente.
// Não depende de nenhuma prop de navegação — sem cadeia, sem closure, sem stale ref.
// Funciona igual ao PostDetailScreen que sempre funcionou.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  Alert, Modal, Pressable, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import LIKE_ANIM from '../../assets/animations/like.json';
import { COLORS, FONTS } from '../theme';
import { supabase } from '../../supabase';

const DEFAULT_AVATAR = require('../../assets/images/avatar-default.png');
const STREAK_BADGE      = require('../../assets/images/streak-badge.png');
const STREAK_BADGE_GRAY = require('../../assets/images/streak-badge-gray.png');

// ── CommentItem — fora do PostCard (regra permanente) ─────────────────────────
function CommentItem({ comment, onProfilePress, currentUserId, onDelete }) {
  const isOwn = comment.profiles?.id === currentUserId || comment.user_id === currentUserId;
  return (
    <View style={styles.commentRow}>
      <TouchableOpacity onPress={() => onProfilePress?.(comment.profiles?.id)} activeOpacity={0.8}>
        <Image
          source={comment.profiles?.avatar_url ? { uri: comment.profiles.avatar_url } : DEFAULT_AVATAR}
          style={styles.commentAvatar}
        />
      </TouchableOpacity>
      <View style={[styles.commentBody, { flex: 1 }]}>
        <TouchableOpacity onPress={() => onProfilePress?.(comment.profiles?.id)}>
          <Text style={styles.commentUsername}>
            {comment.profiles?.username ?? 'usuário'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.commentText}>{comment.content}</Text>
      </View>
      {isOwn && (
        <TouchableOpacity
          onPress={() => onDelete(comment.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ paddingLeft: 8 }}
        >
          <Ionicons name="trash-outline" size={15} color="#CCC" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── PostCard ──────────────────────────────────────────────────────────────────
export default function PostCard({
  post,
  currentUserId,
  currentUserAvatar,
  onLike,
  onAddComment,
  onFetchComments,
  onSubscribeToComments,
  onUnsubscribeFromComments,
  flatListRef,
  postIndex,
  onProfilePress,
  onDeletePost,
}) {
  const [showComments,    setShowComments]    = useState(false);
  const [comments,        setComments]        = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [menuVisible,     setMenuVisible]     = useState(false);
  const [menuPos,         setMenuPos]         = useState({ top: 0, right: 0 });
  const [heartPos,        setHeartPos]        = useState({ x: 0, y: 0 });
  const [showHeart,       setShowHeart]       = useState(false);
  const [lottieKey,       setLottieKey]       = useState(0);
  const menuBtnRef   = useRef(null);
  const lastTapRef   = useRef(0);
  const heartAnim    = useRef(new Animated.Value(0)).current;
  const lottieRef    = useRef(null);
  const likeAnim     = useRef(new Animated.Value(1)).current;
  const commentsAnim = useRef(new Animated.Value(0)).current;
  const [commentText,     setCommentText]     = useState('');
  const [submitting,      setSubmitting]      = useState(false);

  const { profiles: author } = post;
  const authorId  = author?.id;
  const streak    = author?.streak ?? 0;
  const isOwnPost = authorId === currentUserId;

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!showComments) return;
    const handleNewComment = (newComment) => {
      setComments(prev => {
        if (prev.some(c => c.id === newComment.id)) return prev;
        return [...prev, newComment];
      });
    };
    onSubscribeToComments?.(post.id, handleNewComment);
    return () => onUnsubscribeFromComments?.(post.id);
  }, [showComments, post.id, onSubscribeToComments, onUnsubscribeFromComments]);

  // ── Scroll ao focar input ─────────────────────────────────────────────────
  const handleCommentFocus = useCallback(() => {
    if (flatListRef?.current && postIndex != null) {
      setTimeout(() => {
        flatListRef.current.scrollToIndex({ index: postIndex, animated: true, viewPosition: 0 });
      }, 100);
    }
  }, [flatListRef, postIndex]);

  // ── Toggle comentários ────────────────────────────────────────────────────
  const handleToggleComments = useCallback(async () => {
    if (!showComments && comments.length === 0) {
      setLoadingComments(true);
      const data = await onFetchComments(post.id);
      setComments(data);
      setLoadingComments(false);
    }
    setShowComments(v => !v);
  }, [showComments, comments.length, post.id, onFetchComments]);

  // ── Enviar comentário ─────────────────────────────────────────────────────
  const handleSubmitComment = useCallback(async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    const newComment = await onAddComment(post.id, commentText);
    if (newComment) {
      setComments(prev => {
        if (prev.some(c => c.id === newComment.id)) return prev;
        return [...prev, newComment];
      });
      setCommentText('');
    }
    setSubmitting(false);
  }, [commentText, submitting, post.id, onAddComment]);

  // ── Excluir post ────────────────────────────────────────────────────────────
  const handleDeletePost = useCallback(() => {
    setMenuVisible(false);
    Alert.alert(
      'Excluir post',
      'Tem certeza que deseja excluir esta publicação? Essa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('posts').delete().eq('id', post.id);
            // Notifica o pai para remover do feed
            onDeletePost?.(post.id);
          },
        },
      ]
    );
  }, [post.id, onDeletePost]);

  // ── Excluir comentário ───────────────────────────────────────────────────────
  const handleDeleteComment = useCallback(async (commentId) => {
    await supabase.from('comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }, []);

  // ── Curtida com animação de pulso ────────────────────────────────────────────
  const handleLikePress = useCallback(() => {
    onLike(post.id);
    likeAnim.setValue(0.7);
    Animated.spring(likeAnim, {
      toValue: 1, useNativeDriver: true,
      tension: 200, friction: 5,
    }).start();
  }, [post.id, onLike, likeAnim]);

  // ── Toggle comentários com animação ──────────────────────────────────────────
  const handleToggleCommentsAnimated = useCallback(() => {
    handleToggleComments();
    Animated.sequence([
      Animated.timing(commentsAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
      Animated.spring(commentsAnim, { toValue: 0, useNativeDriver: true, tension: 200, friction: 5 }),
    ]).start();
  }, [handleToggleComments, commentsAnim]);

  // ── Double tap — animação Lottie centralizada ────────────────────────────────
  const handleImagePress = useCallback((e) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      setLottieKey(k => k + 1);  // força remontagem — garante frame 0
      setShowHeart(true);
      if (!post.userLiked) onLike(post.id);
    } else {
      lastTapRef.current = now;
    }
  }, [post.userLiked, post.id, onLike]);

  return (
    <View style={styles.card}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.userRow}>
          <TouchableOpacity onPress={() => onProfilePress?.(authorId)} activeOpacity={0.8}>
            <Image
              source={author?.avatar_url ? { uri: author.avatar_url } : DEFAULT_AVATAR}
              style={styles.avatar}
            />
          </TouchableOpacity>
          <View>
            <TouchableOpacity onPress={() => onProfilePress?.(authorId)} activeOpacity={0.7}>
              <Text style={styles.username}>{author?.username ?? 'usuário'}</Text>
            </TouchableOpacity>
            <Text style={styles.timeAgo}>{formatTimeAgo(post.created_at)}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {streak >= 0 && (
            <View style={styles.streakBadge}>
              <Image
                source={streak > 0 ? STREAK_BADGE : STREAK_BADGE_GRAY}
                style={[styles.streakImg, streak === 0 && styles.streakImgInactive]}
              />
              <Text style={[styles.streakNumber, streak === 0 && styles.streakNumberGray]}>
                {streak}
              </Text>
            </View>
          )}
          {isOwnPost && (
            <View>
              <TouchableOpacity
                ref={menuBtnRef}
                onPress={() => {
                  menuBtnRef.current?.measure((fx, fy, w, h, px, py) => {
                    setMenuPos({ top: py + h + 4, right: 12 });
                    setMenuVisible(true);
                  });
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4 }}
              >
                <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textSubtitle} />
              </TouchableOpacity>
              <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuVisible(false)}
              >
                <Pressable style={styles.postMenuBackdrop} onPress={() => setMenuVisible(false)}>
                  <View style={[styles.postMenu, { top: menuPos.top, right: menuPos.right }]}>
                    <TouchableOpacity style={styles.postMenuItem} onPress={handleDeletePost}>
                      <Text style={styles.postMenuItemText}>Excluir post</Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Modal>
            </View>
          )}
        </View>
      </View>

      {/* ── Imagem com double tap ──────────────────────────────────────── */}
      <Pressable onPress={handleImagePress} style={{ position: 'relative' }}>
        <Image source={{ uri: post.image_url }} style={styles.postImage} resizeMode="cover" />
        {/* Coração animado no double tap */}
        {showHeart && (
          <LottieView
            key={lottieKey}
            source={LIKE_ANIM}
            autoPlay
            loop={false}
            pointerEvents="none"
            style={styles.heartOverlay}
            onAnimationFinish={() => setShowHeart(false)}
          />
        )}
      </Pressable>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.interactions}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleLikePress} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
              <Ionicons
                name={post.userLiked ? 'heart' : 'heart-outline'}
                size={28}
                color={post.userLiked ? COLORS.danger : COLORS.textStrong}
              />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleToggleCommentsAnimated} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale: commentsAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.75],
            }) }] }}>
              <Ionicons
                name={showComments ? 'chatbubble' : 'chatbubble-outline'}
                size={26}
                color={showComments ? COLORS.primary : COLORS.textStrong}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>

        <Text style={styles.likesCount}>
          {post.likes_count} {post.likes_count === 1 ? 'curtida' : 'curtidas'}
        </Text>

        {post.caption ? (
          <Text style={styles.caption}>
            <Text style={styles.captionUser} onPress={() => onProfilePress?.(authorId)}>
              {author?.username ?? 'usuário'}{' '}
            </Text>
            {post.caption}
          </Text>
        ) : null}

        {/* ── Comentários ──────────────────────────────────────────── */}
        {showComments && (
          <View style={styles.commentsSection}>
            {loadingComments
              ? <ActivityIndicator size="small" color={COLORS.textSubtitle} style={{ marginVertical: 8 }} />
              : comments.map(c => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    onProfilePress={onProfilePress}
                    currentUserId={currentUserId}
                    onDelete={handleDeleteComment}
                  />
                ))
            }
            <View style={styles.commentInputRow}>
              <Image
                source={currentUserAvatar ? { uri: currentUserAvatar } : DEFAULT_AVATAR}
                style={styles.commentInputAvatar}
              />
              <TextInput
                style={styles.commentInput}
                placeholder="Adicione um comentário..."
                placeholderTextColor={COLORS.textSubtitle}
                value={commentText}
                onChangeText={setCommentText}
                returnKeyType="send"
                onFocus={handleCommentFocus}
                onSubmitEditing={handleSubmitComment}
                editable={!submitting}
              />
              <TouchableOpacity
                onPress={handleSubmitComment}
                disabled={!commentText.trim() || submitting}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {submitting
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Ionicons
                      name="send"
                      size={20}
                      color={commentText.trim() ? COLORS.primary : COLORS.textSubtitle}
                    />
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!showComments && (
          <TouchableOpacity onPress={handleToggleComments}>
            <Text style={styles.viewCommentsLink}>
              {comments.length > 0
                ? `Ver ${comments.length} comentário${comments.length > 1 ? 's' : ''}`
                : 'Adicionar comentário...'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function formatTimeAgo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)        return 'agora';
  if (diff < 3600)      return `${Math.floor(diff / 60)}min`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return new Date(isoString).toLocaleDateString('pt-BR');
}

const styles = StyleSheet.create({
  card:                { backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, marginBottom: 2 },
  header:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  userRow:             { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:              { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.lightGray },
  username:            { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textStrong },
  timeAgo:             { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textSubtitle },
  streakBadge:         { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  streakImg:           { position: 'absolute', width: 46, height: 46, resizeMode: 'contain' },
  streakNumber:        { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.primary, marginTop: -3, marginLeft: 3 },
  streakNumberGray:    { color: '#AAAAAA' },
  streakImgInactive:   { opacity: 0.5 },
  postImage:           { width: '100%', height: 380, backgroundColor: COLORS.lightGray },
  heartOverlay:        { position: 'absolute', width: 260, height: 260, top: '50%', left: '50%', marginTop: -130, marginLeft: -130, zIndex: 10 },
  footer:              { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  interactions:        { flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'center' },
  iconBtn:             { padding: 4 },
  likesCount:          { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.textStrong, marginBottom: 4 },
  caption:             { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, lineHeight: 18, marginBottom: 4 },
  captionUser:         { fontFamily: FONTS.bold, color: COLORS.textStrong },
  viewCommentsLink:    { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, marginTop: 2 },
  commentsSection:     { marginTop: 8 },
  commentRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  headerRight:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postMenuBackdrop:    { flex: 1 },
  postMenu:            { position: 'absolute', backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#EBEBEB', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8, minWidth: 160, overflow: 'hidden' },
  postMenuItem:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  postMenuItemText:    { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.danger },
  commentAvatar:       { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.lightGray, flexShrink: 0 },
  commentBody:         { flex: 1, backgroundColor: COLORS.lightGray, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  commentUsername:     { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textStrong, marginBottom: 2 },
  commentText:         { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle },
  commentInputRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: COLORS.lightGray, paddingTop: 10, gap: 8 },
  commentInputAvatar:  { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.lightGray, flexShrink: 0 },
  commentInput:        { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textStrong, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: COLORS.lightGray, borderRadius: 16 },
});
