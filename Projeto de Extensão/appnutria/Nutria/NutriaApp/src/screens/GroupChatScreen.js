// src/screens/GroupChatScreen.js
//
// Screen dedicada ao chat do grupo.
// Abre como Stack screen sem animação para parecer parte da GroupsTab.
// KeyboardAvoidingView funciona corretamente em Screen.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  FlatList, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { supabase } from '../../supabase';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const DEFAULT_AVATAR = require('../../assets/images/avatar-default.png');

export default function GroupChatScreen({ route, navigation }) {
  const { group } = route.params;
  const { session } = useUser();
  const userId = session?.user?.id;

  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);
  const listRef    = useRef(null);
  const myProfile  = useRef(null); // cache do próprio perfil para exibição otimista

  // Carrega perfil próprio para usar nas mensagens otimistas
  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', userId)
        .single();
      if (data) myProfile.current = data;
    };
    fetchProfile();
  }, [userId]);

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel('chat_' + group.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_messages',
        filter: 'group_id=eq.' + group.id,
      }, async (payload) => {
        // Ignora mensagens próprias — já foram adicionadas otimisticamente
        if (payload.new.user_id === userId) return;

        // Busca mensagem completa com profile para exibir
        const { data } = await supabase
          .from('group_messages')
          .select('id, content, created_at, user_id, profiles ( id, username, avatar_url )')
          .eq('id', payload.new.id)
          .single();
        // Dedup por ID — nunca insere a mesma mensagem duas vezes
        if (data) setMessages(prev => prev.some(m => m.id === data.id) ? prev : [data, ...prev]);
      })
      .subscribe();

    // ── Polling de fallback: a cada 3s garante sincronia mesmo se Realtime falhar
    const pollInterval = setInterval(() => { loadMessages(); }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [group.id]);

  const loadMessages = async () => {
    const { data } = await supabase
      .from('group_messages')
      .select('id, content, created_at, user_id, profiles ( id, username, avatar_url )')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!data) return;
    // Merge inteligente: mantém mensagens otimistas que ainda não foram persistidas
    setMessages(prev => {
      const optimistic = prev.filter(m => String(m.id).startsWith('optimistic_'));
      const serverIds = new Set(data.map(m => m.id));
      // Remove otimistas que já foram persistidas (mesmo conteúdo no servidor)
      const stillPending = optimistic.filter(o =>
        !data.some(d => d.content === o.content && d.user_id === o.user_id)
      );
      return [...stillPending, ...data];
    });
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');

    // Adiciona a mensagem otimisticamente antes de salvar no banco
    const optimisticMsg = {
      id: `optimistic_${Date.now()}`,
      content,
      created_at: new Date().toISOString(),
      user_id: userId,
      profiles: myProfile.current ?? { id: userId, username: 'você', avatar_url: null },
    };
    setMessages(prev => [optimisticMsg, ...prev]);

    try {
      const { data: saved, error } = await supabase
        .from('group_messages')
        .insert({ group_id: group.id, user_id: userId, content })
        .select('id, content, created_at, user_id, profiles ( id, username, avatar_url )')
        .single();

      if (error) throw error;

      // Substitui a mensagem otimista pela real (com ID correto do banco)
      setMessages(prev =>
        prev.map(m => m.id === optimisticMsg.id ? saved : m)
      );
    } catch {
      // Reverte a mensagem otimista em caso de erro
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      setText(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* Header simples — parece a tab */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Image
            source={group.image_url ? { uri: group.image_url } : DEFAULT_AVATAR}
            style={styles.headerAvatar}
          />
          <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* KAV funciona perfeitamente em Screen */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* FlatList invertida — mais recente na base */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          inverted
          contentContainerStyle={messages.length === 0 ? styles.listContentEmpty : styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color="#DDD" />
              <Text style={styles.emptyText}>Nenhuma mensagem ainda.</Text>
              <Text style={styles.emptyText}>Seja o primeiro a escrever!</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.user_id === userId;
            return (
              <View style={isMe ? styles.rowMe : styles.rowThem}>
                {!isMe && (
                  <Image
                    source={item.profiles?.avatar_url
                      ? { uri: item.profiles.avatar_url }
                      : DEFAULT_AVATAR}
                    style={styles.avatar}
                  />
                )}
                <View style={isMe ? styles.balloonMe : styles.balloonThem}>
                  {!isMe && (
                    <Text style={styles.sender}>
                      @{item.profiles?.username ?? 'usuario'}
                    </Text>
                  )}
                  <Text style={isMe ? styles.textMe : styles.textThem}>
                    {item.content}
                  </Text>
                  <Text style={isMe ? styles.timeMe : styles.timeThem}>
                    {new Date(item.created_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {/* Input bar */}
        <View style={styles.bar}>
          <TextInput
            style={styles.barInput}
            value={text}
            onChangeText={setText}
            placeholder="Mensagem..."
            placeholderTextColor="#AAA"
            multiline
            maxLength={500}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={text.trim() ? styles.barBtnActive : styles.barBtn}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: COLORS.background },

  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerCenter:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  headerAvatar:  { width: 30, height: 30, borderRadius: 8, backgroundColor: COLORS.lightGray },
  headerTitle:   { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong, flexShrink: 1 },

  listContent:      { padding: 12, paddingBottom: 4 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center', padding: 12 },
  empty:         { alignItems: 'center', gap: 10 },
  emptyText:     { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center' },

  rowMe:         { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  rowThem:       { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 8, gap: 8, alignItems: 'flex-end' },
  avatar:        { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.lightGray },
  balloonMe:     { maxWidth: '75%', backgroundColor: COLORS.primary, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 13, paddingVertical: 9 },
  balloonThem:   { maxWidth: '75%', backgroundColor: '#F0F0F0', borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 13, paddingVertical: 9 },
  sender:        { fontFamily: FONTS.bold, fontSize: 11, color: '#888', marginBottom: 2 },
  textMe:        { fontFamily: FONTS.regular, fontSize: 15, color: '#FFF', lineHeight: 21 },
  textThem:      { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong, lineHeight: 21 },
  timeMe:        { fontFamily: FONTS.regular, fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4, textAlign: 'right' },
  timeThem:      { fontFamily: FONTS.regular, fontSize: 10, color: '#AAA', marginTop: 4 },

  bar:           { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 12, borderTopWidth: 1, borderTopColor: COLORS.lightGray, backgroundColor: COLORS.background },
  barInput:      { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong, backgroundColor: '#F4F4F4', borderRadius: 22, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, maxHeight: 120 },
  barBtn:        { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.lightGray, alignItems: 'center', justifyContent: 'center' },
  barBtnActive:  { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
});
