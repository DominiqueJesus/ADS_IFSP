// src/screens/ResetPasswordScreen.js
//
// Passo 2 do fluxo OTP: usuário digita o código de 6 dígitos + nova senha.
// verifyOtp autentica o usuário → updateUser persiste a nova senha.

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  ScrollView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const LOGO = require('../../assets/images/logo.png');

// ── OTPInput — 6 caixas individuais ──────────────────────────────────────────
function OTPInput({ value, onChange }) {
  const inputs = useRef([]);
  const digits = value.split('');

  const handleChange = (text, idx) => {
    const cleaned = text.replace(/\D/g, '').slice(-1);
    const arr = digits.slice();
    arr[idx] = cleaned;
    // Preenche posições ausentes com ''
    while (arr.length < 6) arr.push('');
    onChange(arr.join(''));
    // Avança para próximo campo
    if (cleaned && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKeyPress = (e, idx) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  return (
    <View style={otp.row}>
      {[0,1,2,3,4,5].map(i => (
        <TextInput
          key={i}
          ref={r => inputs.current[i] = r}
          style={[otp.box, digits[i] && otp.boxFilled]}
          value={digits[i] ?? ''}
          onChangeText={t => handleChange(t, i)}
          onKeyPress={e => handleKeyPress(e, i)}
          keyboardType="number-pad"
          maxLength={1}
          selectTextOnFocus
          textAlign="center"
        />
      ))}
    </View>
  );
}

// ── ResetPasswordScreen ───────────────────────────────────────────────────────
export default function ResetPasswordScreen({ route, navigation }) {
  const { email } = route.params;

  const [code,      setCode]      = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [resending, setResending] = useState(false);
  const [resentOk,  setResentOk]  = useState(false);

  const handleReset = async () => {
    if (code.length < 6) { setError('Digite o código completo de 6 dígitos.'); return; }
    if (password.length < 6) { setError('A nova senha deve ter pelo menos 6 caracteres.'); return; }
    setError('');
    setLoading(true);
    try {
      // 1. Verifica o OTP — autentica a sessão temporária
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });
      if (verifyErr) throw new Error('Código inválido ou expirado. Solicite um novo código.');

      // 2. Atualiza a senha com a sessão ativa
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw new Error('Não foi possível atualizar a senha. Tente novamente.');

      // 3. Desloga — o AppNavigator detecta session=null e redireciona sozinho
      // Não chamamos navigation.reset pois o UserContext já cuida do redirecionamento
      await supabase.auth.signOut();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResentOk(false);
    setError('');
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setResending(false);
    setResentOk(true);
    setTimeout(() => setResentOk(false), 4000);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
          </TouchableOpacity>

          <Image source={LOGO} style={styles.logo} resizeMode="contain" />

          <Text style={styles.title}>Verificar código</Text>
          <Text style={styles.subtitle}>
            Enviamos um código de 6 dígitos para{'\n'}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

          {/* OTP */}
          <View style={styles.otpWrap}>
            <OTPInput value={code} onChange={setCode} />
          </View>

          {/* Reenviar */}
          <View style={styles.resendRow}>
            {resentOk ? (
              <Text style={styles.resentOk}>Código reenviado! Verifique seu e-mail.</Text>
            ) : (
              <TouchableOpacity onPress={handleResend} disabled={resending}>
                <Text style={styles.resendText}>
                  {resending ? 'Reenviando...' : 'Não recebi o código'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Nova senha */}
          <View style={styles.field}>
            <Text style={styles.label}>Nova senha</Text>
            <View style={styles.passWrap}>
              <TextInput
                style={styles.passInput}
                value={password}
                onChangeText={t => { setPassword(t); setError(''); }}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={COLORS.textSubtitle}
                secureTextEntry={!showPass}
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textSubtitle} />
              </TouchableOpacity>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, (loading || code.length < 6 || password.length < 6) && { opacity: 0.6 }]}
            onPress={handleReset}
            disabled={loading || code.length < 6 || password.length < 6}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={styles.btnText}>Redefinir senha</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: COLORS.background },
  content:         { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  backBtn:         { marginBottom: SPACING.lg },
  logo:            { width: 160, height: 64, alignSelf: 'center', marginBottom: SPACING.xl },
  title:           { fontFamily: FONTS.bold, fontSize: 24, color: COLORS.textStrong, marginBottom: 8 },
  subtitle:        { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle, lineHeight: 22, marginBottom: SPACING.xl },
  emailHighlight:  { fontFamily: FONTS.bold, color: COLORS.textStrong },
  otpWrap:         { marginBottom: SPACING.sm },
  resendRow:       { alignItems: 'center', marginBottom: SPACING.xl },
  resendText:      { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary },
  resentOk:        { fontFamily: FONTS.regular, fontSize: 13, color: '#166534' },
  field:           { marginBottom: SPACING.md },
  label:           { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textStrong, marginBottom: 6 },
  passWrap:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.lightGray, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 13 },
  passInput:       { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong },
  errorBox:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: RADIUS.sm, padding: 10, marginBottom: SPACING.md },
  errorText:       { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.danger, flex: 1 },
  btn:             { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.sm, alignItems: 'center' },
  btnText:         { fontFamily: FONTS.bold, fontSize: 15, color: '#FFF' },
});

const otp = StyleSheet.create({
  row:       { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  box:       { width: 46, height: 56, borderWidth: 1.5, borderColor: COLORS.lightGray, borderRadius: RADIUS.sm, fontSize: 24, fontFamily: FONTS.bold, color: COLORS.textStrong, backgroundColor: '#FAFAFA' },
  boxFilled: { borderColor: COLORS.primary, backgroundColor: '#FFF6F3' },
});
