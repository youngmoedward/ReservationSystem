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

