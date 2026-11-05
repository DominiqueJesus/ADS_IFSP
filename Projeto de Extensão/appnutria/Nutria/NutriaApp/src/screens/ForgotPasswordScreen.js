// src/screens/ForgotPasswordScreen.js
//
// Passo 1 do fluxo OTP: usuário informa o e-mail.
// Chama signInWithOtp que envia código de 6 dígitos para o e-mail.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  ScrollView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const LOGO = require('../../assets/images/logo.png');

export default function ForgotPasswordScreen({ navigation, route }) {
  const [email,   setEmail]   = useState(route.params?.prefillEmail ?? '');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSend = async () => {
    if (!email.trim()) { setError('Informe seu e-mail.'); return; }
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false }, // não cria conta nova
    });
    setLoading(false);
    if (err) {
      setError('Não foi possível enviar o código. Verifique o e-mail e tente novamente.');
      return;
    }
    navigation.navigate('ResetPassword', { email: email.trim().toLowerCase() });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
          </TouchableOpacity>

          <Image source={LOGO} style={styles.logo} resizeMode="contain" />

          <Text style={styles.title}>Esqueci minha senha</Text>
          <Text style={styles.subtitle}>
            Informe o e-mail da sua conta. Enviaremos um código de 6 dígitos para você redefinir sua senha.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={t => { setEmail(t); setError(''); }}
              placeholder="seu@email.com"
              placeholderTextColor={COLORS.textSubtitle}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.7 }]}
            onPress={handleSend}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={styles.btnText}>Enviar código</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Voltar ao login</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.background },
  content:   { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  backBtn:   { marginBottom: SPACING.lg },
  logo:      { width: 160, height: 64, alignSelf: 'center', marginBottom: SPACING.xl },
  title:     { fontFamily: FONTS.bold, fontSize: 24, color: COLORS.textStrong, marginBottom: 8 },
  subtitle:  { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, lineHeight: 22, marginBottom: SPACING.xl },
  field:     { marginBottom: SPACING.md },
  label:     { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textStrong, marginBottom: 6 },
  input:     { borderWidth: 1, borderColor: COLORS.lightGray, borderRadius: RADIUS.sm, paddingVertical: 13, paddingHorizontal: 14, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong },
  errorBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: RADIUS.sm, padding: 10, marginBottom: SPACING.md },
  errorText: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.danger, flex: 1 },
  btn:       { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.sm, alignItems: 'center', marginBottom: SPACING.md },
  btnText:   { fontFamily: FONTS.bold, fontSize: 15, color: '#FFF' },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText:{ fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary },
});
