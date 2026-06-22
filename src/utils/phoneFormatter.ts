/**
 * 전화번호 문자열에서 숫자만 추출하여 미국 전화번호 형식(3자리-3자리-4자리)으로 포맷팅합니다.
 * @param phone 정제할 전화번호 문자열
 */
export function formatUSPhone(phone: string): string {
  // 숫자가 아닌 모든 문자 제거
  const clean = phone.replace(/\D/g, '');
  
  if (clean.length === 0) {
    return '';
  }
  
  // 3자리 이하 (예: 123)
  if (clean.length <= 3) {
    return clean;
  }
  
  // 6자리 이하 (예: 123-456)
  if (clean.length <= 6) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  
  // 10자리 이하 (예: 123-456-7890)
  if (clean.length <= 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  
  // 10자리를 초과하는 경우 10자리까지만 포맷팅하여 반환하거나 초과분을 하이픈 뒤로 붙임
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 10)}`;
}

/**
 * 전화번호에서 하이픈 등 숫자가 아닌 모든 문자를 제거합니다. (DB 저장용)
 * @param phone 정제할 전화번호 문자열
 */
export function stripPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
