'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '../providers'
import { useLanguage } from '@/app/LanguageContext'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Layers, Save, RefreshCw, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react'

export interface Therapist {
  id: number
  name: string
  is_active: boolean
  massage_type?: 'dry' | 'wet' | 'both' | string
}

export interface TherapistPriority {
  id?: number
  therapist_id: number
  service_type: 'wet' | 'dry' // 'wet': 1F Bath Service, 'dry': 2F Massage Service
  day_of_week: number // 0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri, 5: Sat, 6: Sun
  priority_val: string // '1', '2', '3', ..., 'x'
}

const DAYS_OF_WEEK = [
  { key: 0, short: 'Mon', full: '월요일' },
  { key: 1, short: 'Tue', full: '화요일' },
  { key: 2, short: 'Wed', full: '수요일' },
  { key: 3, short: 'Thu', full: '목요일' },
  { key: 4, short: 'Fri', full: '금요일' },
  { key: 5, short: 'Sat', full: '토요일' },
  { key: 6, short: 'Sun', full: '일요일' },
]

const PRIORITY_OPTIONS = ['x', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

export default function PriorityPage() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { language } = useLanguage()

  const [therapists, setTherapists] = useState<Therapist[]>([])
  // priorityMap: key = `${therapistId}_${serviceType}_${dayOfWeek}`, val = priority_val ('1', 'x', etc.)
  const [priorityMap, setPriorityMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 1. 마사지사 명단 및 기존 우선순위 조회
  const fetchData = async () => {
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      // 마사지사 목록 (활성화된 마사지사)
      const { data: tData, error: tErr } = await supabase
        .from('therapists')
        .select('id, name, is_active, massage_type')
        .order('id', { ascending: true })

      if (tErr) throw tErr
      const activeTherapists = (tData || []).filter((t: any) => t.is_active !== false)
      setTherapists(activeTherapists)

      // 우선순위 저장 데이터 조회
      const { data: pData, error: pErr } = await supabase
        .from('therapist_priorities')
        .select('*')

      const newMap: Record<string, string> = {}

      if (!pErr && pData) {
        pData.forEach((row: TherapistPriority) => {
          const key = `${row.therapist_id}_${row.service_type}_${row.day_of_week}`
          newMap[key] = row.priority_val || 'x'
        })
      }

      setPriorityMap(newMap)
    } catch (err: any) {
      console.warn('Failed to load therapist priorities:', err)
      // 테이블이 미생성된 상태라도 기본 UI는 작동되도록 처리
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. 셀 우선순위 값 변경 핸들러
  const handlePriorityChange = (therapistId: number, serviceType: 'wet' | 'dry', dayOfWeek: number, value: string) => {
    const key = `${therapistId}_${serviceType}_${dayOfWeek}`
    setPriorityMap(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // 3. 일괄 저장 핸들러
  const handleSaveAll = async () => {
    setSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const payload: TherapistPriority[] = []

    // 습식 마사지사 (wet / both)
    const wetTherapists = therapists.filter(t => t.massage_type !== 'dry')
    wetTherapists.forEach(t => {
      DAYS_OF_WEEK.forEach(day => {
        const key = `${t.id}_wet_${day.key}`
        payload.push({
          therapist_id: t.id,
          service_type: 'wet',
          day_of_week: day.key,
          priority_val: priorityMap[key] || 'x'
        })
      })
    })

    // 건식 마사지사 (dry / both)
    const dryTherapists = therapists.filter(t => t.massage_type !== 'wet')
    dryTherapists.forEach(t => {
      DAYS_OF_WEEK.forEach(day => {
        const key = `${t.id}_dry_${day.key}`
        payload.push({
          therapist_id: t.id,
          service_type: 'dry',
          day_of_week: day.key,
          priority_val: priorityMap[key] || 'x'
        })
      })
    })

    try {
      const { error } = await supabase
        .from('therapist_priorities')
        .upsert(payload, { onConflict: 'therapist_id,service_type,day_of_week' })

      if (error) {
        if (error.message.includes('relation "public.therapist_priorities" does not exist') || error.code === '42P01') {
          throw new Error(
            language === 'ko'
              ? 'therapist_priorities 테이블이 DB에 생성되어 있지 않습니다. SQL 마이그레이션을 실행해주세요.'
              : 'therapist_priorities table does not exist in Database.'
          )
        }
        throw error
      }

      setSuccessMsg(language === 'ko' ? '요일별 우선순위 설정이 성공적으로 저장되었습니다!' : 'Priorities saved successfully!')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      console.error('Error saving priorities:', err)
      setErrorMsg(err.message || (language === 'ko' ? '우선순위 저장 중 오류가 발생했습니다.' : 'Failed to save priorities.'))
    } finally {
      setSaving(false)
    }
  }

  // 매니저 전용 권한 체크
  if (currentUser.role !== 'manager') {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl max-w-lg mx-auto mt-10 shadow-sm">
          <ShieldAlert className="w-12 h-12 mx-auto mb-3 animate-bounce" />
          <h3 className="text-base font-extrabold">
            {language === 'ko' ? '접근 권한이 없습니다.' : 'Access Denied.'}
          </h3>
          <p className="text-xs mt-1 text-rose-600">
            {language === 'ko'
              ? '우선순위 관리 메뉴는 Manager(관리자) 전용 기능입니다.'
              : 'Priority Management is only accessible for Managers.'}
          </p>
        </div>
      </DashboardLayout>
    )
  }

  // 1F 습식 마사지사 목록 (wet 또는 both)
  const wetTherapists = therapists.filter(t => t.massage_type === 'wet' || t.massage_type === 'both' || !t.massage_type)
  // 2F 건식 마사지사 목록 (dry 또는 both)
  const dryTherapists = therapists.filter(t => t.massage_type === 'dry' || t.massage_type === 'both' || !t.massage_type)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 & 타이틀 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-blue-950 flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-700" />
              {language === 'ko' ? '마사지사 요일별 우선순위 관리' : 'Therapist Daily Priority Management'}
            </h2>
            <p className="text-xs text-stone-500 mt-1 font-semibold">
              {language === 'ko'
                ? '습식(1F Bath) 및 건식(2F Massage) 마사지사의 요일별 배정 우선순위(1, 2, 3...) 및 휴무(x)를 관리합니다.'
                : 'Manage daily assignment priority (1, 2, 3...) and day-off (x) for Wet and Dry therapists.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-2 rounded-xl text-stone-600 bg-stone-100 hover:bg-stone-200 border border-stone-300 transition-colors"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white shadow-md px-5 py-2.5 text-xs font-bold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving
                ? (language === 'ko' ? '저장 중...' : 'Saving...')
                : (language === 'ko' ? '우선순위 설정 저장' : 'Save Priorities')}
            </button>
          </div>
        </div>

        {/* 상태 메시지 알림 */}
        {errorMsg && (
          <div className="p-3.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs flex items-center gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2 shadow-xs animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-bold">{successMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="h-64 flex items-center justify-center border border-stone-200 bg-stone-50 rounded-2xl">
            <span className="text-xs text-stone-500 animate-pulse font-bold">
              {language === 'ko' ? '마사지사 및 우선순위 정보 로딩 중...' : 'Loading priority matrix...'}
            </span>
          </div>
        ) : (
          <div className="space-y-8">
            {/* =========================================================
                SECTION 1: 1F Bath Service (습식 마사지사 우선순위 테이블)
               ========================================================= */}
            <div className="bg-white border border-sky-300/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-sky-100/90 border-b border-sky-300 px-5 py-3.5 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-sky-950 flex items-center gap-2">
                  <span>🧴</span>
                  <span>1F Bath Service</span>
                  <span className="text-xs font-bold text-sky-700 bg-sky-200/80 px-2 py-0.5 rounded-full border border-sky-300/80">
                    {language === 'ko' ? '습식 마사지사' : 'Wet Service'}
                  </span>
                </h3>
                <span className="text-[11px] font-bold text-sky-800">
                  {wetTherapists.length} {language === 'ko' ? '명 등록됨' : 'Therapists'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-sky-50/70 border-b border-sky-200 text-xs font-bold text-sky-950">
                      <th className="py-3 px-4 text-left w-36 border-r border-sky-200">
                        {language === 'ko' ? '마사지사' : 'Therapist'}
                      </th>
                      {DAYS_OF_WEEK.map(day => (
                        <th key={day.key} className="py-3 px-3 w-28 border-r border-sky-200 last:border-r-0">
                          {day.short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-xs">
                    {wetTherapists.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-stone-400 text-xs">
                          {language === 'ko' ? '등록된 습식 마사지사가 없습니다.' : 'No Wet therapists found.'}
                        </td>
                      </tr>
                    ) : (
                      wetTherapists.map(t => (
                        <tr key={`wet_${t.id}`} className="hover:bg-sky-50/40 transition-colors">
                          <td className="py-2.5 px-4 text-left font-black text-stone-800 bg-stone-50/70 border-r border-stone-200">
                            {t.name}
                          </td>
                          {DAYS_OF_WEEK.map(day => {
                            const key = `${t.id}_wet_${day.key}`
                            const currentVal = priorityMap[key] || 'x'
                            const isOff = currentVal === 'x'

                            return (
                              <td key={day.key} className="p-1 border-r border-stone-200 last:border-r-0">
                                <select
                                  value={currentVal}
                                  onChange={(e) => handlePriorityChange(t.id, 'wet', day.key, e.target.value)}
                                  className={`w-full text-center py-2 px-1 rounded-xl font-black text-xs transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer ${
                                    isOff
                                      ? 'bg-stone-300 text-stone-600 border border-stone-400/80 shadow-inner'
                                      : 'bg-white text-stone-950 border border-stone-300 shadow-xs'
                                  }`}
                                >
                                  {PRIORITY_OPTIONS.map(opt => (
                                    <option key={opt} value={opt} className="bg-white text-stone-900 font-bold">
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* =========================================================
                SECTION 2: 2F Massage Service (건식 마사지사 우선순위 테이블)
               ========================================================= */}
            <div className="bg-white border border-amber-300/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-amber-100/90 border-b border-amber-300 px-5 py-3.5 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-amber-950 flex items-center gap-2">
                  <span>🧘‍♂️</span>
                  <span>2F Massage Service</span>
                  <span className="text-xs font-bold text-amber-700 bg-amber-200/80 px-2 py-0.5 rounded-full border border-amber-300/80">
                    {language === 'ko' ? '건식 마사지사' : 'Dry Service'}
                  </span>
                </h3>
                <span className="text-[11px] font-bold text-amber-800">
                  {dryTherapists.length} {language === 'ko' ? '명 등록됨' : 'Therapists'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-amber-50/70 border-b border-amber-200 text-xs font-bold text-amber-950">
                      <th className="py-3 px-4 text-left w-36 border-r border-amber-200">
                        {language === 'ko' ? '마사지사' : 'Therapist'}
                      </th>
                      {DAYS_OF_WEEK.map(day => (
                        <th key={day.key} className="py-3 px-3 w-28 border-r border-amber-200 last:border-r-0">
                          {day.short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-xs">
                    {dryTherapists.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-stone-400 text-xs">
                          {language === 'ko' ? '등록된 건식 마사지사가 없습니다.' : 'No Dry therapists found.'}
                        </td>
                      </tr>
                    ) : (
                      dryTherapists.map(t => (
                        <tr key={`dry_${t.id}`} className="hover:bg-amber-50/40 transition-colors">
                          <td className="py-2.5 px-4 text-left font-black text-stone-800 bg-stone-50/70 border-r border-stone-200">
                            {t.name}
                          </td>
                          {DAYS_OF_WEEK.map(day => {
                            const key = `${t.id}_dry_${day.key}`
                            const currentVal = priorityMap[key] || 'x'
                            const isOff = currentVal === 'x'

                            return (
                              <td key={day.key} className="p-1 border-r border-stone-200 last:border-r-0">
                                <select
                                  value={currentVal}
                                  onChange={(e) => handlePriorityChange(t.id, 'dry', day.key, e.target.value)}
                                  className={`w-full text-center py-2 px-1 rounded-xl font-black text-xs transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer ${
                                    isOff
                                      ? 'bg-stone-300 text-stone-600 border border-stone-400/80 shadow-inner'
                                      : 'bg-white text-stone-950 border border-stone-300 shadow-xs'
                                  }`}
                                >
                                  {PRIORITY_OPTIONS.map(opt => (
                                    <option key={opt} value={opt} className="bg-white text-stone-900 font-bold">
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
