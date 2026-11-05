// src/hooks/useStreakValidation.js
//
// Validação on-entry do streak do usuário logado.
// Usa a RPC get_corrected_streak que já corrige o banco server-side.
// Também verifica streak_reset_pending para exibir popup visual.
//
// Retorna:
//   validateStreak()      — chama a RPC e sincroniza o contexto
//   showStreakPopup        — boolean: true quando deve exibir o popup
//   dismissStreakPopup()   — limpa o flag no banco e fecha o popup

import { useState, useCallback } from 'react';
import { supabase } from '../../supabase';
import { useUser } from '../context/UserContext';

export function useStreakValidation() {
  const { session, profile, setProfile } = useUser();
  const [showStreakPopup, setShowStreakPopup] = useState(false);

  // ── Valida o streak do usuário logado ─────────────────────────────────────
  // A RPC faz tudo server-side:
  //   - Calcula diffDays a partir de last_streak_update
  //   - Se > 1 dia: zera streak, seta streak_reset_pending = true no banco
  //   - Retorna o streak correto
  // Depois verificamos streak_reset_pending para exibir o popup.
  const validateStreak = useCallback(async () => {
    if (!session?.user?.id || !profile) return;

    try {
      // 1. Chama RPC — corrige banco se necessário, retorna streak atual
      const { data: correctedStreak, error: rpcError } = await supabase
        .rpc('get_corrected_streak', { p_user_id: session.user.id });

      if (rpcError) throw rpcError;

      // 2. Sincroniza contexto com valor corrigido
      if (correctedStreak !== profile.streak) {
        setProfile(prev => ({ ...prev, streak: correctedStreak }));
      }

      // 3. Verifica se há popup pendente (foi resetado enquanto estava offline)
      const { data: freshProfile, error: profileError } = await supabase
        .from('profiles')
        .select('streak_reset_pending')
        .eq('id', session.user.id)
        .single();

      if (profileError) throw profileError;

      if (freshProfile?.streak_reset_pending) {
        setShowStreakPopup(true);
      }
    } catch (err) {
      console.warn('useStreakValidation.validateStreak:', err.message);
    }
  }, [session?.user?.id, profile?.streak, profile?.last_streak_update]);

  // ── Fecha o popup e limpa o flag no banco ─────────────────────────────────
  const dismissStreakPopup = useCallback(async () => {
    setShowStreakPopup(false);
    if (!session?.user?.id) return;
    try {
      await supabase
        .from('profiles')
        .update({ streak_reset_pending: false })
        .eq('id', session.user.id);
    } catch (err) {
      console.warn('useStreakValidation.dismissStreakPopup:', err.message);
    }
  }, [session?.user?.id]);

  return { validateStreak, showStreakPopup, dismissStreakPopup };
}
