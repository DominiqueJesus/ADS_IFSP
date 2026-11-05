// src/screens/ProfilePicScreen.js
//
// Equivalente ao HTML:
//   <section class="screen auth-screen" id="profile-pic-screen">
//
// Permite escolher foto da galeria ou câmera.
// Faz upload para o Supabase Storage e atualiza avatar_url no perfil.
// Navegação: "Escolher Foto" / "Adicionar depois" → MainApp
//
// PRÉ-REQUISITO (instalar uma vez):
//   npx expo install expo-image-picker
//
// CONFIGURAÇÃO SUPABASE STORAGE:
//   1. Crie um bucket chamado "avatars" (público)
//   2. Em Storage → Policies, adicione policy de INSERT para usuários autenticados:
//      (bucket_id = 'avatars' AND auth.role() = 'authenticated')

import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { supabase } from '../../supabase';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

// Avatar padrão (mesmo do protótipo HTML)
const DEFAULT_AVATAR = require('../../assets/images/avatar-default.png');

export default function ProfilePicScreen({ navigation, route }) {
  const { profile, updateProfile, session } = useUser();

  // Valores calculados vindo do CaloricDataScreen via WelcomeScreen
  const pendingCalorieTarget = route.params?.calorieTarget;
  const pendingGoal          = route.params?.goal;

  const [imageUri,  setImageUri]  = useState(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);

  // ── Seleciona imagem da galeria ───────────────────────────────────────────
  const pickImage = async () => {
    // Pede permissão de acesso à galeria
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos acessar sua galeria para escolher a foto.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],       // recorte quadrado → ficará circular na UI
      quality: 0.7,
    });

    if (!result.canceled) {
      await uploadAvatar(result.assets[0].uri);
    }
  };

  // ── Faz upload para Supabase Storage e atualiza o perfil ─────────────────
  const uploadAvatar = async (uri) => {
    setUploading(true);
    try {
      // 1. Converte a URI local para ArrayBuffer
      const response  = await fetch(uri);
      const blob      = await response.blob();
      const arrayBuf  = await new Response(blob).arrayBuffer();

      // 2. Define o caminho único no bucket (user_id/avatar.jpg)
      const userId    = session?.user?.id;
      const filePath  = `${userId}/avatar.jpg`;

      // 3. Faz upload (upsert sobrescreve se já existir)
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuf, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // 4. Pega a URL pública
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // 5. Atualiza o perfil no banco e no contexto
      await updateProfile({ avatar_url: publicUrl });
      setImageUri(publicUrl);

    } catch (err) {
      Alert.alert('Erro no upload', err.message ?? 'Não foi possível enviar a foto.');
    } finally {
      setUploading(false);
    }
  };

  // ── Finaliza o onboarding — salva calorie_target e vai para MainApp ──────
  // Este é o único ponto onde calorie_target é persistido.
  // O App.js detecta hasCompletedSetup=true aqui e troca para o grupo MainApp.
  const finishOnboarding = async () => {
    if (pendingCalorieTarget) {
      await updateProfile({
        calorie_target: pendingCalorieTarget,
        goal: pendingGoal,
      });
    }
    // navigation.replace não é necessário — App.js troca de grupo automaticamente
  };

  const handleSkip     = () => finishOnboarding();
  const handleContinue = () => finishOnboarding();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.container}>

        {/* ── Título ────────────────────────────────────────────────────── */}
        {/* HTML: <h2>Escolha sua foto de perfil</h2> */}
        <Text style={styles.title}>Escolha sua foto de perfil</Text>
        <Text style={styles.subtitle}>
          Você pode adicionar ou alterar depois, no seu perfil.
        </Text>

        {/* ── Preview circular ──────────────────────────────────────────── */}
        {/*
            HTML: <img class="profile-pic-preview">
            .profile-pic-preview → width/height: 150px, border-radius: 50%,
                                    border: 4px solid #F0F0F0
        */}
        <TouchableOpacity
          style={styles.avatarWrapper}
          onPress={pickImage}
          activeOpacity={0.85}
          disabled={uploading}
        >
          <Image
            source={imageUri ? { uri: imageUri } : DEFAULT_AVATAR}
            style={styles.avatar}
          />
          {/* Overlay de câmera sobre o avatar */}
          <View style={styles.cameraOverlay}>
            {uploading
              ? <ActivityIndicator color={COLORS.background} size="small" />
              : <Ionicons name="camera" size={22} color={COLORS.background} />
            }
          </View>
        </TouchableOpacity>

        {/* ── Botão Escolher Foto ───────────────────────────────────────── */}
        {/* HTML: <button class="btn btn-primary" id="chooseProfilePicBtn">Escolher Foto</button> */}
        <View style={styles.formGroup}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, uploading && styles.btnDisabled]}
            onPress={pickImage}
            activeOpacity={0.8}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator color={COLORS.background} size="small" />
              : <>
                  <Ionicons name="image-outline" size={20} color={COLORS.background} style={{ marginRight: 8 }} />
                  <Text style={styles.btnPrimaryText}>Escolher Foto</Text>
                </>
            }
          </TouchableOpacity>
        </View>

        {/* Botão "Continuar" aparece apenas após selecionar uma foto */}
        {imageUri && imageUri !== DEFAULT_AVATAR && !uploading && (
          <View style={styles.formGroup}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSuccess]}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.background} style={{ marginRight: 8 }} />
              <Text style={styles.btnPrimaryText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Botão Pular ───────────────────────────────────────────────── */}
        {/* HTML: <button class="btn btn-secondary" id="skipProfilePicBtn">Adicionar depois</button> */}
        <View style={styles.formGroup}>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={handleSkip}
            activeOpacity={0.8}
          >
            <Text style={styles.btnSecondaryText}>Adicionar depois</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:   { flex: 1, backgroundColor: COLORS.background },
  container:  {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },

  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.textStrong,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.textSubtitle,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    maxWidth: 280,
  },

  // .profile-pic-preview → width/height: 150px, border-radius: 50%, border: 4px solid #F0F0F0
  avatarWrapper: {
    width: 150,
    height: 150,
    marginBottom: SPACING.xl,
    position: 'relative',
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 4,
    borderColor: COLORS.lightGray,
    backgroundColor: COLORS.lightGray,
  },
  // Ícone de câmera sobreposto ao avatar
  cameraOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },

  formGroup:      { width: '100%', maxWidth: 320, marginBottom: SPACING.sm },
  btn:            { width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnDisabled:    { opacity: 0.6 },
  btnPrimary:     { backgroundColor: COLORS.primary },
  btnSuccess:     { backgroundColor: COLORS.secondary },
  btnPrimaryText: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.background },

  // .btn-secondary → background: #F0F0F0, color: #555555
  btnSecondary:     { backgroundColor: COLORS.lightGray },
  btnSecondaryText: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.textSubtitle },
});
