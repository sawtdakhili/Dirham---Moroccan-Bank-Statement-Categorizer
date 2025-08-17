"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Calendar, Tag, Edit2, Check, X } from "lucide-react"
import { StorageService } from "@/services/storage"
import type { Transaction, Category } from "@/types"

interface TransactionTableProps {
  onBack: () => void
  onNavigateToDashboard: () => void
}

export function TransactionTable({ onBack, onNavigateToDashboard }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set())
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    day: string
    month: string
    year: string
    description: string
    amount: string
  }>({ day: "", month: "", year: "", description: "", amount: "" })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const allTransactions = StorageService.getTransactions()
    const allCategories = StorageService.getCategories()

    console.log("TransactionTable: Loading transactions from storage:", allTransactions.length)
    console.log("TransactionTable: Loaded transactions:", allTransactions)

    setTransactions(allTransactions)
    setCategories(allCategories)

    // Get available months
    const months = Array.from(
      new Set(
        allTransactions.map((t) => {
          const date = new Date(t.date)
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        }),
      ),
    )
      .sort()
      .reverse()

    setAvailableMonths(months)

    // Set current month as default
    if (months.length > 0 && !selectedMonth) {
      setSelectedMonth(months[0])
    }
  }

  const filteredTransactions = transactions.filter((transaction) => {
    if (!selectedMonth) return true
    const transactionMonth = new Date(transaction.date)
    const monthKey = `${transactionMonth.getFullYear()}-${String(transactionMonth.getMonth() + 1).padStart(2, "0")}`
    return monthKey === selectedMonth
  })

  const updateTransactionCategory = (transactionId: string, categoryId: string) => {
    StorageService.updateTransaction(transactionId, { categoryId })
    loadData()
  }

  const bulkUpdateCategories = (categoryId: string) => {
    selectedTransactions.forEach((transactionId) => {
      StorageService.updateTransaction(transactionId, { categoryId })
    })
    setSelectedTransactions(new Set())
    loadData()
  }

  const toggleTransactionSelection = (transactionId: string) => {
    const newSelection = new Set(selectedTransactions)
    if (newSelection.has(transactionId)) {
      newSelection.delete(transactionId)
    } else {
      newSelection.add(transactionId)
    }
    setSelectedTransactions(newSelection)
  }

  const formatAmount = (amount: number) => {
    const formatted = Math.abs(amount).toLocaleString("fr-MA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return amount < 0 ? `-${formatted} DH` : `+${formatted} DH`
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("fr-MA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const getMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split("-")
    const date = new Date(Number.parseInt(year), Number.parseInt(month) - 1)
    return date.toLocaleDateString("fr-MA", { month: "long", year: "numeric" })
  }

  const uncategorizedCount = filteredTransactions.filter((t) => !t.categoryId).length

  const startEditing = (transaction: Transaction) => {
    setEditingTransaction(transaction.id)
    const date = new Date(transaction.date)
    setEditForm({
      day: String(date.getDate()).padStart(2, "0"),
      month: String(date.getMonth() + 1).padStart(2, "0"),
      year: String(date.getFullYear()),
      description: transaction.description,
      amount: transaction.amount.toString(),
    })
  }

  const saveEdit = () => {
    if (!editingTransaction) return

    const updatedTransaction = {
      date: new Date(
        Number.parseInt(editForm.year),
        Number.parseInt(editForm.month) - 1,
        Number.parseInt(editForm.day),
      ),
      description: editForm.description.trim(),
      amount: Number.parseFloat(editForm.amount),
    }

    if (
      !editForm.day ||
      !editForm.month ||
      !editForm.year ||
      !editForm.description.trim() ||
      isNaN(updatedTransaction.amount)
    ) {
      alert("Please fill in all fields with valid values")
      return
    }

    StorageService.updateTransaction(editingTransaction, updatedTransaction)
    setEditingTransaction(null)
    setEditForm({ day: "", month: "", year: "", description: "", amount: "" })
    loadData()
  }

  const cancelEdit = () => {
    setEditingTransaction(null)
    setEditForm({ day: "", month: "", year: "", description: "", amount: "" })
  }

  const getDayOptions = () => {
    return Array.from({ length: 31 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0")
      return { value: day, label: day }
    })
  }

  const getMonthOptions = () => {
    const months = [
      "Janvier",
      "Février",
      "Mars",
      "Avril",
      "Mai",
      "Juin",
      "Juillet",
      "Août",
      "Septembre",
      "Octobre",
      "Novembre",
      "Décembre",
    ]
    return months.map((month, index) => ({
      value: String(index + 1).padStart(2, "0"),
      label: month,
    }))
  }

  const getYearOptions = () => {
    const currentYear = new Date().getFullYear()
    const years = []
    for (let year = currentYear - 10; year <= currentYear + 1; year++) {
      years.push({ value: String(year), label: String(year) })
    }
    return years.reverse()
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Upload
          </Button>
          <h1 className="text-2xl font-bold">Transactions</h1>
        </div>
        <Button onClick={onNavigateToDashboard}>View Dashboard</Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((month) => (
                <SelectItem key={month} value={month}>
                  {getMonthName(month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {uncategorizedCount > 0 && <Badge variant="secondary">{uncategorizedCount} uncategorized</Badge>}

        {selectedTransactions.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedTransactions.size} selected</span>
            <Select onValueChange={bulkUpdateCategories}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Assign category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <div className="flex items-center gap-2">
                      <span>{category.icon}</span>
                      <span>{category.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {selectedMonth ? getMonthName(selectedMonth) : "All Transactions"}
            <Badge variant="outline">{filteredTransactions.length} transactions</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredTransactions.map((transaction) => {
              const category = categories.find((c) => c.id === transaction.categoryId)
              const isSelected = selectedTransactions.has(transaction.id)
              const isEditing = editingTransaction === transaction.id

              return (
                <div
                  key={transaction.id}
                  className={`
                    flex items-center gap-4 p-4 rounded-lg border transition-colors
                    ${!transaction.categoryId ? "bg-yellow-50 border-yellow-200" : "bg-card"}
                    ${isSelected ? "ring-2 ring-primary" : ""}
                    ${isEditing ? "ring-2 ring-blue-500" : ""}
                  `}
                >
                  <Checkbox checked={isSelected} onCheckedChange={() => toggleTransactionSelection(transaction.id)} />

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    {isEditing ? (
                      <>
                        <div className="md:col-span-4 space-y-3">
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-sm font-medium text-muted-foreground min-w-fit">Date:</span>
                            <Select
                              value={editForm.day}
                              onValueChange={(value) => setEditForm({ ...editForm, day: value })}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue placeholder="Day" />
                              </SelectTrigger>
                              <SelectContent>
                                {getDayOptions().map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={editForm.month}
                              onValueChange={(value) => setEditForm({ ...editForm, month: value })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Month" />
                              </SelectTrigger>
                              <SelectContent>
                                {getMonthOptions().map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={editForm.year}
                              onValueChange={(value) => setEditForm({ ...editForm, year: value })}
                            >
                              <SelectTrigger className="w-24">
                                <SelectValue placeholder="Year" />
                              </SelectTrigger>
                              <SelectContent>
                                {getYearOptions().map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-sm font-medium text-muted-foreground min-w-fit">Description:</span>
                            <Input
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              placeholder="Transaction description"
                              className="flex-1 min-w-64"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-sm font-medium text-muted-foreground min-w-fit">Amount:</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={editForm.amount}
                              onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                              placeholder="Amount"
                              className="w-32"
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium">{formatDate(transaction.date)}</div>
                        <div className="md:col-span-2">
                          <p className="font-medium">{transaction.description}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`font-bold ${transaction.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                            {formatAmount(transaction.amount)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <Button size="sm" onClick={saveEdit} className="h-8 w-8 p-0">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit} className="h-8 w-8 p-0 bg-transparent">
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEditing(transaction)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="w-48">
                    <Select
                      value={transaction.categoryId || ""}
                      onValueChange={(value) => updateTransactionCategory(transaction.id, value)}
                      disabled={isEditing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category">
                          {category && (
                            <div className="flex items-center gap-2">
                              <span>{category.icon}</span>
                              <span className="truncate">{category.name}</span>
                            </div>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <div className="flex items-center gap-2">
                              <span>{cat.icon}</span>
                              <span>{cat.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )
            })}

            {filteredTransactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {transactions.length === 0 ? (
                  <div className="space-y-2">
                    <p>No transactions found.</p>
                    <p className="text-sm">Upload a PDF bank statement to see your transactions here.</p>
                  </div>
                ) : (
                  <p>No transactions found for the selected month.</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
