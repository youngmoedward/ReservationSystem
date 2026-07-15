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
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <h2 className="text-lg font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
            <span className="text-blue-700">📋</span> {t('history.title')}
          </h2>
        </div>

        <HistoryManager
          supabase={supabase}
        />
      </div>
    </DashboardLayout>
  )
}

