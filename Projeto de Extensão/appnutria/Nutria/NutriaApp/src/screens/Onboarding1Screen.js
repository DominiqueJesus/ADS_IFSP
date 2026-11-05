// src/screens/Onboarding1Screen.js
// Navegação:
//   "Pular"   → Login direto (sem passar pelo Onboarding2)
//   "Próximo" → Onboarding2

import React from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

export default function Onboarding1Screen({ navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.container}>
        <Text style={styles.welcomeTitle}>Seja bem vindo(a)</Text>

        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.tagline}>Alimentando uma vida saudável</Text>

        <View style={[styles.buttonRow, { bottom: Math.max(insets.bottom + 16, 40) }]}>
          {/* CORRIGIDO: "Pular" vai para Login, não para Onboarding2 */}
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
          >
            <Text style={styles.btnSecondaryText}>Pular</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => navigation.navigate('Onboarding2')}
            activeOpacity={0.8}
          >
            <Text style={styles.btnPrimaryText}>Próximo</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: COLORS.background },
  container:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl + 40 },
  welcomeTitle:  { fontFamily: FONTS.bold, fontSize: 28, color: '#FF6600', marginBottom: SPACING.lg, textAlign: 'center' },
  logo:          { width: 250, height: 100, marginBottom: SPACING.lg },
  tagline:       { fontFamily: FONTS.regular, fontSize: 16, color: COLORS.textSubtitle, textAlign: 'center', maxWidth: 300, marginBottom: SPACING.lg },
  buttonRow:     { position: 'absolute', left: SPACING.lg, right: SPACING.lg, flexDirection: 'row', gap: 16 },
  btn:           { flex: 1, paddingVertical: 14, paddingHorizontal: 24, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  btnPrimary:    { backgroundColor: COLORS.primary },
  btnPrimaryText:{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.background },
  btnSecondary:  { backgroundColor: COLORS.lightGray },
  btnSecondaryText: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.textSubtitle },
});
