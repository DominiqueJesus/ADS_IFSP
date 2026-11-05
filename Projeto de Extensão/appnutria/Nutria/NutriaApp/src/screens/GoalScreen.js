// src/screens/GoalScreen.js
//
// Equivalente ao HTML:
//   <section class="screen auth-screen" id="goal-screen">
//
// O usuário escolhe seu objetivo. A seleção fica salva no UserContext
// e será usada no cálculo calórico da próxima tela.
// Navegação: Continuar → CaloricData

import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ScrollView, ActivityIndicator,
} from 'react-native';
import { useUser } from '../context/UserContext';
import { calcTMB, calcTDEE, calcTarget } from '../utils/caloricCalc';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

// Opções do protótipo:
//   data-goal="Emagrecimento", "massa", "definir"
const GOALS = [
  { key: 'Emagrecimento', label: 'Emagrecimento',          emoji: '🔥' },
  { key: 'massa',         label: 'Ganho de massa muscular', emoji: '💪' },
  { key: 'definir',       label: 'Manutenção calórica',     emoji: '⚖️' },
];

export default function GoalScreen({ navigation, route }) {
  const editMode = route.params?.editMode ?? false;
  const { profile, setProfile, updateProfile } = useUser();
  const [saving, setSaving] = useState(false);
  // Pré-seleciona o objetivo já salvo, se houver
  const [selected, setSelected] = useState(profile?.goal ?? null);
  const [error, setError]       = useState(false);

  const handleContinue = async () => {
    if (!selected) { setError(true); return; }

    if (editMode) {
      // Modo edição: recalcula a meta com os dados biométricos já salvos
      // e persiste direto — sem ir para CaloricDataScreen
      setSaving(true);
      try {
        const { gender, age, height, weight, activity } = profile ?? {};
        let newTarget = profile?.calorie_target ?? 0;
        if (gender && age && height && weight && activity) {
          const tmb  = calcTMB(gender, parseFloat(weight), parseFloat(height), parseFloat(age));
          const tdee = calcTDEE(tmb, parseFloat(activity));
          newTarget  = calcTarget(tdee, selected);
          await updateProfile({ goal: selected, calorie_target: newTarget, tdee });
        } else {
          // Dados biométricos incompletos — salva só o objetivo
          await updateProfile({ goal: selected });
        }
        navigation.goBack();
      } finally {
        setSaving(false);
      }
    } else {
      // Onboarding: salva localmente e vai para CaloricData
      setProfile(prev => ({ ...prev, goal: selected }));
      navigation.navigate('CaloricData');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo ────────────────────────────────────────────────────── */}
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* ── Título e subtítulo ───────────────────────────────────────── */}
        {/*
            HTML: <h2>Qual é seu objetivo?</h2>
                  <p>Isso nos ajuda a personalizar suas sugestões.</p>
        */}
        <Text style={styles.title}>Qual é seu objetivo?</Text>
        <Text style={styles.subtitle}>
          Isso nos ajuda a personalizar suas sugestões.
        </Text>

        {/* ── Botões de objetivo ───────────────────────────────────────── */}
        {/*
            HTML: .goal-btn → background: #F0F0F0, border: 2px solid #F0F0F0
                  .goal-btn.active → background: #FFF, border-color: #FE4A01, color: #FE4A01
        */}
        <View style={styles.goalOptions}>
          {GOALS.map((g) => {
            const isActive = selected === g.key;
            return (
              <TouchableOpacity
                key={g.key}
                style={[styles.goalBtn, isActive && styles.goalBtnActive]}
                onPress={() => { setSelected(g.key); setError(false); }}
                activeOpacity={0.8}
              >
                <Text style={styles.goalEmoji}>{g.emoji}</Text>
                <Text style={[styles.goalLabel, isActive && styles.goalLabelActive]}>
                  {g.label}
                </Text>
                {/* Indicador de seleção */}
                <View style={[styles.goalRadio, isActive && styles.goalRadioActive]}>
                  {isActive && <View style={styles.goalRadioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Aviso se tentar continuar sem selecionar */}
        {error && (
          <Text style={styles.errorText}>Selecione um objetivo para continuar.</Text>
        )}

        {/* ── Botão Continuar ──────────────────────────────────────────── */}
        {/*
            HTML: <button class="btn btn-primary" id="goalContinueBtn">Continuar</button>
        */}
        <View style={styles.formGroup}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={handleContinue}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color={COLORS.background} />
              : <Text style={styles.btnPrimaryText}>{editMode ? 'Salvar' : 'Continuar'}</Text>
            }
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: COLORS.background },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },

  logo: { width: 200, height: 80, marginBottom: SPACING.lg },

  // .auth-screen h2 → color: textStrong, margin-bottom: 8px
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.textStrong,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  // .auth-screen p → margin-bottom: 24px
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.textSubtitle,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },

  // .goal-options → width: 100%, max-width: 320px
  goalOptions: {
    width: '100%',
    maxWidth: 320,
    marginBottom: SPACING.xs,
  },

  // .goal-btn → background: #F0F0F0, border: 2px solid #F0F0F0, margin-bottom: 12px
  goalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGray,
    borderWidth: 2,
    borderColor: COLORS.lightGray,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    paddingHorizontal: SPACING.md,
    marginBottom: 12,
    gap: SPACING.sm,
  },
  // .goal-btn.active → background: #FFF, border-color: #FE4A01
  goalBtnActive: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.primary,
  },

  goalEmoji: { fontSize: 22 },

  goalLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.textSubtitle,
  },
  // .goal-btn.active → color: #FE4A01
  goalLabelActive: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
  },

  // Radio button visual customizado
  goalRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CCCCCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalRadioActive: { borderColor: COLORS.primary },
  goalRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },

  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.danger,
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
    maxWidth: 320,
  },

  formGroup: { width: '100%', maxWidth: 320, marginTop: SPACING.md },
  btn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary:     { backgroundColor: COLORS.primary },
  btnPrimaryText: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.background },
});
