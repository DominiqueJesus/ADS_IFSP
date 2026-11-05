// src/screens/tabs/SuggestionsTab.js
//
// Nutria Premium — Fake Door Test.
// Valida a demanda por sugestões com IA via lista de espera (premium_waitlist).

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Animated, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../context/UserContext';
import { COLORS, FONTS, SPACING } from '../../theme';

const PURPLE       = '#7C3AED';
const PURPLE_LIGHT = '#F3EEFF';
const PURPLE_DARK  = '#1E1040';

const VALUE_PROPS = [
  {
    icon: 'scan-outline',
    title: 'Escaneamento inteligente',
    desc: 'Fotografe seus ingredientes ou o cardápio e deixe a IA identificar o que você tem disponível.',
  },
  {
    icon: 'fitness-outline',
    title: 'Metas direcionadas',
    desc: 'Sugestões calculadas a partir da sua Taxa Metabólica Basal e do seu objetivo nutricional.',
  },
  {
    icon: 'restaurant-outline',
    title: 'Distribuição automática',
    desc: 'Receba ideias instantâneas para as 5 refeições do dia usando o que você já tem em casa.',
  },
];

export default function SuggestionsTab() {
  const { profile, updateProfile } = useUser();

  const [joined,  setJoined]  = useState(false);
  const [loading, setLoading] = useState(false);

  const fadeIn    = useRef(new Animated.Value(0)).current;
  const badgePulse = useRef(new Animated.Value(0.9)).current;

  // Estado inicial: já está na lista?
  useEffect(() => {
    setJoined(!!profile?.premium_waitlist);
  }, [profile?.premium_waitlist]);

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 0.9, duration: 1300, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleJoinWaitlist = async () => {
    if (joined || loading) return;
    setLoading(true);
    try {
      await updateProfile({ premium_waitlist: true });
      setJoined(true);
    } catch {
      // updateProfile já loga o erro; mantém o botão disponível para nova tentativa
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveWaitlist = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await updateProfile({ premium_waitlist: false });
      setJoined(false);
    } catch {
      // mantém o estado atual em caso de erro
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Badge */}
        <Animated.View style={[styles.badge, { transform: [{ scale: badgePulse }] }]}>
          <Ionicons name="diamond-outline" size={13} color="#C4B5FD" />
          <Text style={styles.badgeText}>NUTRIA PREMIUM</Text>
        </Animated.View>

        {/* Hero */}
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles" size={42} color={PURPLE} />
        </View>
        <Text style={styles.title}>Inteligência Artificial{'\n'}na sua rotina</Text>
        <Text style={styles.subtitle}>
          Em breve, a Nutria vai transformar o que você tem em casa em um cardápio sob medida para os seus objetivos — sem esforço, todos os dias.
        </Text>

        {/* Proposta de valor */}
        <View style={styles.propsWrap}>
          {VALUE_PROPS.map((p, i) => (
            <View key={i} style={styles.propRow}>
              <View style={styles.propIcon}>
                <Ionicons name={p.icon} size={22} color={PURPLE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.propTitle}>{p.title}</Text>
                <Text style={styles.propDesc}>{p.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.cta, joined && styles.ctaJoined]}
          onPress={handleJoinWaitlist}
          disabled={joined || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : joined ? (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#FFF" />
              <Text style={styles.ctaText}>Você está na lista</Text>
            </>
          ) : (
            <>
              <Ionicons name="diamond-outline" size={16} color="#FFF" />
              <Text style={styles.ctaText}>Entrar para a lista de espera</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footnote}>
          {joined
            ? 'Avisaremos assim que o Premium estiver disponível.'
            : 'Seja um dos primeiros a experimentar quando lançarmos.'}
        </Text>

        {/* Sair da lista — só aparece se já está na lista */}
        {joined && (
          <TouchableOpacity onPress={handleLeaveWaitlist} disabled={loading} style={styles.leaveBtn}>
            <Text style={styles.leaveText}>Sair da lista de espera</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.background },
  scroll:      { alignItems: 'center', paddingHorizontal: 24, paddingTop: 28 },

  badge:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: PURPLE_DARK, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 22 },
  badgeText:   { fontFamily: FONTS.bold, fontSize: 11, color: '#C4B5FD', letterSpacing: 1.5 },

  iconWrap:    { width: 84, height: 84, borderRadius: 42, backgroundColor: PURPLE_LIGHT, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title:       { fontFamily: FONTS.bold, fontSize: 24, color: COLORS.textStrong, textAlign: 'center', lineHeight: 31, marginBottom: 12 },
  subtitle:    { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center', lineHeight: 22, marginBottom: 30 },

  propsWrap:   { width: '100%', gap: 18, marginBottom: 32 },
  propRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  propIcon:    { width: 44, height: 44, borderRadius: 12, backgroundColor: PURPLE_LIGHT, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  propTitle:   { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textStrong, marginBottom: 3 },
  propDesc:    { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, lineHeight: 19 },

  cta:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PURPLE, paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14, width: '100%', shadowColor: PURPLE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  ctaJoined:   { backgroundColor: PURPLE_DARK, shadowColor: PURPLE_DARK },
  ctaText:     { fontFamily: FONTS.bold, fontSize: 15, color: '#FFF' },

  footnote:    { fontFamily: FONTS.regular, fontSize: 12, color: '#AAA', textAlign: 'center', marginTop: 14 },
  leaveBtn:    { marginTop: 12, paddingVertical: 6 },
  leaveText:   { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textSubtitle, textDecorationLine: 'underline' },
});
