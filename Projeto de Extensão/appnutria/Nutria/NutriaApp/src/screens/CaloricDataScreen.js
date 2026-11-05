// src/screens/CaloricDataScreen.js
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  REGRA PERMANENTE DO PROJETO — NUNCA DECLARAR COMPONENTES DENTRO DE FUNÇÕES
// ─────────────────────────────────────────────────────────────────────────────
// Em React (Native), se um componente filho é declarado DENTRO de um componente
// pai (seja como `const`, `function` ou arrow function), o React trata cada
// render do pai como uma definição de tipo NOVA e diferente.
// Resultado: o filho é DESMONTADO e REMONTADO a cada keystroke, destruindo
// o foco do TextInput e resetando o estado interno do filho.
//
// REGRA: Todo componente auxiliar (Field, NumericField, OptionSelector, etc.)
// deve ser declarado NO ESCOPO DO MÓDULO (fora de qualquer função),
// recebendo via props tudo que precisa do estado do pai.
//
// ✅ CERTO:
//   function NumericField({ value, onChange, errors, clearError }) { ... }
//   export default function MinhaScreen() { return <NumericField .../> }
//
// ❌ ERRADO:
//   export default function MinhaScreen() {
//     const NumericField = (...) => { ... }  ← NUNCA FAÇA ISSO
//     return <NumericField />
//   }
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { calcTMB, calcTDEE, calcTarget, ACTIVITY_OPTIONS } from '../utils/caloricCalc';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES AUXILIARES — declarados no escopo do módulo (FORA do componente
// principal) para garantir identidade de tipo estável entre renders.
// ─────────────────────────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { label: 'Masculino', value: 'male',   icon: '👨' },
  { label: 'Feminino',  value: 'female', icon: '👩' },
];

// ── Campo numérico com label, unidade e erro inline ──────────────────────────
// Recebe `errors` e `onClearError` como props — nunca acessa o estado do pai
// diretamente, garantindo estabilidade de referência.
function NumericField({ label, value, onChange, placeholder, fieldKey, unit, errors, onClearError }) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            errors[fieldKey] && styles.inputError,
            unit && { paddingRight: 48 },
          ]}
          value={value}
          onChangeText={(t) => { onChange(t); onClearError(fieldKey); }}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textSubtitle}
          keyboardType="numeric"
          returnKeyType="next"
        />
        {unit && <Text style={styles.inputUnit}>{unit}</Text>}
      </View>
      {errors[fieldKey] ? <Text style={styles.fieldError}>{errors[fieldKey]}</Text> : null}
    </View>
  );
}

