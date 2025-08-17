"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, PieChartIcon as PieIcon, TrendingUp, TrendingDown } from "lucide-react"
import { StorageService } from "@/services/storage"
import type { Transaction, Category } from "@/types"

interface DashboardProps {
  onBack: () => void
}

interface ChartData {
  name: string
  value: number
  color: string
  icon: string
}

const CustomPieChart = ({ data, title, type }: { data: ChartData[]; title: string; type: "expense" | "income" }) => {
  const [hoveredSegment, setHoveredSegment] = useState<{ item: ChartData; x: number; y: number } | null>(null)

  const total = data.reduce((sum, item) => sum + item.value, 0)

  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p>No {type} data available for this period</p>
        </div>
      </div>
    )
  }

  let cumulativePercentage = 0
  const radius = 130
  const centerX = 180
  const centerY = 180

  const formatAmount = (amount: number) => {
    return (
      amount.toLocaleString("fr-MA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " DH"
    )
  }

  const createArcPath = (startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) => {
    const start = polarToCartesian(centerX, centerY, outerRadius, endAngle)
    const end = polarToCartesian(centerX, centerY, outerRadius, startAngle)
    const innerStart = polarToCartesian(centerX, centerY, innerRadius, endAngle)
    const innerEnd = polarToCartesian(centerX, centerY, innerRadius, startAngle)

    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1"

    return [
      "M",
      start.x,
      start.y,
      "A",
      outerRadius,
      outerRadius,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
      "L",
      innerEnd.x,
      innerEnd.y,
      "A",
      innerRadius,
      innerRadius,
      0,
      largeArcFlag,
      1,
      innerStart.x,
      innerStart.y,
      "Z",
    ].join(" ")
  }

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    }
  }

  const handleMouseEnter = (item: ChartData, event: React.MouseEvent) => {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
    setHoveredSegment({
      item,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  const handleMouseLeave = () => {
    setHoveredSegment(null)
  }

  return (
    <div className="h-80 w-full">
      <div className="flex items-center justify-start -gap-6 -ml-8">
        <div className="relative">
          <svg width="360" height="360" viewBox="0 0 360 360">
            {data.map((item, index) => {
              const percentage = (item.value / total) * 100
              const startAngle = cumulativePercentage * 3.6
              const endAngle = (cumulativePercentage + percentage) * 3.6

              const path = createArcPath(startAngle, endAngle, 65, radius)
              cumulativePercentage += percentage

              return (
                <g key={index}>
                  <path
                    d={path}
                    fill={item.color}
                    stroke="white"
                    strokeWidth="2"
                    className="hover:opacity-80 cursor-pointer transition-opacity"
                    onMouseEnter={(e) => handleMouseEnter(item, e)}
                    onMouseLeave={handleMouseLeave}
                  />
                </g>
              )
            })}

            <circle cx={centerX} cy={centerY} r="60" fill="white" stroke="#e5e7eb" strokeWidth="2" />
            <text x={centerX} y={centerY - 5} textAnchor="middle" className="text-xs font-medium fill-gray-600">
              Total
            </text>
            <text x={centerX} y={centerY + 8} textAnchor="middle" className="text-sm font-bold fill-gray-900">
              {formatAmount(total)}
            </text>
          </svg>

          {hoveredSegment && (
            <div
              className="absolute bg-black text-white px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10 text-sm"
              style={{
                left: hoveredSegment.x + 10,
                top: hoveredSegment.y - 10,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="font-medium">{hoveredSegment.item.name}</div>
              <div>{formatAmount(hoveredSegment.item.value)}</div>
              <div>{((hoveredSegment.item.value / total) * 100).toFixed(1)}%</div>
            </div>
          )}
        </div>

        <div className="w-64 space-y-2 -ml-6">
          {data.map((item, index) => {
            return (
              <div key={index} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-lg">{item.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{item.name}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function Dashboard({ onBack }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>("")
  const [availableMonths, setAvailableMonths] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const allTransactions = StorageService.getTransactions()
    const allCategories = StorageService.getCategories()

    setTransactions(allTransactions)
    setCategories(allCategories)

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

    if (months.length > 0 && selectedPeriod === "") {
      setSelectedPeriod(months[0])
    } else if (months.length === 0 && selectedPeriod === "") {
      setSelectedPeriod("average-all")
    }
  }

  const hasLastMonthData = () => {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    return transactions.some((t) => {
      const transactionDate = new Date(t.date)
      return (
        transactionDate.getMonth() === lastMonth.getMonth() && transactionDate.getFullYear() === lastMonth.getFullYear()
      )
    })
  }

  const getFilteredTransactions = () => {
    const allTransactions = transactions

    console.log("[v0] Total transactions:", transactions.length)
    console.log("[v0] Categorized transactions:", allTransactions.filter((t) => t.categoryId).length)
    console.log("[v0] Sample transactions:", transactions.slice(0, 3))
    console.log("[v0] Sample categorized:", allTransactions.filter((t) => t.categoryId).slice(0, 3))

    if (selectedPeriod === "last-month") {
      const lastMonth = new Date()
      lastMonth.setMonth(lastMonth.getMonth() - 1)
      const filtered = allTransactions.filter((t) => {
        const transactionDate = new Date(t.date)
        return (
          transactionDate.getMonth() === lastMonth.getMonth() &&
          transactionDate.getFullYear() === lastMonth.getFullYear()
        )
      })
      console.log("[v0] Last month filtered:", filtered.length)
      return filtered
    } else if (selectedPeriod === "average-all") {
      return allTransactions
    } else {
      const filtered = allTransactions.filter((t) => {
        const transactionDate = new Date(t.date)
        const monthKey = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, "0")}`
        return monthKey === selectedPeriod
      })
      console.log("[v0] Specific month filtered:", filtered.length)
      return filtered
    }
  }

  const getChartData = (type: "expense" | "income"): ChartData[] => {
    const filteredTransactions = getFilteredTransactions()
    const relevantTransactions = filteredTransactions.filter((t) => (type === "expense" ? t.amount < 0 : t.amount > 0))

    console.log(`[v0] ${type} transactions:`, relevantTransactions.length)
    console.log(
      `[v0] Sample ${type} amounts:`,
      relevantTransactions.slice(0, 3).map((t) => t.amount),
    )

    const categoryTotals = new Map<string, number>()
    let uncategorizedTotal = 0

    relevantTransactions.forEach((transaction) => {
      const amount = Math.abs(transaction.amount)

      if (transaction.categoryId) {
        const categoryId = transaction.categoryId
        categoryTotals.set(categoryId, (categoryTotals.get(categoryId) || 0) + amount)
      } else {
        uncategorizedTotal += amount
      }
    })

    const chartData: ChartData[] = []

    categoryTotals.forEach((total, categoryId) => {
      const category = categories.find((c) => c.id === categoryId)
      if (category) {
        chartData.push({
          name: category.name,
          value: total,
          color: category.color,
          icon: category.icon,
        })
      }
    })

    if (uncategorizedTotal > 0) {
      chartData.push({
        name: "Uncategorized",
        value: uncategorizedTotal,
        color: "#9CA3AF",
        icon: "🤷",
      })
    }

    console.log(`[v0] ${type} chart data:`, chartData)
    return chartData.sort((a, b) => b.value - a.value)
  }

  const expenseData = getChartData("expense")
  const incomeData = getChartData("income")

  const totalExpenses = expenseData.reduce((sum, item) => sum + item.value, 0)
  const totalIncome = incomeData.reduce((sum, item) => sum + item.value, 0)

  const formatAmount = (amount: number) => {
    return (
      amount.toLocaleString("fr-MA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " DH"
    )
  }

  const getPeriodName = () => {
    if (selectedPeriod === "last-month") return "Last Month"
    if (selectedPeriod === "average-all") return "All Time Average"

    const [year, month] = selectedPeriod.split("-")
    const date = new Date(Number.parseInt(year), Number.parseInt(month) - 1)
    return date.toLocaleDateString("fr-MA", { month: "long", year: "numeric" })
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Transactions
          </Button>
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hasLastMonthData() && <SelectItem value="last-month">Last Month</SelectItem>}
            {availableMonths.map((month) => {
              const [year, monthNum] = month.split("-")
              const date = new Date(Number.parseInt(year), Number.parseInt(monthNum) - 1)
              const name = date.toLocaleDateString("fr-MA", { month: "long", year: "numeric" })
              return (
                <SelectItem key={month} value={month}>
                  {name}
                </SelectItem>
              )
            })}
            <SelectItem value="average-all">Average All Months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatAmount(totalExpenses)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatAmount(totalIncome)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
            <PieIcon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${totalIncome - totalExpenses >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {formatAmount(totalIncome - totalExpenses)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              Expenses - {getPeriodName()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CustomPieChart data={expenseData} title="Expenses" type="expense" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Income - {getPeriodName()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CustomPieChart data={incomeData} title="Income" type="income" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
