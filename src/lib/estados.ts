/** Copy de interfaz para los estados. Nunca se muestra un color sin su texto. */

import type { Estado } from './tipos';

/** Texto corto para chips. */
export function textoEstado(estado: Estado): string {
  switch (estado) {
    case 'excedido':
      return 'Te has pasado';
    case 'aviso':
      return 'Al límite';
    default:
      return 'Vas bien';
  }
}

export function claseChip(estado: Estado): string {
  return `chip chip--${estado}`;
}
