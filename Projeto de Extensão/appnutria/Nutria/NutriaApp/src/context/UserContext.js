// src/context/UserContext.js

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [session,  setSession]  = useState(null);
  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);

  // Ref que impede o onAuthStateChange de atuar durante a inicialização.
  // Problema anterior:
  //   1. getSession() roda → ainda não terminou
  //   2. onAuthStateChange dispara INITIAL_SESSION → chama setSession()
  //      → re-render com session preenchida mas profile=null
  //      → App.js vê session+sem profile → pisca tela de onboarding
  //   3. fetchProfile termina → profile chega → App.js corrige a rota
  //
  // Solução:
  //   Inicializamos de forma totalmente atômica em initializeAuth():
  //   buscamos sessão e perfil juntos, só depois chamamos setSession+setProfile
  //   de uma vez. O onAuthStateChange fica bloqueado durante esse processo
  //   via flag `isInitializing`, e só atua em eventos posteriores
  //   (login real, logout, token refresh).
  const isInitializing = useRef(true);

  useEffect(() => {
    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        // Ignora o INITIAL_SESSION — já tratado em initializeAuth()
        if (isInitializing.current) return;

        if (s) {
          // Login real ou token refresh: busca perfil antes de setar estado
          const profileData = await loadProfile(s.user.id);
          setSession(s);
          setProfile(profileData);
        } else {
          // Logout
          setSession(null);
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Inicialização atômica ──────────────────────────────────────────────────
  // Busca sessão + perfil antes de fazer qualquer setSession ou setProfile.
  // Isso garante que o App.js só renderiza o navigator quando ambos estão prontos,
  // eliminando o flash de tela entre estados intermediários.
  const initializeAuth = async () => {
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        const profileData = await loadProfile(s.user.id);
        setSession(s);
        setProfile(profileData);
      }
    } catch (err) {
      console.warn('UserContext.initializeAuth:', err.message);
    } finally {
      isInitializing.current = false;
      setLoading(false);  // só aqui o App.js recebe o sinal para renderizar
    }
  };

  // ── Busca o perfil sem alterar estado (retorna o dado) ────────────────────
  const loadProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return normalizeProfile(data);
    } catch (err) {
      console.warn('UserContext.loadProfile:', err.message);
      return null;
    }
  };

  // ── Atualiza perfil no Supabase e no contexto ─────────────────────────────
  const updateProfile = async (fields) => {
    if (!session?.user?.id) return { error: 'Sem sessão ativa.' };
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(fields)
        .eq('id', session.user.id)
        .select()
        .single();

      if (error) throw error;
      const normalized = normalizeProfile(data);
      setProfile(prev => ({ ...prev, ...normalized }));
      return { data: normalized };
    } catch (err) {
      console.warn('UserContext.updateProfile:', err.message);
      return { error: err.message };
    }
  };

  // ── Upload de avatar (Uint8Array — compatível com RN/Hermes) ──────────────
  const uploadAvatar = async (uri) => {
    if (!session?.user?.id) return { error: 'Sem sessão ativa.' };
    try {
      const userId   = session.user.id;
      const base64   = await uriToBase64(uri);
      const binary   = atob(base64);
      const bytes    = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const filePath = `${userId}-avatar-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, bytes, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      await updateProfile({ avatar_url: urlData.publicUrl });
      return { url: urlData.publicUrl };
    } catch (err) {
      console.warn('UserContext.uploadAvatar:', err.message);
      return { error: err.message };
    }
  };

  // ── Expõe fetchProfile publicamente (usado por ProfileTab após edições) ───
  const fetchProfile = async (userId) => {
    const data = await loadProfile(userId ?? session?.user?.id);
    if (data) setProfile(data);
  };

  return (
    <UserContext.Provider value={{
      session,
      profile,
      setProfile,
      loading,
      fetchProfile,
      updateProfile,
      uploadAvatar,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser deve ser usado dentro de <UserProvider>');
  return ctx;
}

// ── Helper: URI → base64 puro (sem prefixo data:...) ─────────────────────────
function uriToBase64(uri) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror  = reject;
      reader.readAsDataURL(xhr.response);
    };
    xhr.onerror      = reject;
    xhr.open('GET', uri);
    xhr.responseType = 'blob';
    xhr.send();
  });
}

function normalizeProfile(profile) {
  if (!profile) return profile;

  return {
    ...profile,
    streak: profile.streak == null ? null : Number(profile.streak),
    tdee: profile.tdee == null ? null : Number(profile.tdee),
    calorie_target: profile.calorie_target == null ? null : Number(profile.calorie_target),
  };
}
