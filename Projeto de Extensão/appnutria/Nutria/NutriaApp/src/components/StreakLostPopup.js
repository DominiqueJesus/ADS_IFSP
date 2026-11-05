// src/components/StreakLostPopup.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro desta função.
//
// Popup visual de streak perdida.
// Design: badge grande centralizado, mensagem limpa, botão centralizado.

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, Animated, Image,
} from 'react-native';
import { COLORS, FONTS } from '../theme';

const STREAK_BADGE_GRAY = require('../../assets/images/streak-badge-gray.png');

export default function StreakLostPopup({ visible, onDismiss }) {
  const scaleAnim   = useRef(new Animated.Value(0.75)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  const animateOut = (done) => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.96,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setMounted(false);
      done?.();
    });
  };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      scaleAnim.setValue(0.75);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1, tension: 70, friction: 8, useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1, duration: 220, useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      animateOut();
    }
  }, [visible]);

  const handleDismiss = () => animateOut(onDismiss);

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={handleDismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleDismiss}>
        <Animated.View
          style={[styles.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>

            {/* Badge cinza grande e centralizado */}
            <View style={styles.badgeContainer}>
              <Image source={STREAK_BADGE_GRAY} style={styles.badgeImg} resizeMode="contain" />
              <Text style={styles.badgeZero}>0</Text>
            </View>

            <Text style={styles.title}>Sequência perdida</Text>
            <Text style={styles.message}>
              Volte hoje para começar uma nova sequência!
            </Text>

            <TouchableOpacity style={styles.btn} onPress={handleDismiss} activeOpacity={0.85}>
              <Text style={styles.btnText}>Começar de novo hoje</Text>
            </TouchableOpacity>

          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
  },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },

  // Badge grande e centralizado
  badgeContainer: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  badgeImg: {
    position: 'absolute',
    width: 110,
    height: 110,
    opacity: 0.55,
  },
  badgeZero: {
    fontFamily: FONTS.bold,
    fontSize: 38,
    color: '#BBBBBB',
    marginTop: -5,
    marginLeft: 4,
  },

  title: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.textStrong,
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.textSubtitle,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },

  // Botão centralizado e largo
  btn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignSelf: 'center',
    minWidth: 200,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#FFF',
  },
});
