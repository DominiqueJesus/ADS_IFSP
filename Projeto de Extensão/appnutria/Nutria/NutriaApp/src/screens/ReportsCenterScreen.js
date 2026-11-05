// src/screens/ReportsCenterScreen.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro da função principal.
//
// Central de Denúncias — MUST #1. Acesso restrito a administradores
// (tabela public.admins). A tela também se protege sozinha: se por
// algum motivo alguém sem permissão navegar até aqui, o Supabase RLS
// simplesmente não retorna nenhuma denúncia e mostramos um aviso.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAdmin } from '../hooks/useAdmin';
import { useUser } from '../context/UserContext';
import { supabase } from '../../supabase';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const DEFAULT_AVATAR = require('../../assets/images/avatar-default.png');

const REASON_LABELS = {
  spam:              'Spam ou propaganda',
  conteudo_impropio: 'Conteúdo impróprio ou ofensivo',
  assedio_bullying:  'Assédio ou bullying',
  fora_do_tema:      'Não relacionado à alimentação saudável',
  outro:             'Outro motivo',
};

const FILTERS = [
  { key: 'pending',  label: 'Pendentes' },
  { key: 'resolved', label: 'Resolvidas' },
  { key: 'dismissed', label: 'Ignoradas' },
];

// Filtro por data de criação — presets simples, sem dependência de date
// picker nativo (o projeto não usa nenhum até agora).
const DATE_FILTERS = [
  { key: 'all',   label: 'Todo período' },
  { key: 'today', label: 'Hoje' },
  { key: '7d',    label: 'Últimos 7 dias' },
  { key: '30d',   label: 'Últimos 30 dias' },
];

function isWithinDateFilter(createdAt, dateFilterKey) {
  if (dateFilterKey === 'all' || !createdAt) return true;

  const created = new Date(createdAt);
  const now     = new Date();

  if (dateFilterKey === 'today') {
    return created.getFullYear() === now.getFullYear()
        && created.getMonth()    === now.getMonth()
        && created.getDate()     === now.getDate();
  }

  const days = dateFilterKey === '7d' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return created >= cutoff;
}

