// src/hooks/useAdmin.js
//
// Verifica se o usuário logado é administrador da plataforma (tabela
// public.admins — ver script SQL do MUST #1). Usado para exibir/ocultar
// a opção "Central de Denúncias" e proteger a tela por trás dela.
//
// Retorna:
//   isAdmin   — boolean (false até terminar de checar)
//   checking  — true enquanto a checagem ainda está em andamento

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useUser } from '../context/UserContext';

export function useAdmin() {
  const { session } = useUser();
  const userId = session?.user?.id;

  const [isAdmin,  setIsAdmin]  = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    if (!userId) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }

    setChecking(true);
    (async () => {
      try {
        // maybeSingle: se não houver linha, retorna null em vez de erro —
        // a policy "self_check_admin" só devolve a linha do próprio usuário.
        const { data, error } = await supabase
          .from('admins')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        if (alive) setIsAdmin(!!data);
      } catch (err) {
        console.warn('useAdmin:', err.message);
        if (alive) setIsAdmin(false);
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => { alive = false; };
  }, [userId]);

  return { isAdmin, checking };
}
