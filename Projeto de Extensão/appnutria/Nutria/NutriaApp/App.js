// App.js — Ponto de entrada principal do NutriaApp

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { UserProvider, useUser } from './src/context/UserContext';

import Onboarding1Screen  from './src/screens/Onboarding1Screen';
import Onboarding2Screen  from './src/screens/Onboarding2Screen';
import LoginScreen        from './src/screens/LoginScreen';
import RegisterScreen     from './src/screens/RegisterScreen';
import GoalScreen         from './src/screens/GoalScreen';
import CaloricDataScreen  from './src/screens/CaloricDataScreen';
import WelcomeScreen      from './src/screens/WelcomeScreen';
import ProfilePicScreen   from './src/screens/ProfilePicScreen';
import MainAppScreen      from './src/screens/MainAppScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen  from './src/screens/ResetPasswordScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { session, profile, loading } = useUser();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_700Bold,
  });

  // Spinner até fontes e perfil do Supabase estarem prontos
  if (!fontsLoaded || loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#FE4A01" />
      </View>
    );
  }

  // ── LÓGICA DE ROTEAMENTO ──────────────────────────────────────────────────
  //
  // Padrão recomendado pelo React Navigation para fluxos de autenticação:
  // renderizar GRUPOS DE TELAS condicionalmente em vez de usar initialRouteName
  // dinâmico. O Navigator sempre exibe a primeira tela do grupo ativo.
  //
  // Por que isso resolve o problema?
  //   - initialRouteName é lido apenas na montagem — se o profile chega depois,
  //     a rota não muda. Com grupos condicionais, qualquer mudança em `session`
  //     ou `profile` re-renderiza o Navigator e exibe o grupo correto.
  //   - Não depende de key/remontagem, evitando flashes de tela.
  //
  // DOIS TIPOS DE USUÁRIO — lógica de grupos:
  //
  //   Grupo 1 — SEM SESSÃO:
  //     Onboarding1 → Onboarding2 → Login / Register
  //     Exibido quando: !session
  //
  //   Grupo 2 — COM SESSÃO, ONBOARDING INCOMPLETO:
  //     Goal → CaloricData → Welcome → ProfilePic
  //     Exibido quando: session existe mas calorie_target não foi preenchido.
  //     Isso cobre apenas novos usuários que ainda não completaram o cadastro.
  //
  //   Grupo 3 — COM SESSÃO, ONBOARDING COMPLETO:
  //     MainApp (Feed direto)
  //     Exibido quando: session existe E calorie_target > 0
  //     Cobre QUALQUER login de conta existente, independente do dispositivo.

  const isLoggedIn        = !!session;
  const hasCompletedSetup = isLoggedIn && profile?.calorie_target > 0;
  const needsOnboarding   = isLoggedIn && !hasCompletedSetup;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>

        {!isLoggedIn && (
          // ── Grupo 1: Visitante ─────────────────────────────────────────
          <>
            <Stack.Screen name="Onboarding1"  component={Onboarding1Screen} />
            <Stack.Screen name="Onboarding2"  component={Onboarding2Screen} />
            <Stack.Screen name="Login"           component={LoginScreen} />
            <Stack.Screen name="Register"         component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword"   component={ForgotPasswordScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="ResetPassword"    component={ResetPasswordScreen}  options={{ animation: 'slide_from_right' }} />
          </>
        )}

        {needsOnboarding && (
          // ── Grupo 2: Logado, onboarding pendente (apenas novos usuários) ─
          <>
            <Stack.Screen name="Goal"         component={GoalScreen} />
            <Stack.Screen name="CaloricData"  component={CaloricDataScreen} />
            <Stack.Screen name="Welcome"      component={WelcomeScreen} />
            <Stack.Screen name="ProfilePic"   component={ProfilePicScreen} />
          </>
        )}

        {hasCompletedSetup && (
          // ── Grupo 3: Usuário completo → Feed direto ────────────────────
          <Stack.Screen name="MainApp" component={MainAppScreen} />
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UserProvider>
        <AppNavigator />
      </UserProvider>
    </GestureHandlerRootView>
  );
}