// ── HeaderBar ────────────────────────────────────────────────────────────────
function HeaderBar({ onBack }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Central de Denúncias</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

// ── FilterTabs ───────────────────────────────────────────────────────────────
// Genérico o suficiente pra servir tanto pro filtro de status quanto pro de
// data — recebe a lista de opções em vez de usar FILTERS fixo.
function FilterTabs({ options, active, onChange, counts, style }) {
  return (
    <View style={[styles.filterRow, style]}>
      {options.map(f => (
        <TouchableOpacity
          key={f.key}
          style={[styles.filterChip, active === f.key && styles.filterChipActive]}
          onPress={() => onChange(f.key)}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterText, active === f.key && styles.filterTextActive]}>
            {f.label}{counts?.[f.key] != null ? ` (${counts[f.key]})` : ''}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── ImagePreviewModal — visualizar o post denunciado em tela cheia ───────────
function ImagePreviewModal({ visible, uri, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.previewBackdrop} onPress={onClose}>
        {uri ? <Image source={{ uri }} style={styles.previewImage} resizeMode="contain" /> : null}
        <TouchableOpacity style={styles.previewClose} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={26} color="#FFF" />
        </TouchableOpacity>
      </Pressable>
    </Modal>
  );
}

// ── ReportCard ───────────────────────────────────────────────────────────────
function ReportCard({ report, onViewPost, onRemovePost, onDismiss, busy }) {
  const post     = report.posts;
  const reporter = report.reporter;
  const author   = post?.profiles;

  // Post já foi removido pela moderação — não há mais imagem/post pra
  // mostrar. Usamos o snapshot textual salvo no momento da denúncia.
  const isResolved   = report.status === 'resolved';
  const authorName   = isResolved
    ? (report.post_author_username ?? 'usuário removido')
    : (author?.username ?? 'usuário removido');
  const captionText  = isResolved ? report.post_caption : post?.caption;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.reasonBadgeText}>{REASON_LABELS[report.reason] ?? report.reason}</Text>
        <Text style={styles.dateText}>{formatDate(report.created_at)}</Text>
      </View>

      {isResolved ? (
        // ── Card só-texto: o post e a imagem já não existem mais ──────────
        <View style={styles.textOnlyBody}>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Autor do post: </Text>
            {authorName}
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Denunciado por: </Text>
            {reporter?.username ?? 'usuário removido'}
          </Text>
          {captionText ? (
            <Text style={styles.descriptionText} numberOfLines={2}>
              Legenda do post: “{captionText}”
            </Text>
          ) : null}
          {report.description ? (
            <Text style={styles.descriptionText} numberOfLines={3}>
              Detalhes da denúncia: “{report.description}”
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.cardBody}>
          <TouchableOpacity onPress={() => onViewPost(post?.image_url)} activeOpacity={0.85}>
            <Image
              source={post?.image_url ? { uri: post.image_url } : DEFAULT_AVATAR}
              style={styles.postThumb}
            />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Autor do post: </Text>
              {authorName}
            </Text>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Denunciado por: </Text>
              {reporter?.username ?? 'usuário removido'}
            </Text>
            {report.description ? (
              <Text style={styles.descriptionText} numberOfLines={3}>
                “{report.description}”
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {report.status === 'pending' ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.dismissBtn]}
            onPress={() => onDismiss(report.id)}
            disabled={busy}
          >
            <Ionicons name="checkmark-outline" size={16} color={COLORS.textStrong} />
            <Text style={styles.dismissText}>Ignorar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.removeBtn]}
            onPress={() => onRemovePost(report.id, post?.id)}
            disabled={busy || !post?.id}
          >
            <Ionicons name="trash-outline" size={16} color="#FFF" />
            <Text style={styles.removeText}>Remover post</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.resolvedTag}>
          <Ionicons
            name={isResolved ? 'checkmark-circle' : 'close-circle-outline'}
            size={14}
            color={isResolved ? COLORS.secondary : COLORS.textSubtitle}
          />
          <Text style={styles.resolvedTagText}>
            {isResolved ? 'Post removido' : 'Denúncia ignorada'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────
function EmptyState({ filter, filteredByDate }) {
  let msg;
  if (filteredByDate) {
    msg = 'Nenhuma denúncia neste período. Tente ampliar o filtro de data.';
  } else if (filter === 'pending') {
    msg = 'Nenhuma denúncia pendente. Tudo em ordem! 🎉';
  } else {
    msg = 'Nenhuma denúncia por aqui ainda.';
  }
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="shield-checkmark-outline" size={40} color={COLORS.lightGray} />
      <Text style={styles.emptyText}>{msg}</Text>
    </View>
  );
}

// ── ReportsCenterScreen ────────────────────────────────────────────────────────
export default function ReportsCenterScreen({ navigation }) {
  const { isAdmin, checking } = useAdmin();
  const { session } = useUser();
  const adminId = session?.user?.id;

  const [filter,      setFilter]      = useState('pending');
  const [dateFilter,  setDateFilter]  = useState('all');
  const [reports,     setReports]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [busyId,      setBusyId]      = useState(null);
  const [previewUri,  setPreviewUri]  = useState(null);

  const fetchReports = useCallback(async (status) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reports')
      .select(`
        id, reason, description, status, created_at, post_id,
        post_author_username, post_caption,
        reporter:profiles!reports_reporter_id_fkey ( id, username, avatar_url ),
        posts ( id, image_url, caption, profiles ( id, username, avatar_url ) )
      `)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('ReportsCenterScreen.fetchReports:', error.message);
      setReports([]);
    } else {
      setReports(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchReports(filter);
  }, [isAdmin, filter, fetchReports]);

  // Denúncias já filtradas por status (na query) e agora também por data
  // de criação, aplicado no cliente sobre o que já veio do servidor.
  const visibleReports = reports.filter(r => isWithinDateFilter(r.created_at, dateFilter));

  // ── Remover post denunciado ────────────────────────────────────────────────
  const handleRemovePost = useCallback((reportId, postId) => {
    Alert.alert(
      'Remover post',
      'Esta publicação será excluída permanentemente. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            setBusyId(reportId);
            try {
              // IMPORTANTE: marca as denúncias como resolvidas ANTES de
              // apagar o post. A FK post_id -> posts é ON DELETE SET NULL,
              // então depois de apagar o post o post_id vira NULL e não
              // dá mais pra filtrar "todas as denúncias pendentes deste
              // post" — precisa ser feito nessa ordem.
              if (postId) {
                await supabase
                  .from('reports')
                  .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: adminId })
                  .eq('post_id', postId)
                  .eq('status', 'pending');

                await supabase.from('posts').delete().eq('id', postId);
              } else {
                // Post já não existe mais por algum outro motivo — resolve
                // só esta denúncia mesmo assim.
                await supabase
                  .from('reports')
                  .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: adminId })
                  .eq('id', reportId);
              }
              setReports(prev => prev.filter(r => r.id !== reportId));
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível remover o post. Tente novamente.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }, []);

  // ── Ignorar denúncia (mantém o post no ar) ────────────────────────────────
  const handleDismiss = useCallback(async (reportId) => {
    setBusyId(reportId);
    try {
      await supabase
        .from('reports')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString(), resolved_by: adminId })
        .eq('id', reportId);
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível atualizar a denúncia.');
    } finally {
      setBusyId(null);
    }
  }, []);

  // ── Guarda de acesso ───────────────────────────────────────────────────────
  if (checking) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <HeaderBar onBack={() => navigation.goBack()} />
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <HeaderBar onBack={() => navigation.goBack()} />
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed-outline" size={40} color={COLORS.lightGray} />
          <Text style={styles.emptyText}>Você não tem acesso a esta área.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar onBack={() => navigation.goBack()} />
      <FilterTabs options={FILTERS} active={filter} onChange={setFilter} />
      <FilterTabs options={DATE_FILTERS} active={dateFilter} onChange={setDateFilter} style={{ paddingBottom: 10 }} />

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleReports}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ReportCard
              report={item}
              busy={busyId === item.id}
              onViewPost={setPreviewUri}
              onRemovePost={handleRemovePost}
              onDismiss={handleDismiss}
            />
          )}
          contentContainerStyle={visibleReports.length === 0 ? { flex: 1 } : styles.listContent}
          ListEmptyComponent={<EmptyState filter={filter} filteredByDate={dateFilter !== 'all'} />}
          onRefresh={() => fetchReports(filter)}
          refreshing={loading}
        />
      )}

      <ImagePreviewModal
        visible={!!previewUri}
        uri={previewUri}
        onClose={() => setPreviewUri(null)}
      />
    </SafeAreaView>
  );
}

