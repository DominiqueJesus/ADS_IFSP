// src/screens/GroupDetailScreen.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro da função principal.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { supabase } from '../../supabase';
import PostCard from '../components/PostCard';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const DEFAULT_GROUP     = require('../../assets/images/avatar-default.png');
const DEFAULT_AVATAR    = require('../../assets/images/avatar-default.png');
const STREAK_BADGE      = require('../../assets/images/streak-badge.png');
const STREAK_BADGE_GRAY = require('../../assets/images/streak-badge-gray.png');

const RANK_PAGE_SIZE = 20; // quantos membros mostrar inicialmente

// ── Componentes auxiliares ────────────────────────────────────────────────────

function HeaderBar({ onBack, group, isAdmin, onDeleteGroup }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Image
          source={group.image_url ? { uri: group.image_url } : DEFAULT_GROUP}
          style={styles.headerAvatar}
        />
        <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
      </View>
      {isAdmin
        ? <TouchableOpacity onPress={onDeleteGroup} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
          </TouchableOpacity>
        : <View style={{ width: 24 }} />
      }
    </View>
  );
}

function SegmentedControl({ active, onChange }) {
  return (
    <View style={styles.segmentedControl}>
      {[{ key: 'ranking', label: 'Ranking' }, { key: 'feed', label: 'Posts' }].map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.segment, active === tab.key && styles.segmentActive]}
          onPress={() => onChange(tab.key)}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, active === tab.key && styles.segmentTextActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── RankingItem ───────────────────────────────────────────────────────────────
function RankingItem({ item, position, isCurrentUser }) {
  const streak     = item.profiles?.streak ?? 0;
  const isTop3     = position <= 3;
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <View style={[
      rankStyles.row,
      isTop3 && rankStyles.rowTop,
      isCurrentUser && rankStyles.rowMe,
    ]}>
      <View style={rankStyles.positionWrap}>
        {isTop3
          ? <View style={[rankStyles.medal, { backgroundColor: medalColors[position - 1] }]}>
              <Text style={rankStyles.medalText}>{position}</Text>
            </View>
          : <Text style={[rankStyles.position, isCurrentUser && rankStyles.positionMe]}>
              {position}
            </Text>
        }
      </View>

      <Image
        source={item.profiles?.avatar_url ? { uri: item.profiles.avatar_url } : DEFAULT_AVATAR}
        style={rankStyles.avatar}
      />

      <View style={rankStyles.info}>
        <Text style={[rankStyles.username, isCurrentUser && rankStyles.usernameMe]}>
          {item.profiles?.full_name || `@${item.profiles?.username ?? '—'}`}
          {isCurrentUser ? '  (você)' : ''}
        </Text>
        {item.profiles?.full_name
          ? <Text style={rankStyles.handle}>@{item.profiles?.username}</Text>
          : null}
      </View>

      <View style={rankStyles.streakWrap}>
        <Image
          source={streak > 0 ? STREAK_BADGE : STREAK_BADGE_GRAY}
          style={rankStyles.streakImg}
        />
        <Text style={[rankStyles.streakNum, streak === 0 && rankStyles.streakNumGray]}>
          {streak}
        </Text>
      </View>
    </View>
  );
}

