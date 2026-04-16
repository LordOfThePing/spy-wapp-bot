export function validateImpostorCount(impostorCount: number, playerCount: number): void {
  if (!Number.isInteger(impostorCount) || impostorCount < 1) {
    throw new Error("La cantidad de impostores debe ser un entero mayor o igual a 1.");
  }
  if (impostorCount >= playerCount) {
    throw new Error("La cantidad de impostores debe ser menor que la cantidad de jugadores.");
  }
}
