// src/screens/tabs/ProfileTab.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro da função principal.
//
// Fase B: menu hambúrguer com Editar Perfil + Alterar Objetivo + Premium

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Modal,
  Dimensions, Animated, StatusBar, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { useStreakValidation } from '../../hooks/useStreakValidation';
import { useAdmin } from '../../hooks/useAdmin';
import StreakLostPopup from '../../components/StreakLostPopup';
import { supabase } from '../../../supabase';
import { GOAL_LABELS } from '../../utils/caloricCalc';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

const DEFAULT_AVATAR = require('../../../assets/images/avatar-default.png');

// Grid: 3 colunas sem padding lateral no container
const SCREEN_WIDTH    = Dimensions.get('window').width;
const GRID_GAP        = 2;
const GRID_ITEM_SIZE  = Math.floor((SCREEN_WIDTH - GRID_GAP * 2) / 3);

// ── PostGridItem ──────────────────────────────────────────────────────────────
function PostGridItem({ post, onPress }) {
  return (
    <TouchableOpacity
      style={gridStyles.item}
      onPress={() => onPress(post)}
      activeOpacity={0.85}
    >
      <Image source={{ uri: post.image_url }} style={gridStyles.img} resizeMode="cover" />
    </TouchableOpacity>
  );
}

// ── StatColumn ────────────────────────────────────────────────────────────────
function StatColumn({ count, label, onPress }) {
  return (
    <TouchableOpacity
      style={styles.statItem}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── StreakBadge ───────────────────────────────────────────────────────────────
function StreakBadge({ streak }) {
  const active = streak > 0;
  return (
    <View style={[styles.streakRow, !active && styles.streakRowInactive]}>
      <Ionicons name="flame" size={14} color={active ? COLORS.primary : '#BBBBBB'} />
      <Text style={[styles.streakText, !active && styles.streakTextInactive]}>
        {active
          ? `${streak} ${streak === 1 ? 'dia' : 'dias'} em sequência`
          : 'Nenhuma sequência ativa — poste hoje!'}
      </Text>
    </View>
  );
}

// ── SideDrawer ────────────────────────────────────────────────────────────────
// Drawer totalmente baseado em animação:
//   - Abre com spring ao receber visible=true
//   - Fecha com timing ao receber visible=false
//   - Segue o dedo via PanResponder durante o arrasto
//   - Ao soltar: se passou 30% da largura → fecha; senão → volta
//   - Overlay opacity acompanha translateX interpolado
const SCREEN_W     = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_W * 0.68;   // 68% — não cobre status bar
const EDGE_HIT_WIDTH = 24;              // área de borda para abrir arrastando
const SNAP_THRESHOLD = DRAWER_WIDTH * 0.3;

function SideDrawer({ visible, onClose, onEditProfile, onChangeGoal, onUpdateData, onPremium, onReportsCenter, isAdmin, onLogout, translateRef }) {
  const translateX = useRef(new Animated.Value(DRAWER_WIDTH)).current;

  // Expõe translateX para o edgePanResponder da tela pai
  useEffect(() => {
    if (translateRef) translateRef.current = translateX;
  }, [translateX]);
  const [mounted, setMounted] = useState(false);

  // Overlay opacity derivado do translateX via interpolation
  // 0 (fechado) → opacity 0 | DRAWER_WIDTH (aberto) → opacity 1
  const overlayOpacity = translateX.interpolate({
    inputRange: [0, DRAWER_WIDTH],
    outputRange: [0.5, 0],
    extrapolate: 'clamp',
  });

  // ── Abre e fecha com animação ─────────────────────────────────────────────
  const animateOpen = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start();
  }, []);

  const animateClose = useCallback((onDone) => {
    Animated.timing(translateX, {
      toValue: DRAWER_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(onDone);
  }, []);

  // Monta o modal ao abrir, desmonta após animação de fechamento
  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Garante que começa do lado de fora antes de animar
      translateX.setValue(DRAWER_WIDTH);
      requestAnimationFrame(() => animateOpen());
    } else if (mounted) {
      animateClose(() => setMounted(false));
    }
  }, [visible]);

  // ── PanResponder — segue o dedo ao fechar (arrastar para direita) ──────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),

      onPanResponderMove: (_, g) => {
        // Só direita (fechar): clampeia entre 0 e DRAWER_WIDTH
        const next = Math.max(0, Math.min(DRAWER_WIDTH, g.dx));
        translateX.setValue(next);
      },

      onPanResponderRelease: (_, g) => {
        if (g.dx > SNAP_THRESHOLD || g.vx > 0.5) {
          animateClose(() => onClose());
        } else {
          animateOpen();
        }
      },

      onPanResponderTerminate: () => { animateOpen(); },
    })
  ).current;

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={() => animateClose(() => onClose())}>
      <View style={drawerStyles.root} pointerEvents="box-none">
        {/* Overlay — opacidade derivada da posição do drawer */}
        <Animated.View style={[drawerStyles.overlay, { opacity: overlayOpacity }]}
          pointerEvents="auto"
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => animateClose(() => onClose())}
          />
        </Animated.View>

        {/* Painel — recebe o PanResponder */}
        <Animated.View
          style={[drawerStyles.panel, { transform: [{ translateX }] }]}
          {...panResponder.panHandlers}
        >
          {/* Itens do menu */}
          <TouchableOpacity style={drawerStyles.item} onPress={onEditProfile}>
            <View style={drawerStyles.itemIcon}>
              <Ionicons name="person-outline" size={20} color={COLORS.textStrong} />
            </View>
            <Text style={drawerStyles.itemText}>Editar Perfil</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textSubtitle} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <View style={drawerStyles.divider} />

          <TouchableOpacity style={drawerStyles.item} onPress={onChangeGoal}>
            <View style={drawerStyles.itemIcon}>
              <Ionicons name="flag-outline" size={20} color={COLORS.textStrong} />
            </View>
            <Text style={drawerStyles.itemText}>Alterar Objetivo</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textSubtitle} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <View style={drawerStyles.divider} />

          <TouchableOpacity style={drawerStyles.item} onPress={onUpdateData}>
            <View style={drawerStyles.itemIcon}>
              <Ionicons name="calculator-outline" size={20} color={COLORS.textStrong} />
            </View>
            <Text style={drawerStyles.itemText}>Atualizar meus dados</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textSubtitle} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <View style={drawerStyles.divider} />

          {/* Premium */}
          <TouchableOpacity style={drawerStyles.item} onPress={onPremium}>
            <View style={[drawerStyles.itemIcon, { backgroundColor: '#F3EEFF' }]}>
              <Ionicons name="diamond-outline" size={20} color="#7C3AED" />
            </View>
            <Text style={[drawerStyles.itemText, { color: '#7C3AED' }]}>Assinar Premium</Text>
            <Ionicons name="chevron-forward" size={16} color="#7C3AED" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          {/* Central de Denúncias — visível só para administradores */}
          {isAdmin && (
            <>
              <View style={drawerStyles.divider} />
              <TouchableOpacity style={drawerStyles.item} onPress={onReportsCenter}>
                <View style={[drawerStyles.itemIcon, { backgroundColor: '#FDE9E1' }]}>
                  <Ionicons name="shield-outline" size={20} color={COLORS.primary} />
                </View>
                <Text style={drawerStyles.itemText}>Central de Denúncias</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textSubtitle} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            </>
          )}

          <View style={drawerStyles.divider} />

          <TouchableOpacity style={drawerStyles.item} onPress={onLogout}>
            <View style={drawerStyles.itemIcon}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
            </View>
            <Text style={[drawerStyles.itemText, { color: COLORS.danger }]}>Sair da conta</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── ProfileTab ────────────────────────────────────────────────────────────────
