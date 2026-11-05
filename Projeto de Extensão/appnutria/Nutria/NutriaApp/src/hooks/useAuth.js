// src/hooks/useAuth.js
//
// Hook centralizado de autenticação do NutriaApp — MVP.
// Escopo: exclusivamente e-mail + senha via Supabase.

import { useState } from 'react';
import { supabase } from '../../supabase';

export function useAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const clearError = () => setError(null);

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  const signInWithEmail = async (email, password) => {
    clearError();
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) throw authError;
      return { user: data.user, session: data.session };
    } catch (err) {
      const msg = friendlyError(err.message);
      setError(msg);
      return { user: null, session: null, error: msg };
    } finally {
      setLoading(false);
    }
  };

  // ── CADASTRO ──────────────────────────────────────────────────────────────
  // O Supabase tem dois comportamentos dependendo do painel:
  //
  //   (A) "Confirm email" DESATIVADO (recomendado para MVP):
  //       → retorna { user, session } preenchidos → navegamos direto
  //
  //   (B) "Confirm email" ATIVADO:
  //       → retorna { user, session: null } → precisamos informar o usuário
  //
  // Para DESATIVAR no Supabase:
  //   Authentication → Providers → Email → desmarque "Confirm email"
  //
  // O hook retorna um campo extra `needsConfirmation: true` no caso (B)
  // para que a tela possa exibir uma mensagem amigável em vez de travar.

  const signUpWithEmail = async ({ email, password, username, fullName }) => {
    clearError();
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            // Esses campos chegam ao trigger handle_new_user via raw_user_meta_data
            username:   username.trim().toLowerCase(),
            full_name:  fullName.trim(),
            avatar_url: null,
          },
        },
      });

      if (authError) throw authError;

      // Caso (B): usuário criado mas e-mail ainda não confirmado
      if (data.user && !data.session) {
        return { user: data.user, session: null, needsConfirmation: true };
      }

      // Caso (A): cadastro + login automático — fluxo normal do MVP
      return { user: data.user, session: data.session, needsConfirmation: false };

    } catch (err) {
      const msg = friendlyError(err.message);
      setError(msg);
      return { user: null, session: null, error: msg };
    } finally {
      setLoading(false);
    }
  };

  // ── LOGOUT ────────────────────────────────────────────────────────────────
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    loading,
    error,
    clearError,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  };
}

// ── Mensagens de erro amigáveis em português ──────────────────────────────────
function friendlyError(message = '') {
  if (message.includes('Invalid login credentials'))
    return 'E-mail ou senha incorretos.';
  if (message.includes('Email not confirmed'))
    return 'Confirme seu e-mail antes de entrar.';
  if (message.includes('User already registered'))
    return 'Este e-mail já está cadastrado.';
  if (message.includes('over_email_send_rate_limit') || message.includes('email rate limit'))
    return 'Muitas tentativas. Aguarde alguns segundos e tente novamente.';
  if (message.includes('Password should be at least'))
    return 'A senha deve ter no mínimo 6 caracteres.';
  if (message.includes('Unable to validate email'))
    return 'E-mail inválido.';
  if (message.includes('Network request failed'))
    return 'Sem conexão com a internet.';
  return message || 'Ocorreu um erro. Tente novamente.';
}
