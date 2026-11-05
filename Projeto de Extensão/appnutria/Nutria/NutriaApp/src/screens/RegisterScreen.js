// src/screens/RegisterScreen.js
//
// Versão MVP: cadastro por e-mail + senha via Supabase.
// Fix aplicados:
//   1. Componente <Field> declarado FORA do componente principal
//      → evita perda de foco a cada keystroke (re-render destrutivo)
//   2. Trata needsConfirmation: true do hook
//      → exibe feedback em vez de travar silenciosamente

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../hooks/useAuth';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

// ── Validações ────────────────────────────────────────────────────────────────
const validate = {
  fullName:        (v) => v.trim().length >= 3
    ? null : 'Nome deve ter ao menos 3 caracteres.',
  username:        (v) => /^[a-z0-9._]{3,20}$/.test(v)
    ? null : 'Use 3-20 caracteres: letras, números, ponto ou _',
  email:           (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
    ? null : 'Informe um e-mail válido.',
  password:        (v) => v.length >= 6
    ? null : 'Mínimo de 6 caracteres.',
  confirmPassword: (v, pwd) => v === pwd
    ? null : 'As senhas não coincidem.',
};

// ── <Field> FORA do componente principal ─────────────────────────────────────
// Crítico: declarar aqui evita que o React recrie o componente a cada render,
// o que causava a perda de foco após cada letra digitada.
const Field = ({
  label, value, onChangeText, onBlur, placeholder, fieldKey, fieldErrors,
  clearFieldError, keyboardType = 'default', autoCapitalize = 'none',
  secureTextEntry = false, showToggle = false, onToggle,
  returnKeyType = 'next', onSubmitEditing,
}) => (
  <View style={styles.formGroup}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputWrapper}>
      <TextInput
        style={[
          styles.input,
          showToggle            && styles.inputWithIcon,
          fieldErrors[fieldKey] && styles.inputError,
        ]}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textSubtitle}
        value={value}
        onChangeText={(t) => { onChangeText(t); clearFieldError(fieldKey); }}
        onBlur={onBlur}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
      {showToggle && (
        <TouchableOpacity
          style={styles.eyeBtn}
          onPress={onToggle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={secureTextEntry ? 'eye-outline' : 'eye-off-outline'}
            size={22}
            color={COLORS.textSubtitle}
          />
        </TouchableOpacity>
      )}
    </View>
    {fieldErrors[fieldKey]
      ? <Text style={styles.fieldErrorText}>{fieldErrors[fieldKey]}</Text>
      : null}
  </View>
);

