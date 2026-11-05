// src/screens/Onboarding2Screen.js
// Navegação:
//   "Criar conta grátis" → Register
//   "Já tenho uma conta" → Login

import React from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const FEATURES = [
  {
    icon:  'camera-outline',
    color: COLORS.primary,
    bg:    '#FFF1EC',
    title: 'Registre suas refeições',
    text:  'Tire fotos e compartilhe sua jornada alimentar com a comunidade.',
  },
  {
    icon:  'flame-outline',
    color: '#FF6B00',
    bg:    '#FFF4E8',
    title: 'Mantenha sua ofensiva 🔥',
    text:  'Poste todo dia e acumule dias consecutivos visíveis em cada post.',
  },
  {
    icon:  'people-outline',
    color: '#4CAF50',
    bg:    '#EDF7EE',
    title: 'Comunidade que inspira',
    text:  'Curta e comente com pessoas que vivem mais saudável como você.',
  },
  {
    icon:  'trophy-outline',
    color: '#3A1C9C',
    bg:    '#EEEAF8',
    title: 'Metas calóricas personalizadas',
    text:  'Calculamos sua meta diária com base no seu perfil e objetivo.',
  },
];

// Fora do componente principal — regra permanente
function FeatureCard({ item }) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconBadge, { backgroundColor: item.bg }]}>
        <Ionicons name={item.icon} size={22} color={item.color} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardDesc}>{item.text}</Text>
      </View>
    </View>
  );
}

export default function Onboarding2Screen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* View com flex:1 em vez de ScrollView — força caber sem rolar */}
      <View style={styles.container}>

        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.sectionTitle}>Tudo que você precisa para</Text>
        <Text style={styles.sectionHighlight}>comer melhor todo dia</Text>

        <View style={styles.featureList}>
          {FEATURES.map((item, index) => (
            <FeatureCard key={index} item={item} />
          ))}
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.8}
          >
            <Text style={styles.btnPrimaryText}>Criar conta grátis</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.7}
          >
            <Text style={styles.loginLinkText}>
              Já tenho uma conta{' '}
              <Text style={styles.loginLinkBold}>Entrar</Text>
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:         { flex: 1, backgroundColor: COLORS.background },

  // flex:1 + justifyContent distribui o espaço disponível sem scroll
  container:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },

  logo:             { width: 140, height: 50, marginBottom: 8 },

  sectionTitle:     { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, textAlign: 'center' },
  sectionHighlight: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.textStrong, textAlign: 'center', marginBottom: 12 },

  featureList:      { width: '100%', maxWidth: 340, gap: 8, marginBottom: 14 },

  card:             { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.md, padding: 10, borderWidth: 1, borderColor: COLORS.lightGray, backgroundColor: '#FFFFFF', elevation: 1 },
  iconBadge:        { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardText:         { flex: 1 },
  cardTitle:        { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.textStrong, marginBottom: 1 },
  cardDesc:         { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textSubtitle, lineHeight: 15 },

  buttonGroup:      { width: '100%', maxWidth: 340, gap: 8 },
  btn:              { width: '100%', paddingVertical: 13, borderRadius: RADIUS.md, alignItems: 'center' },
  btnPrimary:       { backgroundColor: COLORS.primary },
  btnPrimaryText:   { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.background },

  loginLink:        { alignItems: 'center', paddingVertical: 6 },
  loginLinkText:    { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle },
  loginLinkBold:    { fontFamily: FONTS.bold, color: COLORS.primary },
});