// ── Modal de transferência de admin ──────────────────────────────────────────
function TransferAdminModal({ visible, members, currentUserId, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(null);
  const others = members.filter(m => m.user_id !== currentUserId);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={transferStyles.backdrop}>
        <View style={transferStyles.card}>
          <Text style={transferStyles.title}>Transferir administração</Text>
          <Text style={transferStyles.subtitle}>
            Escolha quem assumirá o grupo antes de você sair.
          </Text>
          <FlatList
            data={others}
            keyExtractor={i => i.user_id}
            style={{ maxHeight: 260, marginVertical: 12 }}
            renderItem={({ item }) => {
              const isSelected = selected === item.user_id;
              return (
                <TouchableOpacity
                  style={[transferStyles.memberRow, isSelected && transferStyles.memberRowSelected]}
                  onPress={() => setSelected(item.user_id)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={item.profiles?.avatar_url
                      ? { uri: item.profiles.avatar_url }
                      : DEFAULT_AVATAR}
                    style={transferStyles.avatar}
                  />
                  <Text style={transferStyles.memberName}>
                    {item.profiles?.full_name || `@${item.profiles?.username}`}
                  </Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              );
            }}
          />
          <View style={transferStyles.btnRow}>
            <TouchableOpacity style={transferStyles.btnCancel} onPress={onCancel}>
              <Text style={transferStyles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[transferStyles.btnConfirm, !selected && { opacity: 0.4 }]}
              onPress={() => selected && onConfirm(selected)}
              disabled={!selected}
            >
              <Text style={transferStyles.btnConfirmText}>Confirmar e excluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── GroupDetailScreen ─────────────────────────────────────────────────────────
export default function GroupDetailScreen({ route, navigation }) {
  const { group } = route.params;
  const { session } = useUser();
  const userId    = session?.user?.id;
  const flatListRef = useRef(null);

  // isAdmin inicializado do group.admin_id para evitar flash de botão errado
  const [activeTab,      setActiveTab]      = useState('ranking');
  const [members,        setMembers]        = useState([]);
  const [posts,          setPosts]          = useState([]);
  const [membership,     setMembership]     = useState(null);
  const [isAdmin,        setIsAdmin]        = useState(group.admin_id === userId);
  const [loadRank,       setLoadRank]       = useState(true);
  const [loadFeed,       setLoadFeed]       = useState(false);
  const [joining,        setJoining]        = useState(false);
  const [rankSearch,     setRankSearch]     = useState('');
  const [showAll,        setShowAll]        = useState(false);
  const [transferModal,  setTransferModal]  = useState(false);

  useEffect(() => {
    fetchMembership();
    fetchRanking();
  }, [group.id]);

  useEffect(() => {
    if (activeTab === 'feed' && posts.length === 0) fetchFeed();
  }, [activeTab]);

  // ── Membership + role ─────────────────────────────────────────────────────
  const fetchMembership = async () => {
    const { data } = await supabase
      .from('group_members')
      .select('status, role')
      .eq('group_id', group.id)
      .eq('user_id', userId)
      .maybeSingle();
    setMembership(data?.status ?? null);
    // Verifica também via admin_id do grupo (mais confiável após transferência)
    const isAdminByRole = data?.role === 'admin';
    const isAdminById   = group.admin_id === userId;
    setIsAdmin(isAdminByRole || isAdminById);
  };

  // ── Ranking — todos os membros aprovados, ordenados por streak DESC ───────
  const fetchRanking = useCallback(async () => {
    setLoadRank(true);
    const { data } = await supabase
      .from('group_members')
      .select('user_id, role, status, profiles ( id, username, full_name, avatar_url, streak )')
      .eq('group_id', group.id)
      .eq('status', 'approved');

    const sorted = (data ?? []).sort(
      (a, b) => (b.profiles?.streak ?? 0) - (a.profiles?.streak ?? 0)
    );
    setMembers(sorted);
    setLoadRank(false);
  }, [group.id]);

  // ── Feed do grupo ─────────────────────────────────────────────────────────
  const fetchFeed = useCallback(async () => {
    setLoadFeed(true);
    const { data: memberData } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .eq('status', 'approved');

    const memberIds = (memberData ?? []).map(m => m.user_id);
    if (!memberIds.length) { setPosts([]); setLoadFeed(false); return; }

    const { data } = await supabase
      .from('posts')
      .select('id, image_url, caption, likes_count, created_at, profiles ( id, username, avatar_url, streak )')
      .in('user_id', memberIds)
      .order('created_at', { ascending: false })
      .limit(30);

    const postIds = (data ?? []).map(p => p.id);
    const { data: likes } = await supabase
      .from('likes').select('post_id').eq('user_id', userId).in('post_id', postIds);
    const likedSet = new Set((likes ?? []).map(l => l.post_id));
    setPosts((data ?? []).map(p => ({ ...p, userLiked: likedSet.has(p.id) })));
    setLoadFeed(false);
  }, [group.id, userId]);

  // ── Ranking filtrado + lógica de paginação e posição do usuário ───────────
  const { filteredMembers, userPosition, userEntry, visibleMembers } = useMemo(() => {
    const search = rankSearch.trim().toLowerCase();
    const filtered = search
      ? members.filter(m =>
          (m.profiles?.username ?? '').toLowerCase().includes(search) ||
          (m.profiles?.full_name ?? '').toLowerCase().includes(search)
        )
      : members;

    // Posição real do usuário logado na lista completa (sem filtro)
    const userIdx  = members.findIndex(m => m.user_id === userId);
    const userPos  = userIdx >= 0 ? userIdx + 1 : null;
    const userMember = userIdx >= 0 ? members[userIdx] : null;

    // Membros visíveis: primeiros RANK_PAGE_SIZE ou todos se showAll
    const visible = filtered.slice(0, showAll ? filtered.length : RANK_PAGE_SIZE);

    return {
      filteredMembers: filtered,
      userPosition: userPos,
      userEntry: userMember,
      visibleMembers: visible,
    };
  }, [members, rankSearch, showAll, userId]);

  // O usuário aparece abaixo do limite quando não está nos visíveis
  const userBeyondLimit = useMemo(() => {
    if (!userEntry || showAll || rankSearch) return false;
    const userIdx = members.findIndex(m => m.user_id === userId);
    return userIdx >= RANK_PAGE_SIZE;
  }, [members, userEntry, showAll, rankSearch, userId]);

  // ── Like otimista ─────────────────────────────────────────────────────────
  const handleLike = useCallback(async (postId) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const wasLiked = p.userLiked;
      return { ...p, userLiked: !wasLiked, likes_count: wasLiked ? p.likes_count - 1 : p.likes_count + 1 };
    }));
    const post = posts.find(p => p.id === postId);
    if (post?.userLiked) {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
      await supabase.rpc('decrement_likes', { post_id: postId });
    } else {
      await supabase.from('likes').insert({ post_id: postId, user_id: userId });
      await supabase.rpc('increment_likes', { post_id: postId });
    }
  }, [posts, userId]);

  const fetchComments = useCallback(async (postId) => {
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, profiles ( id, username, avatar_url )')
      .eq('post_id', postId).order('created_at', { ascending: true });
    return data ?? [];
  }, []);

  const addComment = useCallback(async (postId, content) => {
    const { data } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: userId, content: content.trim() })
      .select('id, content, created_at, profiles ( id, username, avatar_url )')
      .single();
    return data;
  }, [userId]);

  // ── Entrar no grupo ───────────────────────────────────────────────────────
  const handleJoin = async () => {
    setJoining(true);
    try {
      const status = group.requires_approval ? 'pending' : 'approved';
      const { error } = await supabase.from('group_members')
        .insert({ group_id: group.id, user_id: userId, status });
      if (error) throw error;
      setMembership(status);
      if (status === 'approved') fetchRanking();
    } catch (err) {
      Alert.alert('Erro', err.message);
    } finally {
      setJoining(false);
    }
  };

  // ── Sair do grupo (membro comum) ──────────────────────────────────────────
  const handleLeave = () => {
    Alert.alert('Sair do grupo', `Sair de "${group.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair', style: 'destructive',
        onPress: async () => {
          await supabase.from('group_members')
            .delete().eq('group_id', group.id).eq('user_id', userId);
          setMembership(null);
          navigation.goBack();
        },
      },
    ]);
  };

  // ── Excluir grupo (admin) — com ou sem transferência ─────────────────────
  const handleDeleteGroup = () => {
    const otherMembers = members.filter(m => m.user_id !== userId);

    Alert.alert('Excluir grupo', `Excluir "${group.name}" permanentemente?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: () => {
          if (otherMembers.length > 0) {
            // Há outros membros — pede para transferir admin antes
            setTransferModal(true);
          } else {
            // Único membro — deleta direto
            confirmDeleteGroup(null);
          }
        },
      },
    ]);
  };

  const confirmDeleteGroup = async (newAdminId) => {
    setTransferModal(false);
    try {
      if (newAdminId) {
        // Promove novo admin em group_members E atualiza admin_id no grupo
        await supabase.from('group_members')
          .update({ role: 'admin' })
          .eq('group_id', group.id)
          .eq('user_id', newAdminId);
        await supabase.from('groups')
          .update({ admin_id: newAdminId })
          .eq('id', group.id);
        // Remove o admin atual dos membros (sem deletar o grupo)
        await supabase.from('group_members')
          .delete()
          .eq('group_id', group.id)
          .eq('user_id', userId);
        navigation.goBack();
      } else {
        // Único membro — deleta o grupo (cascade remove membros via FK)
        await supabase.from('groups').delete().eq('id', group.id);
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert('Erro ao excluir', err.message);
    }
  };

  // ── Navegação de perfil ───────────────────────────────────────────────────
  const handleProfilePress = useCallback((authorId) => {
    if (!authorId) return;
    navigation.push('PublicProfile', { userId: authorId });
  }, [navigation]);

  // ── Botão de ação (membro comum — não admin) ──────────────────────────────
  const renderActionButton = () => {
    if (isAdmin) return null; // admin não tem botão — usa o ícone de lixo no header

    if (membership === 'approved') {
      return (
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnOutline]} onPress={handleLeave}>
          <Text style={styles.actionBtnOutlineText}>Sair do grupo</Text>
        </TouchableOpacity>
      );
    }
    if (membership === 'pending') {
      return (
        <View style={[styles.actionBtn, styles.actionBtnDisabled]}>
          <Text style={styles.actionBtnDisabledText}>Solicitação enviada</Text>
        </View>
      );
    }
    return (
      <TouchableOpacity style={styles.actionBtn} onPress={handleJoin} disabled={joining}>
        {joining
          ? <ActivityIndicator size="small" color="#FFF" />
          : <Text style={styles.actionBtnText}>
              {group.requires_approval ? 'Pedir para entrar' : 'Entrar no grupo'}
            </Text>
        }
      </TouchableOpacity>
    );
  };

  const renderPost = useCallback(({ item, index }) => (
    <PostCard
      post={item}
      currentUserId={userId}
      onLike={handleLike}
      onAddComment={addComment}
      onFetchComments={fetchComments}
      flatListRef={flatListRef}
      postIndex={index}
      onProfilePress={handleProfilePress}
    />
  ), [userId, handleLike, addComment, fetchComments, handleProfilePress]);

  // ── Ranking view ──────────────────────────────────────────────────────────
  const renderRanking = () => {
    if (loadRank) return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />;

    return (
      <View style={{ flex: 1 }}>
        {/* Barra de busca do ranking */}
        <View style={styles.rankSearchWrap}>
          <Ionicons name="search-outline" size={16} color={COLORS.textSubtitle} />
          <TextInput
            style={styles.rankSearchInput}
            value={rankSearch}
            onChangeText={t => { setRankSearch(t); setShowAll(false); }}
            placeholder="Buscar membro..."
            placeholderTextColor={COLORS.textSubtitle}
          />
          {rankSearch.length > 0 && (
            <TouchableOpacity onPress={() => setRankSearch('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.textSubtitle} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={visibleMembers}
          keyExtractor={item => item.user_id}
          renderItem={({ item, index }) => {
            const realPosition = filteredMembers.indexOf(item) + 1;
            return (
              <RankingItem
                item={item}
                position={realPosition}
                isCurrentUser={item.user_id === userId}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={40} color={COLORS.lightGray} />
              <Text style={styles.emptyText}>Nenhum membro encontrado.</Text>
            </View>
          }
          ListFooterComponent={() => (
            <View>
              {/* Mostrar mais */}
              {!showAll && filteredMembers.length > RANK_PAGE_SIZE && (
                <TouchableOpacity
                  style={styles.showMoreBtn}
                  onPress={() => setShowAll(true)}
                >
                  <Text style={styles.showMoreText}>
                    Mostrar mais ({filteredMembers.length - RANK_PAGE_SIZE} restantes)
                  </Text>
                </TouchableOpacity>
              )}

              {/* Usuário além do limite — destaque fixo no rodapé */}
              {userBeyondLimit && userEntry && (
                <View>
                  <View style={styles.userBeyondDivider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerLabel}>sua posição</Text>
                    <View style={styles.dividerLine} />
                  </View>
                  <RankingItem
                    item={userEntry}
                    position={userPosition}
                    isCurrentUser
                  />
                </View>
              )}
              <View style={{ height: 40 }} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <HeaderBar
        onBack={() => navigation.goBack()}
        group={group}
        isAdmin={isAdmin}
        onDeleteGroup={handleDeleteGroup}
      />

      {/* ── Info do grupo ────────────────────────────────────────────── */}
      <View style={styles.groupInfo}>
        {group.description ? (
          <Text style={styles.groupDesc}>{group.description}</Text>
        ) : null}
        <View style={styles.groupMeta}>
          <Ionicons
            name={group.privacy === 'private' ? 'lock-closed-outline' : 'globe-outline'}
            size={13} color={COLORS.textSubtitle}
          />
          <Text style={styles.groupMetaText}>
            {group.privacy === 'private' ? 'Grupo Privado' : 'Grupo Público'}
          </Text>
          <Text style={styles.groupMetaDot}>·</Text>
          {/* Contagem real de membros aprovados */}
          <Text style={styles.groupMetaText}>
            {loadRank ? '...' : members.length} {members.length === 1 ? 'membro' : 'membros'}
          </Text>
        </View>
        {renderActionButton()}
      </View>

      <SegmentedControl active={activeTab} onChange={setActiveTab} />

      {activeTab === 'ranking'
        ? renderRanking()
        : loadFeed
          ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
          : posts.length === 0
            ? <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={40} color={COLORS.lightGray} />
                <Text style={styles.emptyText}>Nenhuma postagem ainda.</Text>
              </View>
            : <FlatList
                ref={flatListRef}
                data={posts}
                keyExtractor={item => String(item.id)}
                renderItem={renderPost}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
                onRefresh={fetchFeed}
                refreshing={loadFeed}
              />
      }

      {/* Modal de transferência de admin */}
      <TransferAdminModal
        visible={transferModal}
        members={members}
        currentUserId={userId}
        onConfirm={confirmDeleteGroup}
        onCancel={() => setTransferModal(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: COLORS.background },
  header:                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerCenter:          { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  headerAvatar:          { width: 30, height: 30, borderRadius: 8, backgroundColor: COLORS.lightGray },
  headerTitle:           { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong, flexShrink: 1 },
  groupInfo:             { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  groupDesc:             { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, marginBottom: 6, lineHeight: 18 },
  groupMeta:             { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  groupMetaText:         { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle },
  groupMetaDot:          { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle },
  actionBtn:             { backgroundColor: COLORS.primary, paddingVertical: 9, borderRadius: RADIUS.sm, alignItems: 'center' },
  actionBtnText:         { fontFamily: FONTS.bold, fontSize: 14, color: '#FFF' },
  actionBtnOutline:      { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.lightGray },
  actionBtnOutlineText:  { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.danger },
  actionBtnDisabled:     { backgroundColor: COLORS.lightGray },
  actionBtnDisabledText: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSubtitle },
  segmentedControl:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  segment:               { flex: 1, paddingVertical: 12, alignItems: 'center' },
  segmentActive:         { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  segmentText:           { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSubtitle },
  segmentTextActive:     { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary },
  emptyState:            { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
  emptyText:             { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle },
  rankSearchWrap:        { flexDirection: 'row', alignItems: 'center', gap: 8, margin: SPACING.sm, backgroundColor: '#F4F4F4', borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 8 },
  rankSearchInput:       { flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textStrong, padding: 0 },
  showMoreBtn:           { alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: COLORS.lightGray },
  showMoreText:          { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.primary },
  userBeyondDivider:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SPACING.md, paddingVertical: 8 },
  dividerLine:           { flex: 1, height: 1, backgroundColor: COLORS.lightGray },
  dividerLabel:          { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textSubtitle },
});

const rankStyles = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, gap: 12 },
  rowTop:        { backgroundColor: '#FFFBF7' },
  rowMe:         { backgroundColor: '#FFF3EE', borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  positionWrap:  { width: 28, alignItems: 'center' },
  position:      { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textSubtitle },
  positionMe:    { color: COLORS.primary },
  medal:         { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  medalText:     { fontFamily: FONTS.bold, fontSize: 13, color: '#FFF' },
  avatar:        { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.lightGray },
  info:          { flex: 1 },
  username:      { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textStrong },
  usernameMe:    { color: COLORS.primary },
  handle:        { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle },
  streakWrap:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  streakImg:     { position: 'absolute', width: 44, height: 44, resizeMode: 'contain' },
  streakNum:     { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.primary, marginTop: -3, marginLeft: 3 },
  streakNumGray: { color: '#AAAAAA' },
});

const transferStyles = StyleSheet.create({
  backdrop:            { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:                { backgroundColor: COLORS.background, borderRadius: 20, padding: 20, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 10 },
  title:               { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.textStrong, marginBottom: 6 },
  subtitle:            { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, lineHeight: 18 },
  memberRow:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: 'transparent', marginBottom: 4 },
  memberRowSelected:   { borderColor: COLORS.primary, backgroundColor: '#FFF3EE' },
  avatar:              { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.lightGray },
  memberName:          { flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textStrong },
  btnRow:              { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel:           { flex: 1, paddingVertical: 11, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.lightGray, alignItems: 'center' },
  btnCancelText:       { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSubtitle },
  btnConfirm:          { flex: 1, paddingVertical: 11, borderRadius: RADIUS.sm, backgroundColor: COLORS.danger, alignItems: 'center' },
  btnConfirmText:      { fontFamily: FONTS.bold, fontSize: 14, color: '#FFF' },
});