// ── Tela principal ────────────────────────────────────────────────────────────
export default function RegisterScreen({ navigation }) {
  const { loading, error, clearError, signUpWithEmail } = useAuth();

  const [fullName, setFullName]       = useState('');
  const [username, setUsername]       = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // Exibido quando o Supabase tem "Confirm email" ativado
  const [confirmationSent, setConfirmationSent] = useState(false);

  const validateField = (key, value) => {
    const msg = key === 'confirmPassword'
      ? validate.confirmPassword(value, password)
      : validate[key]?.(value);
    setFieldErrors(prev => ({ ...prev, [key]: msg }));
  };

  const clearFieldError = (key) => {
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: null }));
    clearError();
  };

  const validateAll = () => {
    const errs = {
      fullName:        validate.fullName(fullName),
      username:        validate.username(username),
      email:           validate.email(email),
      password:        validate.password(password),
      confirmPassword: validate.confirmPassword(confirm, password),
    };
    setFieldErrors(errs);
    return Object.values(errs).every(v => v === null);
  };

  const openTerms = async () => {
    try {
      await WebBrowser.openBrowserAsync(
        'https://egoceniricvxorzeqihu.supabase.co/storage/v1/object/public/public-assets/TC-PP%20NUTRIA.pdf'
      );
    } catch {
      // silencioso — falha ao abrir o navegador não deve travar o cadastro
    }
  };

  const handleRegister = async () => {
    if (!validateAll()) return;

    const { user, needsConfirmation, error: err } = await signUpWithEmail({
      email, password,
      username: username.toLowerCase(),
      fullName,
    });

    if (err) return; // erro já exibido pelo hook via <errorBox>

    if (needsConfirmation) {
      setConfirmationSent(true);
      return;
    }

    // Não navegamos manualmente após o cadastro.
    // O Supabase dispara onAuthStateChange → UserContext carrega o perfil →
    // App.js detecta session+profile e exibe o grupo de onboarding (Goal).
    // Para novos usuários, calorie_target = 0, então o grupo 2 é ativado.
  };

  // ── Estado: e-mail de confirmação enviado ─────────────────────────────────
  // Exibido somente se o Supabase ainda estiver com "Confirm email" ativo.
  if (confirmationSent) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.confirmationContainer}>
          <Ionicons name="mail-outline" size={64} color={COLORS.primary} />
          <Text style={styles.confirmationTitle}>Verifique seu e-mail</Text>
          <Text style={styles.confirmationText}>
            Enviamos um link de confirmação para{'\n'}
            <Text style={styles.confirmationEmail}>{email}</Text>
          </Text>
          <Text style={styles.confirmationHint}>
            Após confirmar, volte aqui para fazer login.
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { marginTop: SPACING.xl }]}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
          >
            <Text style={styles.btnPrimaryText}>Ir para o Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Formulário de cadastro ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Field
            label="Nome completo"
            fieldKey="fullName"
            value={fullName}
            onChangeText={setFullName}
            onBlur={() => validateField('fullName', fullName)}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
            placeholder="Ex: Maria Silva"
            autoCapitalize="words"
          />

          <Field
            label="Nome de usuário"
            fieldKey="username"
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase())}
            onBlur={() => validateField('username', username)}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
            placeholder="Ex: maria.silva"
          />

          <Field
            label="E-mail"
            fieldKey="email"
            value={email}
            onChangeText={setEmail}
            onBlur={() => validateField('email', email)}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
            placeholder="Ex: maria@email.com"
            keyboardType="email-address"
          />

          <Field
            label="Senha"
            fieldKey="password"
            value={password}
            onChangeText={setPassword}
            onBlur={() => validateField('password', password)}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
            placeholder="Mínimo 6 caracteres"
            secureTextEntry={!showPass}
            showToggle
            onToggle={() => setShowPass(v => !v)}
          />

          <Field
            label="Confirmar senha"
            fieldKey="confirmPassword"
            value={confirm}
            onChangeText={setConfirm}
            onBlur={() => validateField('confirmPassword', confirm)}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
            placeholder="Repita a senha"
            secureTextEntry={!showConfirm}
            showToggle
            onToggle={() => setShowConfirm(v => !v)}
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={[styles.formGroup, { marginTop: SPACING.xs }]}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, loading && styles.btnDisabled]}
              onPress={handleRegister}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={COLORS.background} size="small" />
                : <Text style={styles.btnPrimaryText}>Cadastre-se</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={styles.termsText}>
            Ao se cadastrar, você concorda com nossos{' '}
            <Text style={styles.termsLink} onPress={openTerms}>Termos de Uso</Text>.
          </Text>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Já tem uma conta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.footerLink}>Entrar</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── StyleSheet ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea:         { flex: 1, backgroundColor: COLORS.background },
  scrollContent:    { flexGrow: 1, alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl },
  logo:             { width: 200, height: 80, marginBottom: SPACING.lg },
  formGroup:        { width: '100%', maxWidth: 320, marginBottom: SPACING.md },
  label:            { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textStrong, marginBottom: SPACING.xs },
  inputWrapper:     { position: 'relative' },
  input:            { width: '100%', paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#CCCCCC', borderRadius: RADIUS.sm, fontSize: 16, fontFamily: FONTS.regular, color: COLORS.textStrong, backgroundColor: COLORS.background },
  inputWithIcon:    { paddingRight: 48 },
  inputError:       { borderColor: COLORS.danger, borderWidth: 1.5 },
  eyeBtn:           { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  fieldErrorText:   { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.danger, marginTop: 4 },
  errorBox:         { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%', maxWidth: 320, marginBottom: SPACING.sm, backgroundColor: '#FFF0EE', borderRadius: RADIUS.sm, paddingVertical: 10, paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: COLORS.danger },
  errorText:        { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.danger, flex: 1 },
  btn:              { width: '100%', paddingVertical: 14, paddingHorizontal: 24, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:      { opacity: 0.6 },
  btnPrimary:       { backgroundColor: COLORS.primary },
  btnPrimaryText:   { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.background },
  termsText:        { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSubtitle, textAlign: 'center', maxWidth: 300, marginTop: SPACING.xs, lineHeight: 18 },
  termsLink:        { color: COLORS.primary, fontFamily: FONTS.medium },
  footer:           { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.lg },
  footerText:       { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle },
  footerLink:       { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary },

  // ── Tela de confirmação de e-mail ──────────────────────────────────────────
  confirmationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  confirmationTitle: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.textStrong,
    textAlign: 'center',
  },
  confirmationText: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.textSubtitle,
    textAlign: 'center',
    lineHeight: 24,
  },
  confirmationEmail: {
    fontFamily: FONTS.bold,
    color: COLORS.textStrong,
  },
  confirmationHint: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.textSubtitle,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
