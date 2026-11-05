// src/screens/WelcomeScreen.js
//
// Equivalente ao HTML:
//   <section class="screen auth-screen" id="welcome-screen">
//
// Exibe o resultado do cálculo calórico lido direto do UserContext.
// Navegação: "Começar" → ProfilePic

import React from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { GOAL_LABELS } from '../utils/caloricCalc';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

export default function WelcomeScreen({ navigation, route }) {
  const { profile } = useUser();

  // Prioriza os params passados pelo CaloricDataScreen
  // (profile ainda não tem calorie_target neste momento)
  const username      = profile?.username ?? 'usuário';
  const goal          = route.params?.goal ?? profile?.goal;
  const goalLabel     = GOAL_LABELS[goal] ?? 'seu objetivo';
  const tdee          = route.params?.tdee ?? profile?.tdee ?? 0;
  const calorieTarget = route.params?.calorieTarget ?? profile?.calorie_target ?? 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Ícone de sucesso ──────────────────────────────────────────── */}
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={72} color={COLORS.secondary} />
        </View>

        {/* ── Saudação ─────────────────────────────────────────────────── */}
        {/*
            HTML: <h1>Boas-vindas, <span id="welcome-username"></span>!</h1>
            .welcome-results h1 → font-size: 1.5rem, color: textStrong, margin-bottom: 16px
        */}
        <Text style={styles.title}>
          Boas-vindas,{' '}
          <Text style={styles.titleHighlight}>{username}</Text>!
        </Text>

        {/* ── Objetivo ─────────────────────────────────────────────────── */}
        {/*
            HTML: <p>Vamos começar sua jornada rumo ao
                      <strong><span id="welcome-goal"></span></strong>!</p>
        */}
        <Text style={styles.paragraph}>
          Vamos começar sua jornada rumo ao{' '}
          <Text style={styles.highlight}>{goalLabel}</Text>!
        </Text>

        {/* ── Cards de resultado ────────────────────────────────────────── */}
        {/*
            HTML: <p>...gasto calórico atual é de
                      <strong><span id="welcome-tdee"></span> calorias</strong>.</p>
                  <p>...meta para alcançar seu objetivo é de
                      <strong><span id="welcome-target"></span> calorias</strong> por dia.</p>
            .welcome-results strong → color: #FE4A01, font-size: 1.2rem
        */}
        <View style={styles.cardsRow}>
          <View style={styles.card}>
            <Ionicons name="flame-outline" size={28} color={COLORS.primary} />
            <Text style={styles.cardValue}>{tdee}</Text>
            <Text style={styles.cardLabel}>kcal{'\n'}gasto diário</Text>
          </View>
          <View style={[styles.card, styles.cardHighlighted]}>
            <Ionicons name="trophy-outline" size={28} color={COLORS.background} />
            <Text style={[styles.cardValue, { color: COLORS.background }]}>{calorieTarget}</Text>
            <Text style={[styles.cardLabel, { color: 'rgba(255,255,255,0.85)' }]}>
              kcal{'\n'}sua meta diária
            </Text>
          </View>
        </View>

        {/* ── Nota explicativa ─────────────────────────────────────────── */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.textSubtitle} />
          <Text style={styles.infoText}>
            Esses valores são calculados com base nas informações fornecidas
            pela fórmula de Harris-Benedict.
          </Text>
        </View>

        {/* ── Botão Começar ─────────────────────────────────────────────── */}
        {/* HTML: <button class="btn btn-primary" id="welcomeStartBtn">Começar</button> */}
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => navigation.navigate('ProfilePic', {
            calorieTarget: route.params?.calorieTarget,
            tdee: route.params?.tdee,
            goal: route.params?.goal,
          })}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>Começar 🚀</Text>
        </TouchableOpacity>

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

  successIcon: { marginBottom: SPACING.lg },

  // .welcome-results h1 → font-size: 1.5rem (24px), color: textStrong
  title: {
    fontFamily: FONTS.bold,
    fontSize: 26,
    color: COLORS.textStrong,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  titleHighlight: { color: COLORS.primary },

  // .welcome-results p → font-size: 1.1rem, line-height: 1.6
  paragraph: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: COLORS.textSubtitle,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.lg,
    maxWidth: 300,
  },

  // .welcome-results strong → color: #FE4A01, font-size: 1.2rem
  highlight: {
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    fontSize: 17,
  },

  // Cards lado a lado com os dois valores calóricos
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: SPACING.lg,
    maxWidth: 320,
    width: '100%',
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.lightGray,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 6,
  },
  cardHighlighted: { backgroundColor: COLORS.primary },
  cardValue: {
    fontFamily: FONTS.bold,
    fontSize: 28,
    color: COLORS.textStrong,
    lineHeight: 32,
  },
  cardLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textSubtitle,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Nota informativa
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: 320,
    backgroundColor: COLORS.lightGray,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  infoText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textSubtitle,
    lineHeight: 18,
  },

  btn:            { width: '100%', maxWidth: 320, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center' },
  btnPrimary:     { backgroundColor: COLORS.primary },
  btnPrimaryText: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.background },
});
