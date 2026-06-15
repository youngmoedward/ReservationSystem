/**
 * Date 객체를 현지 타임존 기준의 YYYY-MM-DD 문자열로 변환합니다.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Date 객체를 현지 타임존 기준의 HH:MM 문자열로 변환합니다.
 */
export function toLocalTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Date 객체 또는 YYYY-MM-DD 문자열을 MM-DD-YYYY 형식의 디스플레이 문자열로 변환합니다.
 */
export function toUIDateString(date: Date | string): string {
  if (typeof date === 'string') {
    const parts = date.split('-')
    if (parts.length === 3 && parts[0].length === 4) {
      const [year, month, day] = parts
      return `${month}-${day}-${year}`
    }
  }
  
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return typeof date === 'string' ? date : ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${month}-${day}-${year}`
}

