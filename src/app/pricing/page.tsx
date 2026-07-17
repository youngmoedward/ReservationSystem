'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '../providers'
import { useLanguage } from '@/app/LanguageContext'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Plus, Edit2, Trash2, Clock, Scale, DollarSign, RefreshCw, AlertCircle, X } from 'lucide-react'

interface PricingPlan {
  id: number
  name: string
  description: string
  price: number
  duration_minutes: number
  weight: number
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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState(80)
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [weight, setWeight] = useState(1.0)
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
    setName('')
    setDescription('')
    setPrice(80)
    setDurationMinutes(60)
    setWeight(1.0)
    setErrorMsg(null)
  }

  // 3. 신규 모달 열기
  const openNewPlanModal = () => {
    setIsEditing(false)
    setEditingPlanId(null)
    setName('')
    setDescription('')
    setPrice(80)
    setDurationMinutes(60)
    setWeight(1.0)
    setErrorMsg(null)
    setIsModalOpen(true)
  }

  // 4. 수정 모달 열기
  const openEditPlanModal = (plan: PricingPlan) => {
    setIsEditing(true)
    setEditingPlanId(plan.id)
    setName(plan.name)
    setDescription(plan.description || '')
    setPrice(Number(plan.price))
    setDurationMinutes(plan.duration_minutes)
    setWeight(Number(plan.weight))
    setErrorMsg(null)
    setIsModalOpen(true)
  }

  // 5. 등록 및 수정 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg(language === 'ko' ? '요금명을 입력해주세요.' : 'Please enter pricing name.')
      return
    }

    setFormLoading(true)
    setErrorMsg(null)

    try {
      if (isEditing && editingPlanId !== null) {
        // 수정
        const { error } = await supabase
          .from('pricing_plans')
          .update({
            name,
            description,
            price: Number(price),
            duration_minutes: Number(durationMinutes),
            weight: Number(weight)
          })
          .eq('id', editingPlanId)

        if (error) throw error
      } else {
        // 등록
        const { error } = await supabase
          .from('pricing_plans')
          .insert({
            name,
            description,
            price: Number(price),
            duration_minutes: Number(durationMinutes),
            weight: Number(weight)
          })

        if (error) throw error
      }

      closeFormModal()
      await fetchPlans()
    } catch (err: any) {
      console.error('Error saving pricing plan:', err)
      setErrorMsg(language === 'ko' ? '요금제 저장 중 오류가 발생했습니다.' : 'Error saving pricing plan.')
    } finally {
      setFormLoading(false)
    }
  }

  // 6. 삭제
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

  // 권한 확인 (직원 및 매니저만 허용)
  if (currentUser.role === 'therapist') {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl max-w-lg mx-auto mt-10 shadow-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 animate-bounce" />
          <h3 className="text-base font-extrabold">
            {language === 'ko' ? '접근 권한이 없습니다.' : 'Access Denied.'}
          </h3>
          <p className="text-xs mt-1 text-rose-600">
            {language === 'ko'
              ? '요금관리 메뉴는 매니저 및 직원만 접근 가능합니다.'
              : 'Pricing management is only accessible for managers and staff.'}
          </p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 타이틀 */}
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <h2 className="text-lg font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
            <span className="text-blue-700">⚙️</span>
            {language === 'ko' ? '마사지 요금 및 서비스 시간 관리' : 'Pricing & Service Duration Management'}
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
          <div className="flex items-center justify-between">
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
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-[#faf6e8]/90 border border-[#e3d7bd] p-5 rounded-2xl shadow-sm hover:border-emerald-600/50 hover:shadow-md hover:scale-[1.01] transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  {/* 요금제 등급별 상단 컬러바 포인트 데코레이션 */}
                  <div className={`absolute top-0 inset-x-0 h-1.5 ${
                    plan.price >= 150 
                      ? 'bg-amber-500 shadow-[0_1px_6px_rgba(245,158,11,0.3)]' 
                      : plan.price >= 120 
                        ? 'bg-emerald-700' 
                        : 'bg-stone-400'
                  }`} />

                  <div>
                    <div className="flex items-start justify-between gap-2 pt-1">
                      <h4 className="text-xs font-extrabold text-blue-900 group-hover:text-emerald-800 transition-colors">
                        {plan.name}
                      </h4>
                      <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
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
                      <p className="text-[10px] text-stone-600 mt-2 font-semibold line-clamp-2 leading-relaxed bg-[#f3edd7]/40 p-2.5 rounded-xl border border-stone-200/50">
                        {plan.description}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 border-t border-[#e3d7bd] pt-3 mt-4 text-[10px]">
                    <div className="flex flex-col bg-white/70 p-1.5 rounded-xl border border-stone-200 items-center justify-center">
                      <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                        {language === 'ko' ? '요금' : 'Price'}
                      </span>
                      <span className="text-blue-950 font-extrabold text-xs flex items-center mt-0.5">
                        ${Number(plan.price).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-col bg-white/70 p-1.5 rounded-xl border border-stone-200 items-center justify-center">
                      <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                        {language === 'ko' ? '시간' : 'Duration'}
                      </span>
                      <span className="text-stone-850 font-extrabold text-xs mt-0.5 flex items-center gap-0.5">
                        <Clock className="w-3 h-3 text-stone-400" /> {plan.duration_minutes}m
                      </span>
                    </div>
                    <div className="flex flex-col bg-white/70 p-1.5 rounded-xl border border-stone-200 items-center justify-center">
                      <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                        {language === 'ko' ? '가중치' : 'Weight'}
                      </span>
                      <span className="text-emerald-700 font-extrabold text-xs flex items-center gap-0.5 mt-0.5">
                        x{Number(plan.weight).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* =======================================================
            [신규 및 수정 모달 팝업]
           ======================================================= */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/30 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-stone-50 border border-stone-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
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

                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                    {language === 'ko' ? '요금명 *' : 'Pricing Plan Name *'}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    placeholder={language === 'ko' ? '예: Basic Swedish Care (60m)' : 'e.g. Basic Swedish Care (60m)'}
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
                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-3 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-700 h-24 resize-none"
                    placeholder={language === 'ko' ? '간략한 요금제 설명을 입력하세요.' : 'Enter simple details.'}
                    disabled={formLoading}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                      {language === 'ko' ? '금액 ($)' : 'Price ($)'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-stone-400">
                        <DollarSign className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(Number(e.target.value))}
                        className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-2 py-2.5 text-xs font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                        min="0"
                        disabled={formLoading}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                      {language === 'ko' ? '시간 (분)' : 'Time (min)'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-stone-400">
                        <Clock className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="number"
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(Number(e.target.value))}
                        className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-2 py-2.5 text-xs font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                        min="1"
                        disabled={formLoading}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                      {language === 'ko' ? '가중치' : 'Weight'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-stone-400">
                        <Scale className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="number"
                        value={weight}
                        onChange={(e) => setWeight(Number(e.target.value))}
                        className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-2 py-2.5 text-xs font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                        min="0.1"
                        step="0.1"
                        disabled={formLoading}
                      />
                    </div>
                  </div>
                </div>

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
