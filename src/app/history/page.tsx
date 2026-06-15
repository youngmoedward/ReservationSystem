'use client'

import React from 'react'
import { createClient } from '@/utils/supabase/client'
import HistoryManager from '@/components/admin/HistoryManager'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { useLanguage } from '../LanguageContext'

export default function HistoryPage() {
  const supabase = createClient()
  const { t } = useLanguage()

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-900/60">
          <h2 className="text-sm font-bold text-slate-400">📋 {t('history.title')}</h2>
        </div>

        <HistoryManager
          supabase={supabase}
        />
      </div>
    </DashboardLayout>
  )
}

