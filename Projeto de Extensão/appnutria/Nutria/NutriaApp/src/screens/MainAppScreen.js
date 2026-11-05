// src/screens/MainAppScreen.js
//
// ⚠️  REGRA PERMANENTE — nenhum componente declarado dentro desta função.
//
// O bottom sheet de novo post é gerenciado AQUI no TabsRoot —
// não no FeedTab. Isso evita toda a cadeia de props e garante
// que o botão + funcione independente de qual aba está ativa.

import React, { useState, useEffect, useRef } from 'react';
import { useWindowDimensions, PanResponder } from 'react-native';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  Modal, Image, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Alert, Animated, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import FeedTab             from './tabs/FeedTab';
import SuggestionsTab      from './tabs/SuggestionsTab';
import GroupsTab           from './tabs/GroupsTab';
import ProfileTab          from './tabs/ProfileTab';
import PublicProfileScreen from './profile/PublicProfileScreen';
import PostDetailScreen    from './profile/PostDetailScreen';
import FollowListScreen    from './profile/FollowListScreen';
import SearchScreen        from './SearchScreen';
import AddMealScreen       from './AddMealScreen';
import AddCaptionScreen    from './AddCaptionScreen';
import EditProfileScreen   from './EditProfileScreen';
import GoalScreen          from './GoalScreen';
import CaloricDataScreen   from './CaloricDataScreen';
import GroupDetailScreen    from './GroupDetailScreen';
import GroupChatScreen      from './GroupChatScreen';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import ResetPasswordScreen  from './ResetPasswordScreen';
import ReportsCenterScreen  from './ReportsCenterScreen';
import { useUser }         from '../context/UserContext';
import { supabase }        from '../../supabase';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const Stack = createNativeStackNavigator();
const SWIPE_TABS = ['feed', 'groups', 'suggestions', 'profile'];
const DEFAULT_AVATAR = require('../../assets/images/avatar-default.png');
const LOGO = require('../../assets/images/logo.png');

// ── Configuração das abas (sem 'add' — ele vai no header agora) ───────────────
const TABS = [
  { key: 'feed',        icon: 'home-outline',   iconActive: 'home',    label: 'Início'    },
  { key: 'groups',      icon: 'people-outline', iconActive: 'people',  label: 'Grupos'    },
  { key: 'suggestions', icon: 'bulb-outline',   iconActive: 'bulb',    label: 'Sugestões' },
  { key: 'profile',     icon: 'person-outline', iconActive: 'person',  label: 'Perfil'    },
];

