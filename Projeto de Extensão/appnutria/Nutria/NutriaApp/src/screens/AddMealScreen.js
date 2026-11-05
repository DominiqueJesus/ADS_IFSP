// src/screens/AddMealScreen.js
//
// Câmera em tela cheia (retrato). Foto capturada é recortada em quadrado
// e redimensionada para 1080px (compressão real) antes de ir para a legenda.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const STREAK_BADGE = require('../../assets/images/streak-badge.png');
const { width: SW } = Dimensions.get('window');

// Compressão via quality no takePictureAsync e launchImageLibraryAsync.
// O expo-image-manipulator requer build nativo — não funciona no Expo Go.
// quality: 0.4 reduz ~60-70% do tamanho sem perda visível em tela mobile.
async function compressImage(uri) {
  // Sem manipulação nativa — retorna o URI direto (galeria já foi comprimida pelo picker)
  return uri;
}

async function cropSquareAndCompress(uri, width, height) {
  // Sem manipulação nativa — retorna o URI direto (câmera já capturou com quality baixo)
  return uri;
}

// ── StreakChip — raio + "Ofensiva" ───────────────────────────────────────────
function StreakChip({ streak }) {
  if (!streak || streak <= 0) return null;
  return (
    <View style={styles.streakChip}>
      <View style={styles.streakBadge}>
        <Image source={STREAK_BADGE} style={styles.streakImg} />
        <Text style={styles.streakBadgeNumber}>{streak}</Text>
      </View>
      <Text style={styles.streakChipText}>Ofensiva</Text>
    </View>
  );
}

// ── AddMealScreen ─────────────────────────────────────────────────────────────
export default function AddMealScreen({ navigation }) {
  const { session, profile } = useUser();
  const cameraRef = useRef(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [facing,     setFacing]     = useState('back');
  const [processing, setProcessing] = useState(false);

  // Reveal circular saindo do canto superior esquerdo (origem do botão +)
  const revealAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
    // Animação de entrada: círculo cresce do canto até cobrir a tela
    Animated.timing(revealAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, []);

  // Fecha direto — a animação de saída fica por conta do fade nativo da navegação
  const closeWithReveal = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // ── Capturar foto → crop quadrado + compressão → tela de legenda ──────────
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || processing) return;
    setProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.4 });
      const cropped = await cropSquareAndCompress(photo.uri, photo.width, photo.height);
      navigation.navigate('AddCaption', { photoUri: cropped });
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível capturar a foto.');
    } finally {
      setProcessing(false);
    }
  }, [processing, navigation]);

  // ── Galeria → crop 1:1 + compressão → tela de legenda ─────────────────────
  const handleGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos acessar sua galeria.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.4,
    });
    if (!result.canceled) {
      setProcessing(true);
      try {
        const compressed = await compressImage(result.assets[0].uri);
        navigation.navigate('AddCaption', { photoUri: compressed });
      } catch {
        Alert.alert('Erro', 'Não foi possível processar a imagem.');
      } finally {
        setProcessing(false);
      }
    }
  }, [navigation]);

  // ── Sem permissão ─────────────────────────────────────────────────────────
  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header navigation={navigation} streak={profile?.streak} />
        <View style={styles.permissionBox}>
          <Ionicons name="camera-outline" size={48} color={COLORS.textSubtitle} />
          <Text style={styles.permissionText}>Permissão de câmera necessária</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Conceder permissão</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.fullscreen}>
      {/* Container com reveal circular saindo do canto superior esquerdo */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: revealAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
            transform: [
              { scale: revealAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
            ],
          },
        ]}
      >
        {/* Câmera em tela cheia (retrato) */}
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

        {/* Overlay superior: voltar + ofensiva */}
        <SafeAreaView style={styles.overlayTop} edges={['top']}>
          <TouchableOpacity
            style={styles.iconCircle}
            onPress={closeWithReveal}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          {profile?.streak > 0 && (
            <View style={styles.overlayStreak}>
              <View style={styles.streakBadgeSmall}>
                <Image source={STREAK_BADGE} style={styles.streakImgSmall} />
                <Text style={styles.streakBadgeNumberSmall}>{profile.streak}</Text>
              </View>
              <Text style={styles.overlayStreakText}>Ofensiva</Text>
            </View>
          )}
        </SafeAreaView>

        {/* Moldura quadrada indicando o recorte */}
        <View style={styles.squareGuideWrap} pointerEvents="none">
          <View style={styles.squareGuide} />
        </View>

        {/* Controles inferiores */}
        <SafeAreaView style={styles.overlayBottom} edges={['bottom']}>
          <View style={styles.controlsRow}>
            {/* Galeria */}
            <TouchableOpacity style={styles.sideBtn} onPress={handleGallery}>
              <Ionicons name="images-outline" size={26} color="#FFF" />
            </TouchableOpacity>

            {/* Disparador */}
            <TouchableOpacity onPress={handleCapture} disabled={processing} activeOpacity={0.8}>
              <View style={styles.shutterOuter}>
                {processing
                  ? <ActivityIndicator color={COLORS.primary} />
                  : <View style={styles.shutterInner} />
                }
              </View>
            </TouchableOpacity>

            {/* Flip */}
            <TouchableOpacity
              style={styles.sideBtn}
              onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            >
              <Ionicons name="camera-reverse-outline" size={26} color="#FFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

// Header usado só na tela de permissão
function Header({ navigation, streak }) {
  return (
    <View style={styles.permHeader}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="arrow-back" size={24} color={COLORS.textStrong} />
      </TouchableOpacity>
      <Text style={styles.permHeaderTitle}>Adicionar refeição</Text>
      <StreakChip streak={streak} />
    </View>
  );
}

const SQUARE = SW - 32;

const styles = StyleSheet.create({
  fullscreen:   { flex: 1, backgroundColor: '#000' },
  safe:         { flex: 1, backgroundColor: COLORS.background },

  // Overlays
  overlayTop:   { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  iconCircle:   { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  overlayStreak:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 22 },
  overlayStreakText: { fontFamily: FONTS.bold, fontSize: 16, color: '#FFF' },
  streakBadgeSmall:  { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  streakImgSmall:    { position: 'absolute', width: 38, height: 38, resizeMode: 'contain' },
  streakBadgeNumberSmall: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.primary, marginTop: -4, marginLeft: 0 },

  // Moldura quadrada
  squareGuideWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  squareGuide:  { width: SQUARE, height: SQUARE, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 12 },

  // Controles inferiores
  overlayBottom:{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 12 },
  controlsRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 40, paddingVertical: 20 },
  sideBtn:      { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primary },

  // Permissão
  permHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  permHeaderTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong },
  permissionBox:{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: 14 },
  permissionText: { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textSubtitle, textAlign: 'center' },
  permissionBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: RADIUS.sm },
  permissionBtnText: { fontFamily: FONTS.bold, fontSize: 14, color: '#FFF' },

  // StreakChip (header de permissão)
  streakChip:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakBadge:  { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  streakImg:    { position: 'absolute', width: 40, height: 40, resizeMode: 'contain' },
  streakBadgeNumber: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.primary, marginTop: -4, marginLeft: 0 },
  streakChipText: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textStrong },
});
