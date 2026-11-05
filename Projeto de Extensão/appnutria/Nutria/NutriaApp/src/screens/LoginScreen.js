// src/screens/LoginScreen.js
import React, { useState } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

export default function LoginScreen({ navigation }) {
  const { loading, error, clearError, signInWithEmail } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    await signInWithEmail(email, password);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />

          {/* Título */}
          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.subtitle}>Bem-vindo de volta!</Text>

          {/* E-mail */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={t => { setEmail(t); clearError?.(); }}
              placeholder="seu@email.com"
              placeholderTextColor={COLORS.textSubtitle}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          {/* Senha */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Senha</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={t => { setPassword(t); clearError?.(); }}
                placeholder="Sua senha"
                placeholderTextColor={COLORS.textSubtitle}
                secureTextEntry={!showPass}
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textSubtitle} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Erro */}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Botão Entrar */}
          <View style={styles.formGroup}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, loading && styles.btnDisabled]}
              onPress={handleLogin}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={COLORS.background} size="small" />
                : <Text style={styles.btnPrimaryText}>Entrar</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Esqueci minha senha */}
          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword', { prefillEmail: email.trim() })}
            style={styles.forgotBtn}
          >
            <Text style={styles.forgotText}>Esqueci minha senha</Text>
          </TouchableOpacity>

          {/* Divisor */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Cadastro */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Não tem uma conta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}>Cadastre-se</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 56, paddingBottom: 40 },

  logo:          { width: 180, height: 72, marginBottom: 40 },

  title:         { fontFamily: FONTS.bold, fontSize: 26, color: COLORS.textStrong, marginBottom: 6 },
  subtitle:      { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, marginBottom: 32 },

  formGroup:     { marginBottom: 18 },
  label:         { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textStrong, marginBottom: 7 },
  input:         { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong, backgroundColor: '#FAFAFA' },

  passwordWrap:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FAFAFA' },
  passwordInput: { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong },

  errorBox:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText:     { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.danger, flex: 1 },

  btn:           { paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnPrimary:    { backgroundColor: COLORS.primary },
  btnDisabled:   { opacity: 0.6 },
  btnPrimaryText:{ fontFamily: FONTS.bold, fontSize: 16, color: '#FFF' },

  forgotBtn:     { alignSelf: 'center', paddingVertical: 8, marginTop: 14 },
  forgotText:    { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary },

  dividerRow:    { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine:   { flex: 1, height: 1, backgroundColor: '#EEEEEE' },
  dividerText:   { fontFamily: FONTS.medium, fontSize: 13, color: '#BBBBBB', marginHorizontal: 14 },

  footer:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  footerText:    { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle },
  footerLink:    { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary },
});
