// src/screens/AddCaptionScreen.js
//
// Tela de legenda — aparece após confirmar a foto na AddMealScreen.
// Recebe a foto já comprimida via params e publica.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Animated,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { supabase } from '../../supabase';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const STREAK_BADGE = require('../../assets/images/streak-badge.png');

// ── StreakChip — raio + "Ofensiva" ───────────────────────────────────────────
function StreakChip({ streak }) {
  if (!streak || streak <= 0) return null;
  return (
    <View style={styles.streakChip}>
      <View style={styles.streakBadge}>
        <Image source={STREAK_BADGE} style={styles.streakImg} />
        <Text style={styles.streakBadgeNumber}>{streak}</Text>
      </View>
      <Text style={styles.streakChipText}>Ofensiva</Text>
    </View>
  );
}

export default function AddCaptionScreen({ route, navigation }) {
  const { photoUri } = route.params;
  const { session, profile, updateProfile } = useUser();
  const userId = session?.user?.id;

  const [caption,    setCaption]    = useState('');
  const [publishing, setPublishing] = useState(false);

  const handlePublish = useCallback(async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      // Upload via XHR+FileReader (único método confiável no Hermes)
      const bytes = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            const binary = atob(base64);
            const arr = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
            resolve(arr);
          };
          reader.onerror = reject;
          reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = reject;
        xhr.open('GET', photoUri);
        xhr.responseType = 'blob';
        xhr.send();
      });

      const filePath = `${userId}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('posts').upload(filePath, bytes, { contentType: 'image/jpeg', upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);

      // 1. Insere o post — o banco atualiza o streak automaticamente via trigger
      const { error: insertErr } = await supabase.from('posts').insert({
        user_id: userId,
        image_url: urlData.publicUrl,
        caption: caption.trim() || null,
      });
      if (insertErr) throw insertErr;

      navigation.navigate('TabsRoot', { refresh: Date.now() });
    } catch (err) {
      Alert.alert('Erro ao publicar', err.message ?? 'Tente novamente.');
    } finally {
      setPublishing(false);
    }
  }, [photoUri, caption, publishing, userId, profile, navigation, updateProfile]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nova publicação</Text>
        <TouchableOpacity onPress={handlePublish} disabled={publishing}>
          {publishing
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Text style={styles.publishText}>Publicar</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Foto + legenda lado a lado (estilo Instagram) */}
          <View style={styles.row}>
            <Image source={{ uri: photoUri }} style={styles.thumb} resizeMode="cover" />
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Escreva uma legenda..."
              placeholderTextColor={COLORS.textSubtitle}
              multiline
              maxLength={300}
              autoFocus
            />
          </View>

          <View style={styles.divider} />

          {/* Ofensiva */}
          <StreakChip streak={profile?.streak} />

          <Text style={styles.hint}>
            Sua refeição será compartilhada no feed e alimentará sua ofensiva diária.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: COLORS.background },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong },
  publishText: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.primary },

  content:     { padding: SPACING.md },
  row:         { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb:       { width: 90, height: 90, borderRadius: 10, backgroundColor: COLORS.lightGray },
  captionInput:{ flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong, minHeight: 90, textAlignVertical: 'top', paddingTop: 4 },

  divider:     { height: 1, backgroundColor: COLORS.lightGray, marginVertical: SPACING.md },

  streakChip:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakBadge: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  streakImg:   { position: 'absolute', width: 40, height: 40, resizeMode: 'contain' },
  streakBadgeNumber: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.primary, marginTop: -4, marginLeft: 0 },
  streakChipText: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textStrong },

  hint:        { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, lineHeight: 19, marginTop: SPACING.md },
});
