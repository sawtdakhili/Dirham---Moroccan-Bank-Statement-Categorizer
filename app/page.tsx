"use client"

import { useState, useEffect } from "react"
import { Navigation } from "@/components/navigation"
import { FileUpload } from "@/components/file-upload"
import { TransactionTable } from "@/components/transaction-table"
import { Dashboard } from "@/components/dashboard"
import { StorageService } from "@/services/storage"

type View = "upload" | "transactions" | "dashboard"

export default function Home() {
  const [currentView, setCurrentView] = useState<View>("upload")

  useEffect(() => {
    StorageService.clearAllData()
    console.log("[v0] Cleared all data on app startup - starting with clean slate")
  }, [])

  const handleUploadComplete = (transactionCount: number) => {
    setCurrentView("transactions")
  }

  const handleBackToUpload = () => {
    setCurrentView("upload")
  }

  const handleNavigateToDashboard = () => {
    setCurrentView("dashboard")
  }

  const handleBackToTransactions = () => {
    setCurrentView("transactions")
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentView={currentView} onViewChange={setCurrentView} />

      <main className="container mx-auto p-4">
        {currentView === "upload" && <FileUpload onUploadComplete={handleUploadComplete} />}

        {currentView === "transactions" && (
          <TransactionTable onBack={handleBackToUpload} onNavigateToDashboard={handleNavigateToDashboard} />
        )}

        {currentView === "dashboard" && <Dashboard onBack={handleBackToTransactions} />}
      </main>
    </div>
  )
}
