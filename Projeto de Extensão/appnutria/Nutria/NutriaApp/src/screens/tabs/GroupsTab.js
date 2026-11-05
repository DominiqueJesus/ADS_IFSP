// src/screens/tabs/GroupsTab.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro da função principal.
//
// Arquitetura "Grupo Principal":
//   - Abre direto no último grupo acessado (last_group_id do profile)
//   - Se não tem grupo → tela de boas-vindas
//   - Seletor compacto no header para trocar de grupo
//   - Botão + contextual para criar/entrar

import React, { useState, useEffect, useCallback, useRef, useMemo, useImperativeHandle } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Image, ActivityIndicator, Modal,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
  Animated, PanResponder,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../../supabase';
import PostCard from '../../components/PostCard';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

const DEFAULT_AVATAR    = require('../../../assets/images/avatar-default.png');
const STREAK_BADGE      = require('../../../assets/images/streak-badge.png');
const STREAK_BADGE_GRAY = require('../../../assets/images/streak-badge-gray.png');
const RANK_PAGE_SIZE    = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function uriToUint8Array(uri) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        const binary = atob(base64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        resolve(bytes);
      };
      reader.onerror = reject;
      reader.readAsDataURL(xhr.response);
    };
    xhr.onerror = reject;
    xhr.open('GET', uri);
    xhr.responseType = 'blob';
    xhr.send();
  });
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function EmptyState({ icon, message }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={36} color={COLORS.lightGray} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

// ── WelcomeGroupPopup — popup de boas-vindas ao entrar em um grupo ─────────────
function WelcomeGroupPopup({ visible, groupName, onDismiss }) {
  const scaleAnim   = useRef(new Animated.Value(0.78)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1, tension: 65, friction: 7, useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1, duration: 200, useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0.78, tension: 80, friction: 10, useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0, duration: 180, useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setIsRendered(false);
      });
    }
  }, [visible]);

  if (!isRendered) return null;

  return (
    <Modal visible={isRendered} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[welcomePopS.backdrop, { opacity: opacityAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />
        <Animated.View
          style={[welcomePopS.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={welcomePopS.emojiWrap}>
              <Text style={welcomePopS.emoji}>🎉</Text>
            </View>
            <Text style={welcomePopS.title}>Você entrou no grupo</Text>
            <Text style={welcomePopS.groupName} numberOfLines={2}>{groupName}</Text>
            <Text style={welcomePopS.message}>
              Seja bem-vindo(a)! Lembre-se de ser respeitoso(a), incentivar os colegas e manter o espírito positivo da comunidade. Bora arrasar juntos! 💪
            </Text>
            <TouchableOpacity style={welcomePopS.btn} onPress={onDismiss} activeOpacity={0.85}>
              <Text style={welcomePopS.btnText}>Começar agora!</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ── GroupSelectorSheet — bottom sheet para trocar de grupo ────────────────────
function GroupSelectorSheet({ visible, groups, activeGroupId, onSelect, onClose, onNew }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={sheet.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={sheet.container}>
        <View style={sheet.handle} />
        <Text style={sheet.title}>Meus Grupos</Text>

        <FlatList
          data={groups}
          keyExtractor={g => g.id}
          style={{ maxHeight: 320 }}
          renderItem={({ item }) => {
            const isActive = item.id === activeGroupId;
            return (
              <TouchableOpacity
                style={[sheet.groupRow, isActive && sheet.groupRowActive]}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.8}
              >
                <Image
                  source={item.image_url ? { uri: item.image_url } : DEFAULT_AVATAR}
                  style={sheet.groupAvatar}
                />
                <View style={sheet.groupInfo}>
                  <Text style={[sheet.groupName, isActive && sheet.groupNameActive]}>
                    {item.name}
                  </Text>
                  {item.privacy === 'private' && (
                    <Ionicons name="lock-closed-outline" size={11} color={COLORS.textSubtitle} />
                  )}
                </View>
                {isActive && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={sheet.emptyText}>Você ainda não participa de nenhum grupo.</Text>
          }
          showsVerticalScrollIndicator={false}
        />

        <View style={sheet.newBtns}>
          <TouchableOpacity style={sheet.newBtn} onPress={() => { onNew('create'); onClose(); }}>
            <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
            <Text style={sheet.newBtnText}>Criar grupo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sheet.newBtn} onPress={() => { onNew('join'); onClose(); }}>
            <Ionicons name="enter-outline" size={18} color={COLORS.primary} />
            <Text style={sheet.newBtnText}>Entrar em grupo</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── RankingItem ───────────────────────────────────────────────────────────────
function RankingItem({ item, position, isCurrentUser, isAdmin, onRemove }) {
  const streak      = item.profiles?.streak ?? 0;
  const isTop3      = position <= 3;
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <View style={[rankS.row, isTop3 && rankS.rowTop, isCurrentUser && rankS.rowMe]}>
      <View style={rankS.posWrap}>
        {isTop3
          ? <View style={[rankS.medal, { backgroundColor: medalColors[position - 1] }]}>
              <Text style={rankS.medalText}>{position}</Text>
            </View>
          : <Text style={[rankS.pos, isCurrentUser && rankS.posMe]}>{position}</Text>
        }
      </View>
      <Image
        source={item.profiles?.avatar_url ? { uri: item.profiles.avatar_url } : DEFAULT_AVATAR}
        style={rankS.avatar}
      />
      <View style={rankS.info}>
        <Text style={[rankS.name, isCurrentUser && rankS.nameMe]} numberOfLines={1}>
          {item.profiles?.full_name || `@${item.profiles?.username ?? '—'}`}
          {isCurrentUser ? '  (você)' : ''}
        </Text>
        {item.profiles?.full_name
          ? <Text style={rankS.handle}>@{item.profiles?.username}</Text>
          : null}
      </View>
      <View style={rankS.streakWrap}>
        <Image source={streak > 0 ? STREAK_BADGE : STREAK_BADGE_GRAY} style={rankS.streakImg} />
        <Text style={[rankS.streakNum, streak === 0 && rankS.streakGray]}>{streak}</Text>
      </View>
      {isAdmin && !isCurrentUser && (
        <TouchableOpacity
          onPress={() => onRemove?.(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={rankS.removeBtn}
        >
          <Ionicons name="person-remove-outline" size={17} color={COLORS.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Modal Criar Grupo ─────────────────────────────────────────────────────────
function CreateGroupModal({ visible, onClose, onCreated, userId }) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy]         = useState('public');
  const [imageUri, setImageUri]       = useState(null);
  const [saving, setSaving]           = useState(false);

  const reset = () => { setName(''); setDescription(''); setPrivacy('public'); setImageUri(null); };
  const handleClose = () => { reset(); onClose(); };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão necessária'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Nome obrigatório', 'Dê um nome ao seu grupo.'); return; }
    setSaving(true);
    try {
      let imageUrl = null;
      if (imageUri) {
        const bytes    = await uriToUint8Array(imageUri);
        const filePath = `groups/${userId}/${Date.now()}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('group_avatars').upload(filePath, bytes, { contentType: 'image/jpeg', upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('group_avatars').getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      }

      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          privacy,
          image_url: imageUrl,
          invite_code: generateInviteCode(),
          created_by: userId,
          admin_id: userId,
          requires_approval: false,
        })
        .select().single();
      if (groupErr) throw groupErr;

      await supabase.from('group_members').insert({
        group_id: group.id, user_id: userId, role: 'admin', status: 'approved',
      });

      reset();
      onCreated(group);
    } catch (err) {
      Alert.alert('Erro ao criar grupo', err.message ?? 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={modal.container}>
          <View style={modal.header}>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={COLORS.textStrong} />
            </TouchableOpacity>
            <Text style={modal.title}>Novo Grupo</Text>
            <TouchableOpacity onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={COLORS.primary} />
                      : <Text style={modal.saveBtn}>Criar</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={modal.content} showsVerticalScrollIndicator={false}>
            <View style={modal.imagePickerWrap}>
              <TouchableOpacity style={modal.imagePicker} onPress={handlePickImage} activeOpacity={0.8}>
                {imageUri
                  ? <Image source={{ uri: imageUri }} style={modal.imagePreview} />
                  : <Image source={DEFAULT_AVATAR} style={modal.imageDefault} resizeMode="cover" />
                }
                <View style={modal.imageEditBadge}>
                  <Ionicons name="camera" size={14} color="#FFF" />
                </View>
              </TouchableOpacity>
              {imageUri && (
                <TouchableOpacity style={modal.removeImageBtn} onPress={() => setImageUri(null)}>
                  <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                  <Text style={modal.removeImageText}>Remover foto</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={modal.field}>
              <Text style={modal.label}>Nome *</Text>
              <TextInput style={modal.input} value={name} onChangeText={setName}
                placeholder="Ex: Equipe Fit 2025" placeholderTextColor={COLORS.textSubtitle} maxLength={60} />
            </View>
            <View style={modal.field}>
              <Text style={modal.label}>Descrição</Text>
              <TextInput style={[modal.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                value={description} onChangeText={setDescription}
                placeholder="Sobre o grupo..." placeholderTextColor={COLORS.textSubtitle} multiline maxLength={200} />
            </View>
            <View style={modal.field}>
              <Text style={modal.label}>Privacidade</Text>
              <View style={modal.segmentRow}>
                {[{ label: 'Público', value: 'public' }, { label: 'Privado', value: 'private' }].map(opt => (
                  <TouchableOpacity key={opt.value}
                    style={[modal.segment, privacy === opt.value && modal.segmentActive]}
                    onPress={() => setPrivacy(opt.value)}>
                    <Text style={[modal.segmentText, privacy === opt.value && modal.segmentTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {privacy === 'private' && (
              <View style={modal.infoBanner}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
                <Text style={modal.infoBannerText}>
                  Grupos privados usam código de convite para controlar o acesso. Compartilhe o código apenas com quem deseja incluir.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Modal Entrar em Grupo ─────────────────────────────────────────────────────
function JoinGroupModal({ visible, onClose, onJoined, userId }) {
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [invCode, setInvCode] = useState('');
  const [tab, setTab]         = useState('search');

  const reset = () => { setQuery(''); setResults([]); setInvCode(''); setTab('search'); };
  const handleClose = () => { reset(); onClose(); };

  // Carrega grupos públicos ao abrir o modal — sem precisar digitar nada
  useEffect(() => {
    if (visible && tab === 'search') {
      loadPublicGroups();
    }
  }, [visible, tab]);

  const loadPublicGroups = async (searchQuery = '') => {
    setLoading(true);
    let q = supabase.from('groups')
      .select('id, name, description, image_url, privacy, requires_approval')
      .eq('privacy', 'public')
      .order('created_at', { ascending: false })
      .limit(10);
    if (searchQuery.trim()) {
      q = q.ilike('name', `%${searchQuery.trim()}%`);
    }
    const { data } = await q;
    setResults(data ?? []);
    setLoading(false);
  };

  const handleSearch = async () => {
    await loadPublicGroups(query);
  };

  // Busca em tempo real conforme digita
  useEffect(() => {
    if (tab !== 'search') return;
    const timer = setTimeout(() => loadPublicGroups(query), 400);
    return () => clearTimeout(timer);
  }, [query, tab]);

  // Entrada direta sem aprovação — o código é a autorização
  const requestJoin = async (group) => {
    const { error } = await supabase.from('group_members')
      .insert({ group_id: group.id, user_id: userId, status: 'approved' });
    if (error?.code === '23505') {
      Alert.alert('Já membro', 'Você já faz parte deste grupo.'); return;
    }
    if (error) throw error;
    reset();
    onJoined(group);
    onClose();
  };

  const handleJoinByCode = async () => {
    if (!invCode.trim()) return;
    setLoading(true);
    try {
      const code = invCode.trim().toUpperCase();
      const { data: group, error } = await supabase.from('groups')
        .select('id, name, requires_approval')
        .eq('invite_code', code)
        .maybeSingle();
      if (error) {
        Alert.alert('Erro', 'Não foi possível buscar o grupo. Tente novamente.');
        return;
      }
      if (!group) {
        Alert.alert('Código inválido', 'Nenhum grupo encontrado com esse código. Verifique e tente novamente.');
        return;
      }
      await requestJoin(group);
    } catch (err) {
      Alert.alert('Erro', err.message ?? 'Não foi possível entrar no grupo.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasteCode = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) setInvCode(text.trim().toUpperCase());
    } catch {
      // silently ignore
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={modal.container}>
        <View style={modal.header}>
          <TouchableOpacity onPress={handleClose}><Ionicons name="close" size={24} color={COLORS.textStrong} /></TouchableOpacity>
          <Text style={modal.title}>Entrar em Grupo</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={modal.tabRow}>
          {[{ key: 'search', label: 'Buscar' }, { key: 'code', label: 'Código' }].map(t => (
            <TouchableOpacity key={t.key} style={[modal.tab, tab === t.key && modal.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[modal.tabText, tab === t.key && modal.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={modal.content}>
          {tab === 'search' ? (
            <>
              <View style={styles.searchBar}>
                <Ionicons name="search-outline" size={18} color={COLORS.textSubtitle} />
                <TextInput style={styles.searchInput} value={query} onChangeText={setQuery}
                  placeholder="Buscar grupos públicos..." placeholderTextColor={COLORS.textSubtitle}
                  returnKeyType="search" onSubmitEditing={handleSearch} />
              </View>
              {loading
                ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
                : <FlatList data={results} keyExtractor={i => i.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.groupCard} onPress={() => requestJoin(item)} activeOpacity={0.8}>
                        <Image source={item.image_url ? { uri: item.image_url } : DEFAULT_AVATAR} style={styles.groupAvatar} />
                        <View style={styles.groupInfo}>
                          <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
                          {item.description ? <Text style={styles.groupDesc} numberOfLines={1}>{item.description}</Text> : null}
                        </View>
                        <Ionicons name="enter-outline" size={18} color={COLORS.primary} />
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={!loading && results.length === 0 ? <EmptyState icon="search-outline" message={query ? 'Nenhum grupo encontrado.' : 'Nenhum grupo público disponível.'} /> : null}
                    showsVerticalScrollIndicator={false}
                  />
              }
            </>
          ) : (
            <View style={{ gap: 12, paddingTop: 8 }}>
              <Text style={modal.label}>Código de convite</Text>
              <View style={[styles.searchBar, { paddingRight: 4 }]}>
                <Ionicons name="key-outline" size={18} color={COLORS.textSubtitle} />
                <TextInput style={[styles.searchInput, { flex: 1 }]} value={invCode} onChangeText={v => setInvCode(v.toUpperCase())}
                  placeholder="Ex: ABC-123" placeholderTextColor={COLORS.textSubtitle} autoCapitalize="characters" />
                <TouchableOpacity
                  onPress={handlePasteCode}
                  style={joinS.pasteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="clipboard-outline" size={16} color={COLORS.primary} />
                  <Text style={joinS.pasteBtnText}>Colar</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleJoinByCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" size="small" />
                         : <Text style={styles.primaryBtnText}>Entrar com código</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── TransferAdminModal ────────────────────────────────────────────────────────
function TransferAdminModal({ visible, members, currentUserId, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(null);
  const others = members.filter(m => m.user_id !== currentUserId);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={transferS.backdrop}>
        <View style={transferS.card}>
          <Text style={transferS.title}>Transferir administração</Text>
          <Text style={transferS.subtitle}>Escolha quem assumirá o grupo antes de você sair.</Text>
          <FlatList data={others} keyExtractor={i => i.user_id} style={{ maxHeight: 240, marginVertical: 12 }}
            renderItem={({ item }) => {
              const isSel = selected === item.user_id;
              return (
                <TouchableOpacity style={[transferS.row, isSel && transferS.rowSel]} onPress={() => setSelected(item.user_id)} activeOpacity={0.8}>
                  <Image source={item.profiles?.avatar_url ? { uri: item.profiles.avatar_url } : DEFAULT_AVATAR} style={transferS.avatar} />
                  <Text style={transferS.name}>{item.profiles?.full_name || `@${item.profiles?.username}`}</Text>
                  {isSel && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              );
            }}
          />
          <View style={transferS.btnRow}>
            <TouchableOpacity style={transferS.btnCancel} onPress={onCancel}>
              <Text style={transferS.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[transferS.btnConfirm, !selected && { opacity: 0.4 }]}
              onPress={() => selected && onConfirm(selected)} disabled={!selected}>
              <Text style={transferS.btnConfirmText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── ChatView ──────────────────────────────────────────────────────────────────
// Abordagem para tabs: FlatList invertida + input fixo no bottom.
// Sem KeyboardAvoidingView — o SO empurra a view naturalmente.
function ChatView({ groupId, userId }) {
  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    loadMessages();
    const channel = supabase
      .channel('chat_' + groupId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_messages',
        filter: 'group_id=eq.' + groupId,
      }, async (payload) => {
        const { data } = await supabase
          .from('group_messages')
          .select('id, content, created_at, user_id, profiles ( id, username, avatar_url )')
          .eq('id', payload.new.id)
          .single();
        if (data) {
          setMessages(prev => [data, ...prev]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  const loadMessages = async () => {
    const { data } = await supabase
      .from('group_messages')
      .select('id, content, created_at, user_id, profiles ( id, username, avatar_url )')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(100);
    setMessages(data ?? []);
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    try {
      await supabase
        .from('group_messages')
        .insert({ group_id: groupId, user_id: userId, content });
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={chatS.wrapper}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        inverted
        contentContainerStyle={chatS.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          <View style={chatS.empty}>
            <Ionicons name="chatbubbles-outline" size={36} color="#CCC" />
            <Text style={chatS.emptyText}>Nenhuma mensagem ainda.</Text>
            <Text style={chatS.emptyText}>Seja o primeiro a escrever!</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.user_id === userId;
          return (
            <View style={isMe ? chatS.rowMe : chatS.rowThem}>
              {!isMe && (
                <Image
                  source={item.profiles?.avatar_url
                    ? { uri: item.profiles.avatar_url }
                    : DEFAULT_AVATAR}
                  style={chatS.avatar}
                />
              )}
              <View style={isMe ? chatS.balloonMe : chatS.balloonThem}>
                {!isMe && (
                  <Text style={chatS.sender}>
                    @{item.profiles?.username ?? 'usuario'}
                  </Text>
                )}
                <Text style={isMe ? chatS.textMe : chatS.textThem}>
                  {item.content}
                </Text>
                <Text style={isMe ? chatS.timeMe : chatS.timeThem}>
                  {new Date(item.created_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          );
        }}
      />

      <View style={chatS.bar}>
        <TextInput
          style={chatS.barInput}
          value={text}
          onChangeText={setText}
          placeholder="Mensagem..."
          placeholderTextColor="#AAA"
          multiline
          maxLength={500}
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={text.trim() ? chatS.barBtnActive : chatS.barBtn}
          onPress={handleSend}
          disabled={sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Ionicons name="send" size={18} color="#FFF" />
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── GroupView — ranking + feed do grupo ativo ─────────────────────────────────
// Toda a lógica de detalhe do grupo DENTRO da tab (sem navegar para nova tela)
function GroupView({ group, userId, navigation, onMembersLoaded, onJoinedGroup, refreshSignal, goToTab }) {
  const [activeTab,     setActiveTab]     = useState('feed');
  const [members,       setMembers]       = useState([]);
  const [posts,         setPosts]         = useState([]);
  const [membership,    setMembership]    = useState(null);
  const [isAdmin,       setIsAdmin]       = useState(group.admin_id === userId);
  const [loadRank,      setLoadRank]      = useState(true);
  const [loadFeed,      setLoadFeed]      = useState(false);
  const [joining,       setJoining]       = useState(false);
  const [rankSearch,    setRankSearch]    = useState('');
  const [showAll,       setShowAll]       = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [messages,      setMessages]      = useState([]);
  const [loadChat,      setLoadChat]      = useState(false);
  const [chatText,      setChatText]      = useState('');
  const [sendingChat,   setSendingChat]   = useState(false);
  const flatListRef    = useRef(null);
  const chatListRef    = useRef(null);
  const chatChannel    = useRef(null);
  const { width: GRP_WIDTH } = useWindowDimensions();

  // Reage ao re-tap na aba Grupos: slide até o topo + refresh silencioso
  useEffect(() => {
    if (refreshSignal > 0) {
      flatListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      setTimeout(() => {
        fetchFeed(true);     // silent — sem piscar spinner
        fetchRanking(true);
      }, 350);
    }
  }, [refreshSignal]);

  useEffect(() => {
    fetchMembership();
    fetchRanking();
    fetchFeed();
    setActiveTab('feed');
    setRankSearch('');
    setShowAll(false);
    setPosts([]);

    // ── Realtime: novos posts de membros do grupo ────────────────────────────
    const postsChannel = supabase
      .channel('group_posts_' + group.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'posts',
      }, async (payload) => {
        // Verifica se o autor é membro do grupo antes de adicionar
        const { data: member } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', group.id)
          .eq('user_id', payload.new.user_id)
          .eq('status', 'approved')
          .maybeSingle();
        if (!member) return;
        const { data: post } = await supabase
          .from('posts')
          .select('id, image_url, caption, likes_count, created_at, profiles ( id, username, avatar_url, streak )')
          .eq('id', payload.new.id)
          .single();
        if (post) setPosts(prev => prev.some(p => p.id === post.id) ? prev : [post, ...prev]);
      })
      .subscribe();

    // ── Realtime: streak atualizado → reordena ranking ───────────────────────
    const rankChannel = supabase
      .channel('group_rank_' + group.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
      }, (payload) => {
        setMembers(prev => {
          const updated = prev.map(m =>
            m.user_id === payload.new.id
              ? { ...m, profiles: { ...m.profiles, streak: payload.new.streak } }
              : m
          );
          return [...updated].sort((a, b) => (b.profiles?.streak ?? 0) - (a.profiles?.streak ?? 0));
        });
      })
      .subscribe();

    // ── Realtime: novo membro entra no grupo ─────────────────────────────────
    const memberChannel = supabase
      .channel('group_members_' + group.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'group_members',
        filter: 'group_id=eq.' + group.id,
      }, () => {
        fetchRanking(); // recarrega o ranking quando alguém entra
      })
      .subscribe();

    // ── Polling de fallback: garante feed e ranking vivos mesmo sem Realtime ──
    const pollInterval = setInterval(() => {
      fetchFeed(true);    // silent — não pisca spinner
      fetchRanking(true);
    }, 4000);

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(rankChannel);
      supabase.removeChannel(memberChannel);
      clearInterval(pollInterval);
    };
  }, [group.id]);


  const fetchMembership = async () => {
    const { data } = await supabase.from('group_members').select('status, role')
      .eq('group_id', group.id).eq('user_id', userId).maybeSingle();
    setMembership(data?.status ?? null);
    setIsAdmin(data?.role === 'admin' || group.admin_id === userId);
  };

  const fetchRanking = useCallback(async (silent = false) => {
    if (!silent) setLoadRank(true);
    const { data } = await supabase.from('group_members')
      .select('user_id, role, status, profiles ( id, username, full_name, avatar_url, streak )')
      .eq('group_id', group.id).eq('status', 'approved');
    const sorted = (data ?? []).sort((a, b) => (b.profiles?.streak ?? 0) - (a.profiles?.streak ?? 0));
    setMembers(sorted);
    onMembersLoaded?.(sorted.length);
    if (!silent) setLoadRank(false);
  }, [group.id]);

  const fetchFeed = useCallback(async (silent = false) => {
    if (!silent) setLoadFeed(true);
    const { data: memberData } = await supabase.from('group_members')
      .select('user_id').eq('group_id', group.id).eq('status', 'approved');
    const memberIds = (memberData ?? []).map(m => m.user_id);
    if (!memberIds.length) { setPosts([]); if (!silent) setLoadFeed(false); return; }
    const { data } = await supabase.from('posts')
      .select('id, image_url, caption, likes_count, created_at, profiles ( id, username, avatar_url, streak )')
      .in('user_id', memberIds).order('created_at', { ascending: false }).limit(30);
    const postIds = (data ?? []).map(p => p.id);
    const { data: likes } = await supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', postIds);
    const likedSet = new Set((likes ?? []).map(l => l.post_id));
    setPosts((data ?? []).map(p => ({ ...p, userLiked: likedSet.has(p.id) })));
    if (!silent) setLoadFeed(false);
  }, [group.id, userId]);

  // ── Chat: busca histórico e subscreve Realtime ───────────────────────────
  const fetchMessages = useCallback(async () => {
    setLoadChat(true);
    const { data } = await supabase
      .from('group_messages')
      .select('id, content, created_at, profiles ( id, username, avatar_url )')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true })
      .limit(100);
    setMessages(data ?? []);
    setLoadChat(false);
    setTimeout(() => chatListRef.current?.scrollToEnd({ animated: false }), 100);
  }, [group.id]);

  const subscribeChat = useCallback(() => {
    chatChannel.current = supabase
      .channel(`group_chat:${group.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'group_messages',
        filter: `group_id=eq.${group.id}`,
      }, async (payload) => {
        // Busca o profile do remetente para exibir nome/avatar
        const { data: msg } = await supabase
          .from('group_messages')
          .select('id, content, created_at, profiles ( id, username, avatar_url )')
          .eq('id', payload.new.id)
          .single();
        if (msg) {
          setMessages(prev => [...prev, msg]);
          setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
        }
      })
      .subscribe();
  }, [group.id]);

  const unsubscribeChat = useCallback(() => {
    if (chatChannel.current) {
      supabase.removeChannel(chatChannel.current);
      chatChannel.current = null;
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'chat') {
      if (messages.length === 0) fetchMessages();
      subscribeChat();
    } else {
      unsubscribeChat();
    }
    return () => unsubscribeChat();
  }, [activeTab, group.id]);

  const handleSendMessage = async () => {
    const text = chatText.trim();
    if (!text || sendingChat) return;
    setSendingChat(true);
    setChatText('');
    try {
      await supabase.from('group_messages').insert({
        group_id: group.id, user_id: userId, content: text,
      });
    } catch (err) {
      setChatText(text); // restaura se falhar
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    } finally {
      setSendingChat(false);
    }
  };

  // ── Like ──────────────────────────────────────────────────────────────────
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
    const { data } = await supabase.from('comments')
      .select('id, content, created_at, profiles ( id, username, avatar_url )')
      .eq('post_id', postId).order('created_at', { ascending: true });
    return data ?? [];
  }, []);

  const addComment = useCallback(async (postId, content) => {
    const { data } = await supabase.from('comments')
      .insert({ post_id: postId, user_id: userId, content: content.trim() })
      .select('id, content, created_at, profiles ( id, username, avatar_url )').single();
    return data;
  }, [userId]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const { error } = await supabase.from('group_members')
        .insert({ group_id: group.id, user_id: userId, status: 'approved' });
      if (error) throw error;
      setMembership('approved');
      fetchRanking();
      onJoinedGroup?.(group);
    } catch (err) { Alert.alert('Erro', err.message); }
    finally { setJoining(false); }
  };

  const handleLeave = () => {
    Alert.alert('Sair do grupo', `Sair de "${group.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => {
        await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', userId);
        setMembership(null);
      }},
    ]);
  };

  const handleRemoveMember = (member) => {
    const name = member.profiles?.full_name || `@${member.profiles?.username ?? 'membro'}`;
    Alert.alert(
      'Remover membro',
      `Remover ${name} do grupo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: async () => {
          const { error } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', group.id)
            .eq('user_id', member.user_id);
          if (error) { Alert.alert('Erro', 'Não foi possível remover o membro.'); return; }
          setMembers(prev => prev.filter(m => m.user_id !== member.user_id));
          onMembersLoaded?.(members.length - 1);
        }},
      ]
    );
  };

  const handleDeleteGroup = () => {
    const others = members.filter(m => m.user_id !== userId);
    Alert.alert('Excluir grupo', `Excluir "${group.name}" permanentemente?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => {
        if (others.length > 0) setTransferModal(true);
        else confirmDelete(null);
      }},
    ]);
  };

  const confirmDelete = async (newAdminId) => {
    setTransferModal(false);
    try {
      if (newAdminId) {
        await supabase.from('group_members').update({ role: 'admin' }).eq('group_id', group.id).eq('user_id', newAdminId);
        await supabase.from('groups').update({ admin_id: newAdminId }).eq('id', group.id);
        await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', userId);
      } else {
        await supabase.from('groups').delete().eq('id', group.id);
      }
      // Notifica o pai para remover o grupo da lista
      onMembersLoaded?.(-1);
    } catch (err) { Alert.alert('Erro ao excluir', err.message); }
  };

  const handleProfilePress = useCallback((authorId) => {
    if (!authorId) return;
    navigation.push('PublicProfile', { userId: authorId });
  }, [navigation]);

  // Ranking filtrado + paginação + posição do usuário
  const { filteredMembers, userPosition, userEntry, visibleMembers, userBeyondLimit } = useMemo(() => {
    const search   = rankSearch.trim().toLowerCase();
    const filtered = search
      ? members.filter(m =>
          (m.profiles?.username ?? '').toLowerCase().includes(search) ||
          (m.profiles?.full_name ?? '').toLowerCase().includes(search))
      : members;
    const userIdx    = members.findIndex(m => m.user_id === userId);
    const userPos    = userIdx >= 0 ? userIdx + 1 : null;
    const userMember = userIdx >= 0 ? members[userIdx] : null;
    const visible    = filtered.slice(0, showAll ? filtered.length : RANK_PAGE_SIZE);
    const beyond     = !showAll && !rankSearch && userIdx >= RANK_PAGE_SIZE;
    return { filteredMembers: filtered, userPosition: userPos, userEntry: userMember, visibleMembers: visible, userBeyondLimit: beyond };
  }, [members, rankSearch, showAll, userId]);

  const [menuVisible, setMenuVisible] = useState(false);

  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(group.invite_code ?? '');
      Alert.alert('Código de entrada do grupo copiado');
    } catch {
      Alert.alert('Erro', 'Não foi possível copiar o código.');
    }
  };

  // Itens do menu contextual — variam por papel
  const menuItems = isAdmin
    ? [
        { icon: 'copy-outline',   label: 'Copiar código de convite', color: COLORS.textStrong, onPress: handleCopyCode,   show: group.privacy === 'private' && !!group.invite_code },
        { icon: 'trash-outline',  label: 'Excluir grupo',            color: COLORS.danger,     onPress: handleDeleteGroup, show: true },
      ].filter(i => i.show)
    : membership === 'approved'
      ? [{ icon: 'exit-outline', label: 'Sair do grupo', color: COLORS.danger, onPress: handleLeave, show: true }]
      : [];

  const renderPost = useCallback(({ item, index }) => (
    <PostCard post={item} currentUserId={userId} onLike={handleLike}
      onAddComment={addComment} onFetchComments={fetchComments}
      flatListRef={flatListRef} postIndex={index} onProfilePress={handleProfilePress} />
  ), [userId, handleLike, addComment, fetchComments, handleProfilePress]);

  return (
    <View style={{ flex: 1 }}>
      {/* ── Info bar ───────────────────────────────────────────────────────── */}
      <View style={gvS.infoBar}>
        <View style={gvS.metaRow}>
          <Ionicons name={group.privacy === 'private' ? 'lock-closed-outline' : 'globe-outline'} size={12} color={COLORS.textSubtitle} />
          <Text style={gvS.metaText}>{group.privacy === 'private' ? 'Privado' : 'Público'}</Text>
          <Text style={gvS.metaDot}>·</Text>
          <Text style={gvS.metaText}>{loadRank ? '...' : members.length} membros</Text>

          <TouchableOpacity
            onPress={() => navigation.navigate('GroupChat', { group })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={gvS.chatLink}
          >
            <Text style={gvS.chatLinkText}>Chat</Text>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.textSubtitle} />
          </TouchableOpacity>

          {menuItems.length > 0 && (
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ marginLeft: 16 }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textSubtitle} />
            </TouchableOpacity>
          )}

          {!isAdmin && membership !== 'approved' && (
            <TouchableOpacity
              style={gvS.joinInline}
              onPress={handleJoin}
              disabled={joining}
            >
              {joining
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={gvS.joinInlineText}>Entrar no grupo</Text>
              }
            </TouchableOpacity>
          )}
        </View>

        {group.description ? <Text style={gvS.desc} numberOfLines={2}>{group.description}</Text> : null}
      </View>

      {/* ── Menu contextual ────────────────────────────────────────────────── */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={menuS.backdrop} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={menuS.sheet}>
            <View style={menuS.handle} />
            {menuItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[menuS.row, idx < menuItems.length - 1 && menuS.rowBorder]}
                onPress={() => { setMenuVisible(false); setTimeout(item.onPress, 200); }}
                activeOpacity={0.7}
              >
                <Ionicons name={item.icon} size={20} color={item.color} />
                <Text style={[menuS.rowText, { color: item.color }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={menuS.cancelRow} onPress={() => setMenuVisible(false)}>
              <Text style={menuS.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Segmented control: Posts | Membros ─────────────────────────────── */}
      <View style={gvS.tabs}>
        <Animated.View
          style={[
            gvS.tabUnderline,
            {
              width: GRP_WIDTH / 2 - 24,
              transform: [{
                translateX: new Animated.Value(activeTab === 'feed' ? 12 : GRP_WIDTH / 2 + 12),
              }],
            },
          ]}
        />
        {[{ key: 'feed', label: 'Posts' }, { key: 'ranking', label: 'Membros' }].map(t => (
          <TouchableOpacity key={t.key} style={gvS.tabHalf}
            onPress={() => setActiveTab(t.key)}
            activeOpacity={0.8}>
            <Text style={[gvS.tabText, activeTab === t.key && gvS.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Conteúdo: Posts ────────────────────────────────────────────────── */}
      {activeTab === 'feed' && (
        <View style={{ flex: 1 }}>
          {loadFeed
            ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
            : posts.length === 0
              ? <EmptyState icon="images-outline" message="Nenhuma postagem ainda." />
              : <FlatList ref={flatListRef} data={posts} keyExtractor={i => String(i.id)}
                  renderItem={renderPost} showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  onRefresh={() => { fetchFeed(); fetchRanking(); }} refreshing={loadFeed} />
          }
        </View>
      )}

      {/* ── Conteúdo: Membros ──────────────────────────────────────────────── */}
      {activeTab === 'ranking' && (
        <View style={{ flex: 1 }}>
          {loadRank
            ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
            : (
              <View style={{ flex: 1 }}>
                <View style={gvS.membersHeader}>
                  <View style={gvS.membersHeaderLeft}>
                    <Ionicons name="people" size={16} color={COLORS.primary} />
                    <Text style={gvS.membersHeaderTitle}>{members.length} membro{members.length !== 1 ? 's' : ''}</Text>
                  </View>
                  {isAdmin && (
                    <View style={gvS.adminBadge}>
                      <Ionicons name="shield-checkmark-outline" size={12} color={COLORS.primary} />
                      <Text style={gvS.adminBadgeText}>Modo admin</Text>
                    </View>
                  )}
                </View>
                <View style={gvS.rankSearch}>
                  <Ionicons name="search-outline" size={15} color={COLORS.textSubtitle} />
                  <TextInput style={gvS.rankSearchInput} value={rankSearch}
                    onChangeText={t => { setRankSearch(t); setShowAll(false); }}
                    placeholder="Buscar membro..." placeholderTextColor={COLORS.textSubtitle} />
                  {rankSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setRankSearch('')}>
                      <Ionicons name="close-circle" size={15} color={COLORS.textSubtitle} />
                    </TouchableOpacity>
                  )}
                </View>
                <FlatList
                  data={visibleMembers}
                  keyExtractor={item => item.user_id}
                  renderItem={({ item }) => {
                    const pos = filteredMembers.indexOf(item) + 1;
                    return <RankingItem item={item} position={pos} isCurrentUser={item.user_id === userId} isAdmin={isAdmin} onRemove={handleRemoveMember} />;
                  }}
                  ListEmptyComponent={<EmptyState icon="trophy-outline" message="Nenhum membro encontrado." />}
                  ListFooterComponent={() => (
                    <View>
                      {!showAll && filteredMembers.length > RANK_PAGE_SIZE && (
                        <TouchableOpacity style={gvS.showMore} onPress={() => setShowAll(true)}>
                          <Text style={gvS.showMoreText}>Mostrar mais ({filteredMembers.length - RANK_PAGE_SIZE} restantes)</Text>
                        </TouchableOpacity>
                      )}
                      {userBeyondLimit && userEntry && (
                        <View>
                          <View style={gvS.userDivider}>
                            <View style={gvS.divLine} /><Text style={gvS.divLabel}>sua posição</Text><View style={gvS.divLine} />
                          </View>
                          <RankingItem item={userEntry} position={userPosition} isCurrentUser />
                        </View>
                      )}
                      <View style={{ height: 40 }} />
                    </View>
                  )}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )
          }
        </View>
      )}

      <TransferAdminModal visible={transferModal} members={members} currentUserId={userId}
        onConfirm={confirmDelete} onCancel={() => setTransferModal(false)} />
    </View>
  );
}

// ── GroupsTab principal ───────────────────────────────────────────────────────
export default function GroupsTab({ navigation, groupsRef, goToTab }) {
  const { session, profile, updateProfile } = useUser();
  const userId = session?.user?.id;

  const [myGroups,      setMyGroups]      = useState([]);
  const [activeGroup,   setActiveGroup]   = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [selectorOpen,  setSelectorOpen]  = useState(false);
  const [showCreate,    setShowCreate]    = useState(false);
  const [showJoin,      setShowJoin]      = useState(false);
  const [memberCount,   setMemberCount]   = useState(null);
  const [welcomeGroup,  setWelcomeGroup]  = useState(null); // popup boas-vindas
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Expõe refresh ao tocar de novo na aba Grupos
  useImperativeHandle(groupsRef, () => ({
    scrollToTopAndRefresh: () => {
      // Apenas sinaliza o GroupView — NÃO chama loadGroups (evita piscar tela de entrar)
      setRefreshSignal(s => s + 1);
    },
  }), []);

  useEffect(() => {
    if (!userId) return;
    loadGroups();
  }, [userId]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('group_members')
      .select('groups ( id, name, description, image_url, privacy, invite_code, admin_id, requires_approval )')
      .eq('user_id', userId).eq('status', 'approved');

    const groups = (data ?? []).map(r => r.groups).filter(Boolean);
    setMyGroups(groups);

    // Seleciona o último grupo acessado ou o primeiro da lista
    if (groups.length > 0) {
      const lastId   = profile?.last_group_id;
      const lastGrp  = lastId ? groups.find(g => g.id === lastId) : null;
      setActiveGroup(lastGrp ?? groups[0]);
    } else {
      setActiveGroup(null);
    }
    setLoading(false);
  }, [userId, profile?.last_group_id]);

  const selectGroup = async (group) => {
    setActiveGroup(group);
    setMemberCount(null);
    // Persiste last_group_id no perfil
    await updateProfile({ last_group_id: group.id });
  };

  const handleGroupCreated = (group) => {
    setShowCreate(false);
    const updated = [group, ...myGroups];
    setMyGroups(updated);
    selectGroup(group);
  };

  const handleJoined = async (joinedGroup) => {
    await loadGroups();
    // Se entrou em um grupo aprovado, seleciona ele e mostra boas-vindas
    if (joinedGroup) {
      selectGroup(joinedGroup);
      setWelcomeGroup(joinedGroup);
    }
  };

  // Callback do GroupView quando membros carregam ou grupo é deletado
  const handleMembersLoaded = (count) => {
    if (count === -1) {
      // Grupo deletado — recarrega lista
      loadGroups();
    } else {
      setMemberCount(count);
    }
  };

  const handleNewAction = (type) => {
    if (type === 'create') setShowCreate(true);
    else setShowJoin(true);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Header com seletor ──────────────────────────────────────────── */}
      <View style={styles.header}>
        {activeGroup ? (
          <TouchableOpacity style={styles.groupSelector} onPress={() => setSelectorOpen(true)} activeOpacity={0.8}>
            <Image
              source={activeGroup.image_url ? { uri: activeGroup.image_url } : DEFAULT_AVATAR}
              style={styles.selectorAvatar}
            />
            <Text style={styles.selectorName} numberOfLines={1}>{activeGroup.name}</Text>
            <Ionicons name="chevron-down" size={16} color={COLORS.textSubtitle} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.headerTitle}>Grupos</Text>
        )}
      </View>

      {/* ── Conteúdo ────────────────────────────────────────────────────── */}
      {!activeGroup ? (
        // Tela de boas-vindas — sem grupos
        <View style={styles.welcome}>
          <Ionicons name="people-outline" size={64} color={COLORS.lightGray} />
          <Text style={styles.welcomeTitle}>Nenhum grupo ainda</Text>
          <Text style={styles.welcomeSubtitle}>
            Crie seu próprio grupo ou entre em um existente para competir com amigos!
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowCreate(true)}>
            <Text style={styles.primaryBtnText}>Criar grupo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryBtn, styles.secondaryBtn]} onPress={() => setShowJoin(true)}>
            <Text style={[styles.primaryBtnText, { color: COLORS.primary }]}>Entrar em grupo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <GroupView
          group={activeGroup}
          userId={userId}
          navigation={navigation}
          onMembersLoaded={handleMembersLoaded}
          onJoinedGroup={(g) => setWelcomeGroup(g)}
          refreshSignal={refreshSignal}
          goToTab={goToTab}
        />
      )}

      {/* ── Seletor de grupo ────────────────────────────────────────────── */}
      <GroupSelectorSheet
        visible={selectorOpen}
        groups={myGroups}
        activeGroupId={activeGroup?.id}
        onSelect={selectGroup}
        onClose={() => setSelectorOpen(false)}
        onNew={handleNewAction}
      />

      {/* ── Modais ──────────────────────────────────────────────────────── */}
      <CreateGroupModal visible={showCreate} onClose={() => setShowCreate(false)}
        onCreated={handleGroupCreated} userId={userId} />
      <JoinGroupModal visible={showJoin} onClose={() => setShowJoin(false)}
        onJoined={handleJoined} userId={userId} />
      <WelcomeGroupPopup
        visible={!!welcomeGroup}
        groupName={welcomeGroup?.name ?? ''}
        onDismiss={() => setWelcomeGroup(null)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle:     { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.textStrong },
  groupSelector:   { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  selectorAvatar:  { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.lightGray },
  selectorName:    { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong, flex: 1 },
  headerAction:    { padding: 2 },
  welcome:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  welcomeTitle:    { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.textStrong, textAlign: 'center' },
  welcomeSubtitle: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center', lineHeight: 22 },
  primaryBtn:      { backgroundColor: COLORS.primary, paddingVertical: 13, paddingHorizontal: 28, borderRadius: RADIUS.sm, alignItems: 'center', width: '100%' },
  secondaryBtn:    { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.primary },
  primaryBtnText:  { fontFamily: FONTS.bold, fontSize: 15, color: '#FFF' },
  searchBar:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F4F4F4', borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput:     { flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textStrong, padding: 0 },
  emptyState:      { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText:       { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center' },
  groupCard:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, gap: 12 },
  groupAvatar:     { width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.lightGray },
  groupInfo:       { flex: 1 },
  groupName:       { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textStrong },
  groupDesc:       { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle, marginTop: 2 },
});

// GroupView styles
const gvS = StyleSheet.create({
  infoBar:              { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  desc:                 { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, marginBottom: 4, lineHeight: 18 },
  metaRow:              { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  metaText:             { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle },
  metaDot:              { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle },
  actionBtnDisabled:    { backgroundColor: COLORS.lightGray },
  actionBtnDisabledText:{ fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSubtitle },
  tabs:                 { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, position: 'relative', alignItems: 'center' },
  tab:                  { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabHalf:              { flex: 1, paddingVertical: 12, alignItems: 'center' },
  chatLink:             { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' },
  chatLinkText:         { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textSubtitle },
  tabActive:            { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText:              { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSubtitle },
  tabUnderline:         { position: 'absolute', bottom: 0, height: 2, backgroundColor: COLORS.primary, borderRadius: 1 },
  tabTextActive:        { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary },
  rankSearch:           { flexDirection: 'row', alignItems: 'center', gap: 8, margin: SPACING.sm, backgroundColor: '#F4F4F4', borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7 },
  rankSearchInput:      { flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textStrong, padding: 0 },
  inviteBanner:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, backgroundColor: '#FFF6F3', borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1.5, borderColor: COLORS.primary },
  inviteBannerLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  inviteIconWrap:       { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FFE8DF', alignItems: 'center', justifyContent: 'center' },
  inviteBannerLabel:    { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textSubtitle, marginBottom: 2 },
  inviteBannerCode:     { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.primary, letterSpacing: 2 },
  inviteCopyBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm },
  inviteCopyText:       { fontFamily: FONTS.bold, fontSize: 12, color: '#FFF' },
  joinInline:           { marginLeft: 'auto', backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.full },
  joinInlineText:       { fontFamily: FONTS.bold, fontSize: 12, color: '#FFF' },
  showMore:             { alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: COLORS.lightGray },
  showMoreText:         { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.primary },
  userDivider:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SPACING.md, paddingVertical: 8 },
  divLine:              { flex: 1, height: 1, backgroundColor: COLORS.lightGray },
  divLabel:             { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textSubtitle },
  membersHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: 4 },
  membersHeaderLeft:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  membersHeaderTitle:   { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textStrong },
  adminBadge:           { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF3EE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#FFD9CC' },
  adminBadgeText:       { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.primary },
});

// Ranking styles
const rankS = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray, gap: 12 },
  rowTop:     { backgroundColor: '#FFFBF7' },
  rowMe:      { backgroundColor: '#FFF3EE', borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  posWrap:    { width: 28, alignItems: 'center' },
  pos:        { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textSubtitle },
  posMe:      { color: COLORS.primary },
  medal:      { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  medalText:  { fontFamily: FONTS.bold, fontSize: 13, color: '#FFF' },
  avatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.lightGray },
  info:       { flex: 1 },
  name:       { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textStrong },
  nameMe:     { color: COLORS.primary },
  handle:     { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle },
  streakWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  streakImg:  { position: 'absolute', width: 44, height: 44, resizeMode: 'contain' },
  streakNum:  { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.primary, marginTop: -5, marginLeft: 0 },
  streakGray: { color: '#AAAAAA' },
  removeBtn:  { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
});

// Sheet styles
const sheet = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  container:      { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '70%' },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  title:          { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  groupRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  groupRowActive: { backgroundColor: '#FFF6F3' },
  groupAvatar:    { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.lightGray },
  groupInfo:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  groupName:      { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textStrong },
  groupNameActive:{ color: COLORS.primary, fontFamily: FONTS.bold },
  emptyText:      { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center', padding: 20 },
  newBtns:        { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md, paddingTop: 16 },
  newBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary },
  newBtnText:     { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.primary },
});

// Modal styles
const modal = StyleSheet.create({
  container:            { flex: 1, backgroundColor: COLORS.background },
  header:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  title:                { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong },
  saveBtn:              { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.primary },
  content:              { flex: 1, padding: SPACING.md },
  field:                { marginBottom: SPACING.md },
  label:                { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textStrong, marginBottom: 6 },
  input:                { borderWidth: 1, borderColor: COLORS.lightGray, borderRadius: RADIUS.sm, paddingVertical: 11, paddingHorizontal: 12, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong },
  imagePickerWrap:      { alignSelf: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  imagePicker:          { position: 'relative' },
  imagePreview:         { width: 90, height: 90, borderRadius: 18, backgroundColor: COLORS.lightGray },
  imageDefault:         { width: 90, height: 90, borderRadius: 18, backgroundColor: '#F4F4F4', borderWidth: 1, borderColor: COLORS.lightGray },
  imageEditBadge:       { position: 'absolute', bottom: -4, right: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.background },
  removeImageBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  removeImageText:      { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.danger },
  segmentRow:           { flexDirection: 'row', gap: 8, backgroundColor: '#F4F4F4', borderRadius: RADIUS.sm, padding: 4 },
  segment:              { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: RADIUS.xs },
  segmentActive:        { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.lightGray },
  segmentText:          { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textSubtitle },
  segmentTextActive:    { color: COLORS.primary, fontFamily: FONTS.bold },
  infoBanner:           { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFF6F3', borderRadius: RADIUS.sm, padding: 10, borderWidth: 1, borderColor: '#FFD9CC' },
  infoBannerText:       { flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle, lineHeight: 18 },
  tabRow:               { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  tab:                  { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:            { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText:              { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSubtitle },
  tabTextActive:        { color: COLORS.primary, fontFamily: FONTS.bold },
});

// Chat styles
const chatS = StyleSheet.create({
  wrapper:      { flex: 1 },
  listContent:  { padding: 12, paddingBottom: 4 },
  empty:        { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText:    { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center' },
  rowMe:        { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  rowThem:      { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 8, gap: 8, alignItems: 'flex-end' },
  avatar:       { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.lightGray },
  balloonMe:    { maxWidth: '75%', backgroundColor: COLORS.primary, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 8 },
  balloonThem:  { maxWidth: '75%', backgroundColor: '#F0F0F0', borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 8 },
  sender:       { fontFamily: FONTS.bold, fontSize: 11, color: '#888', marginBottom: 2 },
  textMe:       { fontFamily: FONTS.regular, fontSize: 14, color: '#FFF', lineHeight: 20 },
  textThem:     { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textStrong, lineHeight: 20 },
  timeMe:       { fontFamily: FONTS.regular, fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 3, textAlign: 'right' },
  timeThem:     { fontFamily: FONTS.regular, fontSize: 10, color: '#AAA', marginTop: 3 },
  bar:          { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 10, borderTopWidth: 1, borderTopColor: COLORS.lightGray, backgroundColor: COLORS.background },
  barInput:     { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong, backgroundColor: '#F4F4F4', borderRadius: 22, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, maxHeight: 110 },
  barBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.lightGray, alignItems: 'center', justifyContent: 'center' },
  barBtnActive: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
});

// Transfer styles
const transferS = StyleSheet.create({
  backdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:          { backgroundColor: COLORS.background, borderRadius: 20, padding: 20, width: '100%' },
  title:         { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.textStrong, marginBottom: 6 },
  subtitle:      { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, lineHeight: 18 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: 'transparent', marginBottom: 4 },
  rowSel:        { borderColor: COLORS.primary, backgroundColor: '#FFF3EE' },
  avatar:        { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.lightGray },
  name:          { flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textStrong },
  btnRow:        { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel:     { flex: 1, paddingVertical: 11, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.lightGray, alignItems: 'center' },
  btnCancelText: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSubtitle },
  btnConfirm:    { flex: 1, paddingVertical: 11, borderRadius: RADIUS.sm, backgroundColor: COLORS.danger, alignItems: 'center' },
  btnConfirmText:{ fontFamily: FONTS.bold, fontSize: 14, color: '#FFF' },
});

// Welcome popup styles
const welcomePopS = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card:       { backgroundColor: COLORS.background, borderRadius: 24, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 28, alignItems: 'center', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 22, elevation: 14 },
  emojiWrap:  { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF3EE', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emoji:      { fontSize: 36 },
  title:      { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.textStrong, marginBottom: 4, textAlign: 'center' },
  groupName:  { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.primary, textAlign: 'center', marginBottom: 14 },
  message:    { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn:        { backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, alignSelf: 'stretch', alignItems: 'center' },
  btnText:    { fontFamily: FONTS.bold, fontSize: 15, color: '#FFF' },
});

// Join group paste button styles
const joinS = StyleSheet.create({
  pasteBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FFF3EE', borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#FFD9CC' },
  pasteBtnText: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.primary },
});

// Context menu (3-dots) styles
const menuS = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, paddingTop: 6 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 8 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: SPACING.md, paddingVertical: 16 },
  rowBorder:  { borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  rowText:    { fontFamily: FONTS.medium, fontSize: 15 },
  cancelRow:  { marginTop: 8, marginHorizontal: SPACING.md, paddingVertical: 14, borderRadius: RADIUS.sm, backgroundColor: COLORS.lightGray, alignItems: 'center' },
  cancelText: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textSubtitle },
});