function formatDate(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.background },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle:   { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong },

  filterRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: 2 },
  filterChip:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.lightGray },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterText:    { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textSubtitle },
  filterTextActive: { color: '#FFF' },

  centerLoader:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent:   { padding: SPACING.md, gap: 12 },

  card:          { backgroundColor: '#FFF', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.lightGray, padding: 12, marginBottom: 12 },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  reasonBadgeText: { fontFamily: FONTS.bold, fontSize: 12.5, color: COLORS.danger },
  dateText:      { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textSubtitle },

  cardBody:      { flexDirection: 'row', gap: 10 },
  textOnlyBody:  { gap: 2 },
  postThumb:     { width: 64, height: 64, borderRadius: 10, backgroundColor: COLORS.lightGray },
  metaLine:      { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textStrong, marginBottom: 2 },
  metaLabel:     { fontFamily: FONTS.bold, color: COLORS.textStrong },
  descriptionText: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle, marginTop: 4, fontStyle: 'italic' },

  actionsRow:    { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  dismissBtn:    { backgroundColor: COLORS.lightGray },
  dismissText:   { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textStrong },
  removeBtn:     { backgroundColor: COLORS.danger },
  removeText:    { fontFamily: FONTS.bold, fontSize: 13, color: '#FFF' },

  resolvedTag:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  resolvedTagText:  { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textSubtitle },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl, gap: 10 },
  emptyText:      { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center' },

  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  previewImage:    { width: '100%', height: '80%' },
  previewClose:    { position: 'absolute', top: 50, right: 20, padding: 6 },
});
