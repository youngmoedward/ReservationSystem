'use client'

import React from 'react'
import { createClient } from '@/utils/supabase/client'
import HistoryManager from '@/components/admin/HistoryManager'
import DashboardLayout from '@/components/layout/DashboardLayout'

export default function HistoryPage() {
  const supabase = createClient()

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-900/60">
          <h2 className="text-sm font-bold text-slate-400">📋 예약 변경 이력 조회</h2>
        </div>

        <HistoryManager
          supabase={supabase}
        />
      </div>
    </DashboardLayout>
  )
}
