// src/hooks/useStreak.js
//
// Calcula e persiste o novo streak após um post ser criado.
// Agora também grava last_streak_update para permitir validação on-entry.
//
// Regras de negócio (baseadas em last_streak_update do profile):
//   - last_streak_update === hoje     → já postou hoje, mantém streak
//   - last_streak_update === ontem    → sequência mantida, streak + 1
//   - last_streak_update < ontem     → sequência quebrada, streak = 1
//   - sem last_streak_update          → primeiro post, streak = 1

import { supabase } from '../../supabase';

// Retorna 'YYYY-MM-DD' no fuso local
function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T00:00:00');
  const b = new Date(dateStrB + 'T00:00:00');
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Calcula e persiste o novo streak após um post ser criado.
 * @param {string} userId
 * @param {object} profile  — perfil atual com streak e last_streak_update
 * @returns {{ streak: number, last_streak_update: string }} novos valores
 */
export async function processStreak(userId, profile) {
  try {
    const today          = toLocalDateStr(new Date());
    const lastUpdate     = profile?.last_streak_update ?? null;
    const currentStreak  = profile?.streak == null ? null : Number(profile.streak);

    let newStreak;

    if (currentStreak == null || currentStreak <= 0 || !lastUpdate) {
      // Primeiro post do usuário ou perfil ainda sem streak confiável
      newStreak = 1;
    } else {
      const diffDays = daysBetween(lastUpdate, today);

      if (diffDays === 0) {
        // Já postou hoje — mantém streak, não atualiza last_streak_update
        return { streak: currentStreak, last_streak_update: lastUpdate };
      } else if (diffDays === 1) {
        // Post consecutivo — incrementa
        newStreak = currentStreak + 1;
      } else {
        // Quebrou a sequência — recomeça
        newStreak = 1;
      }
    }

    // Persiste streak + data do update
    const { error } = await supabase
      .from('profiles')
      .update({ streak: newStreak, last_streak_update: today })
      .eq('id', userId);

    if (error) throw error;

    return { streak: newStreak, last_streak_update: today };
  } catch (err) {
    console.warn('useStreak.processStreak:', err.message);
    return { streak: profile?.streak == null ? 0 : Number(profile.streak), last_streak_update: profile?.last_streak_update ?? null };
  }
}