// ── Dropdown de nível de atividade ───────────────────────────────────────────
// IMPORTANTE: os values são sempre NUMBER (ex: 1.2, 1.375...).
// O banco pode retornar string — por isso usamos parseActivityValue()
// para garantir coerção antes de qualquer comparação.
function parseActivityValue(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function ActivityDropdown({ selected, onSelect }) {
  const [open, setOpen] = useState(false);
  // Garante que a comparação seja sempre number === number
  const selectedNum = parseActivityValue(selected);
  const current     = ACTIVITY_OPTIONS.find(o => o.value === selectedNum);

  return (
    <View style={selStyles.wrapper}>
      <Text style={styles.label}>Nível de atividade física</Text>
      <TouchableOpacity
        style={selStyles.trigger}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.8}
      >
        <Text style={[selStyles.triggerText, !current && selStyles.placeholder]}>
          {current ? current.label : 'Selecione...'}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.textSubtitle}
        />
      </TouchableOpacity>

      {open && (
        <View style={selStyles.dropdown}>
          {ACTIVITY_OPTIONS.map((o, i) => {
            const isSelected = o.value === selectedNum;
            return (
              <TouchableOpacity
                key={o.value}
                style={[
                  selStyles.option,
                  isSelected && selStyles.optionActive,
                  i < ACTIVITY_OPTIONS.length - 1 && selStyles.optionBorder,
                ]}
                onPress={() => {
                  onSelect(o.value); // salva sempre como number
                  setOpen(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[selStyles.optionText, isSelected && selStyles.optionTextActive]}>
                  {o.label}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TELA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function CaloricDataScreen({ navigation, route }) {
  const { profile, updateProfile } = useUser();
  const editMode = route.params?.editMode ?? false;

  // Pré-preenche com dados salvos no perfil — evita redigitar tudo ao editar
  const [gender,   setGender]   = useState(profile?.gender   ?? 'male');
  const [age,      setAge]      = useState(profile?.age      ? String(profile.age)    : '');
  const [height,   setHeight]   = useState(profile?.height   ? String(profile.height) : '');
  const [weight,   setWeight]   = useState(profile?.weight   ? String(profile.weight) : '');
  // activity: inicializa do profile toda vez que o componente monta
  // usamos uma ref para garantir que o valor inicial seja sempre o do banco
  // Coerção para number no estado inicial — banco pode retornar string
  const initialActivity = ACTIVITY_OPTIONS.find(o => o.value === parseFloat(profile?.activity))?.value ?? ACTIVITY_OPTIONS[0].value;
  const [activity, setActivity] = useState(initialActivity);
  const [errors,   setErrors]   = useState({});
  const [saving,   setSaving]   = useState(false);

  // useFocusEffect: roda toda vez que a tela entra em foco
  // Isso garante que ao abrir a tela novamente após salvar,
  // todos os campos — incluindo activity — reflitam o banco.
  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      if (profile.gender) setGender(profile.gender);
      if (profile.age)    setAge(String(profile.age));
      if (profile.height) setHeight(String(profile.height));
      if (profile.weight) setWeight(String(profile.weight));
      // Coerção para number — banco pode retornar string
      const actNum = parseFloat(profile.activity);
      const saved  = ACTIVITY_OPTIONS.find(o => o.value === actNum);
      setActivity(saved ? saved.value : ACTIVITY_OPTIONS[0].value);
    }, [profile])
  );

  // Limpa o erro de um campo específico (passado via prop para NumericField)
  const clearFieldError = (fieldKey) =>
    setErrors(prev => ({ ...prev, [fieldKey]: null }));

  // ── Validação ─────────────────────────────────────────────────────────────
  const validateAll = () => {
    const e = {};
    const a = parseFloat(age);
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (!a || a <= 0 || a > 120)  e.age    = 'Informe uma idade válida.';
    if (!h || h < 100 || h > 250) e.height = 'Altura entre 100 e 250 cm.';
    if (!w || w < 20 || w > 300)  e.weight = 'Peso entre 20 e 300 kg.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit: calcula e navega — NÃO salva calorie_target ainda ────────────
  // O calorie_target só é salvo no ProfilePicScreen (último passo do onboarding).
  // Isso evita que o App.js detecte hasCompletedSetup=true prematuramente
  // e troque de grupo antes de passar por Welcome e ProfilePic.
  const handleContinue = async () => {
    if (!validateAll()) return;

    const goal   = profile?.goal ?? 'definir';
    const tmb    = calcTMB(gender, parseFloat(weight), parseFloat(height), parseFloat(age));
    const tdee   = calcTDEE(tmb, activity);
    const target = calcTarget(tdee, goal);

    // Dados biométricos — salvos sempre para pré-preencher na próxima edição
    const biometrics = {
      gender,
      age:      parseFloat(age),
      height:   parseFloat(height),
      weight:   parseFloat(weight),
      activity,
    };

    setSaving(true);
    if (editMode) {
      // Modo edição: salva tudo direto e volta para o perfil
      const { error } = await updateProfile({ tdee, calorie_target: target, goal, ...biometrics });
      setSaving(false);
      if (error) { setErrors({ global: 'Erro ao salvar. Tente novamente.' }); return; }
      navigation.popToTop();
    } else {
      // Onboarding: salva biometrics + tdee — calorie_target vem no último passo
      const { error } = await updateProfile({ tdee, ...biometrics });
      setSaving(false);
      if (error) { setErrors({ global: 'Erro ao salvar. Tente novamente.' }); return; }
      navigation.navigate('Welcome', { tdee, calorieTarget: target, goal });
    }
  };

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
          {/* ── Logo ──────────────────────────────────────────────────── */}
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          {/* ── Título ────────────────────────────────────────────────── */}
          <Text style={styles.title}>Quase lá!</Text>
          <Text style={styles.subtitle}>
            Precisamos de mais alguns dados para o cálculo calórico.
          </Text>

          {/* ── Gênero ────────────────────────────────────────────────── */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Gênero</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map(g => (
                <TouchableOpacity
                  key={g.value}
                  style={[styles.genderBtn, gender === g.value && styles.genderBtnActive]}
                  onPress={() => setGender(g.value)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.genderIcon}>{g.icon}</Text>
                  <Text style={[styles.genderLabel, gender === g.value && styles.genderLabelActive]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Campos numéricos ──────────────────────────────────────── */}
          {/* errors e onClearError passados como props — não closures do pai */}
          <NumericField
            label="Idade"       fieldKey="age"
            value={age}         onChange={setAge}
            placeholder="Ex: 25" unit="anos"
            errors={errors}     onClearError={clearFieldError}
          />
          <NumericField
            label="Altura"      fieldKey="height"
            value={height}      onChange={setHeight}
            placeholder="Ex: 175" unit="cm"
            errors={errors}     onClearError={clearFieldError}
          />
          <NumericField
            label="Peso"        fieldKey="weight"
            value={weight}      onChange={setWeight}
            placeholder="Ex: 70.5" unit="kg"
            errors={errors}     onClearError={clearFieldError}
          />

          {/* ── Nível de atividade ────────────────────────────────────── */}
          <View style={styles.formGroup}>
            <ActivityDropdown
              selected={activity}
              onSelect={setActivity}
            />
          </View>

          {/* ── Erro global ───────────────────────────────────────────── */}
          {errors.global && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
              <Text style={styles.errorBoxText}>{errors.global}</Text>
            </View>
          )}

          {/* ── Botão Continuar ───────────────────────────────────────── */}
          <View style={[styles.formGroup, { marginTop: SPACING.sm }]}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, saving && styles.btnDisabled]}
              onPress={handleContinue}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={COLORS.background} size="small" />
                : <Text style={styles.btnPrimaryText}>Continuar</Text>
              }
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES — declarados fora de qualquer função (padrão React Native)
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea:         { flex: 1, backgroundColor: COLORS.background },
  scrollContent:    { flexGrow: 1, alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl },
  logo:             { width: 200, height: 80, marginBottom: SPACING.md },
  title:            { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.textStrong, marginBottom: SPACING.xs, textAlign: 'center' },
  subtitle:         { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textSubtitle, marginBottom: SPACING.xl, textAlign: 'center', maxWidth: 300 },
  formGroup:        { width: '100%', maxWidth: 320, marginBottom: SPACING.md },
  label:            { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textStrong, marginBottom: SPACING.xs },
  inputRow:         { position: 'relative' },
  input:            { width: '100%', paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#CCCCCC', borderRadius: RADIUS.sm, fontSize: 16, fontFamily: FONTS.regular, color: COLORS.textStrong, backgroundColor: COLORS.background },
  inputError:       { borderColor: COLORS.danger, borderWidth: 1.5 },
  inputUnit:        { position: 'absolute', right: 14, top: 0, bottom: 0, textAlignVertical: 'center', fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSubtitle, lineHeight: 52 },
  fieldError:       { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.danger, marginTop: 4 },
  genderRow:        { flexDirection: 'row', gap: 12 },
  genderBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderWidth: 2, borderColor: COLORS.lightGray, borderRadius: RADIUS.sm, backgroundColor: COLORS.lightGray },
  genderBtnActive:  { borderColor: COLORS.primary, backgroundColor: COLORS.background },
  genderIcon:       { fontSize: 20 },
  genderLabel:      { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSubtitle },
  genderLabelActive:{ color: COLORS.primary, fontFamily: FONTS.bold },
  errorBox:         { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%', maxWidth: 320, marginBottom: SPACING.sm, backgroundColor: '#FFF0EE', borderRadius: RADIUS.sm, paddingVertical: 10, paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: COLORS.danger },
  errorBoxText:     { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.danger, flex: 1 },
  btn:              { width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:      { opacity: 0.6 },
  btnPrimary:       { backgroundColor: COLORS.primary },
  btnPrimaryText:   { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.background },
});

const selStyles = StyleSheet.create({
  // Espelha styles.input e styles.label para consistência visual
  wrapper:         { width: '100%' },
  trigger:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#CCCCCC', borderRadius: RADIUS.sm, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: COLORS.background },
  triggerText:     { fontFamily: FONTS.regular, fontSize: 16, color: COLORS.textStrong, flex: 1 },
  placeholder:     { color: COLORS.textSubtitle },
  dropdown:        { borderWidth: 1, borderColor: '#CCCCCC', borderRadius: RADIUS.sm, marginTop: 4, backgroundColor: COLORS.background, overflow: 'hidden' },
  option:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 14 },
  optionBorder:    { borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  optionActive:    { backgroundColor: '#FFF6F3' },
  optionText:      { fontFamily: FONTS.regular, fontSize: 16, color: COLORS.textStrong, flex: 1 },
  optionTextActive:{ fontFamily: FONTS.bold, color: COLORS.primary },
});