export default function ProfileTab({ navigation }) {
  const { profile, session }  = useUser();
  const { signOut }           = useAuth();
  const { fetchFollowCounts } = useFollows(session?.user?.id);
  const { validateStreak, showStreakPopup, dismissStreakPopup } = useStreakValidation();
  const { isAdmin } = useAdmin();

  const [userPosts,    setUserPosts]    = useState([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [postsLoading, setPostsLoading] = useState(true);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const profilePostsChannelRef = useRef(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchUserPosts(session.user.id);
    loadFollowCounts(session.user.id);
    validateStreak();
  }, [session?.user?.id]);

  // ── Realtime: novos posts próprios aparecem no grid sem recarregar ─────────
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    if (profilePostsChannelRef.current) {
      supabase.removeChannel(profilePostsChannelRef.current);
      profilePostsChannelRef.current = null;
    }

    const channel = supabase
      .channel('profile_posts_' + uid)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'posts',
        filter: 'user_id=eq.' + uid,
      }, (payload) => {
        setUserPosts(prev =>
          prev.some(p => p.id === payload.new.id) ? prev : [payload.new, ...prev]
        );
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'posts',
        filter: 'user_id=eq.' + uid,
      }, (payload) => {
        setUserPosts(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .subscribe();
    profilePostsChannelRef.current = channel;
    return () => supabase.removeChannel(channel);
  }, [session?.user?.id]);

  // ── Recarrega ao focar a aba — rede de segurança ──────────────────────────
  useFocusEffect(
    useCallback(() => {
      const uid = session?.user?.id;
      if (uid) {
        fetchUserPosts(uid);
        loadFollowCounts(uid);
      }
    }, [session?.user?.id])
  );

  const fetchUserPosts = async (userId) => {
    setPostsLoading(true);
    const { data } = await supabase
      .from('posts')
      .select('id, image_url, likes_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setUserPosts(data ?? []);
    setPostsLoading(false);
  };

  const loadFollowCounts = async (userId) => {
    const counts = await fetchFollowCounts(userId);
    setFollowCounts(counts);
  };

  const handleLogout = () => {
    setMenuOpen(false);
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => await signOut() },
    ]);
  };

  const handlePremium = () => {
    setMenuOpen(false);
    Alert.alert('Em breve', 'Tela Premium chegando na próxima entrega!');
  };

  const handleChangeGoal = () => {
    setMenuOpen(false);
    navigation?.navigate('Goal', { editMode: true });
  };

  const handleUpdateData = () => {
    setMenuOpen(false);
    navigation?.navigate('CaloricData', { editMode: true });
  };

  const handleEditProfile = () => {
    setMenuOpen(false);
    navigation?.navigate('EditProfile');
  };

  const handleReportsCenter = () => {
    setMenuOpen(false);
    navigation?.navigate('ReportsCenter');
  };

  const streak  = profile?.streak ?? 0;
  const userId  = session?.user?.id;
  const goalLabel = GOAL_LABELS[profile?.goal] ?? '—';

  // ── PanResponder da borda direita — abre o drawer arrastando ───────────────
  // translateX do drawer é acessado via ref para não precisar de estado extra
  const drawerTranslateRef = useRef(null);

  const edgePanResponder = useRef(
    PanResponder.create({
      // Inicia apenas se o toque começou nos últimos EDGE_HIT_WIDTH px
      onStartShouldSetPanResponder: (e) => {
        const x = e.nativeEvent.pageX;
        return x > SCREEN_W - EDGE_HIT_WIDTH;
      },
      onMoveShouldSetPanResponder: (e, g) => {
        const x = e.nativeEvent.pageX;
        return x > SCREEN_W - EDGE_HIT_WIDTH * 3 && g.dx < -8;
      },

      onPanResponderGrant: () => {
        // Abre o modal montando o drawer antes do movimento
        setMenuOpen(true);
      },

      onPanResponderMove: (_, g) => {
        // dx é negativo (para esquerda), converte para translateX positivo
        if (drawerTranslateRef.current) {
          const next = Math.max(0, Math.min(DRAWER_WIDTH, DRAWER_WIDTH + g.dx));
          drawerTranslateRef.current.setValue(next);
        }
      },

      onPanResponderRelease: (_, g) => {
        if (g.dx < -SNAP_THRESHOLD || g.vx < -0.5) {
          // Abriu suficiente → snapa para aberto
          if (drawerTranslateRef.current) {
            Animated.spring(drawerTranslateRef.current, {
              toValue: 0, useNativeDriver: true, tension: 68, friction: 12,
            }).start();
          }
        } else {
          // Não abriu suficiente → fecha
          setMenuOpen(false);
        }
      },
    })
  ).current;

  return (
    <View style={styles.container} {...edgePanResponder.panHandlers}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* ── Header com hambúrguer ─────────────────────────────────────── */}
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>@{profile?.username ?? '...'}</Text>
          <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="menu-outline" size={28} color={COLORS.textStrong} />
          </TouchableOpacity>
        </View>

        {/* ── Avatar + stats ────────────────────────────────────────────── */}
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={handleEditProfile} activeOpacity={0.85}>
            <View>
              <Image
                source={profile?.avatar_url ? { uri: profile.avatar_url } : DEFAULT_AVATAR}
                style={styles.avatar}
              />
              {/* Badge de editar sobre o avatar */}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={12} color="#FFF" />
              </View>
            </View>
          </TouchableOpacity>
          <View style={styles.statsRow}>
            <StatColumn count={userPosts.length} label="Posts" />
            <StatColumn
              count={followCounts.followers}
              label="Seguidores"
              onPress={() => navigation.navigate('FollowList', { userId, type: 'followers', username: profile?.username ?? '' })}
            />
            <StatColumn
              count={followCounts.following}
              label="Seguindo"
              onPress={() => navigation.navigate('FollowList', { userId, type: 'following', username: profile?.username ?? '' })}
            />
          </View>
        </View>

        {/* ── Info ──────────────────────────────────────────────────────── */}
        <View style={styles.infoBlock}>
          {profile?.full_name ? (
            <Text style={styles.fullName}>{profile.full_name}</Text>
          ) : null}
          <StreakBadge streak={streak} />
          <Text style={styles.goalText}>
            <Text style={styles.goalLabel}>Objetivo: </Text>{goalLabel}
          </Text>
          {profile?.calorie_target > 0 && (
            <Text style={styles.calorieText}>
              Meta: <Text style={styles.calorieValue}>{profile.calorie_target} kcal/dia</Text>
            </Text>
          )}
        </View>



        {/* ── Grid de posts ─────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Minhas Postagens</Text>

        {postsLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
        ) : userPosts.length === 0 ? (
          <View style={styles.noPostsContainer}>
            <Ionicons name="camera-outline" size={40} color={COLORS.lightGray} />
            <Text style={styles.noPostsText}>Nenhuma postagem ainda.</Text>
          </View>
        ) : (
          // Sem paddingHorizontal no container — GRID_ITEM_SIZE calculado sobre SCREEN_WIDTH inteiro
          <View style={gridStyles.grid}>
            {userPosts.map(post => (
              <PostGridItem
                key={post.id}
                post={post}
                onPress={(p) => navigation.navigate('PostDetail', { postId: p.id })}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Menu hambúrguer ───────────────────────────────────────────────── */}
      <SideDrawer
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onEditProfile={handleEditProfile}
        onChangeGoal={handleChangeGoal}
        onUpdateData={handleUpdateData}
        onPremium={handlePremium}
        onReportsCenter={handleReportsCenter}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        translateRef={drawerTranslateRef}
      />

      {/* ── Popup de streak perdida ───────────────────────────────────────── */}
      <StreakLostPopup visible={showStreakPopup} onDismiss={dismissStreakPopup} />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.background },

  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
  topBarTitle:  { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.textStrong },

  profileHeader:{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.lg },
  avatar:       { width: 86, height: 86, borderRadius: 43, borderWidth: 3, borderColor: COLORS.primary, backgroundColor: COLORS.lightGray },
  avatarEditBadge: { position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.background },
  statsRow:     { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' },
  statItem:     { alignItems: 'center' },
  statCount:    { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.textStrong },
  statLabel:    { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle, marginTop: 2 },

  infoBlock:    { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  fullName:     { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong, marginBottom: 2 },
  streakRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  streakRowInactive: { opacity: 0.55 },
  streakText:   { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.primary },
  streakTextInactive: { fontFamily: FONTS.regular, fontSize: 13, color: '#BBBBBB' },
  goalText:     { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, marginBottom: 2 },
  goalLabel:    { fontFamily: FONTS.bold, color: COLORS.textStrong },
  calorieText:  { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle },
  calorieValue: { fontFamily: FONTS.bold, color: COLORS.primary },

  // Banner Premium — sempre visível, cor roxa de destaque
  premiumBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: SPACING.md, marginBottom: SPACING.md, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F3EEFF', borderWidth: 1, borderColor: '#DDD6FE' },
  premiumTitle:  { fontFamily: FONTS.medium, fontSize: 13, color: '#7C3AED' },

  sectionTitle:     { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textStrong, textAlign: 'center', marginBottom: SPACING.sm },
  noPostsContainer: { alignItems: 'center', paddingVertical: SPACING.xl, gap: 8 },
  noPostsText:      { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle },
});

const gridStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  item: { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE },
  img:  { width: '100%', height: '100%', backgroundColor: COLORS.lightGray },
});

const drawerStyles = StyleSheet.create({
  root:          { ...StyleSheet.absoluteFillObject, zIndex: 999 },
  overlay:       { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  panel:         {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    width: DRAWER_WIDTH,
    backgroundColor: COLORS.background,
    shadowColor: '#000',
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },
  divider:         { height: 1, backgroundColor: COLORS.lightGray, marginVertical: 4, marginHorizontal: 20 },
  item:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20, gap: 14 },
  itemIcon:        { width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.lightGray, alignItems: 'center', justifyContent: 'center' },
  itemText:        { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textStrong, flex: 1 },
  itemPremium:     { backgroundColor: '#3A1C9C', marginHorizontal: 12, marginVertical: 4, borderRadius: 14, paddingHorizontal: 8 },
  itemTextPremium: { fontFamily: FONTS.bold, fontSize: 14, color: '#FFF', flex: 1 },
});
