// src/components/PostCard.js
//
// ⚠️  REGRA PERMANENTE — declarado no escopo do módulo, nunca dentro de outro componente.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  Alert, Modal, Pressable, Animated,
  KeyboardAvoidingView, Platform,
} from 'react-native';

import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import LIKE_ANIM from '../../assets/animations/like.json';
import { COLORS, FONTS } from '../theme';
import { supabase } from '../../supabase';

const DEFAULT_AVATAR    = require('../../assets/images/avatar-default.png');
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

// ── Denúncia de post ──────────────────────────────────────────────────────────
// Motivos curtos de propósito — lista longa polui a tela e reduz a chance
// de a pessoa completar a denúncia.
const REPORT_REASONS = [
  { value: 'spam',               label: 'Spam ou propaganda' },
  { value: 'conteudo_impropio',  label: 'Conteúdo impróprio ou ofensivo' },
  { value: 'assedio_bullying',   label: 'Assédio ou bullying' },
  { value: 'fora_do_tema',       label: 'Não relacionado à alimentação saudável' },
  { value: 'outro',              label: 'Outro motivo' },
];

// ── ReportModal — fora do PostCard (regra permanente) ──────────────────────────
function ReportModal({ visible, onClose, onSubmit, submitting }) {
  const [reason,      setReason]      = useState(null);
  const [description, setDescription] = useState('');

  // Reseta o formulário sempre que o modal é reaberto
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDescription('');
    }
  }, [visible]);

  const handleSubmit = () => {
    if (!reason || submitting) return;
    onSubmit(reason, description.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={reportStyles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={reportStyles.sheet}>
            <View style={reportStyles.handle} />
            <Text style={reportStyles.title}>Denunciar post</Text>
            <Text style={reportStyles.subtitle}>Por que você está denunciando esta publicação?</Text>

            {REPORT_REASONS.map(r => {
              const active = reason === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={reportStyles.reasonRow}
                  onPress={() => setReason(r.value)}
                  activeOpacity={0.7}
                >
                  <View style={[reportStyles.radio, active && reportStyles.radioActive]}>
                    {active && <View style={reportStyles.radioDot} />}
                  </View>
                  <Text style={reportStyles.reasonLabel}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}

            <TextInput
              style={reportStyles.descInput}
              placeholder="Descreva com mais detalhes (opcional)"
              placeholderTextColor={COLORS.textSubtitle}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={280}
              returnKeyType="done"
              blurOnSubmit
            />

            <View style={reportStyles.actions}>
              <TouchableOpacity style={reportStyles.cancelBtn} onPress={onClose} disabled={submitting}>
                <Text style={reportStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[reportStyles.submitBtn, !reason && reportStyles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!reason || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={reportStyles.submitText}>Enviar denúncia</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  const [showHeart,       setShowHeart]       = useState(false);
  const [lottieKey,       setLottieKey]       = useState(0);
  const [isZooming,       setIsZooming]       = useState(false);
  const [commentsCount,   setCommentsCount]   = useState(0);
  const [commentText,     setCommentText]     = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [reportVisible,   setReportVisible]   = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const menuBtnRef   = useRef(null);
  const lastTapRef   = useRef(0);
  const likeAnim     = useRef(new Animated.Value(1)).current;
  const commentsAnim = useRef(new Animated.Value(0)).current;
  const imageScale   = useRef(new Animated.Value(1)).current;
  const translateX   = useRef(new Animated.Value(0)).current;
  const translateY   = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    let alive = true;
    (async () => {
      const { count } = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', post.id);
      if (alive) setCommentsCount(count ?? 0);
    })();
    return () => { alive = false; };
  }, [post.id]);

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
      setCommentsCount(data?.length ?? 0);
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
      setCommentsCount(prev => prev + 1);
      setCommentText('');
    }
    setSubmitting(false);
  }, [commentText, submitting, post.id, onAddComment]);

  // ── Excluir post ──────────────────────────────────────────────────────────
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
            onDeletePost?.(post.id);
          },
        },
      ]
    );
  }, [post.id, onDeletePost]);

  // ── Denunciar post ────────────────────────────────────────────────────────
  const handleOpenReport = useCallback(() => {
    setMenuVisible(false);
    setReportVisible(true);
  }, []);

  const handleSubmitReport = useCallback(async (reason, description) => {
    if (reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const { error } = await supabase.from('reports').insert({
        post_id:     post.id,
        reporter_id: currentUserId,
        reason,
        description: description || null,
        // Snapshot textual do post no momento da denúncia — continua
        // disponível na Central de Denúncias mesmo depois que o post
        // (e a imagem) forem removidos pela moderação.
        post_author_username: author?.username ?? null,
        post_caption:          post.caption ?? null,
      });

      if (error) {
        if (error.code === '23505') {
          // unique_violation — já denunciou este post antes
          setReportVisible(false);
          Alert.alert(
            'Você já denunciou este post',
            'Nossa equipe já foi notificada e está avaliando.'
          );
        } else {
          Alert.alert('Não foi possível enviar', 'Tente novamente em instantes.');
        }
        return;
      }

      setReportVisible(false);
      Alert.alert(
        'Denúncia enviada',
        'Obrigado por ajudar a manter o Nutria seguro. Nossa equipe vai analisar.'
      );
    } catch (err) {
      Alert.alert('Não foi possível enviar', 'Tente novamente em instantes.');
    } finally {
      setReportSubmitting(false);
    }
  }, [post.id, currentUserId, reportSubmitting]);

  // ── Excluir comentário ────────────────────────────────────────────────────
  const handleDeleteComment = useCallback(async (commentId) => {
    await supabase.from('comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    setCommentsCount(prev => Math.max(0, prev - 1));
  }, []);

  // ── Curtida com animação de pulso ─────────────────────────────────────────
  const handleLikePress = useCallback(() => {
    onLike(post.id);
    likeAnim.setValue(0.7);
    Animated.spring(likeAnim, {
      toValue: 1, useNativeDriver: true,
      tension: 200, friction: 5,
    }).start();
  }, [post.id, onLike, likeAnim]);

  // ── Toggle comentários com animação ───────────────────────────────────────
  const handleToggleCommentsAnimated = useCallback(() => {
    handleToggleComments();
    Animated.sequence([
      Animated.timing(commentsAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
      Animated.spring(commentsAnim, { toValue: 0, useNativeDriver: true, tension: 200, friction: 5 }),
    ]).start();
  }, [handleToggleComments, commentsAnim]);

  // ── Double tap: like ──────────────────────────────────────────────────────
  const handleImagePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      setLottieKey(k => k + 1);
      setShowHeart(true);
      if (!post.userLiked) onLike(post.id);
    } else {
      lastTapRef.current = now;
    }
  }, [post.userLiked, post.id, onLike]);

  // ── Snap-back compartilhado entre pinch e pan ────────────────────────────
  const snapBack = useCallback(() => {
    setIsZooming(false);
    Animated.parallel([
      Animated.spring(imageScale, { toValue: 1, tension: 180, friction: 7, useNativeDriver: true }),
      Animated.spring(translateX,  { toValue: 0, tension: 180, friction: 7, useNativeDriver: true }),
      Animated.spring(translateY,  { toValue: 0, tension: 180, friction: 7, useNativeDriver: true }),
    ]).start();
  }, [imageScale, translateX, translateY]);

  // ── Pinch: escala — só ativa com 2 dedos, não compete com scroll de 1 dedo ─
  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => setIsZooming(true))
    .onUpdate((e) => {
      imageScale.setValue(Math.max(1, Math.min(5, e.scale)));
    })
    .onFinalize(snapBack);

  // ── Pan com 2 dedos: arrasta enquanto segura o zoom ───────────────────────
  const panGesture = Gesture.Pan()
    .minPointers(2)
    .runOnJS(true)
    .onUpdate((e) => {
      translateX.setValue(e.translationX);
      translateY.setValue(e.translationY);
    })
    .onFinalize(snapBack);

  // Pinch e Pan rodam simultaneamente com os 2 dedos na tela
  const zoomGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  return (
    <View style={[styles.card, isZooming && styles.cardZooming]}>

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
                  {isOwnPost ? (
                    <TouchableOpacity style={styles.postMenuItem} onPress={handleDeletePost}>
                      <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                      <Text style={styles.postMenuItemText}>Excluir post</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.postMenuItem} onPress={handleOpenReport}>
                      <Ionicons name="flag-outline" size={16} color={COLORS.textStrong} />
                      <Text style={[styles.postMenuItemText, { color: COLORS.textStrong }]}>Denunciar post</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Pressable>
            </Modal>
          </View>
        </View>
      </View>

      {/* ── Imagem: pinch para zoom, double tap para like ─────────────── */}
      {/*
          GestureDetector (RNGH nativo) envolve o Animated.View.
          Gesture.Pinch() só ativa com 2 dedos — toques únicos passam direto
          para o Pressable interno sem interferência.
          isZooming eleva o zIndex da imagem acima do footer enquanto ampliada.
      */}
      <GestureDetector gesture={zoomGesture}>
        <Animated.View
          style={[
            styles.imageWrapper,
            { transform: [{ scale: imageScale }, { translateX }, { translateY }] },
            isZooming && styles.imageWrapperZooming,
          ]}
        >
          <Pressable onPress={handleImagePress}>
            <Image source={{ uri: post.image_url }} style={styles.postImage} resizeMode="cover" />
          </Pressable>
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
        </Animated.View>
      </GestureDetector>

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

        <TouchableOpacity onPress={handleToggleComments}>
          <Text style={styles.viewCommentsLink}>
            {commentsCount} comentário{commentsCount === 1 ? '' : 's'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Denunciar post ────────────────────────────────────────────── */}
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={handleSubmitReport}
        submitting={reportSubmitting}
      />
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
  cardZooming:         { overflow: 'visible' },
  header:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  userRow:             { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:              { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.lightGray },
  username:            { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textStrong },
  timeAgo:             { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textSubtitle },
  streakBadge:         { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  streakImg:           { position: 'absolute', width: 46, height: 46, resizeMode: 'contain' },
  streakNumber:        { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.primary, marginTop: -5, marginLeft: 0 },
  streakNumberGray:    { color: '#AAAAAA' },
  streakImgInactive:   { opacity: 0.5 },
  imageWrapper:        { width: '100%' },
  imageWrapperZooming: { zIndex: 10 },
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

// ── Estilos do modal de denúncia ────────────────────────────────────────────
const reportStyles = StyleSheet.create({
  backdrop:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:         { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.lightGray, alignSelf: 'center', marginBottom: 14 },
  title:         { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.textStrong, marginBottom: 4 },
  subtitle:      { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, marginBottom: 14 },
  reasonRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radio:         { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CCCCCC', alignItems: 'center', justifyContent: 'center' },
  radioActive:   { borderColor: COLORS.primary },
  radioDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  reasonLabel:   { flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textStrong },
  descInput:     { marginTop: 8, minHeight: 64, maxHeight: 100, fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textStrong, backgroundColor: COLORS.lightGray, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  actions:       { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.lightGray },
  cancelText:    { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textStrong },
  submitBtn:     { flex: 1.4, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.danger },
  submitBtnDisabled: { backgroundColor: '#EFB4AD' },
  submitText:    { fontFamily: FONTS.bold, fontSize: 14, color: '#FFF' },
});

