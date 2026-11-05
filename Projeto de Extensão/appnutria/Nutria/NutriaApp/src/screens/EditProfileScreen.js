// src/screens/EditProfileScreen.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro da função principal.
//
// Permite editar: foto de perfil, username e nome completo.
// Valida disponibilidade do username em tempo real (debounce 600ms).

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { supabase } from '../../supabase';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const DEFAULT_AVATAR = require('../../assets/images/avatar-default.png');

// ── Componentes auxiliares (regra permanente) ─────────────────────────────────

function HeaderBar({ onBack, onSave, saving, canSave }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={24} color={COLORS.textStrong} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Editar Perfil</Text>
      <TouchableOpacity onPress={onSave} disabled={!canSave || saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        {saving
          ? <ActivityIndicator size="small" color={COLORS.primary} />
          : <Text style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}>Salvar</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

function FieldLabel({ label }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function StatusIcon({ status }) {
  if (status === 'checking') return <ActivityIndicator size="small" color={COLORS.textSubtitle} />;
  if (status === 'available') return <Ionicons name="checkmark-circle" size={18} color="#22C55E" />;
  if (status === 'taken')     return <Ionicons name="close-circle" size={18} color={COLORS.danger} />;
  return null;
}

// ── EditProfileScreen ─────────────────────────────────────────────────────────
export default function EditProfileScreen({ navigation }) {
  const { profile, session, updateProfile, uploadAvatar } = useUser();

  const [fullName,         setFullName]         = useState(profile?.full_name ?? '');
  const [username,         setUsername]         = useState(profile?.username ?? '');
  const [avatarUri,        setAvatarUri]        = useState(profile?.avatar_url ?? null);
  const [avatarChanged,    setAvatarChanged]    = useState(false);
  const [usernameStatus,   setUsernameStatus]   = useState('idle'); // idle | checking | available | taken
  const [saving,           setSaving]           = useState(false);
  const debounceTimer = useRef(null);

  const originalUsername = profile?.username ?? '';
  const usernameChanged  = username.trim() !== originalUsername;
  const canSave = usernameStatus !== 'taken' && usernameStatus !== 'checking' && username.trim().length >= 3;

  // ── Validação de username com debounce ────────────────────────────────────
  useEffect(() => {
    if (!usernameChanged) { setUsernameStatus('idle'); return; }
    if (username.trim().length < 3) { setUsernameStatus('idle'); return; }

    setUsernameStatus('checking');
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.trim().toLowerCase())
        .neq('id', session?.user?.id)
        .maybeSingle();

      setUsernameStatus(data ? 'taken' : 'available');
    }, 600);
  }, [username]);

  // ── Selecionar nova foto ──────────────────────────────────────────────────
  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos acessar sua galeria.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
      setAvatarChanged(true);
    }
  };

  // ── Salvar ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const updates = {};

      if (fullName.trim() !== (profile?.full_name ?? '')) {
        updates.full_name = fullName.trim();
      }
      if (usernameChanged && usernameStatus === 'available') {
        updates.username = username.trim().toLowerCase();
      }

      // Upload de avatar se foi alterado
      if (avatarChanged && avatarUri) {
        const { error: uploadError } = await uploadAvatar(avatarUri);
        if (uploadError) throw new Error(uploadError);
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await updateProfile(updates);
        if (error) throw new Error(error);
      }

      navigation.goBack();
    } catch (err) {
      Alert.alert('Erro ao salvar', err.message ?? 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <HeaderBar
        onBack={() => navigation.goBack()}
        onSave={handleSave}
        saving={saving}
        canSave={canSave}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* ── Avatar ────────────────────────────────────────────────── */}
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickAvatar} activeOpacity={0.85}>
              <Image
                source={avatarUri ? { uri: avatarUri } : DEFAULT_AVATAR}
                style={styles.avatar}
              />
              <View style={styles.avatarOverlay}>
                <Ionicons name="camera" size={22} color="#FFF" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Toque para alterar a foto</Text>
          </View>

          {/* ── Campos ────────────────────────────────────────────────── */}
          <View style={styles.fieldsSection}>

            <FieldLabel label="Nome completo" />
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Seu nome completo"
              placeholderTextColor={COLORS.textSubtitle}
              autoCorrect={false}
            />

            <FieldLabel label="Nome de usuário" />
            <View style={styles.inputRow}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                style={[styles.input, styles.inputFlex]}
                value={username}
                onChangeText={t => setUsername(t.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase())}
                placeholder="seunome"
                placeholderTextColor={COLORS.textSubtitle}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.statusIcon}>
                <StatusIcon status={usernameChanged ? usernameStatus : 'idle'} />
              </View>
            </View>
            {usernameStatus === 'taken' && (
              <Text style={styles.fieldError}>Este nome de usuário já está em uso.</Text>
            )}
            {usernameStatus === 'available' && usernameChanged && (
              <Text style={styles.fieldSuccess}>Nome de usuário disponível!</Text>
            )}
            <Text style={styles.fieldHint}>Apenas letras, números, pontos e underscores.</Text>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },

  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  headerTitle:      { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong },
  saveBtn:          { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.primary },
  saveBtnDisabled:  { color: '#CCC' },

  avatarSection:  { alignItems: 'center', paddingVertical: SPACING.lg },
  avatarWrapper:  { position: 'relative' },
  avatar:         { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: COLORS.primary, backgroundColor: COLORS.lightGray },
  avatarOverlay:  { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.background },
  avatarHint:     { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSubtitle, marginTop: 8 },

  fieldsSection:  { gap: 4 },
  fieldLabel:     { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.textStrong, marginTop: SPACING.md, marginBottom: 6 },
  input:          { borderWidth: 1, borderColor: COLORS.lightGray, borderRadius: RADIUS.sm, paddingVertical: 11, paddingHorizontal: 12, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong, backgroundColor: COLORS.background },
  inputRow:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.lightGray, borderRadius: RADIUS.sm, paddingHorizontal: 12, backgroundColor: COLORS.background },
  inputFlex:      { flex: 1, borderWidth: 0, paddingHorizontal: 0 },
  atSign:         { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textSubtitle, marginRight: 2 },
  statusIcon:     { width: 24, alignItems: 'center' },
  fieldError:     { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.danger, marginTop: 4 },
  fieldSuccess:   { fontFamily: FONTS.regular, fontSize: 12, color: '#22C55E', marginTop: 4 },
  fieldHint:      { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textSubtitle, marginTop: 3 },
});
