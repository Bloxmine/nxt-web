/** URL of a FatCow icon (CC BY 3.0, http://www.fatcow.com/free-icons). */
export function iconUrl(name: string, size: 16 | 32 = 16): string {
  return `${import.meta.env.BASE_URL}icons/${size}/${name}.png`;
}
