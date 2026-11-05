// src/utils/caloricCalc.js
//
// Fórmulas de Harris-Benedict (revisada por Mifflin-St Jeor)
// Extraídas diretamente do protótipo HTML.
//
// Fórmulas originais do protótipo:
//   Homens:   88.362 + (13.397 * kg) + (4.799 * cm) - (5.677 * anos)
//   Mulheres: 447.593 + (9.247 * kg) + (3.098 * cm) - (4.330 * anos)

/**
 * Calcula a Taxa Metabólica Basal (TMB).
 * @param {'male'|'female'} gender
 * @param {number} weight  - peso em kg
 * @param {number} height  - altura em cm
 * @param {number} age     - idade em anos
 * @returns {number} TMB em kcal
 */
export function calcTMB(gender, weight, height, age) {
  if (gender === 'male') {
    return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
  }
  return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
}

/**
 * Calcula o Gasto Energético Total Diário (TDEE).
 * @param {number} tmb
 * @param {number} activityFactor - multiplicador de atividade (1.2 ~ 1.9)
 * @returns {number} TDEE arredondado em kcal
 */
export function calcTDEE(tmb, activityFactor) {
  return Math.round(tmb * activityFactor);
}

/**
 * Calcula a meta calórica diária conforme o objetivo.
 * @param {number} tdee
 * @param {'Emagrecimento'|'massa'|'definir'} goal
 * @returns {number} meta em kcal
 */
export function calcTarget(tdee, goal) {
  switch (goal) {
    case 'Emagrecimento': return tdee - 500;
    case 'massa':         return tdee + 500;
    case 'definir':
    default:              return tdee;
  }
}

// Mapa de exibição dos objetivos (usado na WelcomeScreen)
export const GOAL_LABELS = {
  Emagrecimento: 'Emagrecimento',
  massa:         'Ganho de Massa',
  definir:       'Manutenção Calórica',
};

// Opções de nível de atividade (usado na CaloricDataScreen)
export const ACTIVITY_OPTIONS = [
  { label: 'Sedentário (pouco ou nenhum exercício)',       value: 1.2   },
  { label: 'Levemente Ativo (1-3 dias/semana)',            value: 1.375 },
  { label: 'Moderadamente Ativo (3-5 dias/semana)',        value: 1.55  },
  { label: 'Muito Ativo (6-7 dias/semana)',                value: 1.725 },
  { label: 'Extremamente Ativo (trabalho físico + treino)',value: 1.9   },
];
