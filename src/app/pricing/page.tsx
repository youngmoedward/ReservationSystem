'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '../providers'
import { useLanguage } from '@/app/LanguageContext'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Plus, Edit2, Trash2, Clock, Scale, DollarSign, RefreshCw, AlertCircle, X, Sparkles, Layers, ShieldAlert } from 'lucide-react'
import PinAuthModal, { PinAuthResult } from '@/components/common/PinAuthModal'

export type ServiceCategory = 'dry' | 'wet' | 'combo'

export interface PricingPlan {
  id: number
  name: string
  description: string
  category?: ServiceCategory
  price: number
  duration_minutes: number
  weight: number
  bath_price?: number
  bath_duration_minutes?: number
  bath_weight?: number
  massage_price?: number
  massage_duration_minutes?: number
  massage_weight?: number
  created_at: string
}

export default function PricingPage() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { language, t } = useLanguage()

  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 모달 제어 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null)

  // 입력 폼 상태
  const [category, setCategory] = useState<ServiceCategory>('combo')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  
  // 콤보용 개별 요금제 선택 드롭다운 상태
  const [selectedWetPlanId, setSelectedWetPlanId] = useState<string>('')
  const [selectedDryPlanId, setSelectedDryPlanId] = useState<string>('')

  // 적용 요금 & 전체 소요시간 & 전체 가중치
  const [totalPrice, setTotalPrice] = useState<number>(160)
  const [totalDuration, setTotalDuration] = useState<number>(90)
  const [totalWeight, setTotalWeight] = useState<number>(1.0)

  // 습식(Bath) 서비스 세부
  const [bathPrice, setBathPrice] = useState<number>(85)
  const [bathDuration, setBathDuration] = useState<number>(30)
  const [bathWeight, setBathWeight] = useState<number>(1.0)

  // 건식(Massage) 서비스 세부
  const [massagePrice, setMassagePrice] = useState<number>(110)
  const [massageDuration, setMassageDuration] = useState<number>(60)
  const [massageWeight, setMassageWeight] = useState<number>(1.0)

  const [formLoading, setFormLoading] = useState(false)

  // 1. 요금제 조회
  const fetchPlans = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await supabase
        .from('pricing_plans')
        .select('*')
        .order('id', { ascending: true })

      if (error) throw error
      if (data) setPlans(data as PricingPlan[])
    } catch (err: any) {
      console.error('Failed to fetch pricing plans:', err)
      setErrorMsg(language === 'ko' ? '요금제 데이터를 불러오는데 실패했습니다.' : 'Failed to fetch pricing plans.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. 폼 초기화 및 모달 닫기
  const closeFormModal = () => {
    setIsModalOpen(false)
    setIsEditing(false)
    setEditingPlanId(null)
    setCategory('combo')
    setName('')
    setDescription('')
    setSelectedWetPlanId('')
    setSelectedDryPlanId('')
    setTotalPrice(160)
    setTotalDuration(90)
    setTotalWeight(1.0)
    setBathPrice(85)
    setBathDuration(30)
    setBathWeight(1.0)
    setMassagePrice(110)
    setMassageDuration(60)
    setMassageWeight(1.0)
    setErrorMsg(null)
  }

  // 3. 신규 모달 열기
  const openNewPlanModal = () => {
    setIsEditing(false)
    setEditingPlanId(null)
    setCategory('combo')
    setName('')
    setDescription('')
    setSelectedWetPlanId('')
    setSelectedDryPlanId('')
    setTotalPrice(160)
    setTotalDuration(90)
    setTotalWeight(1.0)
    setBathPrice(85)
    setBathDuration(30)
    setBathWeight(1.0)
    setMassagePrice(110)
    setMassageDuration(60)
    setMassageWeight(1.0)
    setErrorMsg(null)
    setIsModalOpen(true)
  }

  // 4. 수정 모달 열기
  const openEditPlanModal = (plan: PricingPlan) => {
    setIsEditing(true)
    setEditingPlanId(plan.id)
    const cat = plan.category || 'combo'
    setCategory(cat)
    setName(plan.name)
    setDescription(plan.description || '')
    setTotalPrice(Number(plan.price) || 0)
    setTotalDuration(plan.duration_minutes || 0)
    setTotalWeight(Number(plan.weight) || 1.0)

    const bPrice = Number(plan.bath_price) || 0
    const bDuration = plan.bath_duration_minutes || 0
    const mPrice = Number(plan.massage_price) || 0
    const mDuration = plan.massage_duration_minutes || 0

    setBathPrice(bPrice)
    setBathDuration(bDuration)
    setBathWeight(Number(plan.bath_weight) || 1.0)

    setMassagePrice(mPrice)
    setMassageDuration(mDuration)
    setMassageWeight(Number(plan.massage_weight) || 1.0)

    // 기존 등록된 습식/건식 요금제 리스트에서 가격 및 시간이 일치하는 요금제 자동 매칭
    const matchedWet = plans.find(p =>
      p.id !== plan.id &&
      (p.category === 'wet' || (!p.category && p.bath_price && p.bath_price > 0)) &&
      (Number(p.bath_price || p.price) === bPrice && (p.bath_duration_minutes || p.duration_minutes) === bDuration)
    )
    const matchedDry = plans.find(p =>
      p.id !== plan.id &&
      (p.category === 'dry' || (!p.category && p.massage_price && p.massage_price > 0)) &&
      (Number(p.massage_price || p.price) === mPrice && (p.massage_duration_minutes || p.duration_minutes) === mDuration)
    )

    setSelectedWetPlanId(matchedWet ? String(matchedWet.id) : '')
    setSelectedDryPlanId(matchedDry ? String(matchedDry.id) : '')
    setErrorMsg(null)
    setIsModalOpen(true)
  }

  // 5. 카테고리 변경 핸들러
  const handleCategoryChange = (newCat: ServiceCategory) => {
    setCategory(newCat)
    setSelectedWetPlanId('')
    setSelectedDryPlanId('')
    if (newCat === 'dry') {
      setTotalPrice(massagePrice || 110)
      setTotalDuration(massageDuration || 60)
      setTotalWeight(massageWeight || 1.0)
    } else if (newCat === 'wet') {
      setTotalPrice(bathPrice || 85)
      setTotalDuration(bathDuration || 30)
      setTotalWeight(bathWeight || 1.0)
    } else if (newCat === 'combo') {
      recalculateComboDefaults(bathPrice, bathDuration, bathWeight, massagePrice, massageDuration, massageWeight)
    }
  }

  // 콤보 선택 시 합산 요금, 합산 시간, 합산 가중치 자동 계산 헬퍼
  const recalculateComboDefaults = (
    bPrice: number, bDur: number, bW: number,
    mPrice: number, mDur: number, mW: number
  ) => {
    setTotalPrice(bPrice + mPrice)
    setTotalDuration(bDur + mDur)
    setTotalWeight(Number((bW + mW).toFixed(2)))
  }

  // 습식 요금제 드롭다운 선택 시
  const handleSelectWetPlan = (planIdStr: string) => {
    setSelectedWetPlanId(planIdStr)
    if (!planIdStr) return
    const plan = plans.find(p => p.id === Number(planIdStr))
    if (plan) {
      const bP = Number(plan.bath_price || plan.price || 0)
      const bD = plan.bath_duration_minutes || plan.duration_minutes || 0
      const bW = Number(plan.bath_weight || plan.weight || 1.0)

      setBathPrice(bP)
      setBathDuration(bD)
      setBathWeight(bW)
      recalculateComboDefaults(bP, bD, bW, massagePrice, massageDuration, massageWeight)
    }
  }

  // 건식 요금제 드롭다운 선택 시
  const handleSelectDryPlan = (planIdStr: string) => {
    setSelectedDryPlanId(planIdStr)
    if (!planIdStr) return
    const plan = plans.find(p => p.id === Number(planIdStr))
    if (plan) {
      const mP = Number(plan.massage_price || plan.price || 0)
      const mD = plan.massage_duration_minutes || plan.duration_minutes || 0
      const mW = Number(plan.massage_weight || plan.weight || 1.0)

      setMassagePrice(mP)
      setMassageDuration(mD)
      setMassageWeight(mW)
      recalculateComboDefaults(bathPrice, bathDuration, bathWeight, mP, mD, mW)
    }
  }

  // 6. 등록 및 수정 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg(language === 'ko' ? '요금명을 입력해주세요.' : 'Please enter pricing plan name.')
      return
    }

    setFormLoading(true)
    setErrorMsg(null)

    // category 별 적용 요금, 시간, 가중치 최종 결정
    const finalPrice = category === 'dry' ? Number(massagePrice) : category === 'wet' ? Number(bathPrice) : Number(totalPrice)
    const finalDuration = category === 'dry' ? Number(massageDuration) : category === 'wet' ? Number(bathDuration) : Number(totalDuration)
    const finalWeight = category === 'dry' ? Number(massageWeight) : category === 'wet' ? Number(bathWeight) : Number(totalWeight)

    const payload = {
      name: name.trim(),
      description: description.trim(),
      category,
      price: finalPrice,
      duration_minutes: finalDuration,
      weight: finalWeight,
      bath_price: category === 'dry' ? 0 : Number(bathPrice),
      bath_duration_minutes: category === 'dry' ? 0 : Number(bathDuration),
      bath_weight: category === 'dry' ? 0 : Number(bathWeight),
      massage_price: category === 'wet' ? 0 : Number(massagePrice),
      massage_duration_minutes: category === 'wet' ? 0 : Number(massageDuration),
      massage_weight: category === 'wet' ? 0 : Number(massageWeight)
    }

    try {
      if (isEditing && editingPlanId !== null) {
        // 1차 시도: 신규 스키마 컬럼 포함 update
        let { error } = await supabase.from('pricing_plans').update(payload).eq('id', editingPlanId)

        // 만약 신규 컬럼이 DB에 아직 생성되지 않은 경우, 기본 필수 컬럼으로 2차 Fallback 저장
        if (error && (error.message.includes('column') || error.code === 'PGRST204')) {
          console.warn('Fallback to basic columns on update:', error.message)
          const fallbackPayload = {
            name: name.trim(),
            description: description.trim(),
            price: finalPrice,
            duration_minutes: finalDuration,
            weight: finalWeight
          }
          const res2 = await supabase.from('pricing_plans').update(fallbackPayload).eq('id', editingPlanId)
          if (res2.error) throw res2.error
        } else if (error) {
          throw error
        }
      } else {
        // 1차 시도: 신규 스키마 컬럼 포함 insert
        let { error } = await supabase.from('pricing_plans').insert(payload)

        // 만약 신규 컬럼이 DB에 아직 생성되지 않은 경우, 기본 필수 컬럼으로 2차 Fallback 저장
        if (error && (error.message.includes('column') || error.code === 'PGRST204')) {
          console.warn('Fallback to basic columns on insert:', error.message)
          const fallbackPayload = {
            name: name.trim(),
            description: description.trim(),
            price: finalPrice,
            duration_minutes: finalDuration,
            weight: finalWeight
          }
          const res2 = await supabase.from('pricing_plans').insert(fallbackPayload)
          if (res2.error) throw res2.error
        } else if (error) {
          throw error
        }
      }

      closeFormModal()
      await fetchPlans()
    } catch (err: any) {
      console.error('Error saving pricing plan:', err)
      setErrorMsg(`[DB Error] ${err.message || (language === 'ko' ? '요금제 저장 중 오류가 발생했습니다.' : 'Error saving pricing plan.')}`)
    } finally {
      setFormLoading(false)
    }
  }

  // 7. 삭제
  const handleDeleteClick = async (planId: number) => {
    const isConfirm = window.confirm(
      language === 'ko'
        ? '이 요금제를 정말로 삭제하시겠습니까?\n삭제 이력은 이력로그에 기록됩니다.'
        : 'Are you sure you want to delete this pricing plan?\nDeletion history will be logged.'
    )
    if (!isConfirm) return

    setLoading(true)
    setErrorMsg(null)
    try {
      const { error } = await supabase
        .from('pricing_plans')
        .delete()
        .eq('id', planId)

      if (error) throw error
      await fetchPlans()
    } catch (err: any) {
      console.error('Error deleting pricing plan:', err)
      setErrorMsg(language === 'ko' ? '요금제 삭제 중 오류가 발생했습니다.' : 'Error deleting pricing plan.')
    } finally {
      setLoading(false)
    }
  }

  // 카테고리 뱃지 렌더링 헬퍼
  const renderCategoryBadge = (cat?: ServiceCategory) => {
    switch (cat) {
      case 'dry':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100/90 text-amber-900 border border-amber-300">
            🧘‍♂️ {t('pricing.category.dry')}
          </span>
        )
      case 'wet':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100/90 text-sky-900 border border-sky-300">
            🧴 {t('pricing.category.wet')}
          </span>
        )
      case 'combo':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100/90 text-purple-900 border border-purple-300">
            ⚡ {t('pricing.category.combo')}
          </span>
        )
    }
  }

  // Manager 권한 접근 제한
  if (currentUser.role !== 'manager') {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl max-w-lg mx-auto mt-10 shadow-sm">
          <ShieldAlert className="w-12 h-12 mx-auto mb-3 animate-bounce text-rose-600" />
          <h3 className="text-base font-extrabold">
            {language === 'ko' ? '접근 권한이 없습니다.' : 'Access Denied.'}
          </h3>
          <p className="text-xs mt-1 text-rose-600">
            {language === 'ko'
              ? '요금 관리 메뉴는 Manager(총괄 관리자) 전용 메뉴입니다.'
              : 'Pricing Management is only accessible for Managers.'}
          </p>
        </div>
      </DashboardLayout>
    )
  }

  // 필터링된 습식/건식 요금제 목록
  const wetPlansList = plans.filter(p => p.category === 'wet' || (!p.category && p.bath_price && p.bath_price > 0))
  const dryPlansList = plans.filter(p => p.category === 'dry' || (!p.category && p.massage_price && p.massage_price > 0))

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 타이틀 */}
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <h2 className="text-lg font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
            <span className="text-blue-700">⚙️</span>
            {language === 'ko' ? '마사지 요금 및 서비스 유형 관리' : 'Pricing & Service Duration Management'}
          </h2>
          <button
            onClick={fetchPlans}
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 요금제 메인 보드 컨테이너 */}
        <div className="bg-[#f3edd7]/40 border border-stone-300 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-stone-700">
              📊 {language === 'ko' ? `등록된 요금제 명단 (${plans.length}개)` : `Registered Plans (${plans.length})`}
            </span>
            <button
              onClick={openNewPlanModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#2e7d32] hover:bg-[#1b5e20] text-white shadow-sm px-4 py-2.5 text-xs font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" />
              {language === 'ko' ? '신규 요금제 추가' : 'Add New Plan'}
            </button>
          </div>

          {/* 리스트 그리드 */}
          {loading ? (
            <div className="h-64 flex items-center justify-center border border-stone-200 bg-stone-100/40 rounded-2xl">
              <span className="text-xs text-stone-500 animate-pulse font-medium">
                {language === 'ko' ? '요금제를 불러오고 있습니다...' : 'Loading plans...'}
              </span>
            </div>
          ) : plans.length === 0 ? (
            <div className="p-8 text-center border border-stone-200 bg-stone-100/40 rounded-2xl text-stone-500 text-xs">
              {language === 'ko' ? '등록된 요금제가 없습니다. 신규 추가해 주세요.' : 'No pricing plans registered. Please add a new one.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const cat = plan.category || 'combo'
                return (
                  <div
                    key={plan.id}
                    className="bg-[#faf6e8]/90 border border-[#e3d7bd] p-5 rounded-2xl shadow-sm hover:border-emerald-600/50 hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden space-y-3"
                  >
                    {/* 상단 포인트 데코레이션 바 */}
                    <div className={`absolute top-0 inset-x-0 h-1.5 ${
                      cat === 'combo'
                        ? 'bg-purple-600 shadow-[0_1px_6px_rgba(147,51,234,0.3)]'
                        : cat === 'wet'
                          ? 'bg-sky-500'
                          : 'bg-amber-600'
                    }`} />

                    <div>
                      <div className="flex items-start justify-between gap-2 pt-1">
                        <div>
                          <h4 className="text-xs font-extrabold text-blue-900 group-hover:text-emerald-800 transition-colors">
                            {plan.name}
                          </h4>
                          <div className="mt-1">
                            {renderCategoryBadge(cat)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditPlanModal(plan)}
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-emerald-50 text-stone-500 hover:text-emerald-700 transition-colors border border-stone-200"
                            title="수정"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(plan.id)}
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-500 hover:text-rose-700 transition-colors border border-stone-200"
                            title="삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {plan.description && (
                        <p className="text-[10px] text-stone-600 mt-2 font-semibold line-clamp-2 leading-relaxed bg-[#f3edd7]/50 p-2.5 rounded-xl border border-stone-200/50">
                          {plan.description}
                        </p>
                      )}
                    </div>

                    {/* 세부 서비스 내역 (습식 / 건식 구성) */}
                    <div className="space-y-1.5 bg-white/80 p-3 rounded-xl border border-stone-200 text-[10px]">
                      {/* 습식 서비스 (Bath) */}
                      {(cat === 'wet' || cat === 'combo') && (
                        <div className="flex items-center justify-between text-sky-900 bg-sky-50/70 p-1.5 rounded-lg border border-sky-100">
                          <span className="font-bold flex items-center gap-1">
                            🧴 {t('pricing.bath_service')}
                          </span>
                          <span className="font-extrabold font-mono">
                            ${plan.bath_price || plan.price} ({plan.bath_duration_minutes || plan.duration_minutes}m / x{plan.bath_weight || plan.weight})
                          </span>
                        </div>
                      )}

                      {/* 건식 서비스 (Massage) */}
                      {(cat === 'dry' || cat === 'combo') && (
                        <div className="flex items-center justify-between text-amber-900 bg-amber-50/70 p-1.5 rounded-lg border border-amber-100">
                          <span className="font-bold flex items-center gap-1">
                            🧘‍♂️ {t('pricing.massage_service')}
                          </span>
                          <span className="font-extrabold font-mono">
                            ${plan.massage_price || plan.price} ({plan.massage_duration_minutes || plan.duration_minutes}m / x{plan.massage_weight || plan.weight})
                          </span>
                        </div>
                      )}

                      {/* 예약 화면 적용 요금 (Total Price) */}
                      <div className="flex items-center justify-between bg-emerald-100/80 text-emerald-950 p-2 rounded-lg font-bold border border-emerald-300/60">
                        <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-emerald-800 font-extrabold">
                          🏷️ {t('pricing.total_applied_price')}
                        </span>
                        <span className="text-xs font-black text-emerald-950">
                          ${Number(plan.price).toLocaleString()} ({plan.duration_minutes}m)
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* =======================================================
            [신규 및 수정 모달 팝업]
           ======================================================= */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-stone-50 border border-stone-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              {/* 모달 헤더 */}
              <div className="flex items-center justify-between p-5 border-b border-stone-200 bg-stone-100">
                <h3 className="text-sm font-extrabold text-stone-800 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-800" />
                  {isEditing
                    ? (language === 'ko' ? '요금제 정보 수정' : 'Modify Pricing Plan')
                    : (language === 'ko' ? '신규 요금제 등록' : 'Register New Pricing Plan')}
                </h3>
                <button
                  onClick={closeFormModal}
                  className="p-2 rounded-xl hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 모달 폼 바디 */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* 1. 서비스 유형 선택 버튼 그룹 */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5 uppercase tracking-wider">
                    {t('pricing.category')} *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('dry')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                        category === 'dry'
                          ? 'bg-amber-100 border-amber-400 text-amber-900 ring-2 ring-amber-400/50 shadow-xs'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      🧘‍♂️ {t('pricing.category.dry')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('wet')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                        category === 'wet'
                          ? 'bg-sky-100 border-sky-400 text-sky-900 ring-2 ring-sky-400/50 shadow-xs'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      🧴 {t('pricing.category.wet')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('combo')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                        category === 'combo'
                          ? 'bg-purple-100 border-purple-400 text-purple-900 ring-2 ring-purple-400/50 shadow-xs'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      ⚡ {t('pricing.category.combo')}
                    </button>
                  </div>
                </div>

                {/* 2. 요금명 및 설명 */}
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                    {language === 'ko' ? '요금명 (SERVICE NAME) *' : 'Pricing Plan Name *'}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    placeholder={language === 'ko' ? '예: Body Scrub & Deep Tissue Combo' : 'e.g. Body Scrub & Deep Tissue Combo'}
                    disabled={formLoading}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                    {language === 'ko' ? '요금설명' : 'Description'}
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-700 h-20 resize-none"
                    placeholder={language === 'ko' ? '서비스 구성 설명을 입력하세요.' : 'Enter service description.'}
                    disabled={formLoading}
                  />
                </div>

                {/* 콤보(Combo) 모드 전용 섹션 제목 */}
                {category === 'combo' && (
                  <div className="pt-2">
                    <div className="bg-purple-100/70 border border-purple-300/80 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-purple-950">
                      <Layers className="w-4 h-4 text-purple-700 flex-shrink-0" />
                      <span className="text-xs font-extrabold tracking-tight">
                        {language === 'ko' ? '조합할 기존 요금제 선택 (선택 시 자동 계산)' : 'Select Base Plans for Combo (Auto Calculated)'}
                      </span>
                    </div>
                  </div>
                )}

                {/* 3. [습식/Bath 서비스 요금 및 시간] (wet 또는 combo 일 때 표시) */}
                {(category === 'wet' || category === 'combo') && (
                  <div className={`border rounded-2xl p-4 space-y-3 transition-colors ${
                    category === 'combo' ? 'bg-sky-50/50 border-sky-300/70' : 'bg-sky-50/70 border-sky-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold flex items-center gap-1.5 text-sky-950">
                        🧴 {t('pricing.bath_service')} (Bath / Wet)
                      </span>
                      {category === 'combo' && (
                        <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full border border-sky-200">
                          {language === 'ko' ? '선택에 따라 자동입력 (수정불가)' : 'Auto-filled (Read-only)'}
                        </span>
                      )}
                    </div>

                    {/* 콤보 모드일 때만 박스 상단에 습식 요금제 선택 드롭다운 배치 */}
                    {category === 'combo' && (
                      <div>
                        <label className="block text-[10px] font-extrabold text-sky-900 mb-1">
                          {language === 'ko' ? '1. 습식 요금제 선택' : '1. Select Wet Plan'}
                        </label>
                        <select
                          value={selectedWetPlanId}
                          onChange={(e) => handleSelectWetPlan(e.target.value)}
                          className="w-full bg-white border border-sky-300 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-xs"
                        >
                          <option value="">{language === 'ko' ? '-- 습식 요금제 선택 --' : '-- Select Wet Plan --'}</option>
                          {wetPlansList.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (${p.bath_price || p.price}, {p.bath_duration_minutes || p.duration_minutes}m)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[9px] font-bold text-stone-600 mb-1">
                          {t('pricing.bath_price')}
                        </label>
                        <input
                          type="number"
                          value={bathPrice}
                          disabled={category === 'combo'}
                          onChange={(e) => setBathPrice(Number(e.target.value))}
                          className={`w-full rounded-xl px-2.5 py-2 text-xs font-bold ${
                            category === 'combo'
                              ? 'bg-stone-200/90 border border-stone-300 text-stone-500 cursor-not-allowed'
                              : 'bg-white border border-sky-200 text-stone-800'
                          }`}
                          min="0"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-stone-600 mb-1">
                          {t('pricing.bath_duration')}
                        </label>
                        <input
                          type="number"
                          value={bathDuration}
                          disabled={category === 'combo'}
                          onChange={(e) => setBathDuration(Number(e.target.value))}
                          className={`w-full rounded-xl px-2.5 py-2 text-xs font-bold ${
                            category === 'combo'
                              ? 'bg-stone-200/90 border border-stone-300 text-stone-500 cursor-not-allowed'
                              : 'bg-white border border-sky-200 text-stone-800'
                          }`}
                          min="0"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-stone-600 mb-1">
                          {t('pricing.bath_weight')}
                        </label>
                        <input
                          type="number"
                          value={bathWeight}
                          disabled={category === 'combo'}
                          onChange={(e) => setBathWeight(Number(e.target.value))}
                          className={`w-full rounded-xl px-2.5 py-2 text-xs font-bold ${
                            category === 'combo'
                              ? 'bg-stone-200/90 border border-stone-300 text-stone-500 cursor-not-allowed'
                              : 'bg-white border border-sky-200 text-stone-800'
                          }`}
                          min="0.1"
                          step="0.1"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. [건식/Massage 서비스 요금 및 시간] (dry 또는 combo 일 때 표시) */}
                {(category === 'dry' || category === 'combo') && (
                  <div className={`border rounded-2xl p-4 space-y-3 transition-colors ${
                    category === 'combo' ? 'bg-amber-50/50 border-amber-300/70' : 'bg-amber-50/70 border-amber-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold flex items-center gap-1.5 text-amber-950">
                        🧘‍♂️ {t('pricing.massage_service')} (Massage / Dry)
                      </span>
                      {category === 'combo' && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                          {language === 'ko' ? '선택에 따라 자동입력 (수정불가)' : 'Auto-filled (Read-only)'}
                        </span>
                      )}
                    </div>

                    {/* 콤보 모드일 때만 박스 상단에 건식 요금제 선택 드롭다운 배치 */}
                    {category === 'combo' && (
                      <div>
                        <label className="block text-[10px] font-extrabold text-amber-900 mb-1">
                          {language === 'ko' ? '2. 건식 요금제 선택' : '2. Select Dry Plan'}
                        </label>
                        <select
                          value={selectedDryPlanId}
                          onChange={(e) => handleSelectDryPlan(e.target.value)}
                          className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                        >
                          <option value="">{language === 'ko' ? '-- 건식 요금제 선택 --' : '-- Select Dry Plan --'}</option>
                          {dryPlansList.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (${p.massage_price || p.price}, {p.massage_duration_minutes || p.duration_minutes}m)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[9px] font-bold text-stone-600 mb-1">
                          {t('pricing.massage_price')}
                        </label>
                        <input
                          type="number"
                          value={massagePrice}
                          disabled={category === 'combo'}
                          onChange={(e) => setMassagePrice(Number(e.target.value))}
                          className={`w-full rounded-xl px-2.5 py-2 text-xs font-bold ${
                            category === 'combo'
                              ? 'bg-stone-200/90 border border-stone-300 text-stone-500 cursor-not-allowed'
                              : 'bg-white border border-amber-200 text-stone-800'
                          }`}
                          min="0"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-stone-600 mb-1">
                          {t('pricing.massage_duration')}
                        </label>
                        <input
                          type="number"
                          value={massageDuration}
                          disabled={category === 'combo'}
                          onChange={(e) => setMassageDuration(Number(e.target.value))}
                          className={`w-full rounded-xl px-2.5 py-2 text-xs font-bold ${
                            category === 'combo'
                              ? 'bg-stone-200/90 border border-stone-300 text-stone-500 cursor-not-allowed'
                              : 'bg-white border border-amber-200 text-stone-800'
                          }`}
                          min="0"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-stone-600 mb-1">
                          {t('pricing.massage_weight')}
                        </label>
                        <input
                          type="number"
                          value={massageWeight}
                          disabled={category === 'combo'}
                          onChange={(e) => setMassageWeight(Number(e.target.value))}
                          className={`w-full rounded-xl px-2.5 py-2 text-xs font-bold ${
                            category === 'combo'
                              ? 'bg-stone-200/90 border border-stone-300 text-stone-500 cursor-not-allowed'
                              : 'bg-white border border-amber-200 text-stone-800'
                          }`}
                          min="0.1"
                          step="0.1"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. [예약 화면에 보여질 최종 적용 요금 (Total Price) 및 전체 소요시간] - 콤보일 때만 노출 */}
                {category === 'combo' && (
                  <div className="bg-emerald-50/90 text-emerald-950 border border-emerald-300/90 rounded-2xl p-4 space-y-3 shadow-xs animate-in fade-in duration-200">
                    <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                      <span className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-700" />
                        {language === 'ko' ? '예약 화면 최종 적용 요금 및 전체 정보' : 'Final Reservation Display Details'}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-200">
                        {language === 'ko' ? '* 직접 수정 가능' : '* Editable'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[9px] font-bold text-emerald-800 mb-1 uppercase tracking-wider">
                          {t('pricing.total_applied_price')}
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2.5 text-emerald-700">
                            <DollarSign className="w-3.5 h-3.5" />
                          </span>
                          <input
                            type="number"
                            value={totalPrice}
                            onChange={(e) => setTotalPrice(Number(e.target.value))}
                            className="w-full bg-white border border-emerald-300 text-emerald-950 rounded-xl pl-7 pr-2 py-2 text-xs font-black focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                            min="0"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-emerald-800 mb-1 uppercase tracking-wider">
                          {t('pricing.total_duration')}
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2.5 text-emerald-700">
                            <Clock className="w-3.5 h-3.5" />
                          </span>
                          <input
                            type="number"
                            value={totalDuration}
                            onChange={(e) => setTotalDuration(Number(e.target.value))}
                            className="w-full bg-white border border-emerald-300 text-emerald-950 rounded-xl pl-7 pr-2 py-2 text-xs font-extrabold focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                            min="1"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-emerald-800 mb-1 uppercase tracking-wider">
                          {language === 'ko' ? '전체 가중치' : 'Total Weight'}
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2.5 text-emerald-700">
                            <Scale className="w-3.5 h-3.5" />
                          </span>
                          <input
                            type="number"
                            value={totalWeight}
                            onChange={(e) => setTotalWeight(Number(e.target.value))}
                            className="w-full bg-white border border-emerald-300 text-emerald-950 rounded-xl pl-7 pr-2 py-2 text-xs font-extrabold focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                            min="0.1"
                            step="0.1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-stone-200 justify-end">
                  <button
                    type="button"
                    onClick={closeFormModal}
                    className="px-4 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl text-xs font-bold transition-colors"
                  >
                    {language === 'ko' ? '취소' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
                  >
                    {formLoading
                      ? (language === 'ko' ? '저장 중...' : 'Saving...')
                      : (language === 'ko' ? '저장하기' : 'Save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