// ── AnimatedNavbar — barra flutuante; bubble e cor 100% sincronizados ────────
function AnimatedNavbar({ navPosition, activeIndex, screenWidth, onTabPress, insets }) {
  const NAV_MARGIN = 16;
  const navWidth = screenWidth - NAV_MARGIN * 2;
  const itemWidth = navWidth / TABS.length;

  // Bubble desliza continuamente seguindo navPosition (0..3)
  const bubbleTranslate = navPosition.interpolate({
    inputRange: [0, TABS.length - 1],
    outputRange: [0, itemWidth * (TABS.length - 1)],
    extrapolate: 'clamp',
  });

  return (
    <View style={[navStyles.navWrapper, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      <View style={navStyles.navBar}>
        {/* Bubble único deslizante — centralizado no item */}
        <Animated.View
          style={[
            navStyles.bubble,
            {
              width: 52,
              left: (itemWidth - 52) / 2,
              transform: [{ translateX: bubbleTranslate }],
            },
          ]}
        />
        {/* Ícones */}
        {TABS.map((tab, i) => {
          // Cor lê do MESMO navPosition com o MESMO inputRange do bubble
          // → cor e bubble chegam exatamente juntos
          const iconColor = navPosition.interpolate({
            inputRange: [i - 1, i, i + 1],
            outputRange: ['#6B7177', COLORS.primary, '#6B7177'],
            extrapolate: 'clamp',
          });
          const iconScale = navPosition.interpolate({
            inputRange: [i - 1, i, i + 1],
            outputRange: [1, 1.12, 1],
            extrapolate: 'clamp',
          });
          const isActive = activeIndex === i;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[navStyles.navItem, { width: itemWidth }]}
              onPress={() => onTabPress(tab.key)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            >
              <Animated.View style={{ transform: [{ scale: iconScale }] }}>
                <Animated.Text style={{ color: iconColor }}>
                  <Ionicons name={isActive ? tab.iconActive : tab.icon} size={24} />
                </Animated.Text>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── TopHeader — + esquerda, logo centro, busca direita ───────────────────────
function TopHeader({ onAdd, onSearch }) {
  return (
    <View style={navStyles.topHeader}>
      <TouchableOpacity onPress={onAdd} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="add" size={30} color={COLORS.textStrong} />
      </TouchableOpacity>
      <Image source={LOGO} style={navStyles.headerLogo} resizeMode="contain" />
      <TouchableOpacity onPress={onSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="search-outline" size={26} color={COLORS.textStrong} />
      </TouchableOpacity>
    </View>
  );
}

// ── NewPostSheet ──────────────────────────────────────────────────────────────
// Bottom sheet de criação de post — gerenciado pelo TabsRoot.
// UX: tudo acessível no terço inferior da tela sem reposicionar a mão.
// Fluxo: toca na área de foto → escolhe câmera ou galeria (ActionSheet nativo
// via Alert) → preview aparece inline → digita legenda → publica.
function NewPostSheet({ visible, onClose, onPublished }) {
  const { session, profile, updateProfile } = useUser();
  const userId = session?.user?.id;

  const [pickedImage, setPickedImage] = useState(null);
  const [caption,     setCaption]     = useState('');
  const [publishing,  setPublishing]  = useState(false);

  // Limpa estado ao fechar
  const handleClose = () => {
    setPickedImage(null);
    setCaption('');
    onClose();
  };

  // Abre Action Sheet nativo para escolher fonte
  const handlePickPhoto = () => {
    Alert.alert(
      'Nova Refeição',
      'Como você quer adicionar a foto?',
      [
        { text: 'Câmera', onPress: openCamera },
        { text: 'Galeria', onPress: openGallery },
        { text: 'Cancelar', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos da câmera.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (!result.canceled) setPickedImage(result.assets[0].uri);
  };

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos da galeria.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (!result.canceled) setPickedImage(result.assets[0].uri);
  };

  const handlePublish = async () => {
    if (!pickedImage || publishing) return;
    setPublishing(true);
    try {
      const response = await fetch(pickedImage);
      const blob     = await response.blob();
      const arrayBuf = await new Response(blob).arrayBuffer();
      const filePath = `${userId}/${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('posts').upload(filePath, arrayBuf, { contentType: 'image/jpeg', upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);

      const { data: newPost, error: insertErr } = await supabase
        .from('posts')
        .insert({ user_id: userId, image_url: urlData.publicUrl, caption: caption.trim() || null, likes_count: 0 })
        .select(`id, image_url, caption, likes_count, created_at, profiles ( id, username, avatar_url, streak )`)
        .single();
      if (insertErr) throw insertErr;

      onPublished(newPost);
      handleClose();
    } catch (err) {
      Alert.alert('Erro ao publicar', err.message ?? 'Tente novamente.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      {/* Backdrop — toque fora fecha */}
      <TouchableOpacity style={sheet.backdrop} activeOpacity={1} onPress={handleClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={sheet.kavWrapper}
      >
        <View style={sheet.container}>
          {/* Alça visual */}
          <View style={sheet.handle} />

          {/* Header */}
          <View style={sheet.header}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={sheet.cancelBtn}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={sheet.title}>Nova Refeição</Text>
            <TouchableOpacity
              onPress={handlePublish}
              disabled={!pickedImage || publishing}
            >
              {publishing
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Text style={[sheet.publishBtn, !pickedImage && sheet.publishBtnDisabled]}>
                    Publicar
                  </Text>
              }
            </TouchableOpacity>
          </View>

          {/* Área de foto — toque para escolher */}
          <TouchableOpacity
            style={sheet.photoArea}
            onPress={handlePickPhoto}
            activeOpacity={0.85}
          >
            {pickedImage ? (
              <>
                <Image source={{ uri: pickedImage }} style={sheet.photoPreview} resizeMode="cover" />
                <View style={sheet.photoEditBadge}>
                  <Ionicons name="pencil" size={14} color="#FFF" />
                </View>
              </>
            ) : (
              <View style={sheet.photoPlaceholder}>
                <Ionicons name="camera-outline" size={36} color={COLORS.textSubtitle} />
                <Text style={sheet.photoPlaceholderText}>Toque para adicionar foto</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Legenda */}
          <View style={sheet.captionRow}>
            <Image
              source={profile?.avatar_url ? { uri: profile.avatar_url } : DEFAULT_AVATAR}
              style={sheet.avatar}
            />
            <TextInput
              style={sheet.captionInput}
              placeholder="Escreva uma legenda..."
              placeholderTextColor={COLORS.textSubtitle}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={300}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheet = StyleSheet.create({
  backdrop:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  kavWrapper:         { justifyContent: 'flex-end' },
  container:          { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  handle:             { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  title:              { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.textStrong },
  cancelBtn:          { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textSubtitle },
  publishBtn:         { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.primary },
  publishBtnDisabled: { color: '#CCC' },
  photoArea:          { margin: 16, borderRadius: 14, overflow: 'hidden', height: 220, backgroundColor: COLORS.lightGray },
  photoPreview:       { width: '100%', height: '100%' },
  photoEditBadge:     { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16, padding: 6 },
  photoPlaceholder:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoPlaceholderText:{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSubtitle },
  captionRow:         { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  avatar:             { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.lightGray },
  captionInput:       { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textStrong, minHeight: 44, maxHeight: 100, textAlignVertical: 'top' },
});

// ── TabsRoot ──────────────────────────────────────────────────────────────────
function TabsRoot({ route }) {
  const navigation  = useNavigation();
  const insets      = useSafeAreaInsets();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState('feed');
  const feedRef   = useRef(null);
  const groupsRef = useRef(null);
  const scrollRef = useRef(null);
  const intentRef = useRef({});

  // navPosition = índice fracionário (0..3) — fonte única da verdade da navbar.
  // Bubble e cor dos ícones leem deste valor → sincronia perfeita.
  const navPosition = useRef(new Animated.Value(0)).current;
  // Flag: true quando o movimento veio de clique (não deve reagir ao onScroll)
  const isProgrammatic = useRef(false);

  const activeIndex = SWIPE_TABS.indexOf(activeTab);

  useEffect(() => {
    if (route.params?.switchTab) goToTab(route.params.switchTab);
  }, [route.params?.switchTab]);

  // ── Clique na navbar: troca de conteúdo instantânea + animação só da bubble
  const goToTab = (tabKey) => {
    const idx = SWIPE_TABS.indexOf(tabKey);
    if (idx < 0) return;

    // Já está na aba? → rola para o topo e dá refresh
    if (tabKey === activeTab) {
      if (tabKey === 'feed') feedRef.current?.scrollToTopAndRefresh?.();
      if (tabKey === 'groups') groupsRef.current?.scrollToTopAndRefresh?.();
      return;
    }

    setActiveTab(tabKey);
    // Marca como programático para o onScroll ignorar durante a troca
    isProgrammatic.current = true;
    // Conteúdo troca SEM animação de slide
    scrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: false });
    // Navbar anima suavemente até o índice alvo
    Animated.timing(navPosition, {
      toValue: idx,
      duration: 280,
      useNativeDriver: true,
    }).start(() => { isProgrammatic.current = false; });
  };

  const handlePublished = (newPost) => {
    goToTab('feed');
    feedRef.current?.prependPost(newPost);
  };

  // ── Scroll manual: o gesto controla a navbar em tempo real ────────────────
  const handleScroll = (e) => {
    if (isProgrammatic.current) return; // ignora durante clique
    const x = e.nativeEvent.contentOffset.x;
    navPosition.setValue(x / SCREEN_WIDTH);
  };

  const handleScrollEnd = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_WIDTH);
    const tab = SWIPE_TABS[idx] ?? 'feed';
    if (tab !== activeTab) setActiveTab(tab);
  };

  const tabPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        const absDx = Math.abs(gesture.dx);
        const absDy = Math.abs(gesture.dy);
        if (absDx < 12 && absDy < 12) return false;

        const horizontalClear = absDx > 20 && absDx > absDy * 1.35;
        const verticalClear = absDy > 20 && absDy > absDx * 1.2;
        intentRef.current = { horizontalClear, verticalClear };
        return horizontalClear;
      },
      onPanResponderRelease: (_, gesture) => {
        const absDx = Math.abs(gesture.dx);
        const absDy = Math.abs(gesture.dy);
        const horizontalClear = absDx > 40 && absDx > absDy * 1.35;
        if (!horizontalClear) return;

        const nextIndex = Math.max(0, Math.min(SWIPE_TABS.length - 1, activeIndex + (gesture.dx < 0 ? 1 : -1)));
        const nextTab = SWIPE_TABS[nextIndex];
        if (nextTab && nextTab !== activeTab) goToTab(nextTab);
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>

        {/* Header superior: + | logo | busca */}
        <TopHeader
          onAdd={() => navigation.navigate('AddMeal')}
          onSearch={() => navigation.navigate('Search')}
        />

        <View style={styles.content}>
          <View style={{ flex: 1 }} {...tabPanResponder.panHandlers}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={handleScroll}
              onMomentumScrollEnd={handleScrollEnd}
              directionalLockEnabled
              decelerationRate="fast"
              nestedScrollEnabled
              style={{ flex: 1 }}
            >
              <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                <FeedTab navigation={navigation} feedRef={feedRef} />
              </View>
              <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                <GroupsTab navigation={navigation} groupsRef={groupsRef} goToTab={goToTab} />
              </View>
              <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                <SuggestionsTab />
              </View>
              <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                <ProfileTab navigation={navigation} />
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Navbar animada — lê navPosition (índice fracionário) */}
        <AnimatedNavbar
          navPosition={navPosition}
          activeIndex={activeIndex}
          screenWidth={SCREEN_WIDTH}
          onTabPress={goToTab}
          insets={insets}
        />
      </View>
    </View>
  );
}

// ── MainAppScreen ─────────────────────────────────────────────────────────────
export default function MainAppScreen() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="TabsRoot"      component={TabsRoot} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Stack.Screen name="PostDetail"    component={PostDetailScreen} />
      <Stack.Screen name="FollowList"    component={FollowListScreen} />
      <Stack.Screen name="Search"        component={SearchScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="AddMeal"        component={AddMealScreen} options={{ animation: 'fade', animationDuration: 250 }} />
      <Stack.Screen name="AddCaption"     component={AddCaptionScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="EditProfile"    component={EditProfileScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Goal"            component={GoalScreen} />
      <Stack.Screen name="CaloricData"     component={CaloricDataScreen} />
      <Stack.Screen name="GroupDetail"     component={GroupDetailScreen} />
      <Stack.Screen name="ReportsCenter"   component={ReportsCenterScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="GroupChat"
        component={GroupChatScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          animationDuration: 200,
        }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  content:   { flex: 1 },
});

const navStyles = StyleSheet.create({
  // ── Header superior ──────────────────────────────────────────────
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    backgroundColor: COLORS.background,
  },
  headerLogo: { height: 30, width: 110 },

  // ── Navbar flutuante moderna ─────────────────────────────────────
  navWrapper: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'transparent',
    paddingTop: 6,
    paddingHorizontal: 16,
  },
  navBar: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  itemPill: {
    position: 'absolute',
    width: 52,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF1EB',
  },
  bubble: {
    position: 'absolute',
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF1EB',
    top: 8,
  },
  navItem: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
